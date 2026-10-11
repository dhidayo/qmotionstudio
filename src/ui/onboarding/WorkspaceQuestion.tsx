import { useEffect, useRef } from 'react';
import { useWorkspace } from '@/state/workspace';
import { posterUrl, summaryFor } from '@/templates/manifest';
import { WORKSPACE_IDS, WORKSPACES, type Workspace, type WorkspaceId } from '@/templates/workspaces';
import { groundOf } from '@/ui/library/LibraryRail';
import { BottomSheet } from '@/ui/mobile/BottomSheet';
import { Icon } from '@/ui/mobile/Icon';
import { useLayout } from '@/ui/shell/useLayout';
import { chooseWorkspace } from './chooseWorkspace';
import { closeWorkspaceWindow, useWorkspaceWindow } from './workspaceQuestionState';

/**
 * "What will you make most?" (D-149) — one question, asked once, that sets the
 * library out for the person answering it.
 *
 * One tap answers. The ✕, Escape, a tap outside or a swipe down all skip it,
 * and skipping means "a bit of everything": the library as it always was.
 * The picture stays in view behind it on a phone. From the menu the same
 * window changes the answer, marking the current one.
 */
export function WorkspaceQuestion(): React.JSX.Element | null {
  const open = useWorkspaceWindow();
  if (open === null) return null;
  return <Question asking={open === 'ask'} />;
}

const PICTURED = WORKSPACE_IDS.filter((id) => WORKSPACES[id].poster !== null);
const PLAIN = WORKSPACE_IDS.filter((id) => WORKSPACES[id].poster === null);

function Question({ asking }: { asking: boolean }): React.JSX.Element {
  const phone = useLayout() === 'phone';
  const current = useWorkspace();
  const first = useRef<HTMLButtonElement>(null);
  const source = asking ? 'question' : 'menu';

  useEffect(() => { first.current?.focus(); }, []);

  const choose = (id: WorkspaceId): void => { chooseWorkspace(id, source); };
  const close = asking ? () => { chooseWorkspace('both', 'question'); } : closeWorkspaceWindow;
  // The first option takes focus; in the change form, the current one.
  const focusFirst = (id: WorkspaceId): boolean => (asking ? id === WORKSPACE_IDS[0] : id === current);

  return (
    // Space presses the answer or ✕ in focus, and the arrows stay here, rather than
    // playing or stepping the preview behind the window. The sheet is fixed, so this wrapper takes no room.
    <div onKeyDown={(event) => { if (event.key === ' ' || event.key.startsWith('Arrow')) event.stopPropagation(); }}>
    <BottomSheet
      title="What will you make most?"
      onClose={close}
      closeLabel={asking ? 'Skip and show all designs' : 'Close without changing'}
      tall={phone}
    >
      <div data-workspace-question={asking ? 'ask' : 'change'}>
        <p className="mb-3 text-[13px] leading-snug text-ink-muted">
          {asking
            ? 'We’ll put the right designs first. Nothing is hidden, and you can change this at any time.'
            : 'We’ll put the right designs first. Nothing is hidden, and nothing you’ve made will change.'}
        </p>
        <div className={phone ? 'flex flex-col gap-2' : 'grid grid-cols-3 gap-2.5'}>
          {PICTURED.map((id) => (
            <PictureOption
              key={id}
              workspace={WORKSPACES[id]}
              phone={phone}
              current={!asking && id === current}
              buttonRef={focusFirst(id) ? first : undefined}
              onChoose={() => { choose(id); }}
            />
          ))}
        </div>
        {PLAIN.map((id) => {
          const workspace = WORKSPACES[id];
          const isCurrent = !asking && id === current;
          return (
            <button
              key={id}
              ref={focusFirst(id) ? first : undefined}
              type="button"
              data-workspace-option={id}
              aria-current={isCurrent ? 'true' : undefined}
              onClick={() => { choose(id); }}
              className={`mt-2 flex min-h-12 w-full items-center gap-3 rounded-2xl border ${isCurrent ? 'border-accent' : 'border-edge'} px-3 py-2 text-left hover:border-accent hover:bg-accent-soft`}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--c-accent-soft)', color: 'var(--c-accent)' }}>
                <Icon name="designs" size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">{workspace.name}</span>
                <span className="block text-[12px] text-ink-muted">{workspace.line}</span>
              </span>
              {isCurrent ? <CurrentMark /> : <span aria-hidden className="text-[18px] text-ink-faint">›</span>}
            </button>
          );
        })}
      </div>
    </BottomSheet>
    </div>
  );
}

function CurrentMark(): React.JSX.Element {
  return <span className="shrink-0 text-[12px] font-semibold" style={{ color: 'var(--c-accent)' }}>✓ Current</span>;
}

function PictureOption({
  workspace,
  phone,
  current,
  buttonRef,
  onChoose,
}: {
  workspace: Workspace;
  phone: boolean;
  current: boolean;
  buttonRef: React.RefObject<HTMLButtonElement> | undefined;
  onChoose: () => void;
}): React.JSX.Element {
  const poster = workspace.poster ?? '';
  const summary = summaryFor(poster);
  const ground = summary === undefined ? 'var(--c-panel-alt)' : groundOf(summary);
  const picture = (
    <span
      className={phone ? 'relative block h-[60px] w-[52px] shrink-0 overflow-hidden rounded-[10px]' : 'relative block h-[118px] w-full overflow-hidden'}
      style={{ background: ground }}
    >
      <img src={posterUrl(poster)} alt="" decoding="async" className="absolute inset-0 size-full object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
    </span>
  );

  return (
    <button
      ref={buttonRef}
      type="button"
      data-workspace-option={workspace.id}
      aria-current={current ? 'true' : undefined}
      onClick={onChoose}
      className={`overflow-hidden rounded-2xl border text-left ${current ? 'border-accent' : 'border-edge'} hover:border-accent hover:bg-accent-soft ${phone ? 'flex min-h-[76px] items-center gap-3 px-3 py-2' : 'flex flex-col'}`}
    >
      {picture}
      <span className={phone ? 'min-w-0 flex-1' : 'block px-3 pb-3 pt-2'}>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[15px] font-semibold">{workspace.name}</span>
          {current && <CurrentMark />}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">{workspace.line}</span>
      </span>
      {phone && !current && <span aria-hidden className="text-[18px] text-ink-faint">›</span>}
    </button>
  );
}
