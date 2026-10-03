import type { MutableProps } from '@/core/anim/interpolate';
import type { Ctx2D, FxInstance, Palette, Size } from '@/core/types';
import { elementEffect, frameEffect } from './catalog';
import { clamp01, envelope, hashString } from './random';
import { scratchSurface } from './scratch';
import {
  identityOffset, readParams,
  type Camera, type ElementEffectDef, type ElementSample, type FrameCategory, type FrameEffectDef,
  type FrameIO, type FrameSample,
} from './types';

/**
 * Running effects at an instant (D-100).
 *
 * The catalogue says what each effect does; this decides which are active at
 * a given time, how far through they are, and in what order they draw.
 */

/** How long a frame effect takes to come and go at the ends of its window. */
const FADE_MS = 350;

// ── From the document ───────────────────────────────────────────────────────

type ClipLike = {
  readonly id: string;
  readonly effectId: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly intensity: number;
  readonly params: FxInstance['params'];
};

const fxCache = new WeakMap<readonly ClipLike[], readonly FxInstance[]>();

/**
 * Document effect clips as render instances, each seeded from its own id.
 *
 * Seeded from the id rather than from its position, so reordering or deleting
 * one effect does not reshuffle where another one's snowflakes fall. Cached
 * on the array: the document is immutable, so a new array means a real edit.
 */
export function fxOf(clips: readonly ClipLike[] | undefined): readonly FxInstance[] {
  if (!clips || clips.length === 0) return EMPTY;
  const hit = fxCache.get(clips);
  if (hit) return hit;
  const list = clips.map((clip) => ({
    effectId: clip.effectId,
    startMs: clip.startMs,
    endMs: clip.endMs,
    intensity: clip.intensity,
    params: clip.params,
    seed: hashString(clip.id),
  }));
  fxCache.set(clips, list);
  return list;
}

const EMPTY: readonly FxInstance[] = [];

// ── Frame effects ───────────────────────────────────────────────────────────

function sampleFrame(
  def: FrameEffectDef,
  fx: FxInstance,
  timeMs: number,
  design: Size,
  palette: Palette,
): FrameSample | null {
  if (timeMs < fx.startMs || timeMs >= fx.endMs) return null;
  const dur = Math.max(1, fx.endMs - fx.startMs);
  const t = timeMs - fx.startMs;
  return {
    t,
    dur,
    p: t / dur,
    env: envelope(t, dur, FADE_MS),
    intensity: clamp01(fx.intensity),
    seed: fx.seed,
    design,
    unit: Math.min(design.w, design.h),
    palette,
    params: readParams(def.params, fx.params, palette),
  };
}

/** Every active camera move, added together. Null when nothing is moving the frame. */
export function frameCamera(
  list: readonly FxInstance[],
  timeMs: number,
  design: Size,
  palette: Palette,
): Camera | null {
  let camera: Camera | null = null;
  for (const fx of list) {
    const def = frameEffect(fx.effectId);
    if (!def?.camera) continue;
    const sample = sampleFrame(def, fx, timeMs, design, palette);
    if (!sample) continue;
    const move = def.camera(sample);
    camera = camera
      ? { x: camera.x + move.x, y: camera.y + move.y, scale: camera.scale * move.scale, rotation: camera.rotation + move.rotation }
      : move;
  }
  return camera;
}

/**
 * The zoom that keeps the frame's edges covered while it moves.
 *
 * Shaking a picture by its own size shows the empty canvas behind it — a black
 * sliver at the edge that reads as a rendering bug. Zooming in by just the
 * amount the move needs hides it, and is invisible at the sizes involved.
 */
export function coverScale(camera: Camera, design: Size): number {
  const radians = Math.abs((camera.rotation * Math.PI) / 180);
  const ratio = Math.max(design.w, design.h) / Math.max(1, Math.min(design.w, design.h));
  const turn = Math.cos(radians) + Math.sin(radians) * ratio;
  return turn + (2 * Math.abs(camera.x)) / design.w + (2 * Math.abs(camera.y)) / design.h;
}

