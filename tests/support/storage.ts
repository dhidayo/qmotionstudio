/**
 * What the suite stores before each test (D-149): the quick start marked as
 * seen, and the device set up for everything, so the library is the one every
 * older test was written against and no first-visit question appears.
 */

export type StoredEntry = { readonly name: string; readonly value: string };

export const SEEDED_STORAGE: readonly StoredEntry[] = [
  { name: 'ms.quickstart', value: 'done' },
  { name: 'ms.workspace', value: 'both' },
];

export function seededState(
  entries: readonly StoredEntry[],
  origin: string,
): { cookies: []; origins: { origin: string; localStorage: StoredEntry[] }[] } {
  return { cookies: [], origins: [{ origin, localStorage: [...entries] }] };
}
