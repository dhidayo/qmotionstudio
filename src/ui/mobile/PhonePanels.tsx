import { useState } from 'react';
import { ASPECTS, type Aspect } from '@/core/types';
import type { PreviewClock } from '@/core/time/clock';
import { useEditor } from '@/state/store';
import { MODE_COPY } from '@/ui/shell/modeLabels';
import { switchMode } from '@/ui/shell/switchMode';
import { useOverlays, type PhonePanel } from '@/ui/shell/overlays';
import { ScenePicker } from '@/ui/timeline/ScenePicker';
import { LibraryRail } from '@/ui/library/LibraryRail';
import { PhotosTab } from '@/ui/inspector/tabs/PhotosTab';
import { TextTab } from '@/ui/inspector/tabs/TextTab';
import { MotionTab } from '@/ui/inspector/tabs/MotionTab';
import { LookTab } from '@/ui/inspector/tabs/LookTab';
import { OverlayPanel } from '@/ui/inspector/OverlayPanel';
import { AudioPanel } from '@/ui/inspector/AudioPanel';
import { TimelineEffectPanel } from '@/ui/effects/EffectEditors';
import { Timeline } from '@/ui/timeline/Timeline';
import { AddBar } from '@/ui/editing/AddBar';
import { MAX_NAME, useProjectActions } from '@/ui/projects/useProjectActions';
import { SectionTabs } from '@/ui/inspector/controls';
import { BottomSheet } from './BottomSheet';
import { TierSwitch } from '@/ui/shell/TierSwitch';
import { useProjectFile } from '@/ui/projects/useProjectFile';
import { showQuickStart } from '@/ui/onboarding/quickStartState';
import { readInputCaps } from '@/ui/shell/platform';
import { TRANSITION_KINDS, usesDirection } from '@/core/render/transitions';
import * as actions from '@/document/actions';
import { TRANSITION_LABELS } from '@/ui/timeline/transitionLabels';
import { Icon } from './Icon';

/**
 * Every phone panel, one at a time, each a bottom sheet (D-109). The panels
 * are the same components as the desktop inspector's — only the box they sit
 * in is the phone's.
 */
export function PhonePanels({
  clock,
  scenePicker: drawsScenePicker = true,
}: {
  clock: PreviewClock;
  /** False where the timeline is always on screen and draws its own (a computer). */
  scenePicker?: boolean;
}): React.JSX.Element | null {
  const panel = useOverlays((o) => o.phonePanel);
  const picking = useOverlays((o) => o.scenePicker);
  const openScenePicker = useOverlays((o) => o.openScenePicker);
  /*
   * The scene-design picker lives in the timeline on a computer, and a
   * phone's timeline is folded away — so it is drawn here unless the full
   * timeline is open and drawing its own.
   */
  const scenePicker = drawsScenePicker && picking !== null && panel !== 'timeline'
    ? <ScenePicker mode={picking} onClose={() => { openScenePicker(null); }} />
    : null;
  if (panel === null) return scenePicker;
  return <>{scenePicker}<Panel panel={panel} clock={clock} /></>;
}

function Panel({ panel, clock }: { panel: PhonePanel; clock: PreviewClock }): React.JSX.Element {
  const close = useOverlays((o) => o.openPhonePanel);
  const section = useOverlays((o) => o.phoneSection);
  const template = useEditor((s) => s.template);
  const mode = useEditor((s) => s.project.mode);
  const done = (): void => { close(null); };
  // Long panels show one section at a time on a phone (D-114).
  const tabs = (body: React.ReactNode): React.JSX.Element => <SectionTabs initial={section}>{body}</SectionTabs>;

  switch (panel) {
    case 'designs':
      return (
        <BottomSheet title={MODE_COPY[mode].choose} onClose={done} tall>
          <LibraryRail variant="sheet" onPicked={done} />
        </BottomSheet>
      );
    case 'photos':
      return <BottomSheet title="Photos" onClose={done} tall>{tabs(<PhotosTab template={template} />)}</BottomSheet>;
    case 'text':
      return <BottomSheet title="Text" onClose={done} tall>{tabs(<TextTab template={template} />)}</BottomSheet>;
    case 'effects':
    case 'motion':
      return <BottomSheet title="Effects" onClose={done} tall>{tabs(<MotionTab template={template} />)}</BottomSheet>;
    case 'style':
      return <BottomSheet title="Style" onClose={done} tall>{tabs(<LookTab template={template} />)}</BottomSheet>;
    case 'element':
      return <ElementPanel onClose={done} section={section} />;
    case 'add':
      return <AddPanel onClose={done} />;
    case 'aspect':
      return <AspectPanel onClose={done} />;
    case 'project':
      return <ProjectPanel onClose={done} />;
    case 'scene':
      return <SceneTimingPanel onClose={done} />;
    case 'timeline':
      return (
        <BottomSheet title="Timeline" onClose={done} tall>
          <div className="-mx-3"><Timeline clock={clock} embedded /></div>
        </BottomSheet>
      );
  }
}