/** Composes a camera move into the context, about the centre of the frame. */
export function applyCamera(ctx: Ctx2D, camera: Camera, design: Size): void {
  const scale = camera.scale * coverScale(camera, design);
  ctx.translate(design.w / 2 + camera.x, design.h / 2 + camera.y);
  if (camera.rotation !== 0) ctx.rotate((camera.rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.translate(-design.w / 2, -design.h / 2);
}

/**
 * The order looks are laid down in: colour first, then light on the coloured
 * picture, then things in the air in front of it all. Snow over a black and
 * white photo should stay white; a light leak over sepia should still glow.
 */
const ORDER: Readonly<Record<FrameCategory, number>> = { Stylize: 0, Camera: 1, Light: 2, Atmosphere: 3 };

export function hasActiveFrameFx(list: readonly FxInstance[], timeMs: number): boolean {
  return list.some((fx) => timeMs >= fx.startMs && timeMs < fx.endMs);
}

/**
 * Draws every active frame effect over what is already on `ctx`.
 *
 * `ctx` is in design units (scaled by `scale`); `px` is its pixel size, for the
 * effects that read the picture back.
 */
export function drawFrameEffects(
  ctx: Ctx2D,
  list: readonly FxInstance[],
  timeMs: number,
  design: Size,
  palette: Palette,
  px: Size,
  scale: number,
): void {
  if (list.length === 0) return;
  const active: { def: FrameEffectDef; sample: FrameSample; index: number }[] = [];
  list.forEach((fx, index) => {
    const def = frameEffect(fx.effectId);
    if (!def?.draw) return;
    const sample = sampleFrame(def, fx, timeMs, design, palette);
    if (sample) active.push({ def, sample, index });
  });
  if (active.length === 0) return;
  active.sort((a, b) => ORDER[a.def.category] - ORDER[b.def.category] || a.index - b.index);

  const io: FrameIO = {
    source: ctx.canvas,
    px,
    scale,
    scratch: (index) => scratchSurface(index, px),
  };

  for (const { def, sample } of active) {
    ctx.save();
    def.draw?.(ctx, sample, io);
    ctx.restore();
  }
}

/**
 * A camera move for something already drawn — the whole project, overlays
 * included — by copying the frame and drawing it back moved. Used only for
 * timeline effects; a scene's own camera moves its layers before they draw.
 */
export function applyCameraToFrame(ctx: Ctx2D, camera: Camera, design: Size, px: Size, scale: number): void {
  const copy = scratchSurface(0, px);
  copy.ctx.drawImage(ctx.canvas, 0, 0, px.w, px.h, 0, 0, px.w, px.h);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px.w, px.h);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  applyCamera(ctx, camera, design);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(copy.canvas, 0, 0, px.w, px.h, 0, 0, design.w, design.h);
  ctx.restore();
}

// ── Element effects ─────────────────────────────────────────────────────────

export type ActiveElementFx = { readonly def: ElementEffectDef; readonly sample: ElementSample };

/** The element effects running at `localMs`, with their samples. Null when none are. */
export function activeElementFx(
  list: readonly FxInstance[],
  localMs: number,
  size: { readonly w: number; readonly h: number },
  palette: Palette,
): ActiveElementFx[] | null {
  let active: ActiveElementFx[] | null = null;
  for (const fx of list) {
    const def = elementEffect(fx.effectId);
    if (!def) continue;
    const dur = Math.max(1, fx.endMs - fx.startMs);
    let t = localMs - fx.startMs;
    if (t < 0) {
      if (def.hold !== 'before') continue;
      t = 0;
    } else if (t > dur) {
      if (def.hold !== 'after') continue;
      t = dur;
    }
    active ??= [];
    active.push({
      def,
      sample: {
        t,
        dur,
        p: t / dur,
        intensity: clamp01(fx.intensity),
        seed: fx.seed,
        size,
        palette,
        params: readParams(def.params, fx.params, palette),
      },
    });
  }
  return active;
}

/** Folds the active effects' motion into a layer's resolved props. */
export function applyElementMotion(active: readonly ActiveElementFx[], props: MutableProps): void {
  const o = identityOffset();
  for (const { def, sample } of active) def.motion?.(sample, o);
  props.x += o.x * Math.abs(props.scaleX);
  props.y += o.y * Math.abs(props.scaleY);
  props.scaleX *= o.scaleX;
  props.scaleY *= o.scaleY;
  props.rotation += o.rotation;
  props.opacity *= o.opacity;
  props.blur += o.blur;
}
