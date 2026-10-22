import { describe, expect, it } from 'vitest';
import type { Overlay } from '@/document/types';
import { layersInSpan, placeAmong } from './sceneLayers';
import { MAX_TRACKS } from './tracks';

const layer = (id: string, startMs: number, endMs: number, track = 0, extra: Partial<Overlay> = {}): Overlay => ({
  id,
  track,
  startMs,
  endMs,
  kind: 'text',
  content: { kind: 'text', text: id } as Overlay['content'],
  transform: { x: 0.5, y: 0.5 },
  enterAnim: 'fade',
  exitAnim: 'fade',
  ...extra,
});

describe('a scene’s layers, moved with the scene (D-155)', () => {
  it('keeps only the layers that show during the stretch, moved to its new start', () => {
    const layers = [layer('before', 0, 900), layer('inside', 1_200, 2_000), layer('after', 5_000, 6_000)];
    const kept = layersInSpan(layers, { fromMs: 1_000, toMs: 4_000 }, 0);
    expect(kept.map((o) => [o.id, o.startMs, o.endMs])).toEqual([['inside', 200, 1_000]]);
  });

  it('cuts a layer that runs over either edge to the stretch', () => {
    const kept = layersInSpan([layer('long', 500, 9_000)], { fromMs: 1_000, toMs: 4_000 }, 6_000);
    expect(kept.map((o) => [o.startMs, o.endMs])).toEqual([[6_000, 9_000]]);
  });

  it('keeps a moving layer’s motion where it was when its start is cut off', () => {
    const moving = layer('move', 0, 4_000, 0, {
      poses: [
        { atMs: 0, transform: { x: 0, y: 0.5 } },
        { atMs: 2_000, transform: { x: 1, y: 0.5 } },
      ],
      easing: 'linear',
    });
    const [kept] = layersInSpan([moving], { fromMs: 1_000, toMs: 4_000 }, 0);
    expect(kept?.startMs).toBe(0);
    expect(kept?.poses?.map((pose) => pose.atMs)).toEqual([0, 1_000]);
    // Half way along a linear move when the cut was made, and still there.
    expect(kept?.poses?.[0]?.transform.x).toBeCloseTo(0.5, 6);
    expect(kept?.poses?.[1]?.transform.x).toBe(1);
  });

  it('leaves the motion alone when nothing is cut from the start', () => {
    const poses = [{ atMs: 0, transform: { x: 0 } }, { atMs: 500, transform: { x: 1 } }];
    const [kept] = layersInSpan([layer('move', 1_500, 3_000, 0, { poses })], { fromMs: 1_000, toMs: 4_000 }, 0);
    expect(kept?.poses).toBe(poses);
  });

  it('drops nothing and moves nothing for a stretch that is the whole layer', () => {
    const kept = layersInSpan([layer('a', 0, 2_000, 2)], { fromMs: 0, toMs: 2_000 }, 0);
    expect(kept).toEqual([layer('a', 0, 2_000, 2)]);
  });
});

describe('placing incoming layers among others (D-155)', () => {
  it('keeps their own rows when nothing is in the way', () => {
    const placed = placeAmong([layer('x', 0, 1_000, 0)], [layer('a', 2_000, 3_000, 0), layer('b', 2_000, 3_000, 1)]);
    expect(placed.map((o) => o.track)).toEqual([0, 1]);
  });

  it('moves the whole set up together, keeping its order front to back', () => {
    const existing = [layer('x', 0, 5_000, 0)];
    const placed = placeAmong(existing, [layer('a', 1_000, 2_000, 0), layer('b', 1_000, 2_000, 1)]);
    expect(placed.map((o) => o.track)).toEqual([1, 2]);
  });

  it('takes the first free row for each when no shift fits under the limit', () => {
    const existing = Array.from({ length: MAX_TRACKS - 1 }, (_, track) => layer(`x${track}`, 0, 5_000, track));
    const placed = placeAmong(existing, [layer('a', 1_000, 2_000, 0), layer('b', 1_000, 2_000, 1)]);
    expect(placed.map((o) => o.track)).toEqual([MAX_TRACKS - 1, MAX_TRACKS - 1]);
  });

  it('adds nothing when there is nothing to add', () => {
    expect(placeAmong([layer('x', 0, 1_000)], [])).toEqual([]);
  });
});
