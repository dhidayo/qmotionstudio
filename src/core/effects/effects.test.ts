import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Ctx2D, FxInstance, Palette, Size } from '@/core/types';
import { createProps } from '@/core/anim/interpolate';
import { ELEMENT_EFFECTS, FRAME_EFFECTS, effectName, elementEffect, frameEffect } from './catalog';
import { activeElementFx, applyElementMotion, coverScale, frameCamera, fxOf } from './run';
import { envelope, hashString, rand } from './random';
import { identityOffset, readParams, type ElementSample, type FrameIO, type FrameSample } from './types';

/**
 * The effect library (D-100).
 *
 * The renderer is a pure function of time, so these test the properties that
 * make that true — the same moment draws the same thing, "0%" means none,
 * every effect in the catalogue runs without throwing at any point of its
 * window — rather than how anything looks, which the visual suite owns.
 */

const palette: Palette = { bg: '#101014', surface: '#1c1c22', ink: '#ffffff', inkMuted: '#a0a0a8', accent: '#3b82f6' };
const design: Size = { w: 1080, h: 1920 };

/** Every call made on a context, in order — a drawing, as data. */
type Call = readonly unknown[];

/**
 * A context that records instead of drawing. Node has no canvas, and what is
 * being tested is *what was asked for*, which is exactly what this captures.
 */
function recorder(log: Call[]): Ctx2D {
  const state: Record<string | symbol, unknown> = {
    canvas: { width: design.w, height: design.h },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
  };
  const handler: ProxyHandler<Record<string | symbol, unknown>> = {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (prop === 'createImageData') return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
      return (...args: unknown[]) => {
        log.push([String(prop), ...args.map((a) => (typeof a === 'object' && a !== null ? '{}' : a))]);
        if (typeof prop === 'string' && prop.startsWith('create')) return { addColorStop: () => undefined };
        return undefined;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      log.push(['set', String(prop), typeof value === 'object' && value !== null ? '{}' : value]);
      return true;
    },
  };
  return new Proxy(state, handler) as unknown as Ctx2D;
}

/** Node has no OffscreenCanvas; the scratch surfaces only need to accept drawing. */
class FakeOffscreen {
  width: number;
  height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext(): Ctx2D { return recorder([]); }
}

