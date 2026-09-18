import { describe, expect, it } from 'vitest';
import type { Scene, Transition } from '@/document/types';
import { activeScenesAt, sceneSpans } from './timeline';

const scene = (id: string, durationMs: number, transitionIn: Transition | null = null): Scene =>
  ({ id, templateId: 't', durationMs, transitionIn, inputs: null as never });

const fade = (durationMs: number): Transition => ({ kind: 'crossFade', durationMs });

describe('sceneSpans — D-004 overlapping transitions', () => {
  it('lays scenes end to end when there are no transitions', () => {
    const spans = sceneSpans([scene('a', 3000), scene('b', 2000)]);
    expect(spans.map((s) => [s.startMs, s.endMs])).toEqual([[0, 3000], [3000, 5000]]);
  });

  it('pulls the incoming scene back by the transition duration', () => {
    const spans = sceneSpans([scene('a', 3000), scene('b', 3000, fade(500))]);
    expect(spans.map((s) => [s.startMs, s.endMs])).toEqual([[0, 3000], [2500, 5500]]);
  });

  it('shortens the total by the sum of the transitions', () => {
    const spans = sceneSpans([
      scene('a', 3000),
      scene('b', 3000, fade(500)),
      scene('c', 3000, fade(800)),
    ]);
    // 9000 raw − 1300 of overlap
    expect(spans.at(-1)?.endMs).toBe(7700);
  });

  it('keeps both scenes inside their own valid range during the overlap', () => {
    const spans = sceneSpans([scene('a', 3000), scene('b', 3000, fade(500))]);
    const [a, b] = spans;
    if (!a || !b) throw new Error('expected two spans');
    // At the midpoint of the overlap, A is at local 2750 (< its 3000) and
    // B is at local 250 (>= 0). Neither is reading outside its own content.
    const mid = 2750;
    expect(mid - a.startMs).toBeLessThan(a.scene.durationMs);
    expect(mid - b.startMs).toBeGreaterThanOrEqual(0);
  });

  it('ignores a transition on the first scene — there is nothing to come from', () => {
    const spans = sceneSpans([scene('a', 3000, fade(500)), scene('b', 3000)]);
    expect(spans[0]?.startMs).toBe(0);
    expect(spans[0]?.transitionIn).toBeNull();
  });

  it('treats a cut as zero overlap', () => {
    const spans = sceneSpans([scene('a', 3000), scene('b', 3000, { kind: 'cut', durationMs: 400 })]);
    expect(spans[1]?.startMs).toBe(3000);
  });

  it('clamps an overlong transition to half the shorter neighbour, so the timeline cannot fold', () => {
    const spans = sceneSpans([scene('a', 1000), scene('b', 4000, fade(9999))]);
    expect(spans[1]?.startMs).toBe(500);
    expect(spans[1]?.startMs).toBeGreaterThanOrEqual(spans[0]?.startMs ?? 0);
  });
});

describe('activeScenesAt', () => {
  const spans = sceneSpans([scene('a', 3000), scene('b', 3000, fade(500))]);

  it('returns one scene outside a transition', () => {
    const at = activeScenesAt(spans, 1000);
    expect(at?.current.scene.id).toBe('a');
    expect(at?.incoming).toBeUndefined();
    expect(at?.progress).toBe(0);
  });

  it('returns both scenes with progress during the overlap', () => {
    const at = activeScenesAt(spans, 2750);
    expect(at?.current.scene.id).toBe('a');
    expect(at?.incoming?.scene.id).toBe('b');
    expect(at?.progress).toBeCloseTo(0.5, 6);
  });

  it('runs progress from 0 to 1 across the overlap', () => {
    expect(activeScenesAt(spans, 2500)?.progress).toBeCloseTo(0, 6);
    expect(activeScenesAt(spans, 2999.9)?.progress).toBeGreaterThan(0.99);
  });

  it('settles on the incoming scene once the overlap ends', () => {
    const at = activeScenesAt(spans, 3200);
    expect(at?.current.scene.id).toBe('b');
    expect(at?.incoming).toBeUndefined();
  });

  it('clamps before the start and after the end rather than returning nothing', () => {
    expect(activeScenesAt(spans, -100)?.current.scene.id).toBe('a');
    expect(activeScenesAt(spans, 99999)?.current.scene.id).toBe('b');
  });
});
