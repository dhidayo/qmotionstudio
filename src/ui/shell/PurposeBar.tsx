import { useId, useRef } from 'react';
import { useWorkspace } from '@/state/workspace';
import { WORKSPACE_IDS, WORKSPACES, type WorkspaceId } from '@/templates/workspaces';
import { chooseWorkspace } from '@/ui/onboarding/chooseWorkspace';

/**
 * Purpose (D-150): what the designs are for — Social, Business, News or All —
 * as one slim row above the picture.
 *
 * "Purpose should take small space at the top of canvas; and selected item
 * should also be deep blue; and only one row for all things." It replaces the
 * first-visit question and the switch in the library (D-149): the choice is
 * always in view, Social is chosen until the person picks another, and one tap
 * changes the library at once. Nothing the person has made is touched.
 *
 * A radio group: a screen reader says which is on; the arrow keys move along
 * it and Enter, Space or a click chooses.
 */
export function PurposeBar({ variant }: { variant: 'wide' | 'phone' }): React.JSX.Element {
  const current = useWorkspace();
  const labelId = useId();
  const parts = useRef<(HTMLButtonElement | null)[]>([]);
  const phone = variant === 'phone';

  const move = (from: number, step: number | 'first' | 'last'): void => {
    const count = WORKSPACE_IDS.length;
    const to = step === 'first' ? 0 : step === 'last' ? count - 1 : (from + step + count) % count;
    parts.current[to]?.focus();
  };

  return (
    <div
      data-purpose-bar
      data-tour="purpose"
      className={`flex shrink-0 items-center justify-center gap-2 ${phone ? 'px-3 py-1.5' : 'px-4 py-2'}`}
    >
      <span id={labelId} className={`shrink-0 font-semibold text-ink-muted ${phone ? 'text-[12px]' : 'text-[12px]'}`}>Purpose</span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex shrink-0 gap-1">
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
              title={WORKSPACES[id].line}
              onClick={() => { chooseWorkspace(id); }}
              onKeyDown={(event) => {
                // Space chooses, as on any button — not play or pause in the preview.
                if (event.key === ' ') { event.stopPropagation(); return; }
                const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
                  : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
                  : event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : null;
                if (step === null) return;
                event.preventDefault();
                event.stopPropagation();
                move(index, step);
              }}
              className={`whitespace-nowrap rounded-full border transition-colors ${on ? 'chip-on' : 'border-edge bg-panel text-ink-muted hover:bg-panel-alt'} ${phone ? 'h-8 px-3 text-[13px]' : 'h-7 px-3.5 text-[12px]'}`}
              style={{ transitionDuration: 'var(--t-fast)' }}
            >
              {WORKSPACES[id].short}
            </button>
          );
        })}
      </div>
      {!phone && (
        <span data-purpose-hint className="hidden min-w-0 truncate text-[12px] text-ink-faint lg:block">
          {WORKSPACES[current].line}
        </span>
      )}
    </div>
  );
}
