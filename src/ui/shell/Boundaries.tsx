import { Component, type ErrorInfo, type ReactNode } from 'react';
import { SCHEMA_VERSION } from '@/document/types';
import { writeProject } from '@/persist/db';
import { useEditor } from '@/state/store';
import { hasWork } from '@/state/starter';
import { CRASHED, windowFailureMessage } from './failures';
import { saveAndReload } from './reload';

/**
 * Where an error thrown while drawing the interface ends up (D-171).
 *
 * React unmounts the whole tree on an error nobody catches, which left a
 * blank white page: no words, no way back, and — the autosave being part of
 * that tree — the last few edits' save cancelled with it. These catch it
 * instead.
 */

/**
 * The last resort: the whole editor. It saves the document as it stands, says
 * so, and offers a reload, which reopens the project (§13).
 *
 * The document is written here, not left to the autosave: the autosave's
 * debounce belonged to the tree that just went away, and a crash inside that
 * window would otherwise lose the edit that caused it. Photographs are saved
 * the moment they arrive (D-111), so the document is all that can be waiting.
 */
type CrashState = { readonly error: unknown; readonly saved: 'saving' | 'saved' | 'failed' } | null;

export class CrashBoundary extends Component<{ readonly children: ReactNode }, { crash: CrashState }> {
  override state: { crash: CrashState } = { crash: null };

  static getDerivedStateFromError(error: unknown): { crash: CrashState } {
    return { crash: { error, saved: 'saving' } };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // §16: said in full where a bug report can find it.
    console.error('Q Motion Studio: the editor stopped with an error.', error, info.componentStack);
    const { project } = useEditor.getState();
    // A design nobody has touched is not saved: it would only add an empty project to the list.
    if (!hasWork(project)) {
      this.setState({ crash: { error, saved: 'saved' } });
      return;
    }
    writeProject({ schemaVersion: SCHEMA_VERSION, project })
      .then(() => { this.setState({ crash: { error, saved: 'saved' } }); })
      .catch((saveError: unknown) => {
        console.error('Could not save the project after the error.', saveError);
        this.setState({ crash: { error, saved: 'failed' } });
      });
  }

  override render(): ReactNode {
    const { crash } = this.state;
    if (crash === null) return this.props.children;
    return <CrashScreen saved={crash.saved} />;
  }
}

function CrashScreen({ saved }: { readonly saved: 'saving' | 'saved' | 'failed' }): React.JSX.Element {
  const failed = saved === 'failed';
  return (
    <div className="grid h-full place-items-center bg-bg p-6 text-center text-ink" role="alert" data-crash>
      <div className="max-w-[360px]">
        <h1 className="mb-2 text-[16px] font-semibold">
          {failed ? 'Something went wrong' : CRASHED}
        </h1>
        <p className="mb-4 text-[13px] leading-relaxed text-ink-muted">
          {saved === 'saving' && 'Saving your work…'}
          {saved === 'saved' && 'Reload to carry on where you left off. If it happens again, the last change you made is the likely cause — undo it after reloading.'}
          {failed && 'Your latest change could not be saved, but everything before it was. Reload to carry on.'}
        </p>
        <button
          type="button"
          className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink"
          style={{ minHeight: 44 }}
          onClick={() => { location.reload(); }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}

/**
 * A window loaded on first use — Export, the project list — that could not
 * be: offline before it was kept, usually. Without this the failed download
 * reached the crash screen; the window is closed instead, and a notice says
 * why and offers the reload that fetches it again.
 */
export class WindowBoundary extends Component<{
  readonly children: ReactNode;
  /** Closes whichever window failed. */
  readonly onFailed: () => void;
}, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error('A window could not be opened.', error);
    this.props.onFailed();
    useEditor.getState().showToast(windowFailureMessage(error), {
      sticky: true,
      urgent: true,
      action: { label: 'Reload', run: () => { saveAndReload(useEditor.getState().project); } },
    });
    this.setState({ failed: false });
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
