import { useEffect, useMemo, useRef, useState } from 'react';
import {
  hits, logoBox, logoFreeFrom, overlayBox, projectDesign, safeBox, shiftBy, slotBoxes, toLocal,
  type OrientedBox, type PlacedBox,
} from '@/core/render/bounds';
import type { DrawnScene } from '@/core/render/rig';
import type { TextMeasureContext } from '@/core/text/layout';
import * as actions from '@/document/actions';
import { activeOverlaysAt, sceneSpans } from '@/document/select/timeline';
import { hasNudgePoses } from '@/core/render/slots';
import { isAnimated, poseAt, poseIndexAt, posesOf } from '@/document/select/overlay';
import type { Aspect, Size } from '@/core/types';
import { NO_SLOT_TRANSFORM, type Overlay, type Project, type SlotKey, type SlotTransform } from '@/document/types';
import { useEditor } from '@/state/store';
import { useMediaRevision, useMediaStore } from '@/ui/media/MediaProvider';
import { capturePointer } from '@/ui/timeline/pointerCapture';
import { NO_ZOOM, useOverlays, type ViewZoom } from '@/ui/shell/overlays';
import { useHoldStill } from '@/ui/shell/ClockProvider';
import { useLayout } from '@/ui/shell/useLayout';
import { LongPress } from '@/ui/shell/ContextMenu';
import { deleteSelection, logoMenu, overlayMenu, slotMenu } from '@/ui/editing/commands';
import { InlineTextEditor, SelectionToolbar, screenBounds, type ToolbarAction } from './CanvasEditing';
import { DESIGN_SHORT_EDGE } from '@/core/render/bounds';
import { TEXT_BASE } from '@/core/render/overlays';
import { slotKey as keyOfSlot } from '@/core/render/slots';
import { fontString } from '@/fonts/registry';
import { totalDurationMs } from '@/document/select/timeline';
import type { Layer, TextProps } from '@/core/types';

/**
 * Direct manipulation on the artboard — drag to move, handles to resize and
 * turn.
 *
 * Everything here is DOM sitting *over* the canvas, never pixels drawn into
 * it. That is not a style preference: D-001 makes one `renderFrame` serve both
 * preview and export, so a handle painted into the canvas would be encoded
 * into the user's video and baked into every template thumbnail. DOM chrome
 * also gets focus, cursors and accessibility for free.
 *
 * Geometry is done in the project's design units (`bounds.ts`) and converted
 * to CSS pixels once, at the edge, through one uniform scale. Tracking CSS
 * pixels instead would make every rotation and resize depend on the size of
 * the user's window.
 */

/** How close, in CSS pixels, a drag comes before it snaps. */
const SNAP_PX = 7;
/** Rotation snaps to this, unless ⇧ says otherwise. */
const SNAP_DEGREES = 15;
/** Keyboard nudge, as a fraction of the frame's short edge. */
const NUDGE = 0.005;
const NUDGE_COARSE = 0.02;
/** Hit radius for a handle, in CSS pixels. Generous: fingers and trackpads. */
const HANDLE_HIT_PX = 13;
/** Distance above the top edge where the rotate grip sits, in CSS pixels. */
const ROTATE_OFFSET_PX = 22;
/*
 * Scale bounds, shared with the inspector's Size slider.
 *
 * They have to be the same numbers: a drag that produced 416% while the
 * slider stopped at 300% left the document holding a value the panel could
 * not show, and the next touch of the slider would have snapped the overlay
 * down without the user asking.
 */
const MIN_SCALE = 0.2;
const MAX_SCALE = 6;
/** Floor on a single resize step, so a collapsed drag leaves something to grab. */
const MIN_FACTOR = 0.02;
const MIN_LOGO_PCT = 2;
const MAX_LOGO_PCT = 40;

type Corner = 'nw' | 'ne' | 'se' | 'sw';
type Side = 'n' | 'e' | 's' | 'w';
type Grip = Corner | Side;
type Handle = Grip | 'rotate';

/** Which way each handle pushes, in the box's own unrotated frame. */
const DIRECTION: Record<Grip, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  nw: { x: -1, y: -1 }, ne: { x: 1, y: -1 }, se: { x: 1, y: 1 }, sw: { x: -1, y: 1 },
  n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 },
};

const CORNERS: readonly Corner[] = ['nw', 'ne', 'se', 'sw'];
const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];

const GRIP_CURSOR: Record<Grip, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
};

type Target =
  | {
      readonly kind: 'overlay';
      readonly key: string;
      readonly overlay: Overlay;
      /**
       * Where a drag should write a keyframe, in the overlay's own time, or
       * null when it is not animated and the drag sets its resting place.
       */
      readonly poseAtMs: number | null;
      readonly box: PlacedBox;
      readonly label: string;
    }
  | {
      readonly kind: 'logo';
      readonly key: 'logo';
      readonly sizePct: number;
      readonly box: PlacedBox;
      readonly label: string;
    }
  | {
      readonly kind: 'slot';
      readonly key: SlotKey;
      readonly sceneIndex: number;
      /** The nudge in force when the drag began — deltas are measured from it. */
      readonly transform: SlotTransform;
      /**
       * Where a drag should write a keyframe, in the scene's own time, or null
       * when the nudge is a constant and the drag simply sets it.
       */
      readonly poseAtMs: number | null;
      readonly box: OrientedBox;
      readonly label: string;
    };

type Drag =
  | { readonly mode: 'move'; readonly target: Target; readonly grabLocal: Point }
  | { readonly mode: 'resize'; readonly target: Target; readonly handle: Grip }
  | { readonly mode: 'rotate'; readonly target: Target; readonly fromDegrees: number; readonly atDegrees: number };

type Point = { readonly x: number; readonly y: number };

/** A line shown while a drag is snapped to something. */
type Guide = { readonly axis: 'x' | 'y'; readonly at: number };

/** A press on the canvas, until it lifts (D-110). */
type Press = {
  readonly touch: boolean;
  readonly from: Point;
  readonly target: Target | null;
  /** Whether what was pressed was already the selection — only that moves under a finger. */
  readonly wasSelected: boolean;
  moved: boolean;
};

/** Two fingers on the canvas, as they were when the second one landed. */
type Pinch = {
  readonly distance: number;
  readonly mid: Point;
  readonly zoom: ViewZoom;
  /** Where the stage's corner would be with no zoom, in client pixels. */
  readonly origin: Point;
};

/** How far a finger may wander and still have tapped. */
const TAP_SLOP_PX = 8;
const DOUBLE_TAP_MS = 300;
const MAX_ZOOM = 5;

