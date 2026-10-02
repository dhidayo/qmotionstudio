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
import { isAnimated, poseIndexAt, posesOf } from '@/document/select/overlay';
import type { Aspect, Size } from '@/core/types';
import { NO_SLOT_TRANSFORM, type Overlay, type Project, type SlotKey, type SlotTransform } from '@/document/types';
import { useEditor } from '@/state/store';
import { capturePointer } from '@/ui/timeline/pointerCapture';

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
    const scene = project.scenes[selectedScene] ?? project.scenes[0];
    if (scene) {
      const box = logoBox(scene.inputs, aspect);
      if (box) {
        list.push({ kind: 'logo', key: 'logo', sizePct: scene.inputs.logo.sizePct, box, label: 'Logo' });
      }
    }

    return list;
  }, [project.overlays, project.scenes, aspect, playheadMs, selectedScene, measure, drawn]);

  const selected =
    targets.find((t) =>
      t.kind === 'logo' ? selectedLogo
      : t.kind === 'slot' ? t.key === selectedSlot
      : t.key === selectedOverlay,
    ) ?? null;

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

  const toDesign = (event: React.PointerEvent<HTMLElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
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

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    const point = toDesign(event);

    // Handles win over content, so a handle overhanging another object still
    // resizes the thing it belongs to.
    const handle = handleAt(point);
    if (handle && selected) {
      focusOnRelease.current = true;
      capturePointer(event.currentTarget, event.pointerId);
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

    const target = pick(point);
    focusOnRelease.current = target !== null;
    select(target);
    if (!target) return;

    capturePointer(event.currentTarget, event.pointerId);
    dragRef.current = { mode: 'move', target, grabLocal: toLocal(target.box, point) };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
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

  const onPointerUp = (): void => {
    if (focusOnRelease.current) {
      focusOnRelease.current = false;
      boxRef.current?.focus({ preventScroll: true });
    }
    if (!dragRef.current) return;
    dragRef.current = null;
    setGuides([]);
    endInteraction();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (!selected) return;

    if (event.key === 'Escape') {
      select(null);
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
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
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
    </div>
  );
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
    const free = logoFreeFrom(centre, aspect);
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
    const free = logoFreeFrom(newCentre, aspect);
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
