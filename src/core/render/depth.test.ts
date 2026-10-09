import { describe, expect, it } from 'vitest';
import { colorFill, type Layer } from '@/core/types';
import { depthOrdered, turnOf } from './depth';

const card = (id: string, z: [number, number]): Layer => ({
  id,
  type: 'shape',
  startMs: 0,
  endMs: 1000,
  tracks: { z: [{ t: 0, v: z[0], ease: 'linear' }, { t: 1000, v: z[1], ease: 'linear' }] },
  props: { shape: 'rect', w: 10, h: 10, fill: colorFill('#000') },
});

describe('depth order (D-117)', () => {
  it('draws the nearest last, and re-orders as cards pass each other', () => {
    const layers = [card('a', [0, 1]), card('b', [1, 0])];
    expect(depthOrdered(layers, 100).map((l) => l.id)).toEqual(['a', 'b']);
    expect(depthOrdered(layers, 900).map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('keeps the template order for ties', () => {
    const layers = [card('a', [0, 0]), card('b', [0, 0]), card('c', [0, 0])];
    expect(depthOrdered(layers, 500).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('turning (D-117)', () => {
  it('is nothing at rest', () => {
    expect(turnOf(0, 0)).toBeNull();
  });

  it('foreshortens and shades as a card turns away, never to nothing', () => {
    const half = turnOf(60, 0);
    expect(half?.a).toBeCloseTo(0.5, 5);
    expect(half?.d).toBe(1);
    expect(half?.shade ?? 0).toBeGreaterThan(0.1);
    const edge = turnOf(90, 0);
    expect(Math.abs(edge?.a ?? 0)).toBeGreaterThan(0);
    // Seen from behind it is mirrored and darker still.
    const back = turnOf(150, 0);
    expect(back?.a ?? 0).toBeLessThan(0);
    expect(back?.shade ?? 0).toBeGreaterThan(half?.shade ?? 0);
  });
});
