import type { Layer, SlotRef } from '@/core/types';
import { slotKey, slotOf } from '@/core/render/slots';

/**
 * Parts for designs built a layer at a time (D-159).
 *
 * The families tag their decorations as they draw them (`rect(…, { slot })`,
 * `part()`); a design written out as plain layer objects is tagged here
 * instead, after it is built, by the name its layers already have — "rule",
 * "ring", "seam" — so the drawing code stays exactly as it was and so do its
 * pixels. A tag can depend on where the layer is: the n-th seam, the mark
 * beside the next line of the list.
 */

export type PartTag = { readonly slot: SlotRef; readonly follows?: string };

type Tagger = PartTag | ((at: { readonly index: number; readonly next: Layer | undefined }) => PartTag | null);

/** `layers` with every layer whose id starts `<name>-` tagged as `tags[name]` says. */
export function tagParts(layers: readonly Layer[], tags: Readonly<Record<string, Tagger>>): Layer[] {
  const seen = new Map<string, number>();
  return layers.map((layer, i) => {
    const name = layer.id.replace(/-\d+$/, '');
    const tagger = tags[name];
    const children = layer.type === 'group' || layer.type === 'mask' ? tagParts(layer.children, tags) : null;
    const walked: Layer = children === null ? layer : layer.type === 'group' ? { ...layer, children } : layer.type === 'mask' ? { ...layer, children } : layer;
    if (tagger === undefined || walked.type === 'image' || walked.type === 'video' || walked.type === 'sticker') return walked;
    const index = seen.get(name) ?? 0;
    seen.set(name, index + 1);
    const tag = typeof tagger === 'function' ? tagger({ index, next: layers[i + 1] }) : tagger;
    if (tag === null) return walked;
    const follows = tag.follows === undefined ? {} : { follows: tag.follows };
    switch (walked.type) {
      case 'shape':
        return { ...walked, ...follows, props: { ...walked.props, slot: tag.slot } };
      case 'gradient':
        return { ...walked, ...follows, props: { ...walked.props, slot: tag.slot } };
      case 'group':
        return { ...walked, ...follows, props: { ...walked.props, slot: tag.slot } };
      case 'mask':
        return { ...walked, ...follows, props: { ...walked.props, slot: tag.slot } };
      // A decorative glyph — a quotation mark — is a part like a shape.
      case 'text':
        return { ...walked, ...follows, props: { ...walked.props, slot: tag.slot } };
      default:
        return walked;
    }
  });
}

/** The slot key of a layer, if it has one: for a mark that moves with the line beside it. */
export function keyOf(layer: Layer | undefined): string | undefined {
  const slot = layer ? slotOf(layer) : null;
  return slot ? slotKey(slot) : undefined;
}
