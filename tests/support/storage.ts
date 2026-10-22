/**
 * What the suite stores before each test (D-149): the quick start marked as
 * seen, and the device set up for everything, so the library is the one every
 * older test was written against and no first-visit question appears. The
 * timeline is stored as open (D-153), so no test depends on the window being
 * tall enough for it to start that way.
 */

export type StoredEntry = { readonly name: string; readonly value: string };

export const SEEDED_STORAGE: readonly StoredEntry[] = [
  { name: 'ms.quickstart', value: 'done' },
  { name: 'ms.workspace', value: 'both' },
  { name: 'ms.timeline', value: 'open' },
];

export function seededState(
  entries: readonly StoredEntry[],
  origin: string,
): { cookies: []; origins: { origin: string; localStorage: StoredEntry[] }[] } {
  return { cookies: [], origins: [{ origin, localStorage: [...entries] }] };
}
