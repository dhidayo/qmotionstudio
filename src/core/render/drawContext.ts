import type { Ctx2D, Palette } from '@/core/types';
import type { TextMeasurer } from '@/core/text/measure';
import type { MediaResolver } from './rig';

/**
 * Everything a layer needs in order to draw itself.
 *
 * Passed down rather than reached for: the render core has no module-level
 * state, so two renderers (preview and export) can run at once (D-001).
 */
export type DrawContext = {
  readonly ctx: Ctx2D;
  readonly palette: Palette;
  readonly media: MediaResolver;
  readonly measurer: TextMeasurer;
  /** Nesting depth, used to pick a scratch surface for blur. */
  readonly depth: number;
};

export function atDepth(dc: DrawContext, depth: number): DrawContext {
  return { ...dc, depth };
}

export function withCtx(dc: DrawContext, ctx: Ctx2D): DrawContext {
  return { ...dc, ctx };
}
