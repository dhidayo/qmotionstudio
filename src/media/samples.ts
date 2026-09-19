import { decodeImage } from './image/decode';
import type { MediaStore } from './store';

/**
 * The bundled sample photographs (§8.1's "Try sample photos").
 *
 * Real photography, sized and encoded from `assets/samples/` by
 * `npm run samples` (D-049, superseding D-030). Provenance and the prompts
 * that produced them are recorded in assets/samples/PROVENANCE.md.
 *
 * Eight is not a round number: `photoSlots.max` is 8 on both `angle-fan` and
 * `depth-stack`, so a full set never has to show the same photograph twice
 * within one scene.
 */

export const SAMPLE_NAMES = [
  'dune', 'tide', 'canopy', 'ember', 'slate', 'bloom', 'dusk', 'reef',
] as const;

export type SampleName = (typeof SAMPLE_NAMES)[number];

/**
 * What each photograph is, and the palette it sits against most comfortably.
 *
 * Kept in code rather than only in a markdown file so the set can be described
 * in the UI later — §8.1's picker has nothing to label a thumbnail with today,
 * and "dune" is a filename, not a description.
 */
export const SAMPLE_DESCRIPTIONS: Readonly<Record<SampleName, string>> = {
  dune: 'Wind-carved dune ridge at low sun',
  tide: 'Seawater drawing back over dark sand',
  canopy: 'Light breaking through a dense forest canopy',
  ember: 'Embers and sparks in a dying fire',
  slate: 'Wet slate cliff face after rain',
  bloom: 'A magnolia blossom in deep shade',
  dusk: 'Layered ridgelines receding into violet haze',
  reef: 'Caustic light over a shallow coral shelf',
};

export function sampleMediaId(name: SampleName): string {
  return `sample:${name}`;
}

export function sampleUrl(name: SampleName): string {
  return `/samples/${name}.webp`;
}

/** True for ids this module owns, so callers can tell a sample from an upload. */
export function isSampleId(mediaId: string): boolean {
  return mediaId.startsWith('sample:');
}

/** The sample name inside an id, or null if it is not one of ours. */
export function sampleNameOf(mediaId: string): SampleName | null {
  if (!isSampleId(mediaId)) return null;
  const name = mediaId.slice('sample:'.length);
  return (SAMPLE_NAMES as readonly string[]).includes(name) ? (name as SampleName) : null;
}

/**
 * Loads samples into the media store.
 *
 * Fetched on demand rather than bundled, and — since D-049 made these real
 * photographs — only the ones a document actually references. The full set is
 * 1.16MB; a fresh Showcase project shows four of them, and fetching the other
 * four on the chance that someone presses "Try sample photos" is half a
 * megabyte spent on a maybe. An ad expands to reference all eight, and this
 * runs again for the four that are new.
 *
 * Already-loaded samples are skipped, so calling this repeatedly is cheap.
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
