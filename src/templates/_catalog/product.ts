import type { SceneVariant } from '../catalog';

/**
 * Product Display (D-119): products shown the way a launch page shows them.
 */

const product = (
  id: string,
  name: string,
  blurb: string,
  params: SceneVariant['params'],
  photos: SceneVariant['photos'] = { min: 1, max: 1, default: 1 },
  durationMs = 5_000,
): SceneVariant => ({ id, name, category: 'Product Display', family: 'product', blurb, params, photos, durationMs, isNew: true });

export const PRODUCT_SCENES: readonly SceneVariant[] = [
  product('pd-spotlight', 'Product Spotlight', 'Your product in a pool of light, easing slowly closer.',
    { kind: 'spotlight', headline: 'Meet the new standard', subline: 'Designed for everyday life' }),
  product('pd-callouts', 'Feature Callouts', 'Lines reach out from the product to what makes it special.',
    { kind: 'callouts', headline: 'Built to last', point1: 'All-day battery', point2: 'Water resistant', point3: 'Recycled materials' }, undefined, 5_500),
  product('pd-finishes', 'Colour Finishes', 'Every finish side by side, the spotlight moving across them.',
    { kind: 'finishes', headline: 'Pick your colour', subline: 'Four finishes, one design' }, { min: 2, max: 4, default: 4 }, 6_000),
  product('pd-lineup', 'Product Lineup', 'The range slides onto a shelf one after another.',
    { kind: 'lineup', headline: 'The full collection', subline: 'Something for everyone' }, { min: 2, max: 5, default: 5 }, 5_500),
  product('pd-compare', 'Before & After', 'A divider sweeps across to show the difference.',
    { kind: 'compare', before: 'Before', after: 'After' }, { min: 2, max: 2, default: 2 }, 6_000),
  product('pd-turntable', 'Turntable', 'The product turns on a plinth to show its sides.',
    { kind: 'turntable', headline: 'From every angle', subline: 'Precision in every detail' }, undefined, 6_000),
  product('pd-spec-sheet', 'Spec Sheet', 'The product beside the three things buyers ask about.',
    { kind: 'spec', headline: 'Everything you need', spec1: '12-hour battery', spec2: 'Weighs only 240 g', spec3: 'Two-year warranty' }),
  product('pd-price-reveal', 'Price Reveal', 'The product, then the price, then the old price struck out.',
    { kind: 'price', headline: 'Now at a better price', price: '$129', was: '$159' }),
  product('pd-detail-lens', 'Detail Lens', 'A round lens glides over the product, magnifying the craft.',
    { kind: 'detail', headline: 'Look closer', subline: 'Every stitch, by hand' }, undefined, 6_000),
  product('pd-new-arrival', 'New Arrival', 'A NEW badge stamps onto the product in its spotlight.',
    { kind: 'arrival', headline: 'Just landed', badge: 'NEW', subline: 'Available in store and online' }),
  product('pd-range', 'Product Range', 'Three products rise into a row, each with its name.',
    { kind: 'range', headline: 'Choose your fit', name1: 'Classic', name2: 'Sport', name3: 'Pro' }, { min: 3, max: 3, default: 3 }),
  product('pd-unbox', 'Unboxing', 'The box flaps open and the product rises out of it.',
    { kind: 'unbox', headline: 'Something new is here', subline: 'Unbox yours today' }),
];
