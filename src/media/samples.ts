import { decodeImage } from './image/decode';
import type { MediaStore } from './store';

/**
 * The bundled sample photos (§8.1's "Try sample photos").
 *
 * Synthesised rather than photographed — see D-030 and scripts/gen-samples.ts.
 * Regenerate with `npm run samples`.
 */

export const SAMPLE_NAMES = [
  'dune', 'tide', 'canopy', 'ember', 'slate', 'bloom', 'dusk', 'reef',
] as const;

export type SampleName = (typeof SAMPLE_NAMES)[number];

export function sampleMediaId(name: SampleName): string {
  return `sample:${name}`;
}

export function sampleUrl(name: SampleName): string {
  return `/samples/${name}.webp`;
}

/**
 * Loads samples into the media store.
 *
 * Fetched on demand rather than bundled — 8 × ~95KB has no business on §14's
 * cold-load path, and most sessions will replace them with the user's own
 * pictures immediately.
 */
export async function loadSamples(
  store: MediaStore,
  options: { artboardLongestEdge: number; names?: readonly SampleName[] },
): Promise<void> {
  const names = options.names ?? SAMPLE_NAMES;

  await Promise.all(
    names.map(async (name) => {
      const id = sampleMediaId(name);
      if (store.has(id)) return;

      const response = await fetch(sampleUrl(name));
      if (!response.ok) {
        // §16: never swallow. A missing sample means `npm run samples` has not
        // been run, which is a setup problem worth saying out loud.
        throw new Error(
          `Sample "${name}" is missing (${response.status}). Run \`npm run samples\` to generate it.`,
        );
      }

      const entry = await decodeImage(await response.blob(), {
        id,
        name,
        artboardLongestEdge: options.artboardLongestEdge,
      });
      store.set(entry);
    }),
  );
}
