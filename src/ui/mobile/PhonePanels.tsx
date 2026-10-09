import { useState } from 'react';
import { ASPECTS, type Aspect } from '@/core/types';
import type { PreviewClock } from '@/core/time/clock';
import { useEditor } from '@/state/store';
import { MODE_LABEL } from '@/ui/shell/modeLabels';
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
import { useAddLayers } from '@/ui/timeline/useAddLayers';
import { MAX_NAME, useProjectActions } from '@/ui/projects/useProjectActions';
import { SectionTabs } from '@/ui/inspector/controls';
import { BottomSheet } from './BottomSheet';
import { Icon, type IconName } from './Icon';

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
  const done = (): void => { close(null); };
  // Long panels show one section at a time on a phone (D-114).
  const tabs = (body: React.ReactNode): React.JSX.Element => <SectionTabs initial={section}>{body}</SectionTabs>;

  switch (panel) {
    case 'designs':
      return (
        <BottomSheet title="Choose a design" onClose={done} tall>
          <LibraryRail variant="sheet" onPicked={done} />
        </BottomSheet>
      );
    case 'photos':
      return <BottomSheet title="Photos" onClose={done} tall>{tabs(<PhotosTab template={template} />)}</BottomSheet>;
    case 'text':
      return <BottomSheet title="Text" onClose={done} tall>{tabs(<TextTab template={template} />)}</BottomSheet>;
    case 'effects':
    case 'motion':
      return <BottomSheet title="Motion and effects" onClose={done} tall>{tabs(<MotionTab template={template} />)}</BottomSheet>;
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

/** Adding to an ad: a scene, a layer, music, an effect at the playhead. */
function AddPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const layers = useAddLayers();
  const o = useOverlays.getState();
  const item = (icon: IconName, label: string, hint: string, run: () => void): React.JSX.Element => (
    <button
      type="button"
      onClick={run}
      className="flex items-center gap-3 rounded-xl border border-edge px-3 py-3 text-left active:bg-panel-alt"
    >
      <span className="grid size-10 place-items-center rounded-lg" style={{ background: 'var(--c-accent-soft)', color: 'var(--c-accent)' }}>
        <Icon name={icon} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{label}</span>
        <span className="block text-[12px] text-ink-muted">{hint}</span>
      </span>
    </button>
  );
  return (
    <BottomSheet title="Add" onClose={onClose}>
      <div className="grid gap-2">
        {item('scene', 'Scene', 'A new beat after this one, in any design', () => { onClose(); o.openScenePicker('add'); })}
        {item('text', 'Text', 'A caption at the playhead', () => { layers.addText(); onClose(); })}
        {item('photo', 'Photo', 'A picture on top of the scene', () => { layers.addPhoto(); onClose(); })}
        {item('effects', 'Effect', 'Snow, light, a shake — at the playhead', () => { onClose(); o.openPicker({ target: { kind: 'timeline' } }); })}
        {item('music', 'Music', layers.musicBusy ? 'Reading…' : 'A track from your phone', () => { layers.pickMusic(); })}
        {layers.canVideo && item('video', 'Video', layers.videoBusy ? 'Reading…' : 'A clip from your phone', () => { layers.pickVideo(); })}
      </div>
      {layers.error !== null && <p className="mt-2 text-[12px]" style={{ color: 'var(--c-danger)' }}>{layers.error}</p>}
      {layers.inputs}
    </BottomSheet>
  );
}

/** Everything about the project, and everything that used to crowd the top bar. */
function ProjectPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const name = useEditor((s) => s.project.name);
  const mode = useEditor((s) => s.project.mode);
  const setMode = useEditor((s) => s.setMode);
  const theme = useEditor((s) => s.theme);
  const setTheme = useEditor((s) => s.setTheme);
  const setProjectsOpen = useEditor((s) => s.setProjectsOpen);
  const { rename, saveAs, makeCopy, startNew } = useProjectActions();
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

      <div className="mt-4 text-[12px] text-ink-muted">Kind of video</div>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        {(['showcase', 'motionAd'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => { if (mode !== m) setMode(m); onClose(); }}
            className="rounded-lg border px-2 py-2.5 text-[14px]"
            style={{
              borderColor: mode === m ? 'var(--c-accent)' : 'var(--c-edge)',
              background: mode === m ? 'var(--c-accent-soft)' : 'transparent',
              color: mode === m ? 'var(--c-accent)' : 'var(--c-ink)',
              fontWeight: mode === m ? 600 : 400,
            }}
          >
            {MODE_LABEL[m]}
            <span className="block text-[11px] font-normal text-ink-muted">{m === 'showcase' ? 'One looping scene' : 'Scenes, layers, music'}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 divide-y divide-[var(--c-edge)] border-y border-edge">
        {row('Switch project', () => { onClose(); setProjectsOpen(true); })}
        {row('Save as a copy and keep working on it', () => { void saveAs(`${name} copy`); onClose(); })}
        {row('Make a copy', () => { void makeCopy(); onClose(); })}
        {row('New project', () => { void startNew('template'); onClose(); })}
        {row('New blank canvas', () => { void startNew('blank'); onClose(); })}
        {row(theme === 'dark' ? 'Light theme' : 'Dark theme', () => { setTheme(theme === 'dark' ? 'light' : 'dark'); })}
      </div>
      <p className="mt-3 text-[12px] text-ink-faint">Your photos stay on your device. Nothing is uploaded.</p>
    </BottomSheet>
  );
}