export function CanvasSelection({
  project,
  drawn,
  width,
}: {
  project: Project;
  /** What the preview loop last drew, which is what the slot boxes need. */
  drawn: DrawnScene | null;
  /** The canvas's CSS width. Height follows from the aspect. */
  width: number;
}): React.JSX.Element | null {
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const selectedOverlay = useEditor((s) => s.selectedOverlay);
  const selectedLogo = useEditor((s) => s.selectedLogo);
  const selectOverlay = useEditor((s) => s.selectOverlay);
  const selectLogo = useEditor((s) => s.selectLogo);
  const selectedScene = useEditor((s) => s.selectedScene);
  const selectedSlot = useEditor((s) => s.selectedSlot);
  const selectSlot = useEditor((s) => s.selectSlot);
  const selectScene = useEditor((s) => s.selectScene);
  const playheadMs = useEditor((s) => s.playheadMs);

  const dragRef = useRef<Drag | null>(null);
  const openMenu = useOverlays((o) => o.openMenu);
  /** A finger held on an element opens its menu, as a right-click does (D-104). */
  const longPress = useRef(new LongPress());
  /** On-canvas editing (D-107). */
  const textEdit = useOverlays((o) => o.textEdit);
  const openTextEdit = useOverlays((o) => o.openTextEdit);
  const openPhotoPicker = useOverlays((o) => o.openPhotoPicker);
  const openPicker = useOverlays((o) => o.openPicker);
  const template = useEditor((s) => s.template);
  const selectSlotTab = useEditor((s) => s.selectSlot);
  const setInspectorTab = useEditor((s) => s.setInspectorTab);
  /** True while a press on the canvas is held, so the toolbar keeps out of the way of a drag. */
  const [pressing, setPressing] = useState(false);
  const layout = useLayout();
  /** Picking something stops the preview where it is (point 5): you are about to edit this frame. */
  const holdStill = useHoldStill();
  const viewZoom = useOverlays((o) => o.viewZoom);
  const setViewZoom = useOverlays((o) => o.setViewZoom);
  /*
   * Touch (D-110): a finger selects with a tap, moves only what is already
   * selected, and puts it down with a tap anywhere else; two fingers zoom and
   * pan the view, never the element. These hold the gesture in progress.
   */
  const press = useRef<Press | null>(null);
  const fingers = useRef(new Map<number, Point>());
  const pinch = useRef<Pinch | null>(null);
  const pan = useRef<{ from: Point; zoom: ViewZoom } | null>(null);
  const lastTap = useRef<{ key: string; at: number } | null>(null);
  /** "Tap it again for its menu" waits a moment, in case the second tap is a double-tap. */
  const menuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelMenu = (): void => {
    if (menuTimer.current !== null) clearTimeout(menuTimer.current);
    menuTimer.current = null;
  };
  useEffect(() => () => { if (menuTimer.current !== null) clearTimeout(menuTimer.current); }, []);

  /*
   * The selection box takes keyboard focus when something is clicked on the
   * canvas, so the arrow keys its label promises actually reach it.
   *
   * Nothing did this. The box is focusable, but a click lands on the overlay
   * underneath it — which is not — so focus stayed wherever it was and the
   * arrows went to the global shortcuts instead, stepping the playhead while
   * the element sat still. It only appeared to work when the browser happened
   * to render the box under the pointer before the mousedown's own focus
   * change, which is a race, not a feature.
   *
   * Only for selections made *here*. Taking focus when something is chosen
   * from the timeline or a panel would yank the keyboard away from whatever
   * the person was using.
   *
   * On pointer *up*, never down. The browser's own mousedown runs after
   * pointerdown and moves focus to whatever was clicked — here the overlay,
   * which is not focusable, so focus falls to the page body. Focusing during
   * pointerdown was undone a moment later; it only appeared to work in the
   * dev build, where React happened to schedule the focus after that
   * mousedown, and failed in the production build every time.
   */
  const boxRef = useRef<HTMLDivElement | null>(null);
  const focusOnRelease = useRef(false);
  const [guides, setGuides] = useState<readonly Guide[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string>('default');

  const measure = useMeasureContext();
  const media = useMediaStore();
  // The logo's box depends on its picture's proportions, which are only known
  // once it has decoded — so a decode re-renders this, and the box follows.
  useMediaRevision();
  const logoId = project.scenes[selectedScene]?.inputs.logo.mediaId ?? null;
  const logoBitmap = logoId === null ? null : media.getBitmap(logoId);
  const logoAspect = logoBitmap && logoBitmap.height > 0 ? logoBitmap.width / logoBitmap.height : 1;
  const { aspect } = project;
  const design = projectDesign(aspect);
  const scale = width > 0 ? width / design.w : 0;

  /*
   * What is on screen right now, back to front — the order `renderFrame` draws
   * in, so scanning it backwards finds the topmost thing first, which is what
   * the user is pointing at.
   */
  const targets = useMemo((): readonly Target[] => {
    const list: Target[] = [];

    /*
     * The template's own elements, underneath everything else.
     *
     * Taken from the scene the last frame actually drew rather than from the
     * selected one: what you click has to be what you edit, and in a
     * multi-scene ad the playhead can easily be sitting over a beat other than
     * the one the inspector happens to be showing. Selecting one of these
     * selects its scene too, so the edit lands where the click did.
     */
    const sceneIndex = drawn ? project.scenes.findIndex((s) => s.id === drawn.sceneId) : -1;
    const drawnScene = sceneIndex >= 0 ? project.scenes[sceneIndex] : undefined;
    if (drawn && drawnScene) {
      /*
       * The scene's own clock: the playhead is global, a scene starts part way
       * through it, and §8.4's speed multiplier remaps time before layers are
       * evaluated. Getting any of those wrong puts the boxes where the
       * elements were a moment ago.
       */
      const span = sceneSpans(project.scenes).find((s) => s.scene.id === drawn.sceneId);
      const sceneTimeMs = span ? (playheadMs - span.startMs) * drawnScene.inputs.look.speed : 0;
      const transforms = drawnScene.inputs.slotTransforms;
      for (const slot of slotBoxes(drawn, sceneTimeMs, transforms, aspect, measure)) {
        const transform = transforms[slot.key] ?? NO_SLOT_TRANSFORM;
        list.push({
          kind: 'slot',
          key: slot.key,
          sceneIndex,
          transform,
          poseAtMs: hasNudgePoses(transform) ? sceneTimeMs : null,
          box: slot.box,
          label: slot.label,
        });
      }
    }

    for (const overlay of activeOverlaysAt(project.overlays, playheadMs)) {
      const box = overlayBox(overlay, aspect, measure, playheadMs - overlay.startMs);
      if (!box) continue;
      list.push({
        kind: 'overlay',
        key: overlay.id,
        overlay,
        poseAtMs: isAnimated(overlay) ? playheadMs - overlay.startMs : null,
        box,
        label:
          overlay.kind === 'text' ? 'Text overlay'
          : overlay.kind === 'photo' ? 'Photo overlay'
          : 'Media overlay',
      });
    }

    // The logo is drawn as the topmost layer of a scene, so it wins a tie.
    // Its box takes in the lockup, which moves with it (D-101).
    const scene = project.scenes[selectedScene] ?? project.scenes[0];
    if (scene) {
      const box = logoBox(scene.inputs, aspect, measure, logoAspect);
      if (box) {
        list.push({ kind: 'logo', key: 'logo', sizePct: scene.inputs.logo.sizePct, box, label: 'Logo' });
      }
    }

    return list;
  }, [project.overlays, project.scenes, aspect, playheadMs, selectedScene, measure, drawn, logoAspect]);

  const selected =
    targets.find((t) =>
      t.kind === 'logo' ? selectedLogo
      : t.kind === 'slot' ? t.key === selectedSlot
      : t.key === selectedOverlay,
    ) ?? null;

  /*
   * The thing being typed into, if any (D-107), with what the editor needs:
   * its words, the face and size they are set in on screen, and where typing
   * goes in the document.
   */
  const infoFor = (target: Target): EditInfo | null => {
    if (target.kind === 'overlay' && target.overlay.content.kind === 'text') {
      const { style } = target.overlay.content;
      const pose = poseAt(target.overlay, playheadMs - target.overlay.startMs);
      const sizePx = Math.min(design.w, design.h) * TEXT_BASE * (style.sizePct / 100) * (pose.scaleX ?? 1) * scale;
      const id = target.key;
      return {
        text: target.overlay.content.text,
        font: fontString(style.fontId, Math.max(10, sizePx), style.weight),
        align: style.align,
        maxLength: 200,
        write: (text) => { dispatch(actions.setOverlayText(id, text)); },
      };
    }
    if (target.kind === 'slot' && target.key.startsWith('text:')) {
      const slotId = target.key.slice('text:'.length);
      const scene = project.scenes[target.sceneIndex];
      const def = template?.textSlots.find((slot) => slot.id === slotId);
      const props = drawn ? findSlotText(drawn.layers, target.key) : null;
      const toProject = drawn ? DESIGN_SHORT_EDGE / Math.max(1, Math.min(drawn.design.w, drawn.design.h)) : 1;
      const sizePx = (props?.fontSizePx ?? 48) * toProject * scale;
      return {
        text: scene?.inputs.texts[slotId] ?? def?.placeholder ?? '',
        font: fontString(props?.fontId ?? 'headline', Math.max(10, sizePx), props?.weight ?? 700),
        align: props?.align ?? 'center',
        maxLength: def?.maxChars,
        write: (text) => { dispatch(actions.setText(slotId, text)); },
      };
    }
    return null;
  };

  /*
   * The thing being typed into (D-107), held as it was when typing began: its
   * place on the frame and the words it had. Clearing the text takes its box
   * off the frame — the editor must not vanish with it — and Escape has to put
   * back what was there before, not what has been typed since.
   */
  const [editing, setEditing] = useState<{ key: string; box: OrientedBox; info: EditInfo } | null>(null);
  const editable = textEdit !== null && editing?.key !== textEdit
    ? targets.find((t) => t.key === textEdit && isTextTarget(t)) ?? null
    : null;
  if (textEdit === null && editing !== null) setEditing(null);
  if (editable && textEdit !== null) {
    const info = infoFor(editable);
    if (info) setEditing({ key: textEdit, box: editable.box, info });
  }
  // Asked to edit something that is not text on the frame now: let the request go.
  const unreachable = textEdit !== null && editing?.key !== textEdit && editable === null;
  useEffect(() => {
    if (unreachable) openTextEdit(null);
  }, [unreachable, openTextEdit]);

  /*
   * Escape clears the selection from anywhere.
   *
   * It was on the selection box alone, which meant it only worked while that
   * box had focus — and the moment someone touched a control in the inspector
   * it silently stopped working. Escape means "never mind" wherever you are.
   */
  useEffect(() => {
    if (!selectedOverlay && !selectedLogo && !selectedSlot) return;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;

      // Not while typing, and not while a dialog is up: Escape belongs to
      // whichever of those is in front.
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable) return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      }
      if (document.querySelector('[role="dialog"]')) return;

      selectOverlay(null);
      selectLogo(false);
      selectSlot(null);
    };

    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [selectedOverlay, selectedLogo, selectedSlot, selectOverlay, selectLogo, selectSlot]);

  if (scale <= 0) return null;

  /*
   * Measured against the box as drawn, not the layout width: a pinch scales
   * the whole stage (D-110), and a point read at the unzoomed scale would land
   * somewhere else entirely.
   */
  const toDesign = (event: { clientX: number; clientY: number; currentTarget: Element }): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    const k = rect.width > 0 ? rect.width / design.w : scale;
    return { x: (event.clientX - rect.left) / k, y: (event.clientY - rect.top) / k };
  };

  const height = (width * design.h) / design.w;
  /** Keeps a zoomed picture at least partly on screen. */
  const clampZoom = (zoom: ViewZoom): ViewZoom => {
    if (zoom.scale <= 1.02) return NO_ZOOM;
    const clampAxis = (value: number, size: number): number =>
      Math.min(size / 3, Math.max((1 - zoom.scale) * size - size / 3, value));
    return { scale: zoom.scale, x: clampAxis(zoom.x, width), y: clampAxis(zoom.y, height) };
  };

  const pick = (point: Point): Target | null => {
    for (let i = targets.length - 1; i >= 0; i--) {
      const target = targets[i];
      if (target && hits(target.box, point)) return target;
    }
    return null;
  };

  const select = (target: Target | null): void => {
    if (target === null) {
      selectOverlay(null);
      selectLogo(false);
      selectSlot(null);
      return;
    }
    if (target.kind === 'logo') {
      selectLogo(true);
      return;
    }
    if (target.kind === 'slot') {
      // The scene first, so the edit is scoped to the beat that was clicked.
      if (target.sceneIndex !== selectedScene) selectScene(target.sceneIndex);
      const photo = /^photo:(\d+)$/.exec(target.key);
      selectSlot(
        target.key,
        photo ? 'photos' : 'text',
        photo?.[1] === undefined ? undefined : Number(photo[1]),
      );
      return;
    }
    selectOverlay(target.key);
  };

  /** Which handle of the current selection is under `point`, if any. */
  const handleAt = (point: Point): Handle | null => {
    if (!selected) return null;
    const { box } = selected;
    const local = toLocal(box, point);
    const reach = HANDLE_HIT_PX / scale;

    if (selected.kind !== 'logo') {
      const rotateY = -box.h / 2 - ROTATE_OFFSET_PX / scale;
      if (Math.hypot(local.x, local.y - rotateY) <= reach) return 'rotate';
    }

    /*
     * Never let a handle claim more than a third of the box from each edge.
     *
     * A one-line caption is about 20 CSS pixels tall, so an unclamped 13px
     * hit zone on the north edge and another on the south covered the whole
     * thing: pressing the middle of a caption resized it instead of picking it
     * up. Grabbing the body has to keep working at every size — it is the
     * gesture people reach for first.
     */
    const reachX = Math.min(reach, box.w / 3);
    const reachY = Math.min(reach, box.h / 3);

    const near = (value: number, at: number, within: number): boolean => Math.abs(value - at) <= within;

    for (const corner of CORNERS) {
      const d = DIRECTION[corner];
      if (near(local.x, (d.x * box.w) / 2, reachX) && near(local.y, (d.y * box.h) / 2, reachY)) {
        return corner;
      }
    }

    // Sides are overlay-only: the logo is square and resizes proportionally.
    if (selected.kind === 'overlay') {
      for (const side of SIDES) {
        const d = DIRECTION[side];
        const onAxis = d.x === 0
          ? near(local.y, (d.y * box.h) / 2, reachY) && Math.abs(local.x) <= box.w / 2 - reachX
          : near(local.x, (d.x * box.w) / 2, reachX) && Math.abs(local.y) <= box.h / 2 - reachY;
        if (onAxis) return side;
      }
    }
    return null;
  };

  /** What can be done to the element under the pointer, as a menu at the pointer. */
  const openTargetMenu = (target: Target, x: number, y: number): void => {
    select(target);
    holdStill();
    if (target.kind === 'logo') {
      openMenu({ x, y, title: 'Logo', items: logoMenu() });
      return;
    }
    if (target.kind === 'slot') {
      openMenu({ x, y, title: target.label, items: slotMenu(target.key, target.label.toLowerCase()) });
      return;
    }
    openMenu({ x, y, title: target.label, items: overlayMenu(target.overlay, null, 0) });
  };

  const onContextMenu = (event: React.MouseEvent<HTMLDivElement>): void => {
    const target = pick(toDesign(event));
    if (!target) return;
    event.preventDefault();
    openTargetMenu(target, event.clientX, event.clientY);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    cancelMenu();
    const touch = event.pointerType !== 'mouse';
    if (touch) fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // A second finger turns whatever was starting into a pinch of the view.
    if (touch && fingers.current.size >= 2) {
      longPress.current.cancel();
      if (dragRef.current) { dragRef.current = null; setGuides([]); endInteraction(); }
      press.current = null;
      pan.current = null;
      const [a, b] = [...fingers.current.values()];
      if (!a || !b) return;
      const rect = event.currentTarget.getBoundingClientRect();
      capturePointer(event.currentTarget, event.pointerId);
      pinch.current = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        zoom: viewZoom,
        origin: { x: rect.left - viewZoom.x, y: rect.top - viewZoom.y },
      };
      return;
    }

    setPressing(true);
    const point = toDesign(event);
    const under = pick(point);
    if (under) {
      longPress.current.start(event, (x, y) => {
        dragRef.current = null;
        openTargetMenu(under, x, y);
      });
    }

    // Handles win over content, so a handle overhanging another object still
    // resizes the thing it belongs to.
    const handle = handleAt(point);
    if (handle && selected) {
      focusOnRelease.current = true;
      capturePointer(event.currentTarget, event.pointerId);
      holdStill();
      dragRef.current =
        handle === 'rotate'
          ? {
              mode: 'rotate',
              target: selected,
              fromDegrees: angleOf(selected.box, point),
              atDegrees: selected.box.rotation,
            }
          : { mode: 'resize', target: selected, handle };
      return;
    }

    capturePointer(event.currentTarget, event.pointerId);
    const wasSelected = under !== null && selected !== null && under.key === selected.key;
    press.current = { touch, from: { x: event.clientX, y: event.clientY }, target: under, wasSelected, moved: false };

    /*
     * A finger only ever moves what is already selected (point 9). Pressing
     * anything else does nothing until the finger lifts — then it is a tap,
     * and a tap selects or puts down. Dragging from there pans a zoomed view.
     */
    if (touch) {
      if (under && wasSelected) {
        holdStill();
        dragRef.current = { mode: 'move', target: under, grabLocal: toLocal(under.box, point) };
      } else if (viewZoom.scale > 1) {
        pan.current = { from: { x: event.clientX, y: event.clientY }, zoom: viewZoom };
      }
      return;
    }

    focusOnRelease.current = under !== null;
    select(under);
    if (!under) return;
    holdStill();
    dragRef.current = { mode: 'move', target: under, grabLocal: toLocal(under.box, point) };
  };

  /** A press that ended where it began. */
  const onTap = (tap: Press, x: number, y: number, now: number): void => {
    const again = (key: string): boolean =>
      lastTap.current !== null && lastTap.current.key === key && now - lastTap.current.at < DOUBLE_TAP_MS;

    if (!tap.touch) {
      // Clicking what is already selected brings up its menu (point 6); a
      // double-click cancels that and edits instead.
      if (tap.target && tap.wasSelected) {
        const target = tap.target;
        menuTimer.current = setTimeout(() => { menuTimer.current = null; openTargetMenu(target, x, y); }, DOUBLE_TAP_MS);
      }
      return;
    }

    if (tap.target && tap.wasSelected) {
      if (again(tap.target.key)) {
        lastTap.current = null;
        primaryEdit(tap.target);
        return;
      }
      lastTap.current = { key: tap.target.key, at: now };
      const target = tap.target;
      menuTimer.current = setTimeout(() => { menuTimer.current = null; openTargetMenu(target, x, y); }, DOUBLE_TAP_MS);
      return;
    }
    // Something is selected and this tap is elsewhere: put it down first.
    if (selected) {
      lastTap.current = null;
      select(null);
      return;
    }
    if (tap.target) {
      select(tap.target);
      holdStill();
      lastTap.current = { key: tap.target.key, at: now };
      return;
    }
    // A double-tap on the empty picture fits it back to the screen.
    if (again('')) {
      lastTap.current = null;
      setViewZoom(NO_ZOOM);
      return;
    }
    lastTap.current = { key: '', at: now };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    longPress.current.move(event);
    if (fingers.current.has(event.pointerId)) fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const zooming = pinch.current;
    if (zooming) {
      const [a, b] = [...fingers.current.values()];
      if (!a || !b) return;
      const next = Math.min(MAX_ZOOM, Math.max(1, zooming.zoom.scale * (Math.hypot(a.x - b.x, a.y - b.y) / zooming.distance)));
      // The point of the picture that was between the fingers stays between them.
      const held = {
        x: (zooming.mid.x - zooming.origin.x - zooming.zoom.x) / zooming.zoom.scale,
        y: (zooming.mid.y - zooming.origin.y - zooming.zoom.y) / zooming.zoom.scale,
      };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      setViewZoom(clampZoom({ scale: next, x: mid.x - zooming.origin.x - next * held.x, y: mid.y - zooming.origin.y - next * held.y }));
      return;
    }

    const current = press.current;
    if (current && !current.moved && Math.hypot(event.clientX - current.from.x, event.clientY - current.from.y) > TAP_SLOP_PX) {
      current.moved = true;
    }
    const panning = pan.current;
    if (panning) {
      if (current?.moved === true) {
        setViewZoom(clampZoom({
          ...panning.zoom,
          x: panning.zoom.x + event.clientX - panning.from.x,
          y: panning.zoom.y + event.clientY - panning.from.y,
        }));
      }
      return;
    }
    // A finger's wobble during a tap is not a move.
    if (current?.touch === true && !current.moved) return;

    const point = toDesign(event);
    const drag = dragRef.current;

    if (!drag || event.buttons === 0) {
      const handle = handleAt(point);
      const under = pick(point);
      setHovered(under?.key ?? null);
      setCursor(
        handle === 'rotate' ? 'grab'
        : handle ? GRIP_CURSOR[handle]
        : under ? 'move'
        : 'default',
      );
      return;
    }

    // ⇧ means "no snapping", the same as it does on the music track.
    const free = event.shiftKey;

    if (drag.mode === 'move') {
      // The grab point stays under the pointer, so nothing jumps to centre
      // itself the moment a drag begins.
      const wanted = subtractRotated(point, drag.grabLocal, drag.target.box.rotation);
      const snapped = snapCentre(wanted, drag.target.box, design, free, scale);
      setGuides(snapped.guides);
      dispatch(moveAction(drag.target, snapped.point, design, aspect));
      return;
    }

    if (drag.mode === 'resize') {
      setGuides([]);
      const action = resizeAction(drag.target, drag.handle, point, design, aspect);
      if (action) dispatch(action);
      return;
    }

    setGuides([]);
    if (drag.target.kind === 'logo') return;
    const turned = drag.atDegrees + (angleOf(drag.target.box, point) - drag.fromDegrees);
    const degrees = free ? turned : Math.round(turned / SNAP_DEGREES) * SNAP_DEGREES;

    if (drag.target.kind === 'slot') {
      // A slot's visible angle is the template's plus the nudge, so the nudge
      // takes the *delta* — setting it absolutely would throw away whatever
      // rotation the template had chosen.
      const turned = { rotation: drag.target.transform.rotation + (degrees - drag.atDegrees) };
      dispatch(
        drag.target.poseAtMs === null
          ? actions.nudgeSlot(drag.target.key, turned)
          : actions.setSlotPose(drag.target.key, drag.target.poseAtMs, turned),
      );
      return;
    }
    const turn = { rotation: normaliseDegrees(degrees) };
    dispatch(
      drag.target.poseAtMs === null
        ? actions.setOverlayTransform(drag.target.key, turn)
        : actions.setOverlayPose(drag.target.key, drag.target.poseAtMs, turn),
    );
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean): void => {
    fingers.current.delete(event.pointerId);
    if (pinch.current) {
      // The pinch ends when the last finger lifts; a finger left behind is not a tap.
      if (fingers.current.size === 0) pinch.current = null;
      press.current = null;
      setPressing(false);
      return;
    }
    pan.current = null;
    const tap = press.current;
    press.current = null;
    setPressing(false);
    if (focusOnRelease.current) {
      focusOnRelease.current = false;
      boxRef.current?.focus({ preventScroll: true });
    }
    if (dragRef.current) {
      dragRef.current = null;
      setGuides([]);
      endInteraction();
    }
    if (tap && !tap.moved && !cancelled && !longPress.current.fired) onTap(tap, event.clientX, event.clientY, event.timeStamp);
  };

  /** What a double-click on a thing means: type into it, or choose a new picture for it. */
  const primaryEdit = (target: Target): void => {
    if (isTextTarget(target)) {
      openTextEdit(target.key);
      return;
    }
    const photo = target.kind === 'slot' ? /^photo:(\d+)$/.exec(target.key) : null;
    if (photo?.[1] !== undefined) openPhotoPicker({ kind: 'slot', index: Number(photo[1]) });
    else if (target.kind === 'overlay' && target.overlay.content.kind === 'photo') openPhotoPicker({ kind: 'overlay', id: target.key });
    else if (target.kind === 'logo') openPhotoPicker({ kind: 'logo' });
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    // A touch double-tap is handled as taps (D-110); this is the mouse's.
    cancelMenu();
    const target = pick(toDesign(event));
    if (!target) return;
    event.preventDefault();
    select(target);
    primaryEdit(target);
  };

  /** The selected thing's own toolbar (D-107). */
  const toolbarActions = (target: Target): ToolbarAction[] => {
    const more: ToolbarAction = { label: 'More', icon: '⋯', onSelect: ({ x, y }) => { openTargetMenu(target, x, y); } };
    const remove: ToolbarAction = { label: target.kind === 'slot' && target.key.startsWith('text:') ? 'Remove' : 'Delete', icon: '✕', danger: true, onSelect: () => { deleteSelection(); } };
    if (target.kind === 'logo') {
      return [
        { label: 'Replace', icon: '⇄', onSelect: () => { openPhotoPicker({ kind: 'logo' }); } },
        { label: 'Effects', icon: '✦', onSelect: () => { openPicker({ target: { kind: 'element', target: { kind: 'logo' }, label: 'the logo' } }); } },
        { label: 'Settings', icon: '⚙', onSelect: () => { setInspectorTab('look'); } },
        remove,
        more,
      ];
    }
    if (target.kind === 'overlay') {
      const name = target.overlay.kind === 'text' ? 'this caption' : 'this layer';
      const edit: ToolbarAction[] = target.overlay.content.kind === 'text'
        ? [{ label: 'Edit text', icon: '✎', onSelect: () => { openTextEdit(target.key); } }]
        : target.overlay.content.kind === 'photo'
          ? [{ label: 'Replace', icon: '⇄', onSelect: () => { openPhotoPicker({ kind: 'overlay', id: target.key }); } }]
          : [];
      return [
        ...edit,
        { label: 'Effects', icon: '✦', onSelect: () => { openPicker({ target: { kind: 'element', target: { kind: 'overlay', id: target.key }, label: name } }); } },
        { label: 'Duplicate', icon: '⧉', onSelect: () => { dispatch(actions.duplicateOverlay(target.key, totalDurationMs(project))); } },
        remove,
        more,
      ];
    }
    const label = target.label.toLowerCase();
    const isText = target.key.startsWith('text:');
    const photo = /^photo:(\d+)$/.exec(target.key);
    return [
      ...(isText ? [{ label: 'Edit text', icon: '✎', onSelect: () => { openTextEdit(target.key); } }] : []),
      ...(photo?.[1] !== undefined ? [{ label: 'Replace', icon: '⇄', onSelect: () => { openPhotoPicker({ kind: 'slot', index: Number(photo[1]) }); } }] : []),
      { label: 'Effects', icon: '✦', onSelect: () => { openPicker({ target: { kind: 'element', target: { kind: 'slot', key: target.key }, label } }); } },
      { label: 'Motion', icon: '◐', onSelect: () => { selectSlotTab(target.key, 'motion'); } },
      remove,
      more,
    ];
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (!selected) return;

    if (event.key === 'Escape') {
      select(null);
      return;
    }

    // Enter does what a double-click does: type into text, replace a picture.
    if (event.key === 'Enter') {
      event.preventDefault();
      primaryEdit(selected);
      return;
    }

    const step = (event.shiftKey ? NUDGE_COARSE : NUDGE) * Math.min(design.w, design.h);
    const delta: Point | null =
      event.key === 'ArrowLeft' ? { x: -step, y: 0 }
      : event.key === 'ArrowRight' ? { x: step, y: 0 }
      : event.key === 'ArrowUp' ? { x: 0, y: -step }
      : event.key === 'ArrowDown' ? { x: 0, y: step }
      : null;
    if (!delta) return;

    event.preventDefault();
    dispatch(
      moveAction(
        selected,
        { x: selected.box.cx + delta.x, y: selected.box.cy + delta.y },
        design,
        aspect,
      ),
    );
    endInteraction();
  };

  const px = (n: number): number => n * scale;

  return (
    <div
      role="presentation"
      data-canvas-selection
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => { longPress.current.cancel(); onPointerUp(event, false); }}
      onPointerCancel={(event) => { longPress.current.cancel(); onPointerUp(event, true); }}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      onPointerLeave={() => { setHovered(null); setCursor('default'); }}
      className="absolute inset-0 touch-none"
      style={{ cursor }}
    >
      {/* Hover outline, so it is discoverable that things can be picked up. */}
      {targets.map((target) =>
        target === selected || hovered !== target.key ? null : (
          <div
            key={`hover-${target.key}`}
            aria-hidden
            className="pointer-events-none absolute rounded-[2px] border border-dashed"
            style={{ ...boxStyle(target.box, px), borderColor: 'var(--c-accent)', opacity: 0.6 }}
          />
        ),
      )}

      {guides.map((guide) => (
        <div
          key={`${guide.axis}-${Math.round(guide.at)}`}
          aria-hidden
          data-guide={guide.axis}
          className="pointer-events-none absolute"
          style={
            guide.axis === 'x'
              ? { left: px(guide.at), top: 0, width: 1, height: '100%', background: 'var(--c-accent)' }
              : { top: px(guide.at), left: 0, height: 1, width: '100%', background: 'var(--c-accent)' }
          }
        />
      ))}

      {selected?.kind === 'overlay' && isAnimated(selected.overlay) && (
        <MotionPath
          overlay={selected.overlay}
          aspect={aspect}
          measure={measure}
          atMs={playheadMs - selected.overlay.startMs}
          px={px}
        />
      )}

      {selected && (
        <div
          ref={boxRef}
          role="button"
          tabIndex={0}
          data-selection-box={selected.key}
          aria-label={`${selected.label} selected. Arrow keys move it, ⇧ for bigger steps.`}
          className="absolute"
          style={boxStyle(selected.box, px)}
          onKeyDown={onKeyDown}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[2px]"
            style={{ outline: '1.5px solid var(--c-accent)', outlineOffset: -1 }}
          />

          {CORNERS.map((corner) => (
            <Dot key={corner} grip={corner} rotation={selected.box.rotation} />
          ))}
          {selected.kind === 'overlay' &&
            SIDES.map((side) => <Dot key={side} grip={side} rotation={selected.box.rotation} />)}
          {selected.kind !== 'logo' && (
            <>
              <span
                aria-hidden
                data-grip="rotate"
                className="pointer-events-none absolute rounded-full border"
                style={{
                  left: 'calc(50% - 5px)',
                  top: -ROTATE_OFFSET_PX - 5,
                  width: 10,
                  height: 10,
                  background: 'var(--c-accent)',
                  borderColor: 'var(--c-panel)',
                  transform: `rotate(${-selected.box.rotation}deg)`,
                }}
              />
            </>
          )}
        </div>
      )}

      {editing && (
        <InlineTextEditor
          key={editing.key}
          box={editing.box}
          scale={scale}
          font={editing.info.font}
          align={editing.info.align}
          initial={editing.info.text}
          maxLength={editing.info.maxLength}
          onChange={editing.info.write}
          onDone={(keep) => {
            if (!keep) editing.info.write(editing.info.text);
            endInteraction();
            openTextEdit(null);
            boxRef.current?.focus({ preventScroll: true });
          }}
        />
      )}

      {/* A phone's toolbar becomes the selection's tools instead (D-109). */}
      {selected && !pressing && !editing && layout !== 'phone' && (
        <SelectionToolbar
          bounds={screenBounds(selected.box, scale)}
          frameWidth={design.w * scale}
          actions={toolbarActions(selected)}
        />
      )}
    </div>
  );
}

