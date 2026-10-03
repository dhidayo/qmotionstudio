import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RenderRig } from '@/core/render/rig';
import type { PreviewClock } from '@/core/time/clock';
import type { Project } from '@/document/types';
import type { MediaStore } from '@/media/store';
import * as actions from '@/document/actions';
import { sceneSpans, timelineSpanMs, totalDurationMs } from '@/document/select/timeline';
import { useEditor } from '@/state/store';
import { posterUrl } from '@/templates/manifest';
import { Artboard } from '@/ui/artboard/Artboard';
import { ScrubBar } from '@/ui/artboard/ScrubBar';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { ACCEPT_ATTRIBUTE, useUpload } from '@/ui/media/useUpload';
import { useOverlays } from '@/ui/shell/overlays';
import { Icon } from './Icon';
import { PhonePanels } from './PhonePanels';
import { PhoneToolbar } from './PhoneToolbar';
import { PhoneTopBar } from './PhoneTopBar';

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
      <StartActions />
      <PhoneToolbar />
      <PhonePanels clock={clock} />
    </div>
  );
}

const READOUT_HZ = 12;

/** Time, play and undo — the line under the picture. */
function PhoneTransport({ clock }: { clock: PreviewClock }): React.JSX.Element {
  const [timeMs, setTimeMs] = useState(clock.timeMs);
  const [playing, setPlaying] = useState(clock.playing);
  const durationMs = useEditor((s) => totalDurationMs(s.project));
  // Subscribed so the arrows enable and disable as the history changes.
  useEditor((s) => s.history);
  const { undo, redo, canUndo, canRedo } = useEditor.getState();

  useEffect(() => {
    const handle = setInterval(() => {
      setTimeMs(clock.timeMs);
      setPlaying(clock.playing);
    }, 1000 / READOUT_HZ);
    return () => { clearInterval(handle); };
  }, [clock]);

  return (
    <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center border-t border-edge bg-panel px-3 py-1">
      <span className="tabular text-[12px] text-ink-muted" data-phone-time>
        <span className="text-ink">{clockTime(Math.min(timeMs, durationMs))}</span> / {clockTime(durationMs)}
      </span>
      <button
        type="button"
        onClick={() => { if (clock.playing) clock.pause(); else clock.play(); setPlaying(clock.playing); }}
        aria-label={playing ? 'Pause' : 'Play'}
        className="grid size-10 place-items-center rounded-full"
        style={{ background: 'var(--c-panel-alt)', color: 'var(--c-ink)' }}
      >
        <Icon name={playing ? 'pause' : 'play'} size={20} />
      </button>
      <span className="flex justify-end gap-1">
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

/**
 * "Choose a design" and "Add your photos" — the two things a new project is
 * waiting for, said as what they do (point 3 of the review). Shown while the
 * picture is still the sample photographs; once it is yours, the room goes
 * back to the picture.
 */
function StartActions(): React.JSX.Element | null {
  const media = useMediaStore();
  const photos = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.photos);
  const selecting = useEditor((s) =>
    s.selectedOverlay !== null || s.selectedSlot !== null || s.selectedLogo || s.selectedEffect !== null || s.selectedAudio !== null,
  );
  const dispatch = useEditor((s) => s.dispatch);
  const showToast = useEditor((s) => s.showToast);
  const open = useOverlays((o) => o.openPhonePanel);
  const input = useRef<HTMLInputElement>(null);

  // A new photo takes a sample's place, in order, so the design keeps its framing.
  const onAdded = useCallback((ids: string[]) => {
    const current = useEditor.getState().project.scenes[useEditor.getState().selectedScene]?.inputs.photos ?? [];
    const extra: string[] = [];
    let slot = 0;
    for (const id of ids) {
      while (slot < current.length && current[slot]?.mediaId.startsWith('sample:') !== true) slot++;
      if (slot < current.length) { dispatch(actions.replacePhoto(slot, id)); slot++; }
      else extra.push(id);
    }
    if (extra.length > 0) dispatch(actions.addPhotos(extra));
    showToast(ids.length === 1 ? 'Photo added.' : `${ids.length} photos added.`);
  }, [dispatch, showToast]);
  const { state: upload, addFiles } = useUpload(media, onAdded, { artboardLongestEdge: 1920 });

  const samplesOnly = photos === undefined || photos.every((p) => p.mediaId.startsWith('sample:'));
  if (!samplesOnly || selecting) return null;

  return (
    <div className="flex shrink-0 gap-2 border-t border-edge bg-panel px-3 py-2" data-start-actions>
      <button
        type="button"
        onClick={() => { open('designs'); }}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-edge py-2.5 text-[14px] font-semibold"
      >
        <Icon name="designs" size={18} /> Choose a design
      </button>
      <button
        type="button"
        onClick={() => { input.current?.click(); }}
        disabled={upload.busy}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-[14px] font-semibold text-accent-ink"
      >
        <Icon name="photo" size={18} /> {upload.busy ? 'Reading…' : 'Add your photos'}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        hidden
        aria-label="Add your photos"
        onChange={(e) => {
          void addFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      {upload.error !== null && <span className="sr-only" role="alert">{upload.error}</span>}
    </div>
  );
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
  const [timeMs, setTimeMs] = useState(clock.timeMs);
  const [tip, setTip] = useState(() => !readTipSeen());
  const lane = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = setInterval(() => { setTimeMs(clock.timeMs); }, 1000 / READOUT_HZ);
    return () => { clearInterval(handle); };
  }, [clock]);

  const seekTo = (clientX: number): void => {
    const box = lane.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return;
    const at = Math.max(0, Math.min(durationMs, ((clientX - box.left) / box.width) * durationMs));
    clock.pause();
    clock.seek(at);
    setTimeMs(at);
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
                setTimeMs(span.startMs);
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
          aria-hidden
          className="pointer-events-none absolute -inset-y-1 w-0.5 rounded-full"
          style={{ left: `${(Math.min(timeMs, durationMs) / durationMs) * 100}%`, background: 'var(--c-ink)' }}
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
