import { useMemo, useRef, useState } from 'react';
import {
  hits, logoBox, logoFreeFrom, overlayBox, projectDesign, safeBox, toLocal,
  type OrientedBox,
} from '@/core/render/bounds';
import type { TextMeasureContext } from '@/core/text/layout';
import * as actions from '@/document/actions';
import { activeOverlaysAt } from '@/document/select/timeline';
import type { Aspect, Size } from '@/core/types';
import type { Overlay, Project } from '@/document/types';
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
      readonly box: OrientedBox;
      readonly label: string;
    }
  | {
      readonly kind: 'logo';
      readonly key: 'logo';
      readonly sizePct: number;
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
  width,
}: {
  project: Project;
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
  const playheadMs = useEditor((s) => s.playheadMs);

  const dragRef = useRef<Drag | null>(null);
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

    for (const overlay of activeOverlaysAt(project.overlays, playheadMs)) {
      const box = overlayBox(overlay, aspect, measure);
      if (!box) continue;
      list.push({
        kind: 'overlay',
        key: overlay.id,
        overlay,
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
  }, [project.overlays, project.scenes, aspect, playheadMs, selectedScene, measure]);

  const selected =
    targets.find((t) => (t.kind === 'logo' ? selectedLogo : t.key === selectedOverlay)) ?? null;

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
    } else if (target.kind === 'logo') {
      selectLogo(true);
    } else {
      selectOverlay(target.key);
    }
  };

  /** Which handle of the current selection is under `point`, if any. */
  const handleAt = (point: Point): Handle | null => {
    if (!selected) return null;
    const { box } = selected;
    const local = toLocal(box, point);
    const reach = HANDLE_HIT_PX / scale;

    if (selected.kind === 'overlay') {
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
    if (drag.target.kind !== 'overlay') return;
    const turned = drag.atDegrees + (angleOf(drag.target.box, point) - drag.fromDegrees);
    const degrees = free ? turned : Math.round(turned / SNAP_DEGREES) * SNAP_DEGREES;
    dispatch(actions.setOverlayTransform(drag.target.key, { rotation: normaliseDegrees(degrees) }));
  };

  const onPointerUp = (): void => {
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

      {selected && (
        <div
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
          {selected.kind === 'overlay' && (
            <>
              {SIDES.map((side) => (
                <Dot key={side} grip={side} rotation={selected.box.rotation} />
              ))}
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
  return actions.setOverlayTransform(target.key, {
    x: clamp01(centre.x / design.w),
    y: clamp01(centre.y / design.h),
  });
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

  const { transform } = target.overlay;
  const scaleX = transform.scaleX ?? 1;
  const scaleY = transform.scaleY ?? transform.scaleX ?? 1;

  return actions.setOverlayTransform(target.key, {
    scaleX: clamp(scaleX * fx, MIN_SCALE, MAX_SCALE),
    scaleY: clamp(scaleY * fy, MIN_SCALE, MAX_SCALE),
    x: clamp01(newCentre.x / design.w),
    y: clamp01(newCentre.y / design.h),
  });
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
