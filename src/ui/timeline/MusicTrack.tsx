import { useCallback, useRef } from 'react';
import type { AudioClip } from '@/document/types';
import { clipDurationMs, gainAt, resolvedFades } from '@/core/audio/envelope';
import { peakAt } from '@/media/audio/waveform';
import * as actions from '@/document/actions';
import { useEditor } from '@/state/store';
import { useMediaRevision, useMediaStore } from '@/ui/media/MediaProvider';
import { capturePointer } from './pointerCapture';
import { dragResult, msToPct, pxToMs, snap, type ClipDrag } from './timelineGeometry';

/**
 * Music supports one gesture the other tracks do not: slip.
 *
 * Trim can only shorten from the ends, so reaching a chorus ninety seconds
 * into a track means cutting away the ninety seconds before it — which moves
 * the clip too. Slipping holds position and length and slides the source
 * underneath, which is the gesture "which section of the music" actually
 * wants. ⌥ while dragging the body.
 */
type MusicDragMode = ClipDrag['mode'] | 'slip';
type MusicDrag = Omit<ClipDrag, 'mode'> & {
  readonly mode: MusicDragMode;
  readonly downX: number;
  readonly wasSelected: boolean;
  moved: boolean;
};

/** Pointer slop below which a press counts as a click rather than a drag. */
const CLICK_SLOP_PX = 3;

/**
 * §1.2's dedicated music track, and §10's waveform preview.
 *
 * The waveform is drawn from the precomputed peaks, sampled across the part of
 * the source the clip actually plays — so trimming the clip scrolls the shape
 * rather than squashing it, which is the whole reason peaks are stored against
 * the *source* and not the clip.
 *
 * The envelope is drawn over it, at the gain that will actually be heard, so a
 * fade is something you can see before you press play.
 */

const SNAP_MS = 100;
const MIN_CLIP_MS = 300;
/** How many columns the waveform is drawn with. Beyond this it is mush. */
const COLUMNS = 160;

/**
 * The music row.
 *
 * Renders every clip in `project.audio`, not just the first — splitting a clip
 * to cut a passage out is only useful if both halves are then on screen.
 */
export function MusicTrack({
  clips,
  durationMs,
  videoMs,
  laneWidth,
  onSeek,
}: {
  clips: readonly AudioClip[];
  /** The lane's span, which includes anything past the end of the video. */
  durationMs: number;
  /** What actually renders and exports. */
  videoMs: number;
  laneWidth: number;
  onSeek: (projectMs: number) => void;
}): React.JSX.Element {
  if (clips.length === 0) {
    return (
      <div className="relative h-7 border-b border-edge" data-lane>
        {/*
          * `pointer-events-none`, so the row underneath gets the press.
          *
          * Without it the note was the click target for most of the row's
          * width, and the timeline's scrub handler — which only acts on the
          * lane itself — quietly did nothing. Reported precisely: "when I click
          * the Music section with the text 'No music…' the playhead is not
          * adjusted".
          */}
        <span className="pointer-events-none absolute inset-y-0 left-2 text-[10px] leading-7 text-ink-faint">
          No music. Use “+ Music” above.
        </span>
      </div>
    );
  }

  return (
    <div className="relative h-7 border-b border-edge" data-lane>
      {clips.map((clip) => (
        <MusicClip
          key={clip.id}
          clip={clip}
          durationMs={durationMs}
          videoMs={videoMs}
          laneWidth={laneWidth}
          onSeek={onSeek}
        />
      ))}
    </div>
  );
}

