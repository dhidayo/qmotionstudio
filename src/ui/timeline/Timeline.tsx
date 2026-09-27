import { useCallback, useEffect, useRef, useState } from 'react';
import type { PreviewClock } from '@/core/time/clock';
import type { Overlay } from '@/document/types';
import {
  sceneSpans, timelineSpanMs, totalDurationMs, type SceneSpan,
} from '@/document/select/timeline';
import { DEFAULT_OVERLAY_MS, DEFAULT_OVERLAY_TEXT_STYLE, STARTER_PHOTO_IDS } from '@/document/defaults';
import * as actions from '@/document/actions';
import { isAnimated, posesOf } from '@/document/select/overlay';
import { hasNudgePoses, nudgePoses } from '@/core/render/slots';
import { spanOf } from '@/document/select/motion';
import { MotionBar } from './MotionBar';
import { useEditor } from '@/state/store';
import { setTier, useEntitlements } from '@/entitlements';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { useUpload, AUDIO_ACCEPT_ATTRIBUTE, VIDEO_ACCEPT_ATTRIBUTE } from '@/ui/media/useUpload';
import { capturePointer } from './pointerCapture';
import { SceneTools } from './SceneTools';
import { MusicTrack } from './MusicTrack';
import {
  dragResult, formatSeconds, msToPct, pxToMs, rowCount, snap, tickIntervalMs,
  type ClipDrag,
} from './timelineGeometry';

/**
 * The Motion Ads timeline (§1.2).
 *
 * "A track timeline showing overlay layers (L1, L2, …) plus a dedicated music
 * track." Showcase keeps its slider (§1.1) — the two modes genuinely want
 * different instruments, and giving Showcase a track editor for its single
 * scene would be clutter dressed as capability.
 *
 * Time is read from the clock on an interval rather than per frame, for the
 * same reason the scrub bar does it: the artboard is a canvas, and re-rendering
 * React sixty times a second to move a one-pixel playhead costs more than the
 * frame it is reporting on.
 */
const READOUT_HZ = 20;
const SNAP_MS = 100;
/** Pointer slop below which a press counts as a click rather than a drag. */
const CLICK_SLOP_PX = 3;
const MIN_OVERLAY_MS = 300;

