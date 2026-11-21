import { ASPECTS, type Aspect } from '@/core/types';
import { useEditor } from '@/state/store';
import { AccountButton } from './AccountMenu';
import type { SaveState } from '@/ui/persist/saveState';
import { ProjectTitle } from '@/ui/projects/ProjectTitle';
import { MODE_COPY } from './modeLabels';
import { switchMode } from './switchMode';
import { useOverlays } from './overlays';
import { chord, readInputCaps, useInputCaps } from './platform';
import { useLayout } from './useLayout';
import { useProjectActions } from '@/ui/projects/useProjectActions';
import { useProjectFile } from '@/ui/projects/useProjectFile';
import { showQuickStart } from '@/ui/onboarding/quickStartState';

export function TopBar(): React.JSX.Element {
  const project = useEditor((s) => s.project);
  const setAspect = useEditor((s) => s.setAspect);
  const save = useEditor((s) => s.saveState);
  const compact = useLayout() !== 'desktop';
  const caps = useInputCaps();

  return (
    <header
      // Frosted over the colour field (D-174): it floats over the page, it is not a navy block.
      className="glass-bar flex shrink-0 items-center gap-2 overflow-x-auto border-b px-3 lg:gap-4"
      style={{ height: 'var(--h-topbar)' }}
    >
      <AppMenu />
      <div className="flex shrink-0 items-center gap-2 pr-1">
        {/* The owner's Q, cut from their own artwork by `npm run brand`. */}
        <img src="/brand-q.png" alt="" aria-hidden width={24} height={24} className="size-6 rounded-md" />
        <span className="font-headline hidden text-[14px] font-bold lg:inline">
          Q Motion Studio
        </span>
      </div>

      <ModeSwitch />

      {/* One chip that opens the five shapes when the bar is short of room (D-116). */}
      {compact ? (
        <button
          type="button"
          onClick={() => { useOverlays.getState().openPhonePanel('aspect'); }}
          aria-label={`Frame shape ${project.aspect}. Change`}
          className="ui-chip h-7 shrink-0 gap-1 px-2.5 text-[12px] font-medium tabular"
        >
          {project.aspect} <span aria-hidden className="text-[10px] text-ink-faint">▾</span>
        </button>
      ) : (
      <div className="ui-seg items-center" role="group" aria-label="Aspect ratio">
        {ASPECTS.map((aspect) => (
          <AspectButton
            key={aspect}
            aspect={aspect}
            active={project.aspect === aspect}
            onSelect={setAspect}
          />
        ))}
      </div>
      )}

      <UndoRedo />

      {/* The open project's name, its menu, and "Switch project" (D-099). */}
      <ProjectTitle />

      <div className="ml-auto flex items-center gap-2">
        {/*
          * The save state, shown only when it is not the boring one.
          *
          * "Saved" as a permanent badge is noise that stops being read within
          * a minute, which is the worst possible state for the one indicator
          * that has to be believed when it says *not* saved (§16).
          */}
        <SaveBadge state={save} />
        {/* Only where there is a keyboard (D-161); a touch screen finds its gestures in the menu. */}
        {caps.keyboard && (
          <button
            type="button"
            onClick={() => { useOverlays.getState().setShortcutsOpen(true); }}
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
            className="ui-iconbtn ui-iconbtn--edge size-7 rounded-full text-[12px] font-semibold"
          >
            ?
          </button>
        )}
        <ExportButton />
        {/*
          * The account (D-175): its circle at the end of the bar, and in its
          * menu the plan with the Free/Pro test switch (§12), the theme and
          * Sign out, which used to sit loose here. "Nothing leaves your
          * device" is said there, as how it works today, and still where the
          * photos arrive (§9).
          */}
        <AccountButton />
      </div>
    </header>
  );
}

function ExportButton(): React.JSX.Element {
  const setExporting = useEditor((s) => s.setExporting);
  // Its shortcut as this device writes it, and only where there is a keyboard (D-161).
  const { keyboard } = useInputCaps();
  return (
    <button
      type="button"
      onClick={() => { setExporting(true); }}
      data-tour="export"
      title={keyboard ? `Export (${chord('mod+E')})` : 'Export'}
      // The studio's one main action, and the only button in the accent (D-176).
      className="ui-btn ui-btn--cta"
    >
      Export
    </button>
  );
}

/** §13's ⌘Z/⌘⇧Z, surfaced so the history is visible rather than folklore. */
function UndoRedo(): React.JSX.Element {
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const history = useEditor((s) => s.history);

  const undoName = history.past.at(-1)?.label ?? null;
  const redoName = history.future[0]?.label ?? null;

  return (
    <div className="flex items-center gap-0.5">
      <HistoryButton
        onClick={undo}
        disabled={undoName === null}
        label={undoName === null ? 'Nothing to undo' : `Undo ${undoName}`}
      >
        ↶
      </HistoryButton>
      <HistoryButton
        onClick={redo}
        disabled={redoName === null}
        label={redoName === null ? 'Nothing to redo' : `Redo ${redoName}`}
      >
        ↷
      </HistoryButton>
    </div>
  );
}

function HistoryButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="ui-iconbtn size-7 text-[15px]"
    >
      {children}
    </button>
  );
}

/**
 * §1.1 / §1.2. Image and Video (D-155), named for what each makes. Switching
 * to Video keeps the image as scene 1 and lets you add more; switching back
 * keeps scene 1 and the layers over it, and sets the rest aside.
 *
 * That loses scenes, so a video of more than one scene, or with sound, asks
 * first, and the switch is one undo away (`switchMode`, D-168).
 */
function ModeSwitch(): React.JSX.Element {
  const mode = useEditor((s) => s.project.mode);
  const sceneCount = useEditor((s) => s.project.scenes.length);

  return (
    <div className="ui-seg" role="group" aria-label="Mode">
      {(['showcase', 'motionAd'] as const).map((m) => {
        const active = mode === m;
        const lossy = m === 'showcase' && sceneCount > 1;
        return (
          <button
            key={m}
            type="button"
            aria-current={active}
            aria-pressed={active}
            onClick={() => { if (!active) switchMode(m); }}
            title={
              lossy
                ? `${MODE_COPY[m].label} keeps scene 1 and the layers over it, and sets the other ${sceneCount - 1} aside. It asks first, and can be undone.`
                : MODE_COPY[m].hint
            }
            className="ui-seg-opt whitespace-nowrap px-2.5 py-1 text-[12px]"
          >
            {MODE_COPY[m].label}
          </button>
        );
      })}
    </div>
  );
}

function AspectButton({
  aspect,
  active,
  onSelect,
}: {
  aspect: Aspect;
  active: boolean;
  onSelect: (a: Aspect) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => { onSelect(aspect); }}
      aria-pressed={active}
      className="ui-seg-opt px-2 py-1 text-[11px] tabular"
    >
      {aspect}
    </button>
  );
}

function SaveBadge({ state }: { state: SaveState }): React.JSX.Element | null {
  if (state === 'idle' || state === 'saved') {
    return (
      <span className="text-[11px] text-ink-faint" data-save-state={state}>
        {state === 'saved' ? 'Saved' : ''}
      </span>
    );
  }

  const failed = state === 'failed';
  return (
    <span
      data-save-state={state}
      role={failed ? 'alert' : undefined}
      className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold"
      style={
        failed
          ? { background: 'var(--c-pro-soft)', color: 'var(--c-danger)' }
          : { color: 'var(--c-ink-faint)' }
      }
    >
      {failed ? 'Not saved' : 'Saving…'}
    </span>
  );
}

/**
 * The menu (D-141), the same three lines a phone has, at the start of the
 * bar: everything about the project as a whole — new, open, save to a file,
 * copies — and help, kept out of the bar so the bar stays about the work.
 */
function AppMenu(): React.JSX.Element {
  const { startNew, makeCopy } = useProjectActions();
  const file = useProjectFile();
  const setProjectsOpen = useEditor((s) => s.setProjectsOpen);
  const theme = useEditor((s) => s.theme);
  const setTheme = useEditor((s) => s.setTheme);
  const openMenu = useOverlays((o) => o.openMenu);

  const open = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    openMenu({
      x: box.left,
      y: box.bottom + 4,
      title: 'Q Motion Studio',
      items: [
        { label: MODE_COPY.showcase.newProject, hint: MODE_COPY.showcase.newHint, onSelect: () => { void startNew('template'); } },
        { label: MODE_COPY.motionAd.newProject, hint: MODE_COPY.motionAd.newHint, onSelect: () => { void startNew('blank'); } },
        { label: 'Open…', hint: 'Your projects', onSelect: () => { setProjectsOpen(true); } },
        { kind: 'separator' },
        { label: 'Save project file', hint: '.qmotion — keep or share', onSelect: file.save },
        { label: 'Open project file…', onSelect: file.open },
        { kind: 'separator' },
        { label: 'Rename…', onSelect: () => { useOverlays.getState().askRename(); } },
        { label: 'Save as…', hint: 'A new copy you keep working on', onSelect: () => { useOverlays.getState().setSaveAsOpen(true); } },
        { label: 'Make a copy', hint: 'A copy in your list; you stay here', onSelect: () => { void makeCopy(); } },
        { kind: 'separator' },
        { label: 'Show the quick start', onSelect: () => { showQuickStart(); } },
        // The help that fits the device (D-161): its keys, or its gestures on a touch screen alone.
        readInputCaps().keyboard
          ? { label: 'Keyboard shortcuts', hint: '?', onSelect: () => { useOverlays.getState().setShortcutsOpen(true); } }
          : { label: 'Touch gestures', onSelect: () => { useOverlays.getState().setShortcutsOpen(true); } },
        { label: theme === 'dark' ? 'Light theme' : 'Dark theme', onSelect: () => { setTheme(theme === 'dark' ? 'light' : 'dark'); } },
      ],
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Menu"
        // Says what is in it (D-172): New image and New video are how to start afresh.
        title="Menu: New image, New video, Open, Save"
        data-app-menu
        className="ui-iconbtn size-9 shrink-0 text-ink"
      >
        <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {file.input}
    </>
  );
}
