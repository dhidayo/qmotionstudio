import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { RenderRig } from '@/core/render/rig';
import type { PreviewClock } from '@/core/time/clock';
import type { Project } from '@/document/types';
import type { MediaStore } from '@/media/store';
import { sceneSpans, timelineSpanMs, totalDurationMs } from '@/document/select/timeline';
import { useEditor } from '@/state/store';
import { posterUrl } from '@/templates/manifest';
import { Artboard } from '@/ui/artboard/Artboard';
import { ScrubBar } from '@/ui/artboard/ScrubBar';
import { useOverlays } from '@/ui/shell/overlays';
import { useClockFrames } from '@/ui/hooks/useClockFrames';
import { StartActions } from '@/ui/editing/StartActions';
import { Icon } from './Icon';
import { PhonePanels } from './PhonePanels';
import { PhoneToolbar } from './PhoneToolbar';
import { PhoneTopBar } from './PhoneTopBar';
import { continueAsVideo } from '@/ui/editing/commands';

/**
 * The editor on a phone (D-109): a layout of its own, not the desktop one
 * squeezed.
 *
 * Laid out the way phone video editors are — CapCut is the model the person
 * asked for: one-row top bar, the picture as large as the screen allows, a
 * transport line under it, the timeline (folded, for an ad), and a toolbar of
 * labelled icons along the bottom that turns into the selected thing's tools.
 * Every panel is a bottom sheet over the picture, never a column beside it.
 */
/** Safari's own pinch-to-zoom of the page, which `touch-action` does not stop on older iPhones (D-113). */
function useNoPageZoom(): void {
  useEffect(() => {
    const stop = (event: Event): void => { event.preventDefault(); };
    document.addEventListener('gesturestart', stop);
    return () => { document.removeEventListener('gesturestart', stop); };
  }, []);
}

export function PhoneLayout({
  project,
  clock,
  rig,
  media,
}: {
  project: Project;
  clock: PreviewClock;
  rig: RenderRig;
  media: MediaStore;
}): React.JSX.Element {
  useNoPageZoom();
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-layout="phone">
      <PhoneTopBar />
      <main className="relative min-h-0 flex-1" style={{ background: 'var(--c-stage)' }}>
        <Artboard project={project} clock={clock} rig={rig} media={media} padding={12} />
        {/* A test release is open to anyone with the link, so it says what it is — on one line. */}
        <p
          data-disclaimer
          className="pointer-events-none absolute inset-x-0 bottom-0.5 truncate px-3 text-center text-[9px] text-ink-faint"
        >
          In development — use at your own risk. Nothing is uploaded.
        </p>
      </main>
      <PhoneTransport clock={clock} />
      {project.mode === 'motionAd' ? <PhoneTimeline clock={clock} /> : <ScrubBar clock={clock} variant="phone" />}
      <StartActions variant="phone" onChooseDesign={() => { useOverlays.getState().openPhonePanel('designs'); }} />
      <PhoneToolbar />
      <PhonePanels clock={clock} />
      <SidewaysNote />
    </div>
  );
}

/**
 * Turned sideways, the picture gets the height of a strip: said once, kindly,
 * and dismissible — the editor still works that way (D-113).
 */
function SidewaysNote(): React.JSX.Element | null {
  const sideways = useSyncExternalStore(subscribeOrientation, readSideways, () => false);
  const [dismissed, setDismissed] = useState(false);
  if (!sideways || dismissed) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-6" style={{ background: 'rgb(0 0 0 / 0.55)' }} role="dialog" aria-label="Turn your phone upright">
      <div className="max-w-sm rounded-2xl bg-panel p-5 text-center" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div aria-hidden className="mx-auto mb-3 h-12 w-7 rounded-md border-2" style={{ borderColor: 'var(--c-accent)' }} />
        <p className="text-[15px] font-semibold">Turn your phone upright</p>
        <p className="mt-1 text-[13px] text-ink-muted">The editor is laid out for a phone held upright, so the picture has room.</p>
        <button type="button" onClick={() => { setDismissed(true); }} className="mt-4 rounded-lg border border-edge px-4 py-2 text-[13px] font-medium">
          Keep going sideways
        </button>
      </div>
    </div>
  );
}

