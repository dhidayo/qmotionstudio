import type { Ctx2D } from '@/core/types';

/**
 * A 2D context that records instead of drawing, for tests in Node (D-158).
 *
 * Node has no canvas, and what a drawing test asks is *what was asked for*:
 * which paths were traced, in what order, with what colours. Every method
 * call is logged with its arguments, every property set as ['set', name,
 * value]. Objects (gradients, transforms) are logged as '{}' so logs compare
 * as plain data. `measureText` answers ten pixels a character, so text
 * layout is arithmetic rather than whichever fonts the machine has.
 */

/** One call on the context — a drawing, as data. */
export type Call = readonly unknown[];

export function recorder(log: Call[], size = { w: 1080, h: 1080 }): Ctx2D {
  const state: Record<string | symbol, unknown> = {
    canvas: { width: size.w, height: size.h },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
  };
  const handler: ProxyHandler<Record<string | symbol, unknown>> = {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') {
        return (text: string) => {
          log.push(['measureText', text]);
          return { width: Array.from(text).length * 10 };
        };
      }
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

/** The calls of one kind, without the others: `only(log, 'lineTo')`. */
export function only(log: readonly Call[], name: string): Call[] {
  return log.filter((call) => call[0] === name);
}
