import type { Overlay } from '@/document/types';

/**
 * Which layer (L1, L2, …) a timeline element goes on (D-103).
 *
 * Every new element used to get a layer of its own, so ten captions meant ten
 * layers of which nine were mostly empty — "lots of elements that could have
 * shared a single timeline". Now a layer is only added when nothing that
 * exists has room.
 *
 * Layers are also draw order (§6.4: L1 at the back), so when more than one
 * has room the *highest* is chosen: a new element should appear in front of
 * whatever it shares the moment with, or adding a photo would seem to do
 * nothing at all.
 */

export const MAX_TRACKS = 8;

/** The shortest gap worth placing something in. */
const MIN_FIT_MS = 1_000;

/** Whether `[startMs, endMs)` collides with anything on `track` but `exceptId`. */
export function overlapsOn(
  overlays: readonly Overlay[],
  track: number,
  startMs: number,
  endMs: number,
  exceptId?: string,
): boolean {
  return overlays.some((o) => o.track === track && o.id !== exceptId && o.startMs < endMs && startMs < o.endMs);
}

/** How many layers are in use: one more than the highest. */
export function usedTracks(overlays: readonly Overlay[]): number {
  return overlays.reduce((max, o) => Math.max(max, o.track + 1), 0);
}

export type Placement = { readonly track: number; readonly startMs: number; readonly endMs: number };

/**
 * Where a new element of `lengthMs` goes, wanted at `atMs`.
 *
 * With a layer chosen (`preferTrack` — the one the person clicked, or the one
 * holding what they have selected), it goes on that layer: at the playhead if
 * there is room there, otherwise straight after the element it would have
 * landed on. Without one, or when the chosen layer is full from here on, it
 * takes the highest existing layer with room at the playhead — and only when
 * none has room does it start a new one.
 */
export function placeNew(
  overlays: readonly Overlay[],
  options: { atMs: number; lengthMs: number; durationMs: number; preferTrack: number | null },
): Placement {
  const { lengthMs, durationMs, preferTrack } = options;
  const length = Math.max(1, Math.min(lengthMs, durationMs > 0 ? durationMs : lengthMs));
  const startAt = Math.max(0, Math.min(Math.round(options.atMs), Math.max(0, durationMs - length)));
  const endAt = Math.min(startAt + length, Math.max(durationMs, startAt + length));

  if (preferTrack !== null && preferTrack >= 0 && preferTrack < MAX_TRACKS) {
    const candidates = [
      startAt,
      ...overlays
        .filter((o) => o.track === preferTrack && o.endMs >= options.atMs)
        .map((o) => o.endMs)
        .sort((a, b) => a - b),
    ];
    for (const start of candidates) {
      const end = Math.min(start + length, durationMs);
      if (end - start < Math.min(MIN_FIT_MS, length)) continue;
      if (!overlapsOn(overlays, preferTrack, start, end)) return { track: preferTrack, startMs: start, endMs: end };
    }
  }

  const used = usedTracks(overlays);
  for (let track = used - 1; track >= 0; track--) {
    if (!overlapsOn(overlays, track, startAt, endAt)) return { track, startMs: startAt, endMs: endAt };
  }
  return { track: Math.min(used, MAX_TRACKS - 1), startMs: startAt, endMs: endAt };
}

/**
 * Where a dragged element settles when it is let go.
 *
 * On the layer it was dropped on if it fits there. If that would put it on top
 * of something, it goes back to the layer it came from if *that* has room,
 * then to the nearest layer above with room — a new one if need be — so two
 * elements never end up drawn over each other in one row.
 */
export function settleTrack(
  overlays: readonly Overlay[],
  id: string,
  wanted: number,
  original: number,
): number {
  const self = overlays.find((o) => o.id === id);
  if (!self) return wanted;
  const fits = (track: number): boolean => !overlapsOn(overlays, track, self.startMs, self.endMs, id);
  if (fits(wanted)) return wanted;
  if (original !== wanted && fits(original)) return original;
  const ceiling = Math.min(MAX_TRACKS - 1, usedTracks(overlays));
  for (let track = wanted + 1; track <= ceiling; track++) if (fits(track)) return track;
  for (let track = wanted - 1; track >= 0; track--) if (fits(track)) return track;
  return wanted;
}

/**
 * Renumbers layers so there are no empty ones in between, keeping their order.
 * Moving the last element off L2 should not leave an empty L2 behind.
 */
export function compactTracks(overlays: readonly Overlay[]): readonly Overlay[] {
  const used = [...new Set(overlays.map((o) => o.track))].sort((a, b) => a - b);
  if (used.every((track, i) => track === i)) return overlays;
  const remap = new Map(used.map((track, i) => [track, i]));
  return overlays.map((o) => {
    const track = remap.get(o.track) ?? o.track;
    return track === o.track ? o : { ...o, track };
  });
}
