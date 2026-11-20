import { describe, expect, it } from 'vitest';
import type { Ctx2D } from '@/core/types';
import { STICKERS, STICKER_CATEGORIES, stickerDef } from './catalog';
import type { StickerDef, StickerSample } from './types';

/**
 * The sticker library (D-158).
 *
 * Stickers are pure functions of time drawn in the preview and in the export
 * worker, so these test what makes that safe — the same moment draws the
 * same thing, the loop has no seam, state is put back, alpha is only ever
 * multiplied, words go through `sample.text` — rather than how anything
 * looks, which the contact sheet and the visual suite own.
 */

/** Every call made on a context, in order — a drawing, as data. */
type Call = readonly unknown[];

type Recording = {
  readonly log: Call[];
  readonly problems: string[];
  /**
   * How much ink the drawing put down where it can be seen (D-170): the
   * length of every stroked or filled outline, and of every word, at the
   * scale it was drawn, counted only where its alpha is at least a fifth of
   * the sticker's own. A measure rather than a rasterisation, but enough to
   * tell an empty frame from a drawn one.
   */
  ink: number;
};

/** Below this much outline, in pixels on a 200px box, a sticker has as good as vanished. */
const MIN_INK = 120;

/** The share of the sticker's own alpha below which ink is not counted as seen. */
const SEEN_ALPHA = 0.2;

type Point = readonly [number, number];
const dist = (a: Point | null, b: Point): number => (a === null ? 0 : Math.hypot(b[0] - a[0], b[1] - a[1]));
const num = (args: readonly unknown[], i: number): number => (typeof args[i] === 'number' ? args[i] : 0);

/**
 * A context that records instead of drawing. It keeps a save/restore stack
 * of `globalAlpha` so it can tell an assignment from a multiplication, and
 * of the drawing scale and the path being built so it can measure ink.
 */