function MusicClip({
  clip,
  durationMs,
  videoMs,
  laneWidth,
  onSeek,
}: {
  clip: AudioClip;
  durationMs: number;
  videoMs: number;
  laneWidth: number;
  onSeek: (projectMs: number) => void;
}): React.JSX.Element {
  const media = useMediaStore();
  useMediaRevision();
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const selectedAudio = useEditor((s) => s.selectedAudio);
  const selectAudio = useEditor((s) => s.selectAudio);

  const dragRef = useRef<MusicDrag | null>(null);

  const laneMs = useCallback(
    (clientX: number, element: HTMLElement): number => {
      const lane = element.closest('[data-lane]');
      if (!lane) return 0;
      const box = lane.getBoundingClientRect();
      return pxToMs(clientX - box.left, box.width, durationMs);
    },
    [durationMs],
  );

  const sourceMs = media.durationMsOf(clip.mediaId);
  const waveform = media.getWaveform(clip.mediaId);
  const length = clipDurationMs(clip);
  const left = msToPct(clip.startMs, durationMs);
  const width = Math.max(1.2, msToPct(clip.startMs + length, durationMs) - left);
  const active = selectedAudio === clip.id;

  const begin = (event: React.PointerEvent<HTMLElement>, mode: MusicDragMode): void => {
    event.stopPropagation();
    capturePointer(event.currentTarget, event.pointerId);
    const wasSelected = selectedAudio === clip.id;
    selectAudio(clip.id);
    dragRef.current = {
      // `slip` is not a ClipDrag mode — dragResult knows nothing about it, and
      // the slip branch above returns before ever calling it.
      mode: mode === 'slip' ? 'slip' : mode,
      id: clip.id,
      startMs: clip.startMs,
      endMs: clip.startMs + length,
      pointerMs: laneMs(event.clientX, event.currentTarget),
      downX: event.clientX,
      wasSelected,
      moved: false,
    };
  };

  const move = (event: React.PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (!drag || event.buttons === 0) return;
    if (Math.abs(event.clientX - drag.downX) > CLICK_SLOP_PX) drag.moved = true;

    const pointerMs = laneMs(event.clientX, event.currentTarget);
    // ⇧ bypasses snapping. ⌥ is taken: it is the slip modifier.
    const free = event.shiftKey;
    const rawDelta = pointerMs - drag.pointerMs;

    if (drag.mode === 'slip') {
      // Slipping runs *against* the drag: pulling the clip left brings later
      // audio into view, the way scrubbing a reel under a playhead does.
      dispatch(actions.slipAudio(clip.id, snap(-rawDelta, SNAP_MS, free), sourceMs ?? 0));
      return;
    }

    // Narrowed past 'slip' by the branch above, which is what dragResult needs.
    const geometry: ClipDrag = { ...drag, mode: drag.mode };
    const next = dragResult(geometry, pointerMs, { durationMs, minLengthMs: MIN_CLIP_MS });

    if (drag.mode === 'move') {
      /*
       * Clamped against the *video*, not the lane.
       *
       * `dragResult` keeps a clip inside the lane, which is right for overlays
       * and wrong here — the lane is sized from the content, so clamping a
       * music clip to it made overhang unreachable by construction: the clip
       * could never be dragged past an end that only moved because the clip
       * had. Music may start anywhere up to the end of the video; past that it
       * would be inaudible in the export anyway.
       */
      const wanted = drag.startMs + (pointerMs - drag.pointerMs);
      const startMs = Math.max(0, Math.min(wanted, videoMs));
      dispatch(actions.setAudioStart(clip.id, snap(startMs, SNAP_MS, free)));
      return;
    }

    if (!sourceMs) return;

    /*
     * Trimming moves the window into the *source*, not the clip's place on the
     * timeline. Each edge is one atomic action carrying one coalesce key, so a
     * drag is a single undo step rather than one per pointermove.
     */
    if (drag.mode === 'trimStart') {
      const delta = snap(next.startMs, SNAP_MS, free) - clip.startMs;
      dispatch(actions.trimAudioStart(clip.id, delta, sourceMs));
      return;
    }

    const delta = snap(next.endMs, SNAP_MS, free) - (clip.startMs + length);
    dispatch(actions.trimAudioEnd(clip.id, delta, sourceMs));
  };

  const end = (event: React.PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;

    // Clicking a clip that was already selected moves the playhead there, the
    // same rule the scene and overlay clips follow (D-087).
    if (drag.mode === 'move' && !drag.moved && drag.wasSelected) {
      onSeek(laneMs(drag.downX, event.currentTarget));
      return;
    }
    endInteraction();
  };

  // Where in the source each drawn column sits, so a trim scrolls the shape.
  const sourceLength = sourceMs ?? 0;
  const columnAt = (column: number): number => {
    if (sourceLength <= 0) return 0;
    const intoClip = (column / COLUMNS) * length;
    return (clip.trimStartMs + intoClip) / sourceLength;
  };

  const { inMs, outMs } = resolvedFades(clip);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={active}
        aria-label={`Music clip, ${(length / 1000).toFixed(1)} seconds`}
        title={`${media.get(clip.mediaId)?.name ?? clip.mediaId} · ${(length / 1000).toFixed(1)}s`}
        onPointerDown={(e) => { begin(e, e.altKey ? 'slip' : 'move'); }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectAudio(clip.id); }}
        className="absolute inset-y-1 cursor-grab select-none overflow-hidden rounded-sm border"
        style={{
          left: `${left}%`,
          width: `${width}%`,
          borderColor: active ? 'var(--c-accent)' : 'var(--c-edge-strong)',
          background: active ? 'var(--c-accent-soft)' : 'var(--c-panel-alt)',
        }}
      >
        {/* Peaks, mirrored about the centre line. */}
        <svg
          viewBox={`0 0 ${COLUMNS} 20`}
          preserveAspectRatio="none"
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        >
          {waveform !== null &&
            Array.from({ length: COLUMNS }, (_, column) => {
              const { min, max } = peakAt(waveform, columnAt(column));
              // The envelope scales what is drawn, so a fade is visible.
              const envelope = gainAt(clip, (column / COLUMNS) * length);
              const top = 10 - max * 9 * envelope;
              const bottom = 10 - min * 9 * envelope;
              return (
                <line
                  key={column}
                  x1={column + 0.5}
                  x2={column + 0.5}
                  y1={top}
                  y2={Math.max(bottom, top + 0.4)}
                  stroke={active ? 'var(--c-accent)' : 'var(--c-ink-faint)'}
                  strokeWidth={1}
                />
              );
            })}
        </svg>

        {waveform === null && (
          <span className="pointer-events-none absolute inset-0 truncate px-2 text-[10px] leading-[18px] text-ink-faint">
            Decoding…
          </span>
        )}

        {/* Fade shoulders, so the ramp length is draggable-looking even though
            it is set in the inspector. */}
        {inMs > 0 && (
          <span
            className="pointer-events-none absolute inset-y-0 left-0"
            style={{
              width: `${(inMs / Math.max(1, length)) * 100}%`,
              background: 'linear-gradient(to right, var(--c-panel) 0%, transparent 100%)',
              opacity: 0.55,
            }}
          />
        )}
        {outMs > 0 && (
          <span
            className="pointer-events-none absolute inset-y-0 right-0"
            style={{
              width: `${(outMs / Math.max(1, length)) * 100}%`,
              background: 'linear-gradient(to left, var(--c-panel) 0%, transparent 100%)',
              opacity: 0.55,
            }}
          />
        )}

        <TrimHandle side="start" onDown={(e) => { begin(e, 'trimStart'); }} onMove={move} onUp={end} />
        <TrimHandle side="end" onDown={(e) => { begin(e, 'trimEnd'); }} onMove={move} onUp={end} />
      </div>

      {laneWidth > 0 && width < 3 && (
        <span className="pointer-events-none absolute inset-y-0 right-2 text-[9px] leading-7 text-ink-faint">
          clip is very short
        </span>
      )}
    </>
  );
}

function TrimHandle({
  side,
  onDown,
  onMove,
  onUp,
}: {
  side: 'start' | 'end';
  onDown: (event: React.PointerEvent<HTMLElement>) => void;
  onMove: (event: React.PointerEvent<HTMLElement>) => void;
  onUp: (event: React.PointerEvent<HTMLElement>) => void;
}): React.JSX.Element {
  return (
    <span
      role="presentation"
      aria-label={side === 'start' ? 'Trim music start' : 'Trim music end'}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className="absolute inset-y-0 w-2 cursor-ew-resize"
      style={{ [side === 'start' ? 'left' : 'right']: 0 }}
    />
  );
}