const realOffscreen = (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
beforeAll(() => { (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = FakeOffscreen; });
afterAll(() => { (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = realOffscreen; });

function io(): FrameIO {
  return {
    source: {} as CanvasImageSource,
    px: design,
    scale: 1,
    scratch: () => ({ canvas: new FakeOffscreen(design.w, design.h) as unknown as OffscreenCanvas, ctx: recorder([]) }),
  };
}

function frameSample(id: string, t: number, dur: number, intensity: number, seed = 7): FrameSample {
  const def = frameEffect(id);
  if (!def) throw new Error(id);
  return {
    t, dur, p: t / dur, env: envelope(t, dur, 350), intensity, seed, design,
    unit: Math.min(design.w, design.h), palette, params: readParams(def.params, {}, palette),
  };
}

function drawn(id: string, t: number, intensity: number, seed = 7): Call[] {
  const def = frameEffect(id);
  const log: Call[] = [];
  def?.draw?.(recorder(log), frameSample(id, t, 3_000, intensity, seed), io());
  return log;
}

/** Calls that put paint on the picture. Setting state alone draws nothing. */
const PAINTS = new Set(['fill', 'fillRect', 'stroke', 'drawImage', 'fillText', 'strokeText']);
const paints = (log: readonly Call[]): number => log.filter((call) => PAINTS.has(String(call[0]))).length;

describe('the catalogue', () => {
  it('is large — the point of it', () => {
    expect(FRAME_EFFECTS.length).toBeGreaterThanOrEqual(35);
    expect(ELEMENT_EFFECTS.length).toBeGreaterThanOrEqual(35);
  });

  it('has unique, permanent-looking ids across both kinds', () => {
    const ids = [...FRAME_EFFECTS, ...ELEMENT_EFFECTS].map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('has a name and a one-line description for every card', () => {
    for (const def of [...FRAME_EFFECTS, ...ELEMENT_EFFECTS]) {
      expect(def.name.length, def.id).toBeGreaterThan(1);
      expect(def.blurb.length, def.id).toBeGreaterThan(8);
      expect(effectName(def.id)).toBe(def.name);
    }
  });

  it('has settings whose defaults are inside their own ranges', () => {
    for (const def of [...FRAME_EFFECTS, ...ELEMENT_EFFECTS]) {
      for (const spec of def.params) {
        if (spec.kind === 'number') {
          expect(spec.default, `${def.id}.${spec.key}`).toBeGreaterThanOrEqual(spec.min);
          expect(spec.default, `${def.id}.${spec.key}`).toBeLessThanOrEqual(spec.max);
        }
        if (spec.kind === 'choice') {
          expect(spec.options.some((o) => o.value === spec.default), `${def.id}.${spec.key}`).toBe(true);
        }
      }
    }
  });

  it('puts every element effect in a phase it allows', () => {
    for (const def of ELEMENT_EFFECTS) expect(def.phases, def.id).toContain(def.phase);
  });

  it('names an unknown id after itself rather than throwing — old saves still open', () => {
    expect(effectName('retired-effect')).toBe('retired-effect');
    expect(frameEffect('retired-effect')).toBeUndefined();
    expect(elementEffect('retired-effect')).toBeUndefined();
  });
});

describe('frame effects', () => {
  it.each(FRAME_EFFECTS.map((d) => d.id))('%s runs at every point of its window', (id) => {
    for (const t of [0, 1, 400, 1_500, 2_600, 2_999]) {
      expect(() => drawn(id, t, 1)).not.toThrow();
      const camera = frameEffect(id)?.camera?.(frameSample(id, t, 3_000, 1));
      if (camera) {
        for (const value of [camera.x, camera.y, camera.scale, camera.rotation]) expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it.each(FRAME_EFFECTS.map((d) => d.id))('%s at zero intensity draws nothing and moves nothing', (id) => {
    for (const t of [0, 400, 1_500, 2_600]) {
      expect(paints(drawn(id, t, 0)), `${id} at ${t}ms`).toBe(0);
      const camera = frameEffect(id)?.camera?.(frameSample(id, t, 3_000, 0));
      if (camera) {
        expect(Math.abs(camera.x) + Math.abs(camera.y) + Math.abs(camera.rotation), id).toBeCloseTo(0, 9);
        expect(camera.scale, id).toBeCloseTo(1, 9);
      }
    }
  });

  it.each(FRAME_EFFECTS.filter((d) => d.draw !== undefined).map((d) => d.id))('%s draws the same frame every time', (id) => {
    expect(drawn(id, 1_234, 1)).toEqual(drawn(id, 1_234, 1));
  });

  it('scatters differently for a different seed — two snow effects are two snowfalls', () => {
    expect(drawn('snow', 1_000, 1, 1)).not.toEqual(drawn('snow', 1_000, 1, 2));
  });

  it('actually paints something at full strength in the middle of its window', () => {
    // Effects whose single frame can legitimately be empty: a flash that has
    // decayed, a glitch between bursts, a lightning strike yet to come.
    const between = new Set(['flash', 'glitch', 'lightning', 'shine-sweep', 'film-burn', 'impact']);
    const empty = FRAME_EFFECTS.filter((def) => def.draw && !between.has(def.id) && paints(drawn(def.id, 1_500, 1)) === 0);
    expect(empty.map((def) => def.id)).toEqual([]);
  });
});

describe('the camera', () => {
  it('adds up moves and keeps the frame covered while it moves', () => {
    const list: FxInstance[] = [
      { effectId: 'shake', startMs: 0, endMs: 2_000, intensity: 1, params: {}, seed: 1 },
      { effectId: 'slow-push', startMs: 0, endMs: 2_000, intensity: 1, params: {}, seed: 2 },
    ];
    const camera = frameCamera(list, 1_000, design, palette);
    expect(camera).not.toBeNull();
    if (!camera) return;
    expect(camera.scale).toBeGreaterThan(1);
    // Any offset or turn needs more zoom than none.
    expect(coverScale(camera, design)).toBeGreaterThanOrEqual(1);
    expect(coverScale({ x: 0, y: 0, scale: 1, rotation: 0 }, design)).toBeCloseTo(1, 9);
    expect(coverScale({ x: 40, y: 0, scale: 1, rotation: 0 }, design)).toBeGreaterThan(1);
  });

  it('is null when nothing is moving the frame', () => {
    const snow: FxInstance = { effectId: 'snow', startMs: 0, endMs: 2_000, intensity: 1, params: {}, seed: 1 };
    expect(frameCamera([snow], 1_000, design, palette)).toBeNull();
    expect(frameCamera([{ ...snow, effectId: 'shake' }], 5_000, design, palette)).toBeNull();
  });
});

describe('element effects', () => {
  const size = { w: 400, h: 300 };
  const sample = (id: string, p: number, intensity: number): ElementSample => {
    const def = elementEffect(id);
    if (!def) throw new Error(id);
    return { t: p * 1_000, dur: 1_000, p, intensity, seed: 3, size, palette, params: readParams(def.params, {}, palette) };
  };

  it.each(ELEMENT_EFFECTS.map((d) => d.id))('%s at zero intensity leaves the element exactly as it was', (id) => {
    const def = elementEffect(id);
    for (const p of [0, 0.3, 0.7, 1]) {
      const o = identityOffset();
      def?.motion?.(sample(id, p, 0), o);
      expect(o).toEqual(identityOffset());
      const log: Call[] = [];
      const box = { x: -200, y: -150, w: 400, h: 300, radius: 0 };
      def?.under?.(recorder(log), sample(id, p, 0), box);
      def?.over?.(recorder(log), sample(id, p, 0), box);
      def?.onto?.(recorder(log), sample(id, p, 0), box);
      expect(paints(log), `${id} at ${p}`).toBe(0);
      const glow = def?.glow?.(sample(id, p, 0));
      if (glow) expect(glow.radius).toBe(0);
    }
  });

  it('entrances arrive: hidden or displaced at the start, untouched at the end', () => {
    for (const def of ELEMENT_EFFECTS.filter((d) => d.category === 'Entrance')) {
      const start = identityOffset();
      def.motion?.(sample(def.id, 0, 1), start);
      const end = identityOffset();
      def.motion?.(sample(def.id, 1, 1), end);
      const moved = start.opacity < 0.9 || Math.abs(start.x) + Math.abs(start.y) > 1 || Math.abs(start.rotation) > 1
        || Math.abs(start.scaleX - 1) > 0.05 || Math.abs(start.scaleY - 1) > 0.05 || start.blur > 1;
      expect(moved, `${def.id} should start somewhere else`).toBe(true);
      expect(end.opacity, def.id).toBeCloseTo(1, 2);
      expect(Math.abs(end.x) + Math.abs(end.y), def.id).toBeLessThan(1);
    }
  });

  it('exits leave: untouched at the start, gone or nearly by the end', () => {
    for (const def of ELEMENT_EFFECTS.filter((d) => d.category === 'Exit')) {
      const start = identityOffset();
      def.motion?.(sample(def.id, 0, 1), start);
      const end = identityOffset();
      def.motion?.(sample(def.id, 1, 1), end);
      expect(start.opacity, def.id).toBeCloseTo(1, 2);
      expect(end.opacity, def.id).toBeLessThan(0.2);
    }
  });

  it('holds an entrance before it starts and an exit after it ends', () => {
    const fx: FxInstance[] = [
      { effectId: 'zoom-in', startMs: 500, endMs: 1_000, intensity: 1, params: {}, seed: 1 },
      { effectId: 'fade-out', startMs: 2_000, endMs: 2_500, intensity: 1, params: {}, seed: 2 },
      { effectId: 'pulse', startMs: 1_000, endMs: 2_000, intensity: 1, params: {}, seed: 3 },
    ];
    const before = activeElementFx(fx, 100, size, palette);
    expect(before?.map((a) => a.def.id)).toEqual(['zoom-in']);
    expect(before?.[0]?.sample.p).toBe(0);
    const after = activeElementFx(fx, 3_000, size, palette);
    expect(after?.map((a) => a.def.id)).toEqual(['fade-out']);
    expect(after?.[0]?.sample.p).toBe(1);
    expect(activeElementFx(fx, 1_500, size, palette)?.map((a) => a.def.id)).toEqual(['pulse']);
  });

  it('folds motion into the layer, multiplying what multiplies and adding what adds', () => {
    const props = createProps();
    props.x = 100;
    props.opacity = 0.8;
    const active = activeElementFx([{ effectId: 'fade-in', startMs: 0, endMs: 1_000, intensity: 1, params: {}, seed: 1 }], 0, size, palette);
    expect(active).not.toBeNull();
    applyElementMotion(active ?? [], props);
    expect(props.x).toBe(100);
    expect(props.opacity).toBeCloseTo(0, 6);
  });
});

describe('seeds', () => {
  it('come from the effect’s id, so deleting one effect does not reshuffle another', () => {
    const a = { id: 'fx-a', effectId: 'snow', startMs: 0, endMs: 1, intensity: 1, params: {} };
    const b = { id: 'fx-b', effectId: 'snow', startMs: 0, endMs: 1, intensity: 1, params: {} };
    const both = fxOf([a, b]);
    const alone = fxOf([b]);
    expect(both[1]?.seed).toBe(alone[0]?.seed);
    expect(both[0]?.seed).toBe(hashString('fx-a'));
  });

  it('give values that are fixed for an index and spread across [0, 1)', () => {
    expect(rand(5, 9, 2)).toBe(rand(5, 9, 2));
    const values = Array.from({ length: 2_000 }, (_, i) => rand(11, i));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});