const SIDEWAYS = '(orientation: landscape) and (max-height: 500px)';

function subscribeOrientation(onChange: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => undefined;
  const query = matchMedia(SIDEWAYS);
  query.addEventListener('change', onChange);
  return () => { query.removeEventListener('change', onChange); };
}

function readSideways(): boolean {
  return typeof matchMedia === 'function' && matchMedia(SIDEWAYS).matches;
}

/** Time, play and undo — the line under the picture. */
function PhoneTransport({ clock }: { clock: PreviewClock }): React.JSX.Element {
  const [playing, setPlaying] = useState(clock.playing);
  const shownPlaying = useRef(clock.playing);
  const now = useRef<HTMLSpanElement>(null);
  const durationMs = useEditor((s) => totalDurationMs(s.project));
  const corporate = useEditor((s) => s.project.mode === 'motionAd');
  // Subscribed so the arrows enable and disable as the history changes.
  useEditor((s) => s.history);
  const { undo, redo, canUndo, canRedo } = useEditor.getState();

  // The time is written straight to the page each frame (D-112); only the
  // play/pause icon is React state, and it changes when playback does.
  useClockFrames(clock, (timeMs, isPlaying) => {
    if (now.current) now.current.textContent = clockTime(Math.min(timeMs, durationMs));
    if (isPlaying !== shownPlaying.current) {
      shownPlaying.current = isPlaying;
      setPlaying(isPlaying);
    }
  });

  return (
    <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center border-t border-edge bg-panel px-3 py-1">
      <span className="tabular text-[12px] text-ink-muted" data-phone-time>
        <span ref={now} className="text-ink">{clockTime(0)}</span> / {clockTime(durationMs)}
      </span>
      <button
        type="button"
        onClick={() => { if (clock.playing) clock.pause(); else clock.play(); }}
        aria-label={playing ? 'Pause' : 'Play'}
        className="grid size-10 place-items-center rounded-full"
        style={{ background: 'var(--c-panel-alt)', color: 'var(--c-ink)' }}
      >
        <Icon name={playing ? 'pause' : 'play'} size={20} />
      </button>
      <span className="flex items-center justify-end gap-1">
        {/* A longer video from this design (D-129), where the play controls are. */}
        {!corporate && (
          <button type="button" data-continue-video onClick={continueAsVideo} className="mr-1 rounded-full bg-accent px-2.5 py-1.5 text-[12px] font-semibold text-accent-ink">
            + Scene
          </button>
        )}
        <button type="button" onClick={undo} disabled={!canUndo()} aria-label="Undo" className="grid size-9 place-items-center rounded-full disabled:opacity-35">
          <Icon name="undo" size={20} />
        </button>
        <button type="button" onClick={redo} disabled={!canRedo()} aria-label="Redo" className="grid size-9 place-items-center rounded-full disabled:opacity-35">
          <Icon name="redo" size={20} />
        </button>
      </span>
    </div>
  );
}

function clockTime(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  const tenths = Math.floor((total * 10) % 10);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
}

const TIP_KEY = 'ms.phoneTimelineTip';

/**
 * Corporate Ads' timeline, folded (point 8). A phone is too narrow for five
 * lanes and a picture, so this is the summary — the scenes to scale, where the
 * playhead is, how many layers and effects there are — and one tap opens the
 * whole timeline over the picture when there is real timing work to do.
 */
