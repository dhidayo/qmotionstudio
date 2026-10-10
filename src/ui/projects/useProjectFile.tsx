import { useCallback, useRef, useState } from 'react';
import { SCHEMA_VERSION } from '@/document/types';
import { newId } from '@/document/defaults';
import { downloadBlob } from '@/export';
import { readProjectFile, writeProjectFile, projectFileName, PROJECT_FILE_EXTENSION } from '@/persist/projectFile';
import { writeLastOpened, writeMedia, writeProject } from '@/persist/db';
import { restoreMedia } from '@/persist/media';
import { useEditor } from '@/state/store';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { useProjectActions } from './useProjectActions';
import { adoptFonts } from '@/fonts/userFonts';

/**
 * Save project file / Open project file (D-141), for the menu on a computer
 * and on a phone. The file input it needs is returned as `input`, to be
 * rendered once by whoever uses it.
 */
const isAppleTouch = (): boolean =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export function useProjectFile(): { save: () => void; open: () => void; busy: boolean; input: React.JSX.Element } {
  const media = useMediaStore();
  const showToast = useEditor((s) => s.showToast);
  const openProject = useEditor((s) => s.openProject);
  const { flush } = useProjectActions();
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const save = useCallback((): void => {
    const { project } = useEditor.getState();
    setBusy(true);
    void writeProjectFile(project, media)
      .then(({ blob, missing }) => {
        const name = projectFileName(project.name);
        downloadBlob(blob, name);
        showToast(missing.length > 0
          ? `Saved ${name}, without ${missing.length} file(s) this browser no longer has.`
          : `Saved ${name} — open it on any device with Menu → Open project file.`);
      })
      .catch((error: unknown) => {
        // §16: said, never swallowed.
        console.error('Could not save the project file.', error);
        showToast('Could not save the project file. Your device may be out of space.');
      })
      .finally(() => { setBusy(false); });
  }, [media, showToast]);

  const openFile = useCallback((file: File): void => {
    setBusy(true);
    void (async () => {
      try {
        const { project, media: stored, fonts } = await readProjectFile(file);
        // What is open now is kept first, so opening a file never loses work.
        await flush();
        // Its fonts before its text is measured (D-144).
        await adoptFonts(fonts);
        for (const item of stored) await writeMedia(item);
        const { missing } = await restoreMedia(media, stored.map((item) => item.id));
        // A copy of its own, so opening the same file twice never overwrites anything.
        const opened = { ...project, id: newId('prj'), updatedAt: Date.now() };
        await writeProject({ schemaVersion: SCHEMA_VERSION, project: opened });
        await writeLastOpened(opened.id);
        openProject(opened);
        showToast(missing.length > 0 ? `Opened “${opened.name}”, but ${missing.length} file(s) in it could not be read here.` : `Opened “${opened.name}”.`);
      } catch (error: unknown) {
        console.error('Could not open the project file.', error);
        showToast(error instanceof Error ? error.message : 'Could not open that file.');
      } finally {
        setBusy(false);
      }
    })();
  }, [flush, media, openProject, showToast]);

  return {
    save,
    open: () => { picker.current?.click(); },
    busy,
    input: (
      <input
        ref={picker}
        type="file"
        // iPhones and iPads grey out a file whose extension they do not know,
        // so there every file can be picked; the reader refuses anything else.
        accept={isAppleTouch() ? undefined : `${PROJECT_FILE_EXTENSION},application/zip`}
        hidden
        aria-label="Open project file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) openFile(file);
          e.target.value = '';
        }}
      />
    ),
  };
}
