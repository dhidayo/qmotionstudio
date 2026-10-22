import type { Overlay } from '@/document/types';
import { isAnimated, poseAt } from './overlay';
import { MAX_TRACKS, overlapsOn } from './tracks';

/**
 * A scene's layers, moved with the scene (D-155).
 *
 * "The Design, if added to Video or scene, then, the animated version is what
 * is used for that space." An image is more than its design: words added with
 * + Add text and extra photos are layers on top of it. So when an image
 * becomes a scene of a video, or a video goes back to being one image, the
 * layers over that scene go with it — moved to where the scene now starts,
 * and cut to its length — rather than being left behind or dropped.
 *
 * Pure, so the mode switch and Add a scene → Your images share one rule and it
 * is tested in Node.
 */

/**
 * The layers that show during `[fromMs, toMs)`, cut to that stretch and moved
 * so it begins at `atMs`. A layer cut at its start keeps its motion where it
 * was: its poses move back by the cut, with the pose it had reached at the cut
 * as its new first.
 */
export function layersInSpan(
  overlays: readonly Overlay[],
  span: { readonly fromMs: number; readonly toMs: number },
  atMs: number,
): Overlay[] {
  const { fromMs, toMs } = span;
  const shift = atMs - fromMs;
  const kept: Overlay[] = [];
  for (const overlay of overlays) {
    const startMs = Math.max(overlay.startMs, fromMs);
    const endMs = Math.min(overlay.endMs, toMs);
    if (endMs <= startMs) continue;
    const cut = startMs - overlay.startMs;
    kept.push({
      ...overlay,
      startMs: Math.round(startMs + shift),
      endMs: Math.round(endMs + shift),
      ...(cut > 0 && isAnimated(overlay) ? { poses: posesAfter(overlay, cut) } : {}),
    });
  }
  return kept;
}

function posesAfter(overlay: Overlay, cut: number): NonNullable<Overlay['poses']> {
  const later = (overlay.poses ?? []).filter((pose) => pose.atMs > cut).map((pose) => ({ ...pose, atMs: pose.atMs - cut }));
  return [{ atMs: 0, transform: poseAt(overlay, cut) }, ...later];
}

/**
 * Puts `incoming` layers among `existing` ones without drawing two in one row
 * at once (D-103): the whole set moves up together, keeping its own order
 * front to back, to the lowest rows where none of it collides. When no shift
 * fits under the row limit, each layer takes the first row with room, or the
 * top row.
 */
export function placeAmong(existing: readonly Overlay[], incoming: readonly Overlay[]): Overlay[] {
  if (incoming.length === 0) return [];
  const highest = incoming.reduce((max, o) => Math.max(max, o.track), 0);
  const fits = (base: number): boolean =>
    incoming.every((o) => !overlapsOn(existing, o.track + base, o.startMs, o.endMs));
  for (let base = 0; base + highest < MAX_TRACKS; base++) {
    if (fits(base)) return base === 0 ? [...incoming] : incoming.map((o) => ({ ...o, track: o.track + base }));
  }
  const placed: Overlay[] = [];
  for (const overlay of incoming) {
    const around = [...existing, ...placed];
    let track = MAX_TRACKS - 1;
    for (let t = 0; t < MAX_TRACKS; t++) {
      if (!overlapsOn(around, t, overlay.startMs, overlay.endMs)) { track = t; break; }
    }
    placed.push({ ...overlay, track });
  }
  return placed;
}