type EditInfo = {
  readonly text: string;
  readonly font: string;
  readonly align: 'left' | 'center' | 'right';
  readonly maxLength: number | undefined;
  readonly write: (text: string) => void;
};

/** Whether a target is words someone can type into. */
function isTextTarget(target: Target): boolean {
  return target.kind === 'slot' ? target.key.startsWith('text:') : target.kind === 'overlay' && target.overlay.content.kind === 'text';
}

/** A template's text layer for a slot, wherever it is nested. */
function findSlotText(layers: readonly Layer[], key: string): TextProps | null {
  for (const layer of layers) {
    if (layer.type === 'text' && layer.props.slot && keyOfSlot(layer.props.slot) === key) return layer.props;
    if (layer.type === 'group' || layer.type === 'mask') {
      const hit = findSlotText(layer.children, key);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * The grips are `pointer-events-none` on purpose.
 *
 * Hit testing happens once, in the container, against the same geometry the
 * boxes are drawn from. Letting each dot catch its own events would put a
 * second, subtly different hit test in the DOM — one that is 8px wide when the
 * finger needs 13 — and the two would disagree at exactly the edges.
 */
function Dot({ grip, rotation }: { grip: Grip; rotation: number }): React.JSX.Element {
  const d = DIRECTION[grip];
  return (
    <span
      aria-hidden
      data-grip={grip}
      className="pointer-events-none absolute rounded-full border"
      style={{
        left: `calc(${((d.x + 1) / 2) * 100}% - 4px)`,
        top: `calc(${((d.y + 1) / 2) * 100}% - 4px)`,
        width: 8,
        height: 8,
        background: 'var(--c-panel)',
        borderColor: 'var(--c-accent)',
        // Keeps the dots round and level however the box is turned.
        transform: `rotate(${-rotation}deg)`,
      }}
    />
  );
}

function boxStyle(box: OrientedBox, px: (n: number) => number): React.CSSProperties {
  return {
    left: px(box.cx - box.w / 2),
    top: px(box.cy - box.h / 2),
    width: Math.max(1, px(box.w)),
    height: Math.max(1, px(box.h)),
    transform: `rotate(${box.rotation}deg)`,
    transformOrigin: 'center',
  };
}

/** Degrees from a box's centre to a point, measured from straight up. */
function angleOf(box: OrientedBox, point: Point): number {
  return (Math.atan2(point.x - box.cx, -(point.y - box.cy)) * 180) / Math.PI;
}

function normaliseDegrees(degrees: number): number {
  const wrapped = (((degrees + 180) % 360) + 360) % 360 - 180;
  return Math.round(wrapped * 10) / 10;
}

function rotate(local: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: local.x * Math.cos(radians) - local.y * Math.sin(radians),
    y: local.x * Math.sin(radians) + local.y * Math.cos(radians),
  };
}

function subtractRotated(point: Point, local: Point, degrees: number): Point {
  const turned = rotate(local, degrees);
  return { x: point.x - turned.x, y: point.y - turned.y };
}

function addRotated(point: Point, local: Point, degrees: number): Point {
  const turned = rotate(local, degrees);
  return { x: point.x + turned.x, y: point.y + turned.y };
}

/**
 * Pulls a centre onto the frame's obvious lines.
 *
 * Centre, thirds and the safe box — the places people actually align things,
 * and the same set any layout tool offers. ⇧ turns it off, which is the
 * convention the music track already uses, so it stays one thing to learn
 * rather than two.
 */
function snapCentre(
  wanted: Point,
  box: OrientedBox,
  design: Size,
  free: boolean,
  scale: number,
): { point: Point; guides: readonly Guide[] } {
  if (free) return { point: wanted, guides: [] };

  const safe = safeBox(design);
  const tolerance = SNAP_PX / Math.max(scale, 0.0001);
  const guides: Guide[] = [];

  const xLines = [design.w / 2, design.w / 3, (design.w * 2) / 3, safe.x + box.w / 2, safe.x + safe.w - box.w / 2];
  const yLines = [design.h / 2, design.h / 3, (design.h * 2) / 3, safe.y + box.h / 2, safe.y + safe.h - box.h / 2];

  let { x, y } = wanted;
  for (const line of xLines) {
    if (Math.abs(x - line) <= tolerance) {
      x = line;
      guides.push({ axis: 'x', at: line });
      break;
    }
  }
  for (const line of yLines) {
    if (Math.abs(y - line) <= tolerance) {
      y = line;
      guides.push({ axis: 'y', at: line });
      break;
    }
  }

  return { point: { x, y }, guides };
}

function moveAction(target: Target, centre: Point, design: Size, aspect: Aspect): actions.Action {
  if (target.kind === 'logo') {
    // The box is the logo *and* its lockup; the position is the logo's own
    // centre, an offset away from the box's.
    const free = logoFreeFrom(shiftBy(centre, negate(target.box.anchorOffset), 0), aspect);
    return actions.setLogoPosition(free.x, free.y);
  }

  if (target.kind === 'slot') {
    /*
     * A nudge is a delta, never a position (B). The template keeps deciding
     * where the element belongs; this records how far the user pulled it from
     * there. Measured against the box as it was when the drag started, so a
     * long drag cannot accumulate rounding.
     */
    const moved = {
      offsetX: target.transform.offsetX + (centre.x - target.box.cx) / design.w,
      offsetY: target.transform.offsetY + (centre.y - target.box.cy) / design.h,
    };
    // Auto-keyframe, the same as an overlay: with keyframes on, a drag records
    // where the element is at *this* moment rather than for the whole scene.
    return target.poseAtMs === null
      ? actions.nudgeSlot(target.key, moved)
      : actions.setSlotPose(target.key, target.poseAtMs, moved);
  }

  /*
   * `centre` is where the *drawing* should end up; `transform` holds where the
   * layer's anchor goes. For a centre-anchored photo those are the same point,
   * and for a caption they are half a line apart — so the offset has to be
   * taken back out or every drag overshoots by a constant.
   */
  const position = shiftBy(centre, negate(target.box.anchorOffset), target.box.rotation);
  const placement = {
    x: clamp01(position.x / design.w),
    y: clamp01(position.y / design.h),
  };

  // Auto-keyframe: with animation on, dragging records where the overlay is at
  // *this* moment rather than moving it for the whole clip. Move the playhead,
  // drag, repeat — which is the entire interaction.
  return target.poseAtMs === null
    ? actions.setOverlayTransform(target.key, placement)
    : actions.setOverlayPose(target.key, target.poseAtMs, placement);
}

function negate(point: Point): Point {
  return { x: -point.x, y: -point.y };
}

/**
 * Resizes about the opposite corner or edge — the part of the object you are
 * not holding stays where it is, which is what every layout tool does.
 */
function resizeAction(
  target: Target,
  handle: Grip,
  point: Point,
  design: Size,
  aspect: Aspect,
): actions.Action | null {
  const { box } = target;
  if (box.w <= 0 || box.h <= 0) return null;

  const d = DIRECTION[handle];
  const local = toLocal(box, point);

  const anchorLocal = { x: (-d.x * box.w) / 2, y: (-d.y * box.h) / 2 };
  const anchorFrame = addRotated({ x: box.cx, y: box.cy }, anchorLocal, box.rotation);

  /*
   * Signed, not absolute. Measuring the raw distance from the anchor means
   * dragging an edge *past* the opposite one mirrors the object and it grows
   * away from the pointer — so pulling the top edge downwards made the box
   * taller upwards. Projecting onto the handle's own direction instead makes
   * an over-drag collapse to the minimum, which is what it looks like it
   * should do.
   */
  const reachX = d.x === 0 ? box.w : Math.max(0, (local.x - anchorLocal.x) * d.x);
  const reachY = d.y === 0 ? box.h : Math.max(0, (local.y - anchorLocal.y) * d.y);

  /*
   * Corners keep the proportions, sides stretch one axis. That split is what
   * people already expect from every other editor, and it is why a corner drag
   * can never distort a photo by accident.
   */
  const corner = d.x !== 0 && d.y !== 0;
  const rawX = Math.max(reachX / box.w, MIN_FACTOR);
  const rawY = Math.max(reachY / box.h, MIN_FACTOR);
  const fx = corner ? Math.max(rawX, rawY) : rawX;
  const fy = corner ? fx : rawY;

  const newCentre = addRotated(
    anchorFrame,
    { x: (d.x * box.w * fx) / 2, y: (d.y * box.h * fy) / 2 },
    box.rotation,
  );

  if (target.kind === 'logo') {
    const pct = clamp(target.sizePct * fx, MIN_LOGO_PCT, MAX_LOGO_PCT);
    // Everything in the unit scales together, the offset to the logo's centre included.
    const offset = { x: -target.box.anchorOffset.x * fx, y: -target.box.anchorOffset.y * fx };
    const free = logoFreeFrom(shiftBy(newCentre, offset, 0), aspect);
    return actions.setLogoBox(Math.round(pct * 10) / 10, free.x, free.y);
  }

  if (target.kind === 'slot') {
    // One scale, both axes: a template photo's proportions are the frame
    // ratio's business (§8.1), not something a corner drag should override.
    // Position moves with it, in the same action, so the drag stays one step.
    const sized = {
      scale: target.transform.scale * fx,
      offsetX: target.transform.offsetX + (newCentre.x - target.box.cx) / design.w,
      offsetY: target.transform.offsetY + (newCentre.y - target.box.cy) / design.h,
    };
    return target.poseAtMs === null
      ? actions.nudgeSlot(target.key, sized)
      : actions.setSlotPose(target.key, target.poseAtMs, sized);
  }

  const { transform } = target.overlay;
  const scaleX = transform.scaleX ?? 1;
  const scaleY = transform.scaleY ?? transform.scaleX ?? 1;

  // The anchor offset scales with the drawing, so the correction has to use
  // the size the layer is about to be, not the size it currently is.
  // `target.box` rather than the destructured `box`: only the overlay variant
  // carries an anchor offset, and this branch is the one that has narrowed.
  const { anchorOffset } = target.box;
  const grown = { x: anchorOffset.x * fx, y: anchorOffset.y * fy };
  const position = shiftBy(newCentre, negate(grown), box.rotation);

  const sized = {
    scaleX: clamp(scaleX * fx, MIN_SCALE, MAX_SCALE),
    scaleY: clamp(scaleY * fy, MIN_SCALE, MAX_SCALE),
    x: clamp01(position.x / design.w),
    y: clamp01(position.y / design.h),
  };

  return target.poseAtMs === null
    ? actions.setOverlayTransform(target.key, sized)
    : actions.setOverlayPose(target.key, target.poseAtMs, sized);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

/**
 * A 2D context used only for measuring text.
 *
 * `OffscreenCanvas` rather than a DOM canvas: this never paints, and an
 * offscreen one cannot accidentally end up in the layout.
 */
function useMeasureContext(): TextMeasureContext {
  return useMemo(() => {
    const ctx = new OffscreenCanvas(1, 1).getContext('2d');
    if (!ctx) throw new Error('Could not get a 2D context to measure text with.');
    return ctx;
  }, []);
}

/**
 * The route an animated overlay takes, drawn over the artboard.
 *
 * Without this, keyframes are invisible: the panel says there are three of
 * them and the timeline shows three small diamonds, but nothing tells you
 * *where* the overlay is going, which is the only question anyone actually has
 * while placing them. A line through the poses with a dot at each answers it
 * at a glance, and makes the feature discoverable to someone who never read
 * the panel.
 *
 * Each dot comes from `overlayBox` at that pose's own time, so it sits exactly
 * where the handles would be if the playhead were there — rather than at the
 * raw stored position, which for anchored text is half a line away.
 */
function MotionPath({
  overlay,
  aspect,
  measure,
  atMs,
  px,
}: {
  overlay: Overlay;
  aspect: Aspect;
  measure: TextMeasureContext;
  atMs: number;
  px: (n: number) => number;
}): React.JSX.Element | null {
  const poses = posesOf(overlay);
  if (poses.length === 0) return null;

  const here = poseIndexAt(overlay, atMs, actions.POSE_TOLERANCE_MS);

  const points = poses.map((pose) => {
    const box = overlayBox(overlay, aspect, measure, pose.atMs);
    return { atMs: pose.atMs, x: px(box?.cx ?? 0), y: px(box?.cy ?? 0) };
  });

  return (
    <svg
      aria-hidden
      data-motion-path
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    >
      {points.length > 1 && (
        <polyline
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke="var(--c-accent)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          opacity={0.85}
        />
      )}
      {points.map((point, index) => (
        <circle
          key={point.atMs}
          data-path-pose={Math.round(point.atMs)}
          cx={point.x}
          cy={point.y}
          r={index === here ? 5 : 3.5}
          fill={index === here ? 'var(--c-accent)' : 'var(--c-panel)'}
          stroke="var(--c-accent)"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );
}
