import { ASPECTS, type Aspect } from '@/core/types';
import { useEditor } from '@/state/store';
import { useEntitlements } from '@/entitlements';

export function TopBar(): React.JSX.Element {
  const project = useEditor((s) => s.project);
  const setAspect = useEditor((s) => s.setAspect);
  const theme = useEditor((s) => s.theme);
  const setTheme = useEditor((s) => s.setTheme);
  const { tier } = useEntitlements(project.mode);

  return (
    <header
      className="flex shrink-0 items-center gap-4 border-b border-edge bg-panel px-3"
      style={{ height: 'var(--h-topbar)' }}
    >
      <div className="flex items-center gap-2 pr-1">
        <span className="grid size-6 place-items-center rounded-md bg-accent text-[11px] font-bold text-accent-ink">
          M
        </span>
        <span className="text-[13px] font-semibold tracking-tight">Motion Studio</span>
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

      <div className="ml-auto flex items-center gap-2">
        <span className="text-[11px] text-ink-faint">Nothing leaves your device</span>
        <span
          className="rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ background: 'var(--c-pro-soft)', color: 'var(--c-pro)' }}
        >
          {tier}
        </span>
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

function ModeSwitch(): React.JSX.Element {
  const mode = useEditor((s) => s.project.mode);
  return (
    <div className="flex rounded-md border border-edge p-0.5" role="group" aria-label="Mode">
      {(['showcase', 'motionAd'] as const).map((m) => (
        <span
          key={m}
          aria-current={mode === m}
          title={m === 'motionAd' ? 'Motion Ads arrive at M5' : undefined}
          className="rounded-sm px-2 py-0.5 text-[12px]"
          style={
            mode === m
              ? { background: 'var(--c-accent-soft)', color: 'var(--c-accent)', fontWeight: 600 }
              : { color: 'var(--c-ink-faint)' }
          }
        >
          {m === 'showcase' ? 'Showcase' : 'Motion Ads'}
        </span>
      ))}
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
