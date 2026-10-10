import { useSyncExternalStore } from 'react';
import { listFonts, writeFont } from '@/persist/db';
import { loadUserFont, userFonts, type FontId } from './registry';

/**
 * Fonts the person uploads (D-144): read, checked by actually loading them,
 * kept on this device, and loaded again before the first frame of every
 * visit — a text measured in a fallback face stays wrong (§3E).
 */
const listeners = new Set<() => void>();
let snapshot = userFonts();
function changed(): void {
  snapshot = userFonts();
  for (const listener of listeners) listener();
}

export function useUserFonts(): readonly { readonly id: FontId; readonly label: string }[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => snapshot, () => snapshot);
}

/** At start-up. A font that no longer loads costs itself, not the editor. */
export async function loadSavedFonts(target: FontFaceSet): Promise<void> {
  let saved: Awaited<ReturnType<typeof listFonts>>;
  try {
    saved = await listFonts();
  } catch (error: unknown) {
    console.error('Could not read your saved fonts.', error);
    return;
  }
  for (const font of saved) {
    try {
      await loadUserFont(target, font.id, font.name, font.bytes.slice(0));
    } catch (error: unknown) {
      console.error(`Your font "${font.name}" could not be loaded.`, error);
    }
  }
  changed();
}

const ACCEPTED = /\.(ttf|otf|woff2?)$/i;
export const FONT_ACCEPT = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';

/** Adds an uploaded font file and returns its id — or throws, saying why. */
export async function addFontFile(file: File): Promise<FontId> {
  if (!ACCEPTED.test(file.name)) throw new Error('That is not a font file. Choose a .ttf, .otf, .woff or .woff2 file.');
  if (file.size > 8 * 1024 * 1024) throw new Error('That font is over 8 MB — too large to carry into every export.');
  const bytes = await file.arrayBuffer();
  const id = `user:${crypto.randomUUID().slice(0, 8)}`;
  const name = file.name.replace(ACCEPTED, '').replace(/[-_]+/g, ' ').trim() || 'My font';
  try {
    await loadUserFont(document.fonts, id, name, bytes.slice(0));
  } catch {
    throw new Error('That file could not be read as a font. It may be damaged, or a format this browser does not support.');
  }
  await writeFont({ id, name, bytes });
  changed();
  return id;
}

/** Fonts from a project file, kept and loaded as if uploaded here. */
export async function adoptFonts(fonts: readonly { id: FontId; name: string; bytes: ArrayBuffer }[]): Promise<void> {
  for (const font of fonts) {
    if (userFonts().some((known) => known.id === font.id)) continue;
    try {
      await loadUserFont(document.fonts, font.id, font.name, font.bytes.slice(0));
      await writeFont(font);
    } catch (error: unknown) {
      console.error(`The font "${font.name}" in that project could not be loaded.`, error);
    }
  }
  changed();
}
