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

type Recording = { readonly log: Call[]; readonly problems: string[] };

/**
 * A context that records instead of drawing. It keeps a save/restore stack
 * of `globalAlpha` so it can tell an assignment from a multiplication.
 */
function recorder(startAlpha = 0.5): { ctx: Ctx2D; rec: Recording } {
  const rec: Recording = { log: [], problems: [] };
  const state: Record<string | symbol, unknown> = { globalAlpha: startAlpha };
  const stack: number[] = [];
  const handler: ProxyHandler<Record<string | symbol, unknown>> = {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        const name = String(prop);
        rec.log.push([name, ...args.map((a) => (typeof a === 'object' && a !== null ? '{}' : a))]);
        if (name === 'save') stack.push(target['globalAlpha'] as number);
        if (name === 'restore') {
          if (stack.length === 0) rec.problems.push('restore without save');
          else target['globalAlpha'] = stack.pop();
        }
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
  return { ctx: new Proxy(state, handler) as unknown as Ctx2D, rec };
}

const BOX = 200;

function boxOf(def: StickerDef): { w: number; h: number } {
  return def.aspect >= 1 ? { w: BOX, h: BOX / def.aspect } : { w: BOX * def.aspect, h: BOX };
}

function draw(def: StickerDef, t: number, labels: Record<string, string> = {}, seed = 7): Recording {
  const { ctx, rec } = recorder();
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
    text: (label, cx, cy, maxW, sizePx, color) => { rec.log.push(['text', label, cx, cy, maxW, sizePx, color]); },
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
