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

/**
 * Fonts every device already has (D-144): "allow users to be able to change
 * font of selected text from system fonts… such as Georgia, Times New Roman".
 * Nothing to download, so nothing to wait for; each names a stack that falls
 * back sensibly where the first choice is missing (Android has no Georgia).
 */
export const SYSTEM_FONTS: readonly { readonly id: FontId; readonly label: string; readonly stack: string }[] = [
  { id: 'sys:georgia', label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  { id: 'sys:times', label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { id: 'sys:palatino', label: 'Palatino', stack: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
  { id: 'sys:garamond', label: 'Garamond', stack: "Garamond, 'EB Garamond', Baskerville, serif" },
  { id: 'sys:arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { id: 'sys:helvetica', label: 'Helvetica', stack: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: 'sys:verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { id: 'sys:trebuchet', label: 'Trebuchet', stack: "'Trebuchet MS', 'Lucida Grande', sans-serif" },
  { id: 'sys:rounded', label: 'Rounded', stack: "ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', system-ui, sans-serif" },
  { id: 'sys:impact', label: 'Impact', stack: "Impact, 'Arial Black', 'Helvetica Neue', sans-serif" },
  { id: 'sys:courier', label: 'Courier', stack: "'Courier New', Courier, ui-monospace, monospace" },
  { id: 'sys:cursive', label: 'Handwriting', stack: "'Segoe Script', 'Snell Roundhand', 'Bradley Hand', 'Brush Script MT', cursive" },
];
const SYSTEM_BY_ID = new Map(SYSTEM_FONTS.map((font) => [font.id, font]));

/** Fonts the person added (D-144), by id, as registered once their face has loaded. */
const USER_FONTS = new Map<FontId, { readonly family: string; readonly label: string }>();

/** The family name an uploaded font is registered under: unique, and never a real font's name. */
export function userFamily(id: FontId): string {
  return `QMU ${id.replace(/[^a-zA-Z0-9]/g, '')}`;
}

export function isUserFont(id: FontId): boolean {
  return id.startsWith('user:');
}

/**
 * Loads an uploaded font into a FontFaceSet — the document's, or the export
 * worker's — and makes it known to `familyOf`. Rejects if the file is not a
 * font the browser can read, so a bad upload is said, not silently ignored.
 */
export async function loadUserFont(target: FontFaceSet, id: FontId, label: string, bytes: ArrayBuffer): Promise<void> {
  const family = userFamily(id);
  const face = new FontFace(family, bytes, { display: 'block' });
  const ready = await face.load();
  target.add(ready);
  USER_FONTS.set(id, { family, label });
}

export function userFonts(): readonly { readonly id: FontId; readonly label: string }[] {
  return [...USER_FONTS].map(([id, font]) => ({ id, label: font.label }));
}

/** A font's name as the picker shows it. */
export function fontLabel(id: FontId): string {
  return FONTS[id]?.label ?? SYSTEM_BY_ID.get(id)?.label ?? USER_FONTS.get(id)?.label ?? 'Font';
}

export function familyOf(id: FontId): string {
  const system = SYSTEM_BY_ID.get(id);
  if (system) return system.stack;
  const user = USER_FONTS.get(id);
  // An uploaded font that is not here (a project from another device) falls back to the body face.
  if (user) return `"${user.family}", ui-sans-serif, system-ui, sans-serif`;
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
