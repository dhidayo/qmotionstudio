import type { AdTemplate, Tier } from './schema';
import { TEXT_STORY_SCENES } from './_catalog/text';
import { PRODUCT_SCENES } from './_catalog/product';
import { SHOWCASE_SCENES } from './_catalog/showcase';
import { BUSINESS_SCENES } from './_catalog/business';
import { AD_FILMS } from './_catalog/films';

/**
 * The template catalogue (D-119).
 *
 * Most of the library is families: one motion idea — a ring of cards, a line
 * of words that rises into place, a product with callouts round it — played
 * with different settings. Each entry here names a variant and its settings;
 * the family's code (src/templates/_families) turns it into a template when it
 * is first asked for. The data is small and loads with the editor; the code
 * loads per family, on demand, like every other template.
 *
 * Ad films (Corporate Ads) are pure data — a list of scenes with their timing
 * and copy — so they live here whole.
 */

export type FamilyId =
  | 'type' | 'element' | 'product'
  | 'orbit' | 'flow' | 'depth' | 'marquee' | 'tiles' | 'deck'
  | 'hero' | 'cuts' | 'halo' | 'timeline' | 'business';

export type VariantParams = Readonly<Record<string, string | number | boolean>>;

export type SceneVariant = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly family: FamilyId;
  readonly blurb: string;
  readonly params: VariantParams;
  readonly photos: { readonly min: number; readonly max: number; readonly default: number };
  readonly durationMs: number;
  readonly tier?: Tier;
  readonly isNew?: boolean;
  /** Where the library's still is taken, when the default moment is not the best. */
  readonly posterAtMs?: number;
  /** The look it opens in, when its category's turn would not suit it (D-121). */
  readonly look?: string;
};

export const SCENE_VARIANTS: readonly SceneVariant[] = [
  ...TEXT_STORY_SCENES,
  ...PRODUCT_SCENES,
  ...BUSINESS_SCENES,
  ...SHOWCASE_SCENES,
];

export const AD_FILM_TEMPLATES: readonly AdTemplate[] = AD_FILMS;

const byId = new Map(SCENE_VARIANTS.map((variant) => [variant.id, variant]));
const filmsById = new Map(AD_FILM_TEMPLATES.map((film) => [film.id, film]));

export function sceneVariant(id: string): SceneVariant | undefined {
  return byId.get(id);
}

export function adFilm(id: string): AdTemplate | undefined {
  return filmsById.get(id);
}

/** A number setting, with a default for variants that leave it out. */
export function num(params: VariantParams, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === 'number' ? value : fallback;
}

/** A word setting, from an allowed set. */
export function pick<T extends string>(params: VariantParams, key: string, allowed: readonly T[], fallback: T): T {
  const value = params[key];
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function flag(params: VariantParams, key: string, fallback = false): boolean {
  const value = params[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function text(params: VariantParams, key: string, fallback: string): string {
  const value = params[key];
  return typeof value === 'string' ? value : fallback;
}
