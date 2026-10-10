import { useEffect, useRef, useState } from 'react';
import { useOverlays } from '@/ui/shell/overlays';
import { useEditor } from '@/state/store';
import { MAX_NAME, useProjectActions } from './useProjectActions';

/**
 * The open project's name, at the top of the editor, and everything you can do
 * with the project itself (D-099).
 *
 * Asked for as: the name shown at the top, "Switch project" beside it, a click
 * on the name to rename it — saved automatically, with a notice that fades —
 * and Save as. Renaming used to live only inside the project list, which you
 * had to open to find out what the project was even called.
 *
 * The name is the control because that is where people already click to
 * rename a document in every editor they use. Enter or clicking away saves;
 * Escape puts it back.
 */
export function ProjectTitle(): React.JSX.Element {
  const name = useEditor((s) => s.project.name);
  const setProjectsOpen = useEditor((s) => s.setProjectsOpen);
  const { rename } = useProjectActions();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  // Asked for from the menu (D-141): the menu is the one place for project actions.
  const renameAsked = useOverlays((o) => o.renameAsked);
  const savingAs = useOverlays((o) => o.saveAsOpen);
  const setSavingAs = useOverlays((o) => o.setSaveAsOpen);
  const input = useRef<HTMLInputElement | null>(null);

  const beginRename = (): void => {
    setDraft(name);
    setEditing(true);
  };

  const [seenAsk, setSeenAsk] = useState(renameAsked);
  if (renameAsked !== seenAsk) {
    setSeenAsk(renameAsked);
    setDraft(name);
    setEditing(true);
  }

  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  const commit = (): void => {
    setEditing(false);
    void rename(draft);
  };

  return (
    <div className="relative flex min-w-0 items-center gap-1">
      {editing ? (
        <input
          ref={input}
          aria-label="Rename project"
          value={draft}
          maxLength={MAX_NAME}
          onChange={(event) => { setDraft(event.target.value); }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); commit(); }
            if (event.key === 'Escape') { event.preventDefault(); setEditing(false); }
          }}
          className="w-48 rounded-md border px-2 py-1 text-[12px] font-semibold focus:outline-none"
          style={{ borderColor: 'var(--c-accent)', background: 'var(--c-panel-alt)' }}
        />
      ) : (
        <button
          type="button"
          data-project-title
          onClick={beginRename}
          title="Click to rename"
          aria-label={`Project: ${name}. Click to rename.`}
          className="max-w-[200px] truncate rounded-md px-2 py-1 text-[12px] font-semibold hover:bg-panel-alt"
        >
          {name}
        </button>
      )}

      <button
        type="button"
        onClick={() => { setProjectsOpen(true); }}
        className="shrink-0 rounded-md border border-edge px-2 py-1 text-[12px] hover:bg-panel-alt"
      >
        Switch project
      </button>

      {savingAs && <SaveAsDialog onClose={() => { setSavingAs(false); }} />}
    </div>
  );
}



/** "Save as": name the copy, then carry on working in it. */
function SaveAsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const name = useEditor((s) => s.project.name);
  const { saveAs } = useProjectActions();
  const [draft, setDraft] = useState(`${name} copy`.slice(0, MAX_NAME));
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  const submit = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    await saveAs(draft);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Save as"
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: 'rgb(0 0 0 / 0.45)' }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <form
        className="w-[380px] max-w-full rounded-lg border border-edge bg-panel p-4 shadow-lg"
        onSubmit={(event) => { event.preventDefault(); void submit(); }}
      >
        <h2 className="text-[13px] font-semibold">Save as</h2>
        <p className="mt-1 text-[11px] text-ink-faint">
          Saves a copy under a new name and opens it. “{name}” stays exactly as it is.
        </p>
        <label className="mt-3 block text-[11px] text-ink-muted" htmlFor="save-as-name">Name</label>
        <input
          id="save-as-name"
          ref={field}
          value={draft}
          maxLength={MAX_NAME}
          onChange={(event) => { setDraft(event.target.value); }}
          onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
          className="mt-1 w-full rounded-md border border-edge bg-panel-alt px-2 py-1.5 text-[12px] focus:border-accent focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-edge px-3 py-1 text-[12px] hover:bg-panel-alt">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-3 py-1 text-[12px] font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save as'}
          </button>
        </div>
      </form>
    </div>
  );
}
