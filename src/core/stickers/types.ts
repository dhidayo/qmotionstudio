import type { Ctx2D, Paint } from '@/core/types';

/**
 * Animated stickers (D-158): small looping pieces of art — a Subscribe button
 * whose bell rings, a Like that springs, a NEW burst that turns — drawn by
 * code, not played from files.
 *
 * Every sticker is a pure function of time, like the effects library (D-100):
 * `draw` computes the frame from `t` and a seed and keeps no state, so the
 * preview, a scrub to any moment and the export worker all draw the same
 * thing. Rules every `draw` keeps, because the export runs in a worker on an
 * OffscreenCanvas in every browser:
 *   - save/restore around its own changes, and only ever multiply
 *     `globalAlpha`, never assign it;
 *   - no `ctx.filter` (Safari's OffscreenCanvas lacks it), no `Path2D` from
 *     SVG strings, no images, and no emoji or icon-font glyphs — every shape
 *     is drawn with paths, and words go through `sample.text`;
 *   - randomness only from `rand`/`hashString` in `@/core/effects/random`,
 *     seeded by `sample.seed`;
 *   - the frame at `t = 0` matches the frame at `t = loopMs`, so the loop has
 *     no seam;
 *   - no platform logos, wordmarks or brand colours: a generic red Subscribe
 *     button and a thumbs-up are fine; a play-button logo, an "f", a camera
 *     glyph or a platform's name are not (BUILD-SPEC §16).
 */

export type StickerCategory = 'Social' | 'Reactions' | 'Badges' | 'Pointers';

/** A word on a sticker that the person can change — "SUBSCRIBE" to "ABONNIEREN". */
export type StickerLabelDef = {
  /** Permanent key, stored in projects. */
  readonly key: string;
  /** What the inspector calls it: "Button words". */
  readonly name: string;
  /** The default words. */
  readonly text: string;
  readonly maxChars: number;
};

/** Everything a sticker needs to draw one frame. */
export type StickerSample = {
  /** Milliseconds into the loop, 0 ≤ t < loopMs. */
  readonly t: number;
  /** `t / loopMs`, 0 ≤ p < 1. */
  readonly p: number;
  /** The sticker's box, drawn from (0, 0) to (w, h). */
  readonly w: number;
  readonly h: number;
  /** Resolved CSS colours: the main colour, the second colour, a colour that reads on the main one, and the look's ink. */
  readonly primary: string;
  readonly secondary: string;
  readonly onPrimary: string;
  readonly ink: string;
  /** The words, by label key: the defaults with the person's changes on top. */
  readonly labels: Readonly<Record<string, string>>;
  readonly seed: number;
  /**
   * Draws `label` centred on (cx, cy) in the app's headline face at weight
   * 800, at `sizePx` or smaller so it fits in `maxW`.
   */
  readonly text: (label: string, cx: number, cy: number, maxW: number, sizePx: number, color: string) => void;
};

export type StickerDef = {
  /** Permanent: projects store it. Never rename one. */
  readonly id: string;
  readonly name: string;
  readonly category: StickerCategory;
  /** Extra words the picker's search matches: "like", "thumb", "heart". */
  readonly keywords: readonly string[];
  /** Width over height of its box. */
  readonly aspect: number;
  /** Its longer side when added, as a fraction of the frame's short edge (0.3 when absent). */
  readonly size?: number;
  readonly loopMs: number;
  /** The moment shown when it is set to "Still", and in the picker before it plays. */
  readonly posterMs: number;
  readonly labels?: readonly StickerLabelDef[];
  /** Default colours. Role paints restyle with the look (D-121). */
  readonly primary: Paint;
  readonly secondary: Paint;
  /** Offers "Flip" in the inspector — an arrow that can point either way. */
  readonly flippable?: boolean;
  draw(ctx: Ctx2D, sample: StickerSample): void;
};