/** The settings of whatever is selected. */
function ElementPanel({ onClose, section }: { onClose: () => void; section: string | null }): React.JSX.Element {
  const template = useEditor((s) => s.template);
  const overlay = useEditor((s) => s.selectedOverlay);
  const audio = useEditor((s) => s.selectedAudio);
  const effect = useEditor((s) => s.selectedEffect);
  const slot = useEditor((s) => s.selectedSlot);
  const body = overlay !== null ? <OverlayPanel />
    : audio !== null ? <AudioPanel />
    : effect !== null ? <TimelineEffectPanel />
    : slot?.startsWith('photo:') === true ? <PhotosTab template={template} />
    : <TextTab template={template} />;
  return <BottomSheet title="Settings" onClose={onClose} tall><SectionTabs initial={section}>{body}</SectionTabs></BottomSheet>;
}

const SHAPES: Readonly<Record<Aspect, string>> = {
  '9:16': 'Story · reels, TikTok',
  '4:5': 'Portrait · Instagram feed',
  '1:1': 'Square · posts',
  '4:3': 'Classic',
  '16:9': 'Wide · YouTube, web',
};

/** The frame shape, chosen from one button rather than five in a row. */
function AspectPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const aspect = useEditor((s) => s.project.aspect);
  const setAspect = useEditor((s) => s.setAspect);
  return (
    <BottomSheet title="Frame shape" onClose={onClose}>
      <div className="grid gap-1.5">
        {[...ASPECTS].reverse().map((value) => {
          const [w, h] = value.split(':').map(Number) as [number, number];
          const on = value === aspect;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => { setAspect(value); onClose(); }}
              className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left"
              style={{ borderColor: on ? 'var(--c-accent)' : 'var(--c-edge)', background: on ? 'var(--c-accent-soft)' : 'transparent' }}
            >
              <span className="grid w-9 place-items-center">
                <span aria-hidden className="block rounded-[3px] border-2" style={{
                  width: w >= h ? 30 : (30 * w) / h,
                  height: h >= w ? 30 : (30 * h) / w,
                  borderColor: on ? 'var(--c-accent)' : 'var(--c-ink-faint)',
                }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold tabular">{value}</span>
                <span className="block text-[12px] text-ink-muted">{SHAPES[value]}</span>
              </span>
              {on && <Icon name="check" size={18} />}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}

/**
 * Adding, on a phone: the add bar's own items as a grid (D-153), so the phone
 * and the computer never disagree about what can be added. A video's starts
 * with + Scene; photos are the Photos tool's (D-162).
 */
function AddPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <BottomSheet title="Add" onClose={onClose}>
      <AddBar variant="grid" onDone={onClose} />
    </BottomSheet>
  );
}

/** Everything about the project, and everything that used to crowd the top bar. */
function ProjectPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const name = useEditor((s) => s.project.name);
  const mode = useEditor((s) => s.project.mode);
  const theme = useEditor((s) => s.theme);
  const setTheme = useEditor((s) => s.setTheme);
  const setProjectsOpen = useEditor((s) => s.setProjectsOpen);
  const { rename, saveAs, makeCopy, startNew } = useProjectActions();
  const file = useProjectFile();
  const [draft, setDraft] = useState(name);

  const row = (label: string, run: () => void, hint?: string): React.JSX.Element => (
    <button type="button" onClick={run} className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left text-[14px] active:bg-panel-alt">
      <span>{label}</span>
      {hint !== undefined && <span className="text-[12px] text-ink-faint">{hint}</span>}
    </button>
  );

  return (
    <BottomSheet title="Menu" onClose={onClose} tall>
      <label className="block text-[12px] text-ink-muted" htmlFor="phone-project-name">Name</label>
      <input
        id="phone-project-name"
        value={draft}
        maxLength={MAX_NAME}
        onChange={(event) => { setDraft(event.target.value); }}
        onBlur={() => { void rename(draft); }}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        className="mt-1 w-full rounded-lg border border-edge bg-panel-alt px-3 py-2 text-[15px] focus:border-accent focus:outline-none"
      />

      <div className="mt-4 text-[12px] text-ink-muted">Mode</div>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        {(['showcase', 'motionAd'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => { switchMode(m); onClose(); }}
            className="rounded-lg border px-2 py-2.5 text-[14px]"
            style={{
              borderColor: mode === m ? 'var(--c-accent)' : 'var(--c-edge)',
              background: mode === m ? 'var(--c-accent-soft)' : 'transparent',
              color: mode === m ? 'var(--c-accent)' : 'var(--c-ink)',
              fontWeight: mode === m ? 600 : 400,
            }}
          >
            {MODE_COPY[m].label}
            <span className="block text-[11px] font-normal text-ink-muted">{MODE_COPY[m].subtitle}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 divide-y divide-[var(--c-edge)] border-y border-edge">
        {row(MODE_COPY.showcase.newProject, () => { void startNew('template'); onClose(); }, MODE_COPY.showcase.newHint)}
        {row(MODE_COPY.motionAd.newProject, () => { void startNew('blank'); onClose(); }, MODE_COPY.motionAd.newHint)}
        {row('Open…', () => { onClose(); setProjectsOpen(true); }, 'Your projects')}
        {row('Save project file', () => { file.save(); }, '.qmotion')}
        {row('Open project file…', () => { file.open(); })}
        {row('Save as a copy and keep working on it', () => { void saveAs(`${name} copy`); onClose(); })}
        {row('Make a copy', () => { void makeCopy(); onClose(); })}
        {row('Show the quick start', () => { showQuickStart(); onClose(); })}
        {/* Help in the device's own terms (D-161): its gestures, or its keys once a keyboard is attached. */}
        {row(readInputCaps().keyboard ? 'Keyboard shortcuts' : 'Touch gestures', () => { onClose(); useOverlays.getState().setShortcutsOpen(true); })}
        {row(theme === 'dark' ? 'Light theme' : 'Dark theme', () => { setTheme(theme === 'dark' ? 'light' : 'dark'); })}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-[13px]">
          Plan
          <span className="block text-[11px] text-ink-faint">Test switch — try Free and Pro.</span>
        </div>
        <TierSwitch size="large" />
      </div>
      {file.input}
      <p className="mt-3 text-[12px] text-ink-faint">Your photos stay on your device. Nothing is uploaded. Save a project file to keep a copy anywhere.</p>
    </BottomSheet>
  );
}

/**
 * A scene's length and how it arrives (D-133): the phone's Timing tool, and
 * on a computer "Length and transition…" in the scene's menu, as a small
 * window (D-162) — the timeline's scene bar that held these is gone.
 */
function SceneTimingPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const index = useEditor((s) => s.selectedScene);
  const scene = useEditor((s) => s.project.scenes[s.selectedScene]);
  const template = useEditor((s) => s.template);
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  if (!scene) return <BottomSheet title="Scene" onClose={onClose}><p className="text-[13px] text-ink-muted">No scene selected.</p></BottomSheet>;
  const bounds = { min: template?.minDurationMs ?? 1_000, max: template?.maxDurationMs ?? 60_000 };
  const transition = scene.transitionIn;
  const chip = (on: boolean): React.CSSProperties => ({
    borderColor: on ? 'var(--c-accent)' : 'var(--c-edge)',
    background: on ? 'var(--c-accent-soft)' : 'transparent',
    color: on ? 'var(--c-accent)' : 'var(--c-ink)',
    fontWeight: on ? 600 : 400,
  });

  return (
    <BottomSheet title={`Scene ${index + 1}`} onClose={onClose}>
      <label className="block text-[13px]" htmlFor="phone-scene-length">
        Length <span className="tabular text-ink-muted">· {(scene.durationMs / 1000).toFixed(1)}s</span>
      </label>
      <input
        id="phone-scene-length"
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={100}
        value={scene.durationMs}
        aria-label="Scene length"
        onChange={(e) => { dispatch(actions.setSceneDurationAt(index, Number(e.target.value), bounds)); }}
        onPointerUp={endInteraction}
        className="mt-1 h-7 w-full accent-[var(--c-accent)]"
      />

      {index === 0 ? (
        <p className="mt-4 text-[12px] text-ink-muted">The first scene is where the video starts, so it has no way in.</p>
      ) : (
        <>
          <div className="mt-4 text-[13px]">How it arrives</div>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {TRANSITION_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={(transition?.kind ?? 'crossFade') === kind}
                onClick={() => { dispatch(actions.setSceneTransition(index, { kind })); endInteraction(); }}
                className="rounded-lg border px-2 py-2 text-[13px]"
                style={chip((transition?.kind ?? 'crossFade') === kind)}
              >
                {TRANSITION_LABELS[kind]}
              </button>
            ))}
          </div>
          {transition !== null && transition.kind !== 'cut' && (
            <>
              <label className="mt-4 block text-[13px]" htmlFor="phone-transition-length">
                Over <span className="tabular text-ink-muted">· {(transition.durationMs / 1000).toFixed(2)}s</span>
              </label>
              <input
                id="phone-transition-length"
                type="range"
                min={100}
                max={1_500}
                step={50}
                value={transition.durationMs}
                aria-label="Transition length"
                onChange={(e) => { dispatch(actions.setSceneTransition(index, { durationMs: Number(e.target.value) })); }}
                onPointerUp={endInteraction}
                className="mt-1 h-7 w-full accent-[var(--c-accent)]"
              />
            </>
          )}
          {transition !== null && usesDirection(transition.kind) && (
            <>
              <div className="mt-4 text-[13px]">From</div>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {(['left', 'right', 'up', 'down'] as const).map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    aria-pressed={(transition.direction ?? 'left') === direction}
                    onClick={() => { dispatch(actions.setSceneTransition(index, { direction })); endInteraction(); }}
                    className="rounded-lg border px-2 py-2 text-[13px] capitalize"
                    style={chip((transition.direction ?? 'left') === direction)}
                  >
                    {direction}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </BottomSheet>
  );
}