function recorder(startAlpha = 0.5): { ctx: Ctx2D; rec: Recording; seen: (amount: number) => void } {
  const rec: Recording = { log: [], problems: [], ink: 0 };
  const state: Record<string | symbol, unknown> = { globalAlpha: startAlpha };
  const stack: { alpha: number; scale: number }[] = [];
  let scale = 1;
  let path = 0;
  let cur: Point | null = null;
  let first: Point | null = null;
  /** Ink in the context's own units, put down at the current alpha and scale. */
  const seen = (amount: number): void => {
    if ((state['globalAlpha'] as number) / startAlpha >= SEEN_ALPHA) rec.ink += amount * scale;
  };
  const to = (args: readonly unknown[], i: number): void => {
    const next: Point = [num(args, i), num(args, i + 1)];
    path += dist(cur, next);
    cur = next;
  };
  const measure = (name: string, args: readonly unknown[]): void => {
    switch (name) {
      case 'beginPath': path = 0; cur = null; first = null; return;
      case 'moveTo': cur = [num(args, 0), num(args, 1)]; first = cur; return;
      case 'lineTo': to(args, 0); return;
      case 'quadraticCurveTo': to(args, 2); return;
      case 'bezierCurveTo': to(args, 4); return;
      case 'arcTo': to(args, 2); return;
      case 'arc': {
        const r = Math.abs(num(args, 2));
        path += r * Math.min(Math.PI * 2, Math.abs(num(args, 4) - num(args, 3)));
        cur = [num(args, 0) + Math.cos(num(args, 4)) * r, num(args, 1) + Math.sin(num(args, 4)) * r];
        first ??= cur;
        return;
      }
      case 'ellipse': {
        const r = (Math.abs(num(args, 2)) + Math.abs(num(args, 3))) / 2;
        path += r * Math.min(Math.PI * 2, Math.abs(num(args, 6) - num(args, 5)));
        cur = [num(args, 0), num(args, 1)];
        first ??= cur;
        return;
      }
      case 'rect':
      case 'roundRect': path += 2 * (Math.abs(num(args, 2)) + Math.abs(num(args, 3))); return;
      case 'closePath': if (first !== null) path += dist(cur, first); cur = first; return;
      case 'fill':
      case 'stroke': seen(path); return;
      case 'fillRect':
      case 'strokeRect': seen(2 * (Math.abs(num(args, 2)) + Math.abs(num(args, 3)))); return;
      case 'scale': scale *= Math.sqrt(Math.abs(num(args, 0) * num(args, 1))); return;
      default: return;
    }
  };
  const handler: ProxyHandler<Record<string | symbol, unknown>> = {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        const name = String(prop);
        rec.log.push([name, ...args.map((a) => (typeof a === 'object' && a !== null ? '{}' : a))]);
        if (name === 'save') stack.push({ alpha: target['globalAlpha'] as number, scale });
        if (name === 'restore') {
          const top = stack.pop();
          if (top === undefined) rec.problems.push('restore without save');
          else {
            target['globalAlpha'] = top.alpha;
            scale = top.scale;
          }
        }
        measure(name, args);
        if (name === 'fillText' || name === 'strokeText') rec.problems.push(`${name} called directly`);
        if (name === 'drawImage' || name === 'putImageData') rec.problems.push(`${name} called`);
        if (name.startsWith('create')) return { addColorStop: () => undefined };
        if (name === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(target, prop, value) {
      const name = String(prop);
      if (name === 'filter') rec.problems.push('ctx.filter set');
      if (name === 'globalAlpha' && typeof value === 'number' && value > (target['globalAlpha'] as number) + 1e-9) {
        rec.problems.push(`globalAlpha raised from ${String(target['globalAlpha'])} to ${value}`);
      }
      if (name === 'globalAlpha' && typeof value === 'number' && !Number.isFinite(value)) rec.problems.push('globalAlpha not finite');
      target[prop] = value;
      rec.log.push(['set', name, typeof value === 'object' && value !== null ? '{}' : value]);
      return true;
    },
  };
  return { ctx: new Proxy(state, handler) as unknown as Ctx2D, rec, seen };
}

const BOX = 200;

function boxOf(def: StickerDef): { w: number; h: number } {
  return def.aspect >= 1 ? { w: BOX, h: BOX / def.aspect } : { w: BOX * def.aspect, h: BOX };
}

function draw(def: StickerDef, t: number, labels: Record<string, string> = {}, seed = 7): Recording {
  const { ctx, rec, seen } = recorder();
  const { w, h } = boxOf(def);
  const defaults: Record<string, string> = {};
  for (const label of def.labels ?? []) defaults[label.key] = label.text;
  const sample: StickerSample = {
    t,
    p: t / def.loopMs,
    w,
    h,
    primary: '#3B82F6',
    secondary: '#FFB300',
    onPrimary: '#141418',
    ink: '#FFFFFF',
    labels: { ...defaults, ...labels },
    seed,
    text: (label, cx, cy, maxW, sizePx, color) => {
      rec.log.push(['text', label, cx, cy, maxW, sizePx, color]);
      // Words are ink too: the outline of the line they fill, about half their size a letter.
      seen(2 * (Math.min(maxW, label.length * sizePx * 0.5) + sizePx));
    },
  };
  def.draw(ctx, sample);
  return rec;
}

/** The ids projects store, in picker order. A sticker is added, never renamed or removed. */
const IDS = [
  'subscribe', 'like', 'love', 'bell', 'follow', 'share', 'comment', 'save',
  'react-laugh', 'react-wow', 'react-love', 'react-sad', 'react-angry', 'react-cool',
  'burst-new', 'burst-sale', 'star-burst', 'check', 'live', 'fire', 'limited', 'rating',
  'pointer-arrow', 'pointer-hand', 'click-cursor', 'swipe-up', 'arrow-curve', 'circle-scribble', 'sparkles', 'confetti',
];

/** Any emoji or pictograph: words on stickers are words, never glyphs. */
const EMOJI = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\u{FE0F}/u;

/** Two drawings match when they make the same calls with numbers close enough not to see. */
function seamGap(a: readonly Call[], b: readonly Call[], tolerance: number): string | null {
  if (a.length !== b.length) return `${a.length} calls at the start, ${b.length} at the end`;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? [];
    const y = b[i] ?? [];
    if (x.length !== y.length || x[0] !== y[0]) return `call ${i}: ${String(x[0])} vs ${String(y[0])}`;
    for (let j = 1; j < x.length; j++) {
      const u = x[j];
      const v = y[j];
      if (typeof u === 'number' && typeof v === 'number') {
        // Alpha and angles are small numbers: hold them to a small absolute gap.
        const limit = x[0] === 'set' || x[0] === 'rotate' || x[0] === 'scale' ? 0.03 : tolerance;
        if (Math.abs(u - v) > limit) return `call ${i} (${String(x[0])} ${String(x[1])}): ${u} vs ${v}`;
      } else if (typeof u === 'string' && typeof v === 'string' && u !== v) {
        const nu = u.match(/-?\d*\.?\d+(e-?\d+)?/g) ?? [];
        const nv = v.match(/-?\d*\.?\d+(e-?\d+)?/g) ?? [];
        if (u.replace(/-?\d*\.?\d+(e-?\d+)?/g, '#') !== v.replace(/-?\d*\.?\d+(e-?\d+)?/g, '#')) return `call ${i}: "${u}" vs "${v}"`;
        if (nu.some((n, k) => Math.abs(Number(n) - Number(nv[k])) > 0.03)) return `call ${i}: "${u}" vs "${v}"`;
      } else if (u !== v) {
        return `call ${i}: ${String(u)} vs ${String(v)}`;
      }
    }
  }
  return null;
}

