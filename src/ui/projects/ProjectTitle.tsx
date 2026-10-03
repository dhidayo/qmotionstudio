import { useEffect, useRef, useState } from 'react';
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
  const { rename, makeCopy, startNew } = useProjectActions();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * Where the menu opens, in window coordinates.
   *
   * The top bar scrolls sideways on narrow screens, and a scrolling box clips
   * anything that hangs out of it — so a menu positioned inside the bar was
   * opened and cut off in the same instant. Fixed to the window instead, at
   * the button's own position.
   */
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [savingAs, setSavingAs] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  // Closes on a click anywhere else, and on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: PointerEvent): void => {
      if (menu.current && event.target instanceof Node && !menu.current.contains(event.target)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const beginRename = (): void => {
    setDraft(name);
    setEditing(true);
    setMenuOpen(false);
  };

  const commit = (): void => {
    setEditing(false);
    void rename(draft);
  };

  const run = (action: () => void): void => {
    setMenuOpen(false);
    action();
  };

  return (
    <div className="relative flex min-w-0 items-center gap-1" ref={menu}>
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
        ref={trigger}
        type="button"
        onClick={() => {
          const box = trigger.current?.getBoundingClientRect();
          if (box) setAnchor({ top: box.bottom + 4, left: Math.max(8, box.left - 160) });
          setMenuOpen((open) => !open);
        }}
        aria-label="Project menu"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="rounded-md px-1.5 py-1 text-[11px] text-ink-muted hover:bg-panel-alt"
      >
        ▾
      </button>

      <button
        type="button"
        onClick={() => { setProjectsOpen(true); }}
        className="shrink-0 rounded-md border border-edge px-2 py-1 text-[12px] hover:bg-panel-alt"
      >
        Switch project
      </button>

      {menuOpen && anchor && (
        <div
          role="menu"
          aria-label="Project"
          className="fixed z-50 w-56 rounded-md border border-edge bg-panel py-1 shadow-lg"
          style={{ top: anchor.top, left: anchor.left }}
        >
          <MenuItem onSelect={() => { run(beginRename); }}>Rename</MenuItem>
          <MenuItem onSelect={() => { run(() => { setSavingAs(true); }); }} hint="A new copy you keep working on">Save as…</MenuItem>
          <MenuItem onSelect={() => { run(() => { void makeCopy(); }); }} hint="A copy in your list; you stay here">Make a copy</MenuItem>
          <Divider />
          <MenuItem onSelect={() => { run(() => { void startNew('template'); }); }}>New project</MenuItem>
          <MenuItem onSelect={() => { run(() => { void startNew('blank'); }); }} hint="Build from scratch">New blank canvas</MenuItem>
          <Divider />
          <MenuItem onSelect={() => { run(() => { setProjectsOpen(true); }); }}>Switch project…</MenuItem>
        </div>
      )}

      {savingAs && <SaveAsDialog onClose={() => { setSavingAs(false); }} />}
    </div>
  );
}

function MenuItem({
  children,
  hint,
  onSelect,
}: {
  children: React.ReactNode;
  hint?: string;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-panel-alt focus:bg-panel-alt focus:outline-none"
    >
      {children}
      {hint !== undefined && <span className="block text-[10px] text-ink-faint">{hint}</span>}
    </button>
  );
}

function Divider(): React.JSX.Element {
  return <div role="separator" className="my-1 border-t border-edge" />;
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
