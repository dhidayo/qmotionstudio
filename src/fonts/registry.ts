/**
 * Font registry.
 *
 * §3E: self-hosted WOFF2, explicit FontFace objects, both preview and export
 * blocked until they resolve. A frame drawn in a fallback face is a bug.
 *
 * Both faces are **variable** (D-026). That is not a stylistic preference: §8.2
 * needs five weights per family, and ten static files would cost ~300KB against
 * §14's ~500KB cold-load budget. Two variable files cost 83KB and cover the
 * whole 100–900 axis. Canvas honours weights on multiples of 100, which is
 * exactly what the inspector exposes.
 *
 * Subsets: `latin` loads eagerly and blocks the first frame. `latin-ext` is
 * deferred — Inter's is 85KB on its own, and nothing needs it until the user
 * can type (M3). Latin-1 already covers the Western European accents.
 *
 * Licences live beside the files in public/fonts. Both are SIL OFL 1.1, which
 * requires the licence to ship with the fonts.
 */

export type FontId = string;

export type FontSubset = {
  readonly url: string;
  /** Eager subsets block the first frame; deferred ones load on demand. */
  readonly eager: boolean;
};

export type FontDef = {
  readonly id: FontId;
  /** The family name used in ctx.font. */
  readonly family: string;
  /** Appended after `family` so a failed load degrades to something sane. */
  readonly fallback: string;
  /** Variable weight axis, as a FontFace weight descriptor. */
  readonly weightRange: string;
  readonly subsets: readonly FontSubset[];
  /** Shown in the M3 font picker. */
  readonly label: string;
};

export const FONTS: Readonly<Record<FontId, FontDef>> = {
  headline: {
    id: 'headline',
    family: 'Archivo',
    fallback: 'ui-sans-serif, system-ui, sans-serif',
    weightRange: '100 900',
    label: 'Archivo',
    subsets: [
      { url: '/fonts/archivo-latin.woff2', eager: true },
      { url: '/fonts/archivo-latin-ext.woff2', eager: false },
    ],
  },
  body: {
    id: 'body',
    family: 'Inter',
    fallback: 'ui-sans-serif, system-ui, sans-serif',
    weightRange: '100 900',
    label: 'Inter',
    subsets: [
      { url: '/fonts/inter-latin.woff2', eager: true },
      { url: '/fonts/inter-latin-ext.woff2', eager: false },
    ],
  },
  mono: {
    id: 'mono',
    family: '',
    fallback: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    weightRange: '400 700',
    label: 'System mono',
    subsets: [],
  },
};

export function familyOf(id: FontId): string {
  const def = FONTS[id] ?? FONTS['body'];
  if (!def) return 'sans-serif';
  return def.family.length > 0 ? `"${def.family}", ${def.fallback}` : def.fallback;
}

/** Builds a ctx.font string. Order matters: weight, then size, then family. */
export function fontString(id: FontId, sizePx: number, weight: number): string {
  return `${weight} ${sizePx}px ${familyOf(id)}`;
}

/**
 * Loads the eager subsets and resolves once they are usable.
 *
 * Must be awaited before the first frame on both paths (§3E). On the export
 * path the target is the worker's own FontFaceSet — faces added to the
 * document are *not* visible inside a worker, so the worker loads its own
 * copies (see the M0 research note, 2.3).
 *
 * Rejects rather than resolving quietly on failure: a silent fallback is
 * exactly the bug §3E is written to prevent, and §16 forbids swallowing errors.
 */
export async function loadFonts(target: FontFaceSet, options?: { includeDeferred?: boolean }): Promise<void> {
  const wanted = options?.includeDeferred === true;
  const pending: Promise<FontFace>[] = [];

  for (const def of Object.values(FONTS)) {
    if (def.family.length === 0) continue;
    for (const subset of def.subsets) {
      if (!subset.eager && !wanted) continue;
      pending.push(loadFace(target, def, subset));
    }
  }

  await Promise.all(pending);
}

const loaded = new Set<string>();

async function loadFace(target: FontFaceSet, def: FontDef, subset: FontSubset): Promise<FontFace> {
  const face = new FontFace(def.family, `url(${subset.url}) format('woff2')`, {
    weight: def.weightRange,
    display: 'block',
  });
  const ready = await face.load();
  target.add(ready);
  loaded.add(subset.url);
  return ready;
}

/**
 * Loads the deferred subsets. Called when the user first types text that needs
 * glyphs outside Latin-1 (M3), so the 85KB of extended coverage never lands on
 * the cold-load path.
 */
export async function loadExtendedSubsets(target: FontFaceSet): Promise<void> {
  const pending: Promise<FontFace>[] = [];
  for (const def of Object.values(FONTS)) {
    if (def.family.length === 0) continue;
    for (const subset of def.subsets) {
      if (subset.eager || loaded.has(subset.url)) continue;
      pending.push(loadFace(target, def, subset));
    }
  }
  await Promise.all(pending);
}

/** True when a string needs glyphs the eager Latin subset does not carry. */
export function needsExtendedSubset(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0x00ff && !(code >= 0x2000 && code <= 0x206f)) return true;
  }
  return false;
}
