import { ASPECTS, type Aspect } from '@/core/types';
import { useEditor } from '@/state/store';
import { TIER_SWITCHABLE, setTier, useEntitlements } from '@/entitlements';
import type { SaveState } from '@/ui/persist/saveState';
import { ProjectTitle } from '@/ui/projects/ProjectTitle';
import { MODE_LABEL } from './modeLabels';

export function TopBar(): React.JSX.Element {
  const project = useEditor((s) => s.project);
  const setAspect = useEditor((s) => s.setAspect);
  const theme = useEditor((s) => s.theme);
  const setTheme = useEditor((s) => s.setTheme);
  const { tier } = useEntitlements(project.mode);
  const save = useEditor((s) => s.saveState);

  return (
    <header
      className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-edge bg-panel px-3 lg:gap-4"
      style={{ height: 'var(--h-topbar)' }}
    >
      <div className="flex shrink-0 items-center gap-2 pr-1">
        {/* The owner's Q, cut from their own artwork by `npm run brand`. */}
        <img src="/brand-q.png" alt="" aria-hidden width={24} height={24} className="size-6 rounded-md" />
        <span className="hidden text-[13px] font-semibold tracking-tight lg:inline">
          Q Motion Studio
        </span>
      </div>

      <ModeSwitch />

      <div className="flex items-center gap-1" role="group" aria-label="Aspect ratio">
        {ASPECTS.map((aspect) => (
          <AspectButton
            key={aspect}
            aspect={aspect}
            active={project.aspect === aspect}
            onSelect={setAspect}
          />
        ))}
      </div>

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
        {/*
          * §9 requires the UI to say this, and it still does at every width —
          * the Photos panel carries "Nothing is uploaded" where the files
          * actually arrive, which is the more useful place for it on a small
          * screen anyway. Here it is the first thing to go when the bar runs
          * out of room, rather than being allowed to squeeze the controls.
          */}
        <span className="hidden text-[11px] text-ink-faint xl:inline">
          Nothing leaves your device
        </span>
        {/*
          * §12's dev toggle. The stub "returns a tier from local state with a
          * dev toggle", and without one the Pro paths — custom media most of
          * all — cannot be reached, let alone tested. The upsell UI and the
          * free-tier watermark remain M7; this is only the switch.
          */}
        {TIER_SWITCHABLE ? (
          <button
            type="button"
            onClick={() => { setTier(tier === 'pro' ? 'free' : 'pro'); }}
            title={`Development toggle — currently ${tier}. Click for ${tier === 'pro' ? 'free' : 'pro'}.`}
            aria-label={`Tier: ${tier}. Switch to ${tier === 'pro' ? 'free' : 'pro'}.`}
            className="rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: 'var(--c-pro-soft)', color: 'var(--c-pro)' }}
          >
            {tier}
          </button>
        ) : (
          // The plan, stated. Not a control: there is nothing to switch to yet.
          <span
            title="Pro plans are coming soon"
            className="rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: 'var(--c-pro-soft)', color: 'var(--c-pro)' }}
          >
            {tier}
          </span>
        )}
        <button
          type="button"
          onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); }}
          className="rounded-md border border-edge px-2 py-1 text-[12px] hover:bg-panel-alt"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
        <ExportButton />
      </div>
    </header>
  );
}

function ExportButton(): React.JSX.Element {
  const setExporting = useEditor((s) => s.setExporting);
  return (
    <button
      type="button"
      onClick={() => { setExporting(true); }}
      title="Export (⌘E)"
      className="rounded-md bg-accent px-3 py-1 text-[12px] font-medium text-accent-ink hover:bg-accent-hover"
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
    <div className="flex items-center gap-1">
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
      className="grid size-6 place-items-center rounded-md border border-edge text-[13px] leading-none hover:bg-panel-alt disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/**
 * §1.1 / §1.2. Switching to Motion Ads keeps the scene you were on and lets you
 * add more; switching back keeps the *selected* scene and drops the rest along
 * with the overlays and audio, because §5 says showcase has exactly one scene.
 *
 * That is destructive, and it is one ⌘Z away — which is why the button says so
 * rather than opening a dialog.
 */
function ModeSwitch(): React.JSX.Element {
  const mode = useEditor((s) => s.project.mode);
  const sceneCount = useEditor((s) => s.project.scenes.length);
  const layerCount = useEditor((s) => s.project.overlays.length + s.project.audio.length);
  const setMode = useEditor((s) => s.setMode);
  const showToast = useEditor((s) => s.showToast);

  /*
   * Showcase holds one scene and no layers or music (§5), so going back to it
   * from an ad keeps the selected scene and sets the rest aside. It was only
   * ever said in a tooltip; now it is said at the moment it happens, with the
   * way back (D-098).
   */
  const choose = (next: 'showcase' | 'motionAd'): void => {
    setMode(next);
    if (next === 'showcase' && (sceneCount > 1 || layerCount > 0)) {
      showToast('Lifestyle keeps the selected scene. Press ⌘Z to bring the rest of the ad back.');
    }
  };

  return (
    <div className="flex rounded-md border border-edge p-0.5" role="group" aria-label="Mode">
      {(['showcase', 'motionAd'] as const).map((m) => {
        const active = mode === m;
        const lossy = m === 'showcase' && sceneCount > 1;
        return (
          <button
            key={m}
            type="button"
            aria-current={active}
            aria-pressed={active}
            onClick={() => { if (!active) choose(m); }}
            title={
              lossy
                ? `Keeps the selected scene and drops the other ${sceneCount - 1}. Undoable.`
                : m === 'showcase' ? 'One looping scene' : 'Several scenes, transitions and overlays'
            }
            className="rounded-sm px-2 py-0.5 text-[12px] transition-colors"
            style={
              active
                ? { background: 'var(--c-accent-soft)', color: 'var(--c-accent)', fontWeight: 600 }
                : { color: 'var(--c-ink-faint)' }
            }
          >
            {MODE_LABEL[m]}
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
      className="rounded-md border px-2 py-1 text-[11px] tabular transition-colors"
      style={{
        borderColor: active ? 'var(--c-accent)' : 'var(--c-edge)',
        background: active ? 'var(--c-accent-soft)' : 'transparent',
        color: active ? 'var(--c-accent)' : 'var(--c-ink-muted)',
        fontWeight: active ? 600 : 400,
        transitionDuration: 'var(--t-fast)',
      }}
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
