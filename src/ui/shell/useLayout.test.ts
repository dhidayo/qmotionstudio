import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAYOUT_MEDIA } from '../../../deploy/layouts';
import { currentLayout, PHONE_MAX, PHONE_SIDEWAYS_MAX_HEIGHT } from './useLayout';

/**
 * The page fetches the phone's or the wide layout's chunk by a media query
 * (deploy/layouts.ts, D-173) before any script has run; the editor then draws
 * the one `useLayout` chooses. If the two disagreed, a device would download
 * the wrong layout and wait on the right one, so they are checked against
 * each other across sizes either side of every break.
 */

type Screen = { width: number; height: number; pointer: 'fine' | 'coarse' | 'none' };

/** The queries' own small grammar: `,` is or, `and` is and, each feature a width, height or pointer. */
function matches(query: string, screen: Screen): boolean {
  return query.split(',').some((alternative) => alternative.trim().split(/\s+and\s+/).every((feature) => {
    const parsed = /^\((min-width|max-width|min-height|max-height|pointer):\s*([a-z0-9]+?)(px)?\)$/.exec(feature.trim());
    if (parsed === null) throw new Error(`Not understood: ${feature}`);
    const [, name, value] = parsed;
    const n = Number(value);
    switch (name) {
      case 'min-width': return screen.width >= n;
      case 'max-width': return screen.width <= n;
      case 'min-height': return screen.height >= n;
      case 'max-height': return screen.height <= n;
      default: return screen.pointer === value;
    }
  }));
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('the page names the layout the editor will draw (D-173)', () => {
  const widths = [320, PHONE_MAX - 1, PHONE_MAX, PHONE_MAX + 1, 900, 1100, 1101, 1440];
  const heights = [360, PHONE_SIDEWAYS_MAX_HEIGHT - 1, PHONE_SIDEWAYS_MAX_HEIGHT, PHONE_SIDEWAYS_MAX_HEIGHT + 1, 844, 1000];
  const pointers = ['fine', 'coarse', 'none'] as const;

  for (const pointer of pointers) {
    it(`with a ${pointer} pointer, at every size exactly one query matches, and it is useLayout's`, () => {
      for (const width of widths) {
        for (const height of heights) {
          vi.stubGlobal('window', { innerWidth: width, innerHeight: height });
          vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' && pointer === 'coarse' }));
          const screen = { width, height, pointer };
          const phone = matches(LAYOUT_MEDIA.phone, screen);
          const wide = matches(LAYOUT_MEDIA.wide, screen);
          expect(phone !== wide, `${width}×${height}`).toBe(true);
          expect(phone ? 'phone' : 'wide', `${width}×${height}`).toBe(currentLayout() === 'phone' ? 'phone' : 'wide');
        }
      }
    });
  }
});
