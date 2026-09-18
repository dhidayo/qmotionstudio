/**
 * Font registry.
 *
 * §3E requires self-hosted WOFF2 loaded through explicit FontFace objects,
 * with both preview and export blocked until they resolve.
 *
 * The loading machinery below is that pipeline. What it does not yet have is
 * font *files* — which typefaces ship is a design decision that belongs with
 * the template designs at M2, not with the render core. Until then the two
 * roles resolve to system stacks, which are present by definition, so nothing
 * is ever drawn in an unintended fallback.
 *
 * Adding a real face is a single entry with a `url`; nothing else changes.
 */

export type FontId = string;

export type FontDef = {
  readonly id: FontId;
  /** What goes into ctx.font. */
  readonly family: string;
  readonly weights: readonly number[];
  /** Absent for system stacks; a self-hosted WOFF2 path once type is chosen. */
  readonly url?: string;
};

export const FONTS: Readonly<Record<FontId, FontDef>> = {
  headline: {
    id: 'headline',
    family: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    weights: [400, 500, 600, 700, 800],
  },
  body: {
    id: 'body',
    family: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    weights: [400, 500, 600, 700],
  },
  mono: {
    id: 'mono',
    family: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    weights: [400, 500],
  },
};

export function familyOf(id: FontId): string {
  return FONTS[id]?.family ?? FONTS['body']?.family ?? 'sans-serif';
}

/** Builds a ctx.font string. Order matters: weight, then size, then family. */
export function fontString(id: FontId, sizePx: number, weight: number): string {
  return `${weight} ${sizePx}px ${familyOf(id)}`;
}

/**
 * Loads every registered face and resolves once they are usable.
 *
 * Call before the first frame on both paths (§3E). Faces without a url are
 * system stacks and need no loading, so today this resolves immediately — the
 * call site is what matters, and it is in place.
 */
export async function loadFonts(target: FontFaceSet): Promise<void> {
  const pending: Promise<FontFace>[] = [];

  for (const def of Object.values(FONTS)) {
    if (!def.url) continue;
    for (const weight of def.weights) {
      const face = new FontFace(def.family, `url(${def.url})`, { weight: String(weight) });
      pending.push(face.load().then((loaded) => {
        target.add(loaded);
        return loaded;
      }));
    }
  }

  await Promise.all(pending);
  await target.ready;
}
