import { useCallback, useEffect, useState } from 'react';
import { createProject } from '@/document/defaults';
import { migrate } from '@/document/migrate';
import { referencedMedia } from '@/document/select/media';
import * as actions from '@/document/actions';
import { SCHEMA_VERSION, type Project } from '@/document/types';
import {
  deleteProject, listProjects, writeLastOpened, writeProject, type StoredProject,
} from '@/persist/db';
import { restoreMedia } from '@/persist/media';
import { useEditor } from '@/state/store';
import { useMediaStore } from '@/ui/media/MediaProvider';

/**
 * §13's project list: "on load, with rename, duplicate and delete".
 *
 * A dialog rather than a separate screen. The editor is the application, and
 * sending someone to a gallery to get back into their work adds a step to the
 * thing they do most often — opening the project they were just in, which
 * autosave already does for them.
 *
 * Everything here is read from disk each time it opens rather than mirrored in
 * React state. The list is small, it is only looked at occasionally, and a
 * cached copy would be one more thing that can disagree with what is actually
 * saved.
 */
export function ProjectsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const current = useEditor((s) => s.project);
  const openProject = useEditor((s) => s.openProject);
  const dispatch = useEditor((s) => s.dispatch);
  const media = useMediaStore();

  const [entries, setEntries] = useState<readonly StoredProject[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setEntries(await listProjects());
    } catch (caught) {
      console.error('Could not read the project list.', caught);
      setError('Could not read your saved projects.');
    }
  }, []);

  // Read on open, in a task of its own: the list is external state and the
  // effect's job is to go and fetch it, not to set anything on the way past.
  useEffect(() => {
    void (async () => { await refresh(); })();
  }, [refresh]);

  /**
   * Writes the open project before leaving it.
   *
   * Autosave is debounced, so anything done in the last fraction of a second
   * — renaming it in this very dialog, most obviously — has not reached disk
   * yet. Switching away would then save the *new* project over that intent and
   * the edit would be gone. Leaving a document is exactly the moment to flush
   * it.
   */
  const flushCurrent = async (): Promise<void> => {
    await writeProject({ schemaVersion: SCHEMA_VERSION, project: current });
  };

  /** Opens a stored project, media first so it does not appear half-drawn. */
  const open = async (stored: StoredProject): Promise<void> => {
    if (stored.project.id === current.id) {
      onClose();
      return;
    }
    setBusy(stored.project.id);
    try {
      await flushCurrent();
      const result = migrate({ ...stored.project, schemaVersion: stored.schemaVersion });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      await restoreMedia(media, referencedMedia(result.project));
      await writeLastOpened(result.project.id);
      openProject(result.project);
      onClose();
    } catch (caught) {
      console.error('Could not open that project.', caught);
      setError('Could not open that project.');
    } finally {
      setBusy(null);
    }
  };

  const start = async (project: Project): Promise<void> => {
    await flushCurrent();
    await writeProject({ schemaVersion: SCHEMA_VERSION, project });
    await writeLastOpened(project.id);
    openProject(project);
    onClose();
  };

  const remove = async (stored: StoredProject): Promise<void> => {
    setBusy(stored.project.id);
    try {
      await deleteProject(stored.project.id);
      /*
       * Media is deliberately left alone.
       *
       * Blobs are shared between projects (§5's ids), so deleting one
       * project's photographs could empty another's. Reclaiming them needs to
       * ask every remaining project what it still refers to, which belongs in
       * a sweep rather than in a button someone pressed by mistake.
       */
      if (stored.project.id === current.id) openProject(createProject());
      await refresh();
    } catch (caught) {
      console.error('Could not delete that project.', caught);
      setError('Could not delete that project.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Projects"
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: 'rgb(0 0 0 / 0.45)' }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="w-[520px] max-w-full rounded-lg border border-edge bg-panel p-4 shadow-lg">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[13px] font-semibold">Projects</h2>
          <button
            type="button"
            onClick={() => { void start(createProject()); }}
            className="ml-auto rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-accent-ink hover:bg-accent-hover"
          >
            New project
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close projects"
            className="rounded-md border border-edge px-2 py-1 text-[11px] hover:bg-panel-alt"
          >
            Done
          </button>
        </div>

        {error !== null && (
          <p role="alert" className="mb-2 text-[11px]" style={{ color: 'var(--c-danger)' }}>
            {error}
          </p>
        )}

        {entries === null && <p className="text-[11px] text-ink-faint">Reading…</p>}

        {entries?.length === 0 && (
          <p className="text-[11px] text-ink-faint">
            Nothing saved yet. Your work is saved automatically as you edit.
          </p>
        )}

        <ul className="max-h-80 overflow-y-auto">
          {entries?.map((stored) => {
            const isCurrent = stored.project.id === current.id;
            return (
              <li
                key={stored.project.id}
                data-project={stored.project.id}
                className="flex items-center gap-2 border-b border-edge py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  {isCurrent ? (
                    <input
                      aria-label="Project name"
                      value={current.name}
                      onChange={(event) => { dispatch(actions.renameProject(event.target.value)); }}
                      onBlur={() => { void refresh(); }}
                      className="w-full rounded-sm border border-edge bg-transparent px-1.5 py-0.5 text-[12px] focus:border-accent focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => { void open(stored); }}
                      disabled={busy !== null}
                      className="block w-full truncate text-left text-[12px] hover:underline"
                    >
                      {stored.project.name}
                    </button>
                  )}
                  <p className="tabular mt-0.5 text-[10px] text-ink-faint">
                    {isCurrent && 'Open now · '}
                    {stored.project.scenes.length} {stored.project.scenes.length === 1 ? 'scene' : 'scenes'}
                    {' · '}
                    {when(stored.savedAt)}
                  </p>
                </div>

                <button
                  type="button"
                  aria-label={`Duplicate ${stored.project.name}`}
                  /*
                   * Duplicates what is on screen, not what is on disk.
                   *
                   * For the open project those differ by whatever has happened
                   * since the last autosave — a rename typed a moment ago, most
                   * obviously — and copying the stale one silently discards it.
                   */
                  onClick={() => {
                    void start(actions.duplicateProject(isCurrent ? current : stored.project));
                  }}
                  disabled={busy !== null}
                  className="rounded-md border border-edge px-2 py-1 text-[11px] hover:bg-panel-alt"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${stored.project.name}`}
                  onClick={() => { void remove(stored); }}
                  disabled={busy !== null}
                  className="rounded-md border px-2 py-1 text-[11px]"
                  style={{ borderColor: 'var(--c-edge)', color: 'var(--c-danger)' }}
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** "3 minutes ago" beats a timestamp for a list you scan. */
function when(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(at).toLocaleDateString();
}
