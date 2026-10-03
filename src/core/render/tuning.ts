import type { AnimatedProp, Ease, FxInstance, Keyframe, Layer, Tracks } from '@/core/types';
import { sampleTrack } from '@/core/anim/interpolate';
import { hashString } from '@/core/effects/random';
import { NO_TUNING, type ElementEffect, type MotionFeel, type MotionTuning, type SceneInputs } from '@/document/types';
import { slotKey, slotOf } from './slots';

/**
 * A template's motion, as the person wants it played (D-102), and the effects
 * they have put on its elements (D-100).
 *
 * Both are applied to what `build()` produced, after the memo — the same
 * place the slot nudges go, for the same reason: a slider dragged sixty times
 * a second must never re-run a template. The template still decides what
 * moves and when; this decides how far, and with what character.
 *
 * Nothing here is template-specific, which is the point. Every design in the
 * library — and every one added later — gets Motion properties for free.
 */

/** Properties whose movement "strength" scales. Opacity is presence, not movement. */
const MOVES: readonly AnimatedProp[] = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'blur', 'letterSpacing'];

const FEEL_EASE: Readonly<Record<Exclude<MotionFeel, 'template'>, Ease>> = {
  smooth: 'inOutCubic',
  gentle: 'inOutSine',
  snappy: 'outExpo',
  linear: 'linear',
  bouncy: { kind: 'spring', stiffness: 170, damping: 11, mass: 1 },
};

export function isNoTuning(tuning: MotionTuning | undefined): boolean {
  return !tuning || (Math.abs(tuning.strength - 1) < 1e-6 && tuning.feel === 'template');
}

function slotEffects(inputs: SceneInputs): readonly [string, readonly ElementEffect[]][] {
  return Object.entries(inputs.elementEffects ?? {}).filter(([key, list]) => key !== 'logo' && list.length > 0);
}

/** Whether there is anything to apply at all — the common case must cost nothing. */
export function hasSceneExtras(inputs: SceneInputs): boolean {
  if (!isNoTuning(inputs.motion)) return true;
  if (Object.values(inputs.slotMotion ?? {}).some((t) => !isNoTuning(t))) return true;
  return slotEffects(inputs).length > 0;
}

/** What the extras depend on, for the placed-layers cache. */
export function sceneExtrasKey(inputs: SceneInputs): string {
  if (!hasSceneExtras(inputs)) return '';
  return JSON.stringify([inputs.motion ?? null, inputs.slotMotion ?? null, slotEffects(inputs)]);
}

/**
 * The value a track rests at: the one it holds for longest, counting the time
 * before its first keyframe and after its last.
 *
 * "Twice the strength" means twice as far *from the resting pose*. For a
 * photo that zooms in, holds, and zooms out, that pose is the hold; for one
 * that only zooms in, it is where it ends up; for one that only leaves, where
 * it started. Counting the implicit holds at either end gets all three right.
 */
export function restValue(track: readonly Keyframe[], lengthMs: number): number {
  const first = track[0];
  if (!first) return 0;
  const holds = new Map<number, number>();
  const add = (value: number, ms: number): void => { holds.set(value, (holds.get(value) ?? 0) + Math.max(0, ms)); };
  add(first.v, first.t);
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    if (!a || !b) continue;
    if (Math.abs(a.v - b.v) <= 1e-6 * Math.max(1, Math.abs(a.v))) add(a.v, b.t - a.t);
  }
  const last = track[track.length - 1] ?? first;
  add(last.v, lengthMs - last.t);

  let best = first.v;
  let longest = -1;
  for (const [value, ms] of holds) {
    if (ms > longest) { best = value; longest = ms; }
  }
  return best;
}

function tuneTracks(tracks: Tracks, tuning: MotionTuning, lengthMs: number): Tracks {
  const ease = tuning.feel === 'template' ? null : FEEL_EASE[tuning.feel];
  const strength = tuning.strength;
  let changed = false;
  const next: { -readonly [K in AnimatedProp]?: readonly Keyframe[] } = { ...tracks };

  for (const prop of MOVES) {
    const track = tracks[prop];
    if (!track || track.length < 2) continue;
    const rest = restValue(track, lengthMs);
    next[prop] = track.map((frame, i) => ({
      t: frame.t,
      v: rest + (frame.v - rest) * strength,
      ease: ease !== null && i > 0 ? ease : frame.ease,
    }));
    changed = true;
  }

  // Opacity keeps its values, but takes the feel — except a spring, which
  // would overshoot past fully visible and below invisible.
  const opacity = tracks.opacity;
  if (ease !== null && tuning.feel !== 'bouncy' && opacity && opacity.length >= 2) {
    next.opacity = opacity.map((frame, i) => (i > 0 ? { ...frame, ease } : frame));
    changed = true;
  }

  return changed ? next : tracks;
}