function PhoneTimeline({ clock }: { clock: PreviewClock }): React.JSX.Element {
  const project = useEditor((s) => s.project);
  const selectedScene = useEditor((s) => s.selectedScene);
  const sceneClip = useEditor((s) => s.sceneClipSelected);
  const selectSceneClip = useEditor((s) => s.selectSceneClip);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const open = useOverlays((o) => o.openPhonePanel);
  const durationMs = Math.max(1, timelineSpanMs(project));
  const spans = useMemo(() => sceneSpans(project.scenes), [project.scenes]);
  const [tip, setTip] = useState(() => !readTipSeen());
  const lane = useRef<HTMLDivElement>(null);
  const playhead = useRef<HTMLSpanElement>(null);

  // Moved with the picture, frame by frame, without re-rendering the strip (D-112).
  useClockFrames(clock, (timeMs) => {
    if (playhead.current) playhead.current.style.left = `${(Math.min(timeMs, durationMs) / durationMs) * 100}%`;
  });

  const seekTo = (clientX: number): void => {
    const box = lane.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return;
    const at = Math.max(0, Math.min(durationMs, ((clientX - box.left) / box.width) * durationMs));
    clock.pause();
    clock.seek(at);
    setPlayhead(at);
  };

  const fxCount = project.scenes.reduce((n, s) => n + (s.inputs.effects?.length ?? 0), 0) + (project.effects?.length ?? 0);

  return (
    <div className="shrink-0 border-t border-edge bg-panel px-3 pb-1.5 pt-2" aria-label="Timeline summary" data-phone-timeline>
      <div
        ref={lane}
        className="relative h-11 touch-none select-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seekTo(event.clientX);
        }}
        onPointerMove={(event) => { if (event.buttons !== 0) seekTo(event.clientX); }}
      >
        {spans.map((span) => {
          const on = span.index === selectedScene;
          return (
            <button
              key={span.scene.id}
              type="button"
              aria-label={`Scene ${span.index + 1}`}
              aria-pressed={on && sceneClip}
              data-phone-scene={span.index}
              onPointerDown={(event) => { event.stopPropagation(); }}
              onClick={() => {
                clock.pause();
                clock.seek(span.startMs);
                setPlayhead(span.startMs);
                selectSceneClip(span.index);
              }}
              className="absolute inset-y-0 overflow-hidden rounded-md border-2 text-left text-[11px] font-semibold"
              style={{
                left: `calc(${(span.startMs / durationMs) * 100}% + 1px)`,
                width: `calc(${((span.endMs - span.startMs) / durationMs) * 100}% - 2px)`,
                borderColor: on && sceneClip ? 'var(--c-accent)' : on ? 'var(--c-edge-strong)' : 'transparent',
                // Each scene's own design, so the strip reads as the ad at a glance.
                backgroundColor: 'var(--c-edge)',
                backgroundImage: `url("${posterUrl(span.scene.templateId)}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <span
                className="m-0.5 inline-block rounded px-1 text-[10px] leading-4"
                style={{ background: 'rgb(0 0 0 / 0.55)', color: '#fff' }}
              >
                {span.index + 1}
              </span>
            </button>
          );
        })}
        <span
          ref={playhead}
          aria-hidden
          data-phone-playhead
          className="pointer-events-none absolute -inset-y-1 left-0 w-0.5 rounded-full"
          style={{ background: 'var(--c-ink)' }}
        />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span className="rounded-md bg-panel-alt px-1.5 py-0.5">Layers · {project.overlays.length}</span>
        <span className="rounded-md bg-panel-alt px-1.5 py-0.5">Effects · {fxCount}</span>
        {project.audio.length > 0 && <span className="rounded-md bg-panel-alt px-1.5 py-0.5">Music</span>}
        <button
          type="button"
          onClick={() => { open('timeline'); }}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-accent"
          aria-label="Open the full timeline"
        >
          <Icon name="up" size={14} /> Timeline
        </button>
      </div>
      {tip && (
        <div className="mt-1.5 flex items-start gap-2 rounded-lg px-2 py-1.5 text-[11px]" style={{ background: 'var(--c-accent-soft)' }} role="note">
          <span className="min-w-0 flex-1">
            Detailed timing work is easier on a larger screen. Everything still works here — tap Timeline to open it.
          </span>
          <button type="button" onClick={() => { setTip(false); rememberTipSeen(); }} className="font-semibold text-accent">
            Got it
          </button>
        </div>
      )}
    </div>
  );
}

function readTipSeen(): boolean {
  try { return localStorage.getItem(TIP_KEY) === '1'; } catch { return false; }
}

function rememberTipSeen(): void {
  try { localStorage.setItem(TIP_KEY, '1'); } catch {
    // A remembered tip is a convenience; seeing it twice changes nothing.
  }
}
