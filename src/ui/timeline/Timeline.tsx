import { useCallback, useEffect, useRef, useState } from 'react';
import type { PreviewClock } from '@/core/time/clock';
import type { Overlay } from '@/document/types';
import { sceneSpans, totalDurationMs } from '@/document/select/timeline';
import { DEFAULT_OVERLAY_MS, DEFAULT_OVERLAY_TEXT_STYLE, STARTER_PHOTO_IDS } from '@/document/defaults';
import * as actions from '@/document/actions';
import { useEditor } from '@/state/store';
import { useEntitlements } from '@/entitlements';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { useUpload, VIDEO_ACCEPT_ATTRIBUTE } from '@/ui/media/useUpload';
import { SceneTools } from './SceneTools';
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
const MIN_OVERLAY_MS = 300;

export function Timeline({ clock }: { clock: PreviewClock }): React.JSX.Element {
  const project = useEditor((s) => s.project);
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const selectedScene = useEditor((s) => s.selectedScene);
  const selectScene = useEditor((s) => s.selectScene);
  const selectedOverlay = useEditor((s) => s.selectedOverlay);
  const selectOverlay = useEditor((s) => s.selectOverlay);

  const durationMs = totalDurationMs(project);
  const spans = sceneSpans(project.scenes);

  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(clock.playing);

  useEffect(() => {
    const handle = setInterval(() => {
      setTimeMs(clock.timeMs);
      setPlaying(clock.playing);
    }, 1000 / READOUT_HZ);
    return () => { clearInterval(handle); };
  }, [clock]);

  const laneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<ClipDrag | null>(null);

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
  }, [clock, laneMs]);

  const onRulerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
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
    event.currentTarget.setPointerCapture(event.pointerId);
    selectOverlay(overlay.id);
    dragRef.current = {
      mode,
      id: overlay.id,
      startMs: overlay.startMs,
      endMs: overlay.endMs,
      pointerMs: laneMs(event.clientX),
    };
  };

  const onClipMove = (event: React.PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (!drag || event.buttons === 0) return;

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
    if (!dragRef.current) return;
    dragRef.current = null;
    // One undo step for the whole drag, not one per pointermove.
    endInteraction();
  };

  // ── Adding overlays (§1.2) ───────────────────────────────────────────────

  const media = useMediaStore();
  const { limits } = useEntitlements('motionAd');

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

        <span className="tabular w-28 text-[11px] text-ink-muted">
          {formatSeconds(timeMs)} / {formatSeconds(durationMs)}
        </span>

        <div className="ml-2 flex items-center gap-1" role="group" aria-label="Add overlay">
          <AddButton onClick={() => { addOverlay('photo'); }} title="Add a photo overlay">+ Photo</AddButton>
          <AddButton onClick={() => { addOverlay('text'); }} title="Add a text overlay">+ Text</AddButton>
          <AddButton
            onClick={() => { videoInput.current?.click(); }}
            disabled={!limits.customMedia || videoUpload.busy}
            title={limits.customMedia ? 'Add a video overlay' : 'Custom media is a Pro feature (§12)'}
          >
            {videoUpload.busy ? 'Reading…' : '+ Media'}
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
        </div>

        {videoUpload.error !== null && (
          <span className="max-w-64 truncate text-[10px]" style={{ color: 'var(--c-danger)' }}>
            {videoUpload.error}
          </span>
        )}

        <span className="ml-auto text-[10px] text-ink-faint">
          {project.scenes.length} scenes · {project.overlays.length} overlays
        </span>
      </div>

      <SceneTools />

      {/* Tracks. The label gutter is fixed so every row's time axis lines up. */}
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <div className="w-14 shrink-0 border-r border-edge">
          <Gutter>Time</Gutter>
          <Gutter tall>Scenes</Gutter>
          {Array.from({ length: rows }, (_, i) => <Gutter key={i}>{`L${i + 1}`}</Gutter>)}
          <Gutter>Music</Gutter>
        </div>

        <div ref={laneRef} className="relative min-w-0 flex-1">
          {/* Ruler, which is also the scrub surface. */}
          <div
            className="relative h-5 cursor-ew-resize border-b border-edge"
            onPointerDown={onRulerDown}
            onPointerMove={onRulerMove}
            role="slider"
            tabIndex={0}
            aria-label="Scrub"
            aria-valuemin={0}
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
          <div className="relative h-9 border-b border-edge">
            {spans.map((span) => {
              const active = span.index === selectedScene && selectedOverlay === null;
              return (
                <button
                  key={span.scene.id}
                  type="button"
                  onClick={() => { selectScene(span.index); }}
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

          {/* Overlay tracks, L1 first (§6.4 draws them in this order). */}
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className="relative h-7 border-b border-edge">
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

          {/* §1.2's dedicated music track. Empty until M6 owns it. */}
          <div className="relative h-7 border-b border-edge">
            <span className="absolute inset-y-0 left-2 text-[10px] leading-7 text-ink-faint">
              Music arrives at M6
            </span>
          </div>

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
