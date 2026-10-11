import { useId, useRef, type ReactNode } from 'react';
import { useWorkspace } from '@/state/workspace';
import { WORKSPACE_IDS, WORKSPACES, type WorkspaceId } from '@/templates/workspaces';
import { chooseWorkspace } from '@/ui/onboarding/chooseWorkspace';

/**
 * "Set up for" (D-149), at the top of the library on every screen: which
 * designs come first. One tap switches, and the list below changes at once;
 * nothing is hidden, and nothing the person has made is touched.
 *
 * A radio group rather than buttons, so a screen reader says which one is on
 * and the arrow keys move along it.
 */
export function WorkspaceSwitch({ size, aside }: { size: 'rail' | 'sheet'; aside?: ReactNode }): React.JSX.Element {
  const current = useWorkspace();
  const labelId = useId();
  const parts = useRef<(HTMLButtonElement | null)[]>([]);
  const sheet = size === 'sheet';

  const move = (from: number, step: number | 'first' | 'last'): void => {
    const count = WORKSPACE_IDS.length;
    const to = step === 'first' ? 0 : step === 'last' ? count - 1 : (from + step + count) % count;
    const id = WORKSPACE_IDS[to];
    if (id === undefined) return;
    chooseWorkspace(id, 'switch');
    parts.current[to]?.focus();
  };

  return (
    <div className={sheet ? 'mb-2.5' : 'mb-2'}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span id={labelId} className={`font-semibold uppercase tracking-wider text-ink-faint ${sheet ? 'text-[12px]' : 'text-[10px]'}`}>Set up for</span>
        {aside}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        data-workspace-switch
        title="Which designs come first. Nothing is hidden."
        className="grid grid-cols-4 gap-1"
      >
        {WORKSPACE_IDS.map((id: WorkspaceId, index) => {
          const on = id === current;
          return (
            <button
              key={id}
              ref={(el) => { parts.current[index] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              data-workspace={id}
              onClick={() => { chooseWorkspace(id, 'switch'); }}
              onKeyDown={(event) => {
                const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
                  : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
                  : event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : null;
                if (step === null) return;
                event.preventDefault();
                move(index, step);
              }}
              className={`truncate rounded-md border px-1 transition-colors ${sheet ? 'h-10 text-[13px]' : 'h-[26px] text-[11px]'}`}
              style={{
                borderColor: on ? 'var(--c-accent)' : 'var(--c-edge)',
                background: on ? 'var(--c-accent-soft)' : 'transparent',
                color: on ? 'var(--c-accent)' : 'var(--c-ink-muted)',
                fontWeight: on ? 600 : 400,
                transitionDuration: 'var(--t-fast)',
              }}
            >
              {WORKSPACES[id].short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