/**
 * When an element is actually on screen, in its own time: from the first
 * moment it is visible to the last.
 *
 * A template layer often runs the whole scene but is only seen for part of it
 * — a photo in a sequence fades in at its turn and out at the next. An exit
 * effect belongs on that fade, not at the end of the scene where the photo has
 * long gone.
 */
export function visibleWindow(layer: Layer): { start: number; end: number } {
  const length = Math.max(1, layer.endMs - layer.startMs);
  const probe = layer.tracks.opacity && layer.tracks.opacity.length > 0
    ? { tracks: layer.tracks, offset: 0 }
    : firstChildTracks(layer);
  if (!probe) return { start: 0, end: length };

  const step = Math.max(16, length / 400);
  let start = -1;
  let end = -1;
  for (let t = 0; t <= length; t += step) {
    const local = t - probe.offset;
    const opacity = sampleTrack(probe.tracks.opacity ?? [], local) ?? 1;
    const sx = Math.abs(sampleTrack(probe.tracks.scaleX ?? [], local) ?? 1);
    const sy = Math.abs(sampleTrack(probe.tracks.scaleY ?? [], local) ?? 1);
    if (opacity > 0.02 && sx > 0.02 && sy > 0.02) {
      if (start < 0) start = t;
      end = t;
    }
  }
  if (start < 0) return { start: 0, end: length };
  return { start, end: Math.min(length, end + step) };
}

function firstChildTracks(layer: Layer): { tracks: Tracks; offset: number } | null {
  if (layer.type !== 'group' && layer.type !== 'mask') return null;
  const child = layer.children[0];
  if (!child) return null;
  return { tracks: child.tracks, offset: child.startMs };
}

/**
 * Element effects as render instances, timed against the element's window:
 * an entrance at its start, an exit at its end, a 'during' across all of it.
 */
export function timeElementEffects(
  effects: readonly ElementEffect[] | undefined,
  window: { start: number; end: number },
): readonly FxInstance[] {
  if (!effects || effects.length === 0) return [];
  const span = Math.max(1, window.end - window.start);
  return effects.map((effect) => {
    const length = Math.min(Math.max(50, effect.durationMs), span);
    const [startMs, endMs] =
      effect.phase === 'enter' ? [window.start, window.start + length]
      : effect.phase === 'exit' ? [window.end - length, window.end]
      : [window.start, window.end];
    return {
      effectId: effect.effectId,
      startMs,
      endMs,
      intensity: effect.intensity,
      params: effect.params,
      seed: hashString(effect.id),
    };
  });
}

/**
 * The layers, with the scene's motion tuning and its element effects applied.
 *
 * Tuning is inherited downwards: a tuned element's pieces move with it, so a
 * photo told to keep still keeps still even where the template animates the
 * picture inside its frame.
 */
export function applySceneExtras(layers: readonly Layer[], inputs: SceneInputs): readonly Layer[] {
  if (!hasSceneExtras(inputs)) return layers;
  const sceneTuning = inputs.motion ?? NO_TUNING;
  const perSlot = inputs.slotMotion ?? {};
  const effects = inputs.elementEffects ?? {};

  const visit = (layer: Layer, inherited: MotionTuning): Layer => {
    const slot = slotOf(layer);
    const key = slot ? slotKey(slot) : null;
    const tuning = (key !== null ? perSlot[key] : undefined) ?? inherited;

    const tracks = isNoTuning(tuning) ? layer.tracks : tuneTracks(layer.tracks, tuning, layer.endMs - layer.startMs);
    const own = key !== null ? effects[key] : undefined;
    const fx = own && own.length > 0
      ? [...(layer.fx ?? []), ...timeElementEffects(own, visibleWindow(layer))]
      : layer.fx;
    const extra = fx === undefined ? {} : { fx };

    if (layer.type === 'group' || layer.type === 'mask') {
      const children = layer.children.map((child) => visit(child, tuning));
      const same = tracks === layer.tracks && fx === layer.fx && children.every((child, i) => child === layer.children[i]);
      if (same) return layer;
      return layer.type === 'group'
        ? { ...layer, tracks, children, ...extra }
        : { ...layer, tracks, children, ...extra };
    }

    if (tracks === layer.tracks && fx === layer.fx) return layer;
    return { ...layer, tracks, ...extra };
  };

  return layers.map((layer) => visit(layer, sceneTuning));
}
