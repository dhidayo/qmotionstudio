import type { Project } from '@/document/types';

/**
 * Undo/redo over the document (§4, §13).
 *
 * Plain and framework-free so it can be unit-tested in Node, with the Zustand
 * wiring kept in store.ts.
 *
 * Two things this has to get right beyond push/pop:
 *
 * **Coalescing.** Dragging a size slider fires an action per pointer move. One
 * undo entry per frame would make ⌘Z useless — the user would press it forty
 * times to get back to where they started. Actions carry a `coalesceKey`, and
 * consecutive commits sharing one replace the previous entry rather than
 * stacking. The key includes the target, so dragging photo 2's size then photo
 * 3's produces two entries, not one.
 *
 * **Only the document.** Selection, the open tab and the playhead are editor
 * state and deliberately excluded: nobody wants ⌘Z to reopen a panel. §5's
 * media store is excluded for the same reason plus cost — the document holds
 * ids, so a snapshot is small.
 */

export type Commit = {
  /** Shown in the UI, e.g. "Undo Remove photo". */
  readonly label: string;
  /**
   * Consecutive commits with the same key collapse into one entry. Omit for
   * discrete actions that should always be separately undoable.
   */
  readonly coalesceKey?: string;
};

type Entry = { readonly project: Project; readonly label: string; readonly coalesceKey?: string };

/** Deep enough for a long editing session, bounded so memory cannot run away. */
export const MAX_HISTORY = 120;

export type HistoryState = {
  readonly past: readonly Entry[];
  readonly future: readonly Entry[];
};

export const emptyHistory: HistoryState = { past: [], future: [] };

export type CommitResult = { readonly history: HistoryState; readonly project: Project };

/**
 * Records a change.
 *
 * `current` is the document *before* the change; `next` is after. Nothing is
 * recorded when they are identical, so an action that turns out to be a no-op
 * (setting a value to what it already was) does not leave a dead undo step.
 */
export function commit(
  history: HistoryState,
  current: Project,
  next: Project,
  options: Commit,
): CommitResult {
  if (current === next) return { history, project: current };

  const previous = history.past.at(-1);
  const coalesces =
    options.coalesceKey !== undefined &&
    previous !== undefined &&
    previous.coalesceKey === options.coalesceKey;

  // When coalescing, the entry already on the stack holds the state from
  // *before* the drag began — which is exactly where undo should land, so it
  // is kept and only the label refreshed.
  const entry: Entry = coalesces
    ? { ...previous, label: options.label }
    : {
        project: current,
        label: options.label,
        ...(options.coalesceKey === undefined ? {} : { coalesceKey: options.coalesceKey }),
      };

  const base = coalesces ? history.past.slice(0, -1) : history.past;
  const past = [...base, entry].slice(-MAX_HISTORY);

  // Any new edit invalidates the redo branch.
  return { history: { past, future: [] }, project: next };
}

export function undo(history: HistoryState, current: Project): CommitResult {
  const entry = history.past.at(-1);
  if (!entry) return { history, project: current };

  return {
    history: {
      past: history.past.slice(0, -1),
      future: [{ project: current, label: entry.label }, ...history.future].slice(0, MAX_HISTORY),
    },
    project: entry.project,
  };
}

export function redo(history: HistoryState, current: Project): CommitResult {
  const [entry, ...rest] = history.future;
  if (!entry) return { history, project: current };

  return {
    history: {
      past: [...history.past, { project: current, label: entry.label }].slice(-MAX_HISTORY),
      future: rest,
    },
    project: entry.project,
  };
}

export function canUndo(history: HistoryState): boolean {
  return history.past.length > 0;
}

export function canRedo(history: HistoryState): boolean {
  return history.future.length > 0;
}

/** Label for the next undo, for the menu item and the toast. */
export function undoLabel(history: HistoryState): string | null {
  return history.past.at(-1)?.label ?? null;
}

export function redoLabel(history: HistoryState): string | null {
  return history.future[0]?.label ?? null;
}

/**
 * Ends the current coalescing run.
 *
 * Called on pointer-up. Without it, releasing a slider and immediately dragging
 * it again would merge both drags into one undo step, because the key would
 * still match.
 */
export function sealCoalescing(history: HistoryState): HistoryState {
  const previous = history.past.at(-1);
  if (!previous?.coalesceKey) return history;

  const sealed: Entry = { project: previous.project, label: previous.label };
  return { ...history, past: [...history.past.slice(0, -1), sealed] };
}
