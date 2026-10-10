import { SCHEMA_VERSION, type Project } from '@/document/types';
import { referencedMedia, usedUserFonts } from '@/document/select/media';
import { migrate } from '@/document/migrate';
import { isSampleId } from '@/media/samples';
import type { MediaKind, MediaStore } from '@/media/store';
import { makeZip, readZip } from '@/export/zip';
import { readFont, readMedia, type StoredFont, type StoredMedia } from './db';

/**
 * A project as one file (D-141): "Save project file", "Open project file".
 *
 * Projects otherwise live only in this browser, which a phone may clear, a
 * new laptop does not have, and a colleague cannot open. A `.qmotion` file is
 * a ZIP holding the document and every photo, clip and track it uses, so it
 * opens anywhere exactly as it was saved. The samples are not included — they
 * come with the app.
 */
export const PROJECT_FILE_EXTENSION = '.qmotion';
const FORMAT = 'q-motion-studio-project';

type Manifest = {
  readonly format: typeof FORMAT;
  readonly version: 1;
  readonly schemaVersion: number;
  readonly savedAt: number;
  readonly project: Project;
  readonly media: readonly { readonly id: string; readonly kind: MediaKind; readonly name: string; readonly type: string; readonly file: string }[];
  /** Uploaded fonts its text uses (D-144). Absent in files saved before fonts could be uploaded. */
  readonly fonts?: readonly { readonly id: string; readonly name: string; readonly file: string }[];
};

export async function writeProjectFile(project: Project, store: MediaStore): Promise<{ blob: Blob; missing: readonly string[] }> {
  const files: { name: string; data: Uint8Array }[] = [];
  const media: Manifest['media'][number][] = [];
  const missing: string[] = [];
  let n = 0;
  for (const id of referencedMedia(project)) {
    if (isSampleId(id) || id.startsWith('__empty_')) continue;
    const entry = store.get(id) ?? (await readMedia(id));
    if (!entry) { missing.push(id); continue; }
    const file = `media/${String(++n).padStart(3, '0')}`;
    files.push({ name: file, data: new Uint8Array(await entry.blob.arrayBuffer()) });
    media.push({ id, kind: entry.kind, name: entry.name, type: entry.blob.type, file });
  }
  const fonts: NonNullable<Manifest['fonts']>[number][] = [];
  let f = 0;
  for (const id of usedUserFonts(project)) {
    const font = await readFont(id);
    if (!font) { missing.push(id); continue; }
    const file = `fonts/${String(++f).padStart(2, '0')}`;
    files.push({ name: file, data: new Uint8Array(font.bytes) });
    fonts.push({ id, name: font.name, file });
  }
  const manifest: Manifest = { format: FORMAT, version: 1, schemaVersion: SCHEMA_VERSION, savedAt: Date.now(), project, media, fonts };
  files.unshift({ name: 'project.json', data: new TextEncoder().encode(JSON.stringify(manifest)) });
  return { blob: makeZip(files), missing };
}

export async function readProjectFile(file: Blob): Promise<{ project: Project; media: readonly StoredMedia[]; fonts: readonly StoredFont[] }> {
  const entries = readZip(new Uint8Array(await file.arrayBuffer()));
  const json = entries.get('project.json');
  if (!json) throw new Error('That file is not a Q Motion Studio project.');
  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new Error('That project file is damaged.');
  }
  if (typeof manifest !== 'object' || manifest === null || (manifest as { format?: unknown }).format !== FORMAT) {
    throw new Error('That file is not a Q Motion Studio project.');
  }
  const m = manifest as Manifest;
  const result = migrate({ ...m.project, schemaVersion: m.schemaVersion });
  if (!result.ok) throw new Error(result.reason);
  const media: StoredMedia[] = [];
  for (const item of listOf(m.media)) {
    if (!isMediaItem(item)) throw new Error('That project file is damaged.');
    const bytes = entries.get(item.file);
    if (!bytes) continue;
    media.push({ id: item.id, kind: item.kind, name: item.name, blob: new Blob([bytes as BlobPart], { type: item.type }) });
  }
  const fonts: StoredFont[] = [];
  for (const item of listOf(m.fonts)) {
    if (!isFontItem(item)) throw new Error('That project file is damaged.');
    const bytes = entries.get(item.file);
    if (bytes) fonts.push({ id: item.id, name: item.name, bytes: bytes.slice().buffer });
  }
  return { project: result.project, media, fonts };
}

// The file comes from anywhere: every listed entry is checked before it is used.
const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? (value as unknown[]) : []);
const MEDIA_KINDS: readonly unknown[] = ['image', 'video', 'audio'] satisfies readonly MediaKind[];

function strings<K extends string>(item: unknown, keys: readonly K[]): item is Record<K, string> {
  return typeof item === 'object' && item !== null && keys.every((key) => typeof (item as Record<string, unknown>)[key] === 'string');
}

function isMediaItem(item: unknown): item is Manifest['media'][number] {
  return strings(item, ['id', 'name', 'type', 'file', 'kind']) && MEDIA_KINDS.includes(item.kind);
}

function isFontItem(item: unknown): item is NonNullable<Manifest['fonts']>[number] {
  return strings(item, ['id', 'name', 'file']) && /^user:[\w-]+$/.test(item.id);
}

/** A file name from a project name: "Spring sale" → "spring-sale.qmotion". */
export function projectFileName(name: string): string {
  const stem = name.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
  return `${stem.length > 0 ? stem : 'project'}${PROJECT_FILE_EXTENSION}`;
}