export function Timeline({ clock }: { clock: PreviewClock }): React.JSX.Element {
  const project = useEditor((s) => s.project);
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const selectedScene = useEditor((s) => s.selectedScene);
  const selectScene = useEditor((s) => s.selectScene);
  const selectedOverlay = useEditor((s) => s.selectedOverlay);
  const selectOverlay = useEditor((s) => s.selectOverlay);

  /*
   * Two different lengths, and conflating them was the bug that made a long
   * music track unmanageable (see timelineSpanMs).
   *
   *   videoMs  what renders and exports — the scenes, minus D-004's overlaps.
   *   durationMs  what the lane has to *show*, which includes audio running
   *               past the end of the video.
   */
  const videoMs = totalDurationMs(project);
  const durationMs = timelineSpanMs(project);
  const overhang = durationMs > videoMs + 1;
  const spans = sceneSpans(project.scenes);

  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(clock.playing);

  /*
   * The clock is a plain mutable object so the artboard can redraw without
   * re-rendering React sixty times a second (see PreviewClock). Chrome that
   * needs to *display* the time samples it slowly instead — and publishes it,
   * so panels outside the timeline can act on the playhead without each one
   * starting a poll of its own.
   */
  const setPlayhead = useEditor((s) => s.setPlayhead);
  useEffect(() => {
    const handle = setInterval(() => {
      setTimeMs(clock.timeMs);
      setPlaying(clock.playing);
      // The shell publishes the playhead for the whole application; this
      // interval is only the readout's own.
    }, 1000 / READOUT_HZ);
    return () => { clearInterval(handle); };
  }, [clock]);

  const laneRef = useRef<HTMLDivElement>(null);
  /**
      * A press on a clip is a drag *or* a click, and which one it was is only
      * known when it ends. So the press records where it started and whether
      * the clip was already selected, and the release decides (D-087).
      */
  const dragRef = useRef<(ClipDrag & { downX: number; moved: boolean; wasSelected: boolean }) | null>(null);

  /**
   * The lane's pixel width, measured rather than read from the ref during
   * render: the ruler's tick spacing depends on it, and a value read mid-render
   * is a frame stale on every resize.
   */
  const [laneWidth, setLaneWidth] = useState(800);
  useEffect(() => {
    const lane = laneRef.current;
    if (!lane) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setLaneWidth(Math.max(1, entry.contentRect.width));
    });
    observer.observe(lane);
    return () => { observer.disconnect(); };
  }, []);

  const laneMs = useCallback((clientX: number): number => {
    const lane = laneRef.current;
    if (!lane) return 0;
    const box = lane.getBoundingClientRect();
    return pxToMs(clientX - box.left, box.width, durationMs);
  }, [durationMs]);

  // ── Scrubbing ─────────────────────────────────────────────────────────────

  const scrubTo = useCallback((clientX: number): void => {
    clock.seek(laneMs(clientX));
    setTimeMs(clock.timeMs);
    /*
     * Published straight away, not left to the 20Hz sampler.
     *
     * A scrub is a deliberate move to an exact moment, and everything that
     * acts on the playhead — where a keyframe gets written, whether a music
     * clip can be split — would otherwise be working from where the playhead
     * was up to fifty milliseconds ago. For keyframes that is inside the
     * tolerance that decides whether two of them are the same one, so a drag
     * immediately after a scrub could land on the wrong keyframe entirely.
     */
    setPlayhead(clock.timeMs);
  }, [clock, laneMs, setPlayhead]);

  /**
   * Scrubbing from the lane background.
   *
   * Separate from the ruler's handlers only because the ruler captures the
   * pointer for a continuous drag; here a press is a jump and a drag scrubs,
   * which is what a click on a track is for.
   */
  const seekTo = useCallback((projectMs: number): void => {
    clock.pause();
    clock.seek(projectMs);
    setTimeMs(clock.timeMs);
    setPlayhead(clock.timeMs);
  }, [clock, setPlayhead]);

  const onLaneDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    // Only the background. A press that started on a clip has already been
    // stopped, and one on a control inside a lane is not a scrub either.
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).dataset['lane']) {
      return;
    }
    capturePointer(event.currentTarget, event.pointerId);
    scrubTo(event.clientX);
  };

  const onLaneMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.buttons === 0) return;
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).dataset['lane']) {
      return;
    }
    scrubTo(event.clientX);
  };

  const onRulerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    capturePointer(event.currentTarget, event.pointerId);
    scrubTo(event.clientX);
  };

  const onRulerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.buttons === 0) return;
    scrubTo(event.clientX);
  };

  // ── Overlay clip dragging ────────────────────────────────────────────────

  const beginClipDrag = (
    event: React.PointerEvent<HTMLElement>,
    overlay: Overlay,
    mode: ClipDrag['mode'],
  ): void => {
    event.stopPropagation();
    capturePointer(event.currentTarget, event.pointerId);
    const wasSelected = selectedOverlay === overlay.id;
    selectOverlay(overlay.id);
    dragRef.current = {
      mode,
      id: overlay.id,
      startMs: overlay.startMs,
      endMs: overlay.endMs,
      pointerMs: laneMs(event.clientX),
      downX: event.clientX,
      moved: false,
      wasSelected,
    };
  };

  const onClipMove = (event: React.PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (!drag || event.buttons === 0) return;
    // A few pixels of jitter between press and release is a click, not a drag.
    if (Math.abs(event.clientX - drag.downX) > CLICK_SLOP_PX) drag.moved = true;

    const next = dragResult(drag, laneMs(event.clientX), { durationMs, minLengthMs: MIN_OVERLAY_MS });
    // ⌥ suspends snapping, which is the convention everywhere else and the only
    // way to place a clip on an exact frame.
    const free = event.altKey;
    dispatch(actions.setOverlayTime(
      drag.id,
      snap(next.startMs, SNAP_MS, free),
      snap(next.endMs, SNAP_MS, free),
    ));
  };

  const endClipDrag = (): void => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;

    /*
     * Clicking a clip that was already selected moves the playhead there.
     *
     * The first click is for choosing the thing; a second says "and take me to
     * this moment in it". Reported as the missing half of selection: "when I
     * click an element on the timeline, the playhead does not move to that
     * click location… I keep looking for ways to bring the playhead to current
     * location" (D-087).
     */
    if (drag.mode === 'move' && !drag.moved && drag.wasSelected) {
      seekTo(laneMs(drag.downX));
      return;
    }
    // One undo step for the whole drag, not one per pointermove.
    endInteraction();
  };

  // ── Adding overlays (§1.2) ───────────────────────────────────────────────

  const media = useMediaStore();
  const { tier, limits } = useEntitlements('motionAd');
  const [proNote, setProNote] = useState(false);

  const placeOverlay = useCallback(
    (content: Overlay['content']): void => {
      const startMs = Math.min(Math.round(timeMs), Math.max(0, durationMs - DEFAULT_OVERLAY_MS));
      const endMs = Math.min(startMs + DEFAULT_OVERLAY_MS, durationMs);
      const track = rowCount(project.overlays) - 1;

      const overlay = actions.makeOverlay(content, { startMs, endMs, track });
      dispatch(actions.addOverlay(overlay));
      selectOverlay(overlay.id);
    },
    [timeMs, durationMs, project.overlays, dispatch, selectOverlay],
  );

  const addOverlay = (kind: 'photo' | 'text'): void => {
    if (kind === 'text') {
      placeOverlay({ kind: 'text', text: 'New caption', style: DEFAULT_OVERLAY_TEXT_STYLE });
      return;
    }

    // A photo overlay needs something to show. Whatever the user has uploaded
    // comes first; the sample set is the fallback so the button is never a
    // no-op on a fresh project.
    const firstMedia = media.ids('image')[0] ?? STARTER_PHOTO_IDS[0] ?? '';
    placeOverlay({ kind: 'photo', mediaId: firstMedia });
  };

  /**
   * Custom media picks its file first (§9).
   *
   * The button used to mint an overlay pointing at `media.ids()[0]`, which on
   * any ordinary project is a *photograph* — so a Pro user got a video overlay
   * that could never draw a frame. A clip is not something the editor can
   * invent a default for, so the picker opens and the overlay is created once
   * a file has actually decoded.
   */
  const videoInput = useRef<HTMLInputElement>(null);
  const onVideoAdded = useCallback(
    (mediaIds: string[]) => {
      const first = mediaIds[0];
      if (first !== undefined) placeOverlay({ kind: 'customMedia', mediaId: first });
    },
    [placeOverlay],
  );
  const { state: videoUpload, addFiles: addVideoFiles } = useUpload(media, onVideoAdded, {
    artboardLongestEdge: 1920,
    video: true,
  });

  /**
   * Music (§10). One track per project, so adding replaces rather than
   * appends — the timeline has one music row and two clips fighting over it
   * would be a model the UI cannot show.
   */
  const audioInput = useRef<HTMLInputElement>(null);
  const selectAudio = useEditor((s) => s.selectAudio);
  const onAudioAdded = useCallback(
    (mediaIds: string[]) => {
      const first = mediaIds[0];
      if (first === undefined) return;
      const sourceMs = media.durationMsOf(first) ?? 0;
      const clip = actions.makeAudioClip(first, { startMs: 0, durationMs: sourceMs });
      dispatch(actions.addAudio(clip));
      selectAudio(clip.id);
    },
    [media, dispatch, selectAudio],
  );
  const { state: audioUpload, addFiles: addAudioFiles } = useUpload(media, onAudioAdded, {
    artboardLongestEdge: 1920,
    audio: true,
  });

  const rows = rowCount(project.overlays);
  const tick = tickIntervalMs(durationMs, laneWidth);
  const ticks: number[] = [];
  for (let t = 0; t <= durationMs; t += tick) ticks.push(t);

  return (
    <div
      className="flex shrink-0 flex-col border-t border-edge bg-panel"
      style={{ height: 'var(--h-timeline)' }}
      aria-label="Timeline"
    >
      {/* Transport and the three "Add …" buttons. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-edge px-3 py-1.5">
        <button
          type="button"
          onClick={() => { if (clock.playing) clock.pause(); else clock.play(); setPlaying(clock.playing); }}
          aria-label={playing ? 'Pause' : 'Play'}
          className="w-16 rounded-md border border-edge px-2 py-1 text-[12px] hover:bg-panel-alt"
        >
          {playing ? 'Pause' : 'Play'}
        </button>

        <span
          className="tabular w-32 text-[11px]"
          style={{ color: timeMs > videoMs ? 'var(--c-ink-faint)' : 'var(--c-ink-muted)' }}
        >
          {formatSeconds(timeMs)} / {formatSeconds(videoMs)}
          {/* Said plainly, so a held last frame does not read as a stall. */}
          {timeMs > videoMs && <span className="ml-1">past end</span>}
        </span>

        <div className="ml-2 flex items-center gap-1" role="group" aria-label="Add overlay">
          <AddButton onClick={() => { addOverlay('photo'); }} title="Add a photo overlay">+ Photo</AddButton>
          <AddButton onClick={() => { addOverlay('text'); }} title="Add a text overlay">+ Text</AddButton>
          {/*
            * §12 keeps custom media behind Pro, and it stays behind Pro — but a
            * disabled button that does nothing when clicked is a dead end, not
            * a gate. It explains itself instead, and offers the dev switch §12
            * already specifies. The real upsell is M7's.
            */}
          <AddButton
            onClick={() => {
              if (!limits.customMedia) { setProNote(true); return; }
              videoInput.current?.click();
            }}
            disabled={videoUpload.busy}
            title={limits.customMedia
              ? 'Add a video overlay'
              : 'Custom media is a Pro feature — click to find out how to enable it'}
          >
            {videoUpload.busy ? 'Reading…' : '+ Media'}
            {!limits.customMedia && (
              <span
                className="ml-1 rounded-sm px-1 text-[8px] font-bold uppercase"
                style={{ background: 'var(--c-pro-soft)', color: 'var(--c-pro)' }}
              >
                Pro
              </span>
            )}
          </AddButton>
          <input
            ref={videoInput}
            type="file"
            accept={VIDEO_ACCEPT_ATTRIBUTE}
            hidden
            aria-label="Add a video overlay"
            onChange={(e) => {
              void addVideoFiles([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />

          <AddButton
            onClick={() => { audioInput.current?.click(); }}
            disabled={audioUpload.busy}
            title="Add a music track"
          >
            {audioUpload.busy ? 'Decoding…' : '+ Music'}
          </AddButton>
          <input
            ref={audioInput}
            type="file"
            accept={AUDIO_ACCEPT_ATTRIBUTE}
            hidden
            aria-label="Add a music track"
            onChange={(e) => {
              void addAudioFiles([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
        </div>

        {proNote && !limits.customMedia && (
          <span className="flex items-center gap-1.5 text-[10px] text-ink-muted">
            Video overlays are Pro.
            <button
              type="button"
              onClick={() => { setTier('pro'); setProNote(false); }}
              className="rounded-md border px-1.5 py-0.5 text-[10px]"
              style={{ borderColor: 'var(--c-pro)', color: 'var(--c-pro)' }}
            >
              Switch to Pro ({tier === 'free' ? 'dev' : 'on'})
            </button>
          </span>
        )}

        {(videoUpload.error ?? audioUpload.error) !== null && (
          <span className="max-w-64 truncate text-[10px]" style={{ color: 'var(--c-danger)' }}>
            {videoUpload.error ?? audioUpload.error}
          </span>
        )}

        <span className="ml-auto text-[10px] text-ink-faint">
          {project.scenes.length} scenes · {project.overlays.length} overlays
          {overhang && ` · music runs ${formatSeconds(durationMs - videoMs)} past the end`}
        </span>
      </div>

      <SceneTools />

      {/* Tracks. The label gutter is fixed so every row's time axis lines up. */}
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        {/* Wide enough for the labels to be words. At w-14 they read
            "SCEN…" and "MOTI…", which is a gutter that has stopped being a
            gutter and become a puzzle. */}
        <div className="w-20 shrink-0 border-r border-edge">
          <Gutter>Time</Gutter>
          <Gutter tall>Scenes</Gutter>
          <Gutter>Motion</Gutter>
          {Array.from({ length: rows }, (_, i) => <Gutter key={i}>{`L${i + 1}`}</Gutter>)}
          <Gutter>Music</Gutter>
        </div>

        <div
          ref={laneRef}
          className="relative min-w-0 flex-1"
          /*
           * Clicking anywhere on the timeline moves the playhead.
           *
           * It used to be the thin ruler strip alone, which is a five-pixel
           * target you have to know about — and everywhere else, a click did
           * nothing at all. Every editor people have used moves the playhead
           * when you click the timeline, and looking for a way to do the
           * obvious thing is exactly the sort of friction that makes a tool
           * feel like it is hiding something.
           *
           * Clips stop the event themselves (`beginClipDrag` calls
           * stopPropagation), so dragging a scene or a music clip still does
           * what it did; this only catches the empty space around them.
           */
          onPointerDown={onLaneDown}
          onPointerMove={onLaneMove}
        >
          {/* Ruler, which is also the scrub surface. */}
          <div
            className="relative h-5 cursor-ew-resize border-b border-edge"
            onPointerDown={onRulerDown}
            onPointerMove={onRulerMove}
            role="slider"
            tabIndex={0}
            aria-label="Scrub"
            aria-valuemin={0}
            /*
             * The lane's length, because the playhead now reaches all of it.
             *
             * It used to report the video's, which was honest at the time —
             * the transport was clamped to the video and promising more would
             * have been a lie. Now the transport spans the lane so that
             * overhanging music can actually be auditioned, and this follows.
             */
            aria-valuemax={Math.round(durationMs)}
            aria-valuenow={Math.round(timeMs)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              clock.seek(clock.timeMs + (e.key === 'ArrowRight' ? 100 : -100));
              setTimeMs(clock.timeMs);
            }}
          >
            {ticks.map((t) => (
              <span
                key={t}
                className="tabular absolute top-0 border-l border-edge pl-1 text-[9px] leading-5 text-ink-faint"
                style={{ left: `${msToPct(t, durationMs)}%` }}
              >
                {formatSeconds(t)}
              </span>
            ))}
          </div>

          {/* Scene track. Clip widths come from the spans, so a transition
              overlap is visible as two clips that touch rather than a gap. */}
          <div className="relative h-9 border-b border-edge" data-lane>
            {spans.map((span) => {
              const active = span.index === selectedScene && selectedOverlay === null;
              return (
                <button
                  key={span.scene.id}
                  type="button"
                  onClick={(e) => {
                    // Already selected? Then this click is about the moment,
                    // not the choice (D-087).
                    if (active) seekTo(laneMs(e.clientX));
                    else selectScene(span.index);
                  }}
                  aria-pressed={active}
                  title={`${span.scene.templateId} · ${formatSeconds(span.scene.durationMs)}`}
                  className="absolute inset-y-1 overflow-hidden rounded-md border px-1.5 text-left text-[10px] transition-colors"
                  style={{
                    left: `${msToPct(span.startMs, durationMs)}%`,
                    width: `${msToPct(span.endMs, durationMs) - msToPct(span.startMs, durationMs)}%`,
                    borderColor: active ? 'var(--c-accent)' : 'var(--c-edge-strong)',
                    background: active ? 'var(--c-accent-soft)' : 'var(--c-panel-alt)',
                    color: active ? 'var(--c-accent)' : 'var(--c-ink-muted)',
                    fontWeight: active ? 600 : 400,
                    transitionDuration: 'var(--t-fast)',
                  }}
                >
                  <span className="block truncate leading-[26px]">
                    {span.index + 1}. {span.scene.templateId}
                  </span>
                  {span.transitionIn && span.transitionIn.kind !== 'cut' && (
                    <span
                      className="pointer-events-none absolute inset-y-0 left-0 border-l-2 border-dashed"
                      style={{
                        width: `${((span.transitionEndMs - span.transitionStartMs) / Math.max(1, span.scene.durationMs)) * 100}%`,
                        borderColor: 'var(--c-accent)',
                        background: 'color-mix(in srgb, var(--c-accent) 12%, transparent)',
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/*
            * The selected element's motion, on a lane of its own.
            *
            * It used to be drawn inside the clip, which was wrong twice over: a
            * bar positioned in lane percentages inside a four-second clip came
            * out a few pixels long in the wrong place, and there was no room
            * for an end you could actually grab. A motion is a span of time, so
            * it belongs on the same time axis as everything else.
            */}
          <div className="relative h-7 border-b border-edge" data-lane>
            <MotionLane spans={spans} durationMs={durationMs} onSeek={seekTo} />
          </div>

          {/* Overlay tracks, L1 first (§6.4 draws them in this order). */}
          {Array.from({ length: rows }, (_, row) => (
            /* `data-lane` marks the row as a time axis: the motion bar
               converts pointer positions against it, and a press on the bare
               row scrubs like any other empty part of the timeline. */
            <div key={row} className="relative h-7 border-b border-edge" data-lane>
              {project.overlays
                .filter((o) => o.track === row)
                .map((overlay) => {
                  const active = overlay.id === selectedOverlay;
                  return (
                    <div
                      key={overlay.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={active}
                      title={labelFor(overlay)}
                      onPointerDown={(e) => { beginClipDrag(e, overlay, 'move'); }}
                      onPointerMove={onClipMove}
                      onPointerUp={endClipDrag}
                      onPointerCancel={endClipDrag}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectOverlay(overlay.id); }}
                      className="absolute inset-y-1 cursor-grab select-none overflow-hidden rounded-sm border text-[10px] leading-[18px]"
                      style={{
                        left: `${msToPct(overlay.startMs, durationMs)}%`,
                        width: `${Math.max(1.2, msToPct(overlay.endMs, durationMs) - msToPct(overlay.startMs, durationMs))}%`,
                        borderColor: active ? 'var(--c-accent)' : 'var(--c-edge-strong)',
                        background: active ? 'var(--c-accent-soft)' : 'var(--c-panel-alt)',
                        color: active ? 'var(--c-accent)' : 'var(--c-ink-muted)',
                      }}
                    >
                      <TrimHandle side="start" onDown={(e) => { beginClipDrag(e, overlay, 'trimStart'); }} onMove={onClipMove} onUp={endClipDrag} />
                      <span className="pointer-events-none block truncate px-2">{labelFor(overlay)}</span>
                      <TrimHandle side="end" onDown={(e) => { beginClipDrag(e, overlay, 'trimEnd'); }} onMove={onClipMove} onUp={endClipDrag} />
                    </div>
                  );
                })}
            </div>
          ))}

          {/* §1.2's dedicated music track, §10's waveform. */}
          <MusicTrack
            clips={project.audio}
            durationMs={durationMs}
            videoMs={videoMs}
            laneWidth={laneWidth}
            onSeek={seekTo}
          />

          {/*
            * Everything past the end of the video, dimmed.
            *
            * D-053 cuts the exported mix to the video's length; this is that
            * rule made visible, so a track that overruns looks deliberate
            * rather than broken.
            */}
          {overhang && (
            <div
              className="pointer-events-none absolute inset-y-0"
              style={{
                left: `${msToPct(videoMs, durationMs)}%`,
                right: 0,
                background: 'color-mix(in srgb, var(--c-stage) 55%, transparent)',
                borderLeft: '1px dashed var(--c-edge-strong)',
              }}
              aria-hidden
            />
          )}

          {/* Playhead, over every row. */}
          <div
            className="pointer-events-none absolute inset-y-0 w-px"
            style={{ left: `${msToPct(timeMs, durationMs)}%`, background: 'var(--c-accent)' }}
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}

function labelFor(overlay: Overlay): string {
  if (overlay.content.kind === 'text') return overlay.content.text || 'Text';
  return overlay.content.kind === 'photo' ? 'Photo' : 'Media';
}

function Gutter({ children, tall }: { children: React.ReactNode; tall?: boolean }): React.JSX.Element {
  return (
    <div
      className="truncate border-b border-edge px-2 text-[10px] uppercase tracking-wide text-ink-faint"
      style={{ height: tall === true ? 36 : 28, lineHeight: tall === true ? '36px' : '28px' }}
    >
      {children}
    </div>
  );
}

function AddButton({
  onClick,
  children,
  disabled,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  title: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-md border border-edge px-2 py-1 text-[11px] text-ink-muted hover:bg-panel-alt disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** The grab strip at each end of a clip. Eight pixels, which is the smallest
 *  target that does not fight the move drag on a narrow clip. */
function TrimHandle({
  side,
  onDown,
  onMove,
  onUp,
}: {
  side: 'start' | 'end';
  onDown: (event: React.PointerEvent<HTMLElement>) => void;
  onMove: (event: React.PointerEvent<HTMLElement>) => void;
  onUp: () => void;
}): React.JSX.Element {
  return (
    <span
      role="presentation"
      aria-label={side === 'start' ? 'Trim start' : 'Trim end'}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className="absolute inset-y-0 w-2 cursor-ew-resize"
      style={{ [side === 'start' ? 'left' : 'right']: 0 }}
    />
  );
}

/**
 * Whatever is selected, and what its motion is doing.
 *
 * One lane for all of them. An overlay, a template photograph and a block of
 * template text are three different things in the document and exactly the same
 * thing here — something with a span of time attached — so giving each its own
 * row would be three rows of which two are always empty.
 *
 * The lane says something even when there is no motion, because the commonest
 * report about this feature was never that it worked badly. It was that nobody
 * could find it.
 */
function MotionLane({
  spans,
  durationMs,
  onSeek,
}: {
  spans: readonly SceneSpan[];
  durationMs: number;
  onSeek: (projectMs: number) => void;
}): React.JSX.Element {
  const overlay = useEditor((s) => s.project.overlays.find((o) => o.id === s.selectedOverlay) ?? null);
  const selectedSlot = useEditor((s) => s.selectedSlot);

  if (overlay) return <OverlayMotion overlay={overlay} durationMs={durationMs} onSeek={onSeek} />;
  if (selectedSlot !== null) {
    return <SlotMotion slotKey={selectedSlot} spans={spans} durationMs={durationMs} onSeek={onSeek} />;
  }
  return <LaneNote>Select a photo, some text or an overlay to give it motion.</LaneNote>;
}

function LaneNote({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[10px] text-ink-faint">
      {children}
    </span>
  );
}

/**
 * The way in, on the lane rather than only in the panel.
 *
 * Named "+ Motion" to sit alongside "+ Photo" and "+ Text" in the toolbar
 * above, and so that it does not collide with the panel's own "Add motion" —
 * two controls with one name is a worse problem than a slightly terser label.
 */
function AddMotionHere({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className="absolute inset-y-0 left-2 flex items-center gap-2">
      <button
        type="button"
        onPointerDown={(e) => { e.stopPropagation(); }}
        onClick={onAdd}
        title="Give the selected element a motion"
        className="rounded-md border px-2 py-0.5 text-[10px] font-semibold"
        style={{ borderColor: 'var(--c-accent)', color: 'var(--c-accent)', background: 'var(--c-accent-soft)' }}
      >
        + Motion
      </button>
      <span className="pointer-events-none text-[10px] text-ink-faint">
        Then put the playhead at the end and drag it to say where it finishes.
      </span>
    </div>
  );
}

/**
 * The selected template element's motion.
 *
 * Times are in the scene's own clock, after §8.4's speed remap, so they have to
 * be mapped back out to the project's before anything is drawn — a scene played
 * at half speed spreads its motion over twice as much timeline.
 */
function SlotMotion({
  slotKey,
  spans,
  durationMs,
  onSeek,
}: {
  slotKey: string;
  spans: readonly SceneSpan[];
  durationMs: number;
  onSeek: (projectMs: number) => void;
}): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const playheadMs = useEditor((s) => s.playheadMs);
  const selectedScene = useEditor((s) => s.selectedScene);
  const transform = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.slotTransforms[slotKey]);

  const sceneSpan = spans[selectedScene];
  if (!sceneSpan) return <LaneNote>No scene selected.</LaneNote>;

  const speed = sceneSpan.scene.inputs.look.speed;
  const scale = speed === 0 ? 1 : 1 / speed;
  const sceneMs = sceneSpan.scene.durationMs;
  const localMs = Math.max(0, Math.min(Math.round((playheadMs - sceneSpan.startMs) * speed), sceneMs));

  if (!transform || !hasNudgePoses(transform)) {
    return (
      <AddMotionHere
        onAdd={() => {
          dispatch(actions.setSlotAnimated(slotKey, true, localMs));
          dispatch(actions.addSlotMotion(slotKey, localMs, sceneMs));
        }}
      />
    );
  }

  const times = nudgePoses(transform).map((pose) => pose.atMs);
  const span = spanOf(times);
  if (!span) return <LaneNote>No motion on this element.</LaneNote>;

  return (
    <MotionBar
      span={span}
      poseTimes={times}
      originMs={sceneSpan.startMs}
      scale={scale}
      laneMs={durationMs}
      onChange={(change) => { dispatch(actions.reshapeSlotMotion(slotKey, sceneMs, change)); }}
      onCommit={endInteraction}
      onSeek={(atMs) => { onSeek(sceneSpan.startMs + Math.min(atMs, sceneMs - 1) * scale); }}
    />
  );
}

/**
 * An overlay's motion.
 *
 * Times are the overlay's own (§6.1), so dragging the clip along the timeline
 * takes the motion with it and the bar follows on the next render.
 */
function OverlayMotion({
  overlay,
  durationMs,
  onSeek,
}: {
  overlay: Overlay;
  durationMs: number;
  onSeek: (projectMs: number) => void;
}): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const playheadMs = useEditor((s) => s.playheadMs);

  const spanMs = Math.max(1, overlay.endMs - overlay.startMs);
  const localMs = Math.max(0, Math.min(Math.round(playheadMs - overlay.startMs), spanMs));

  if (!isAnimated(overlay)) {
    return (
      <AddMotionHere
        onAdd={() => {
          dispatch(actions.setOverlayAnimated(overlay.id, true, localMs));
          dispatch(actions.addOverlayMotion(overlay.id, localMs));
        }}
      />
    );
  }

  const times = posesOf(overlay).map((pose) => pose.atMs);
  const span = spanOf(times);
  if (!span) return <LaneNote>No motion on this overlay.</LaneNote>;

  return (
    <MotionBar
      span={span}
      poseTimes={times}
      originMs={overlay.startMs}
      scale={1}
      laneMs={durationMs}
      onChange={(change) => { dispatch(actions.reshapeOverlayMotion(overlay.id, change)); }}
      onCommit={endInteraction}
      /*
       * Never the exact end: a layer's range is half-open, so the instant a
       * motion finishes is the first instant the overlay is gone, and standing
       * there leaves nothing on screen to drag.
       */
      onSeek={(atMs) => { onSeek(overlay.startMs + Math.min(atMs, spanMs - 1)); }}
    />
  );
}
