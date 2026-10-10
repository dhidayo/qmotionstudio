import { describe, expect, it } from 'vitest';
import { createProject } from '@/document/defaults';
import type { MediaStore } from '@/media/store';
import { projectFileName, readProjectFile, writeProjectFile } from './projectFile';
import { makeZip } from '@/export/zip';

const photo = (mediaId: string) => ({ mediaId, frame: '3:4' as const, sizeMode: 'template' as const, sizePct: 100, cropMode: 'template' as const });

function storeOf(entries: Record<string, number[]>): MediaStore {
  return {
    get: (id: string) => {
      const bytes = entries[id];
      return bytes ? { id, kind: 'image', name: `${id}.png`, blob: new Blob([new Uint8Array(bytes)], { type: 'image/png' }) } : undefined;
    },
  } as unknown as MediaStore;
}

describe('the project file (D-141)', () => {
  it('carries the project and its own photos, and opens as it was saved', async () => {
    const base = createProject({ name: 'Spring sale' });
    const scene = base.scenes[0];
    if (!scene) throw new Error('no scene');
    const project = { ...base, scenes: [{ ...scene, inputs: { ...scene.inputs, photos: [photo('upload:a'), photo('sample:dune'), photo('upload:b')] } }] };
    const { blob, missing } = await writeProjectFile(project, storeOf({ 'upload:a': [1, 2, 3], 'upload:b': [4, 5] }));
    expect(missing).toEqual([]);

    const opened = await readProjectFile(blob);
    expect(opened.project).toEqual(project);
    // The samples come with the app; only the person's own photos travel.
    expect(opened.media.map((m) => m.id).sort()).toEqual(['upload:a', 'upload:b']);
    const a = opened.media.find((m) => m.id === 'upload:a');
    expect([...new Uint8Array(await (a?.blob ?? new Blob()).arrayBuffer())]).toEqual([1, 2, 3]);
    expect(a?.blob.type).toBe('image/png');
  });

  it('refuses a file that is not a project, and says so', async () => {
    await expect(readProjectFile(new Blob(['hello']))).rejects.toThrow(/not a Q Motion Studio project/);
    const other = makeZip([{ name: 'readme.txt', data: new TextEncoder().encode('hi') }]);
    await expect(readProjectFile(other)).rejects.toThrow(/not a Q Motion Studio project/);
  });

  it('refuses a damaged list of photos or fonts rather than opening half of it', async () => {
    const project = createProject({ name: 'X' });
    const fileWith = (extra: object): Blob => makeZip([{
      name: 'project.json',
      data: new TextEncoder().encode(JSON.stringify({ format: 'q-motion-studio-project', version: 1, schemaVersion: project.schemaVersion, savedAt: 0, project, media: [], ...extra })),
    }]);
    await expect(readProjectFile(fileWith({ media: [{ id: 'upload:a', kind: 'image' }] }))).rejects.toThrow(/damaged/);
    await expect(readProjectFile(fileWith({ media: [{ id: 'upload:a', kind: 'program', name: 'a', type: 'x', file: 'media/001' }] }))).rejects.toThrow(/damaged/);
    await expect(readProjectFile(fileWith({ fonts: [{ id: 'user:a"; color: red', name: 'a', file: 'fonts/01' }] }))).rejects.toThrow(/damaged/);
    // A well-formed file opens.
    await expect(readProjectFile(fileWith({}))).resolves.toMatchObject({ media: [], fonts: [] });
  });

  it('says a cut-short file is damaged, not something technical', async () => {
    const { blob } = await writeProjectFile(createProject({ name: 'X' }), storeOf({}));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // The end record kept, the middle lost: its offsets now point past the end.
    const cut = new Blob([bytes.slice(0, 40), bytes.slice(bytes.length - 22)]);
    await expect(readProjectFile(cut)).rejects.toThrow('That project file is damaged.');
  });

  it('names the file after the project', () => {
    expect(projectFileName('Spring sale!')).toBe('spring-sale.qmotion');
    expect(projectFileName('  ')).toBe('project.qmotion');
  });
});
