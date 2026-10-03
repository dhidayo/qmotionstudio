import { describe, expect, it } from 'vitest';
import type { Overlay } from '@/document/types';
import { MAX_TRACKS, compactTracks, overlapsOn, placeNew, settleTrack, usedTracks } from './tracks';

/**
 * Layers on the timeline (D-103): "only add a new layer if it overlaps".
 */

function clip(id: string, track: number, startMs: number, endMs: number): Overlay {
  return {
    id, track, startMs, endMs, kind: 'text',
    content: { kind: 'text', text: id, style: {
      fontId: 'body', weight: 600, align: 'center', sizePct: 100, color: '', wrap: false,
      shadow: false, outline: false, pill: false, wrapWidthPct: 80, letterSpacingPct: 0,
    } },
    transform: {}, enterAnim: 'fade', exitAnim: 'fade',
  };
}

const VIDEO = 15_000;

describe('placing a new element', () => {
  it('starts L1 on an empty timeline', () => {
    expect(placeNew([], { atMs: 2_000, lengthMs: 3_000, durationMs: VIDEO, preferTrack: null }))
      .toEqual({ track: 0, startMs: 2_000, endMs: 5_000 });
  });

  it('shares a layer that has room, instead of opening a new one', () => {
    const overlays = [clip('a', 0, 0, 3_000)];
    const spot = placeNew(overlays, { atMs: 6_000, lengthMs: 3_000, durationMs: VIDEO, preferTrack: null });
    expect(spot.track).toBe(0);
    expect(usedTracks([...overlays, { ...clip('b', spot.track, spot.startMs, spot.endMs) }])).toBe(1);
  });

  it('opens a new layer only when every layer is busy at that moment', () => {
    const overlays = [clip('a', 0, 0, 5_000), clip('b', 1, 1_000, 6_000)];
    expect(placeNew(overlays, { atMs: 2_000, lengthMs: 3_000, durationMs: VIDEO, preferTrack: null }).track).toBe(2);
  });

  it('prefers the highest layer with room, so the new element is in front', () => {
    const overlays = [clip('a', 0, 0, 2_000), clip('b', 1, 0, 2_000), clip('c', 2, 8_000, 9_000)];
    expect(placeNew(overlays, { atMs: 4_000, lengthMs: 3_000, durationMs: VIDEO, preferTrack: null }).track).toBe(2);
  });

  it('goes on a chosen layer at the playhead when it fits there', () => {
    const overlays = [clip('a', 0, 0, 2_000), clip('b', 1, 0, 2_000)];
    expect(placeNew(overlays, { atMs: 3_000, lengthMs: 3_000, durationMs: VIDEO, preferTrack: 0 }))
      .toEqual({ track: 0, startMs: 3_000, endMs: 6_000 });
  });

  it('stacks straight after the element it would have landed on, on a chosen layer', () => {
    const overlays = [clip('a', 0, 1_000, 5_000)];
    expect(placeNew(overlays, { atMs: 2_000, lengthMs: 3_000, durationMs: VIDEO, preferTrack: 0 }))
      .toEqual({ track: 0, startMs: 5_000, endMs: 8_000 });
  });

  it('skips past a run of clips to the first gap long enough', () => {
    const overlays = [clip('a', 0, 1_000, 4_000), clip('b', 0, 4_500, 7_000)];
    // The 500ms between them is too short for a 3s clip.
    expect(placeNew(overlays, { atMs: 2_000, lengthMs: 3_000, durationMs: VIDEO, preferTrack: 0 }).startMs).toBe(7_000);
  });

  it('falls back to the usual rule when the chosen layer is full to the end', () => {
    const overlays = [clip('a', 0, 0, VIDEO)];
    const spot = placeNew(overlays, { atMs: 2_000, lengthMs: 3_000, durationMs: VIDEO, preferTrack: 0 });
    expect(spot.track).toBe(1);
  });

  it('never goes past the last layer', () => {
    const overlays = Array.from({ length: MAX_TRACKS }, (_, i) => clip(`c${i}`, i, 0, VIDEO));
    expect(placeNew(overlays, { atMs: 1_000, lengthMs: 3_000, durationMs: VIDEO, preferTrack: null }).track).toBe(MAX_TRACKS - 1);
  });

  it('keeps a new element inside the video', () => {
    const spot = placeNew([], { atMs: 14_000, lengthMs: 3_000, durationMs: VIDEO, preferTrack: null });
    expect(spot.endMs).toBeLessThanOrEqual(VIDEO);
    expect(spot.endMs - spot.startMs).toBe(3_000);
  });
});

describe('dropping a dragged element', () => {
  it('stays where it was dropped when it fits', () => {
    const overlays = [clip('a', 0, 0, 2_000), clip('b', 1, 4_000, 6_000)];
    expect(settleTrack(overlays, 'b', 1, 0)).toBe(1);
  });

  it('goes back to the layer it came from when dropped on top of something', () => {
    const overlays = [clip('a', 0, 0, 3_000), clip('b', 0, 1_000, 2_000)];
    expect(settleTrack(overlays, 'b', 0, 1)).toBe(1);
  });

  it('otherwise finds the nearest layer above with room', () => {
    const overlays = [clip('a', 0, 0, 3_000), clip('c', 1, 0, 3_000), clip('b', 0, 1_000, 2_000)];
    expect(settleTrack(overlays, 'b', 0, 0)).toBe(2);
  });
});

describe('closing up empty layers', () => {
  it('renumbers so there is no empty layer in between, keeping the order', () => {
    const compact = compactTracks([clip('a', 0, 0, 1), clip('b', 3, 0, 1), clip('c', 5, 0, 1)]);
    expect(compact.map((o) => o.track)).toEqual([0, 1, 2]);
  });

  it('returns the same array when there is nothing to close up', () => {
    const overlays = [clip('a', 0, 0, 1), clip('b', 1, 0, 1)];
    expect(compactTracks(overlays)).toBe(overlays);
  });

  it('knows an overlap from a touch', () => {
    const overlays = [clip('a', 0, 0, 2_000)];
    expect(overlapsOn(overlays, 0, 2_000, 3_000)).toBe(false);
    expect(overlapsOn(overlays, 0, 1_999, 3_000)).toBe(true);
    expect(overlapsOn(overlays, 0, 1_000, 3_000, 'a')).toBe(false);
  });
});