describe('sticker catalogue', () => {
  it('keeps every id, in picker order', () => {
    expect(STICKERS.map((def) => def.id)).toEqual(IDS);
    expect(new Set(IDS).size).toBe(IDS.length);
  });

  it('finds each sticker by id, and nothing for an unknown one', () => {
    for (const def of STICKERS) expect(stickerDef(def.id)).toBe(def);
    expect(stickerDef('from-a-newer-build')).toBeUndefined();
  });

  it('has stickers in every category, and only in those', () => {
    for (const category of STICKER_CATEGORIES) expect(STICKERS.some((def) => def.category === category)).toBe(true);
    for (const def of STICKERS) expect(STICKER_CATEGORIES).toContain(def.category);
  });

  it('describes each sticker sensibly', () => {
    for (const def of STICKERS) {
      expect(def.name.length, def.id).toBeGreaterThan(0);
      expect(def.keywords.length, def.id).toBeGreaterThan(0);
      expect(def.aspect, def.id).toBeGreaterThan(0);
      expect(def.loopMs, def.id).toBeGreaterThan(0);
      expect(def.posterMs, def.id).toBeGreaterThanOrEqual(0);
      expect(def.posterMs, def.id).toBeLessThan(def.loopMs);
      if (def.size !== undefined) {
        expect(def.size, def.id).toBeGreaterThan(0);
        expect(def.size, def.id).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives every label a unique key and default words that fit, with no emoji', () => {
    for (const def of STICKERS) {
      const keys = (def.labels ?? []).map((label) => label.key);
      expect(new Set(keys).size, def.id).toBe(keys.length);
      for (const label of def.labels ?? []) {
        expect(label.text.length, `${def.id}.${label.key}`).toBeGreaterThan(0);
        expect(label.text.length, `${def.id}.${label.key}`).toBeLessThanOrEqual(label.maxChars);
        expect(EMOJI.test(label.text), `${def.id}.${label.key}`).toBe(false);
      }
    }
  });
});

describe.each(STICKERS.map((def) => [def.id, def] as const))('%s', (_id, def) => {
  const moments = [0, def.posterMs, def.loopMs / 4, def.loopMs / 2, (def.loopMs * 3) / 4, def.loopMs - 1];

  it('draws at every moment of its loop, putting state back and only multiplying alpha', () => {
    for (const t of moments) {
      const rec = draw(def, t);
      expect(rec.problems, `t=${t}`).toEqual([]);
      const saves = rec.log.filter((c) => c[0] === 'save').length;
      const restores = rec.log.filter((c) => c[0] === 'restore').length;
      expect(restores, `t=${t}`).toBe(saves);
      expect(rec.log.length, `t=${t}`).toBeGreaterThan(0);
      for (const call of rec.log) {
        for (const arg of call.slice(1)) if (typeof arg === 'number') expect(Number.isFinite(arg), `${String(call[0])} at t=${t}`).toBe(true);
      }
    }
  });

  /*
   * D-158 promises a sticker never disappears inside its loop, so an Image
   * that rests on any moment shows it (D-170: the drawn arrow and the
   * scribbled circle were empty for about 4% at each end of theirs). Every
   * 1/96th of the loop, and its very ends, must put down visible ink.
   */
  it('shows itself at every moment of its loop', () => {
    const times = [...Array.from({ length: 96 }, (_, i) => (def.loopMs * i) / 96), def.loopMs - 1];
    for (const t of times) expect(draw(def, t).ink, `t=${Math.round(t)}`).toBeGreaterThanOrEqual(MIN_INK);
  });

  it('draws the same thing at the same moment', () => {
    for (const t of moments) expect(draw(def, t).log).toEqual(draw(def, t).log);
  });

  it('has no seam: the end of the loop matches its start', () => {
    const gap = seamGap(draw(def, 0).log, draw(def, def.loopMs - 1).log, BOX * 0.03);
    expect(gap).toBeNull();
  });

  it('writes words only through sample.text, never as emoji', () => {
    for (let i = 0; i < 24; i++) {
      for (const call of draw(def, (def.loopMs * i) / 24).log) {
        if (call[0] === 'text') expect(EMOJI.test(String(call[1]))).toBe(false);
      }
    }
  });

  it("shows the person's own words for each of its labels", () => {
    const own: Record<string, string> = {};
    for (const label of def.labels ?? []) own[label.key] = `W${label.key}`.slice(0, label.maxChars);
    const shown = new Set<string>();
    for (let i = 0; i < 48; i++) {
      for (const call of draw(def, (def.loopMs * i) / 48, own).log) if (call[0] === 'text') shown.add(String(call[1]));
    }
    for (const words of Object.values(own)) expect(shown).toContain(words);
  });

  it('draws with any seed', () => {
    for (const seed of [0, 1, 0xffffffff]) expect(draw(def, def.posterMs, {}, seed).problems).toEqual([]);
  });
});
