import { useCallback, useRef } from 'react';
import type { AudioClip } from '@/document/types';
import { clipDurationMs, gainAt, isLooping, loopPhaseOf, loopWindowMs, resolvedFades, sourceMsAt } from '@/core/audio/envelope';
import { soundFor } from '@/audio/library';
import { packRows, type AudioLane } from '@/document/select/audio';
import { peakAt } from '@/media/audio/waveform';
import * as actions from '@/document/actions';
import { useEditor } from '@/state/store';
import { useMediaRevision, useMediaStore } from '@/ui/media/MediaProvider';
import { capturePointer } from './pointerCapture';
import { useOverlays } from '@/ui/shell/overlays';
import { LongPress } from '@/ui/shell/ContextMenu';
import { useHoldStill } from '@/ui/shell/ClockProvider';
import { audioMenu } from '@/ui/editing/commands';
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
/** One row of clips; overlapping clips stack onto more rows. */
export const AUDIO_ROW_PX = 28;

/** How tall a row of these clips is: one row, or more where clips overlap. */
export function audioRowsHeight(clips: readonly AudioClip[]): number {
  return AUDIO_ROW_PX * Math.max(1, packRows(clips).rows);
}

/**
 * The Music row, and the Sounds row (D-156).
 *
 * Renders every clip it is given, not just the first — splitting a clip to
 * cut a passage out is only useful if both halves are then on screen. Clips
 * that overlap in time stack onto rows of their own, so a whoosh under a pop,
 * or two tracks crossing, are each there to grab.
 *
 * `clips` are as they play (`resolvedAudio`): a background loop that fits
 * the video is drawn to the video's end.
 */
export function MusicTrack({
  clips,
  lane = 'music',
  durationMs,
  videoMs,
  laneWidth,
  onSeek,
}: {
  clips: readonly AudioClip[];
  /** Which row this is: the names it gives its clips depend on it. */
  lane?: AudioLane;
  /** The lane's span, which includes anything past the end of the video. */
  durationMs: number;
  /** What actually renders and exports. */
  videoMs: number;
  laneWidth: number;
  onSeek: (projectMs: number) => void;
}): React.JSX.Element {
  // Only drawn once there is something on it: the timeline shows the rows in use (D-153).
  const { rowOf } = packRows(clips);
  return (
    <div className="relative h-full" data-lane>
      {clips.map((clip) => (
        <MusicClip
          key={clip.id}
          clip={clip}
          lane={lane}
          row={rowOf.get(clip.id) ?? 0}
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
  lane,
  row,
  durationMs,
  videoMs,
  laneWidth,
  onSeek,
}: {
  clip: AudioClip;
  lane: AudioLane;
  row: number;
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
  const openMenu = useOverlays((o) => o.openMenu);
  const longPress = useRef(new LongPress());
  /** Picking a clip stops the preview where it is (D-110). */
  const holdStill = useHoldStill();

  const sound = soundFor(clip.mediaId);

  const openClipMenu = (x: number, y: number, element: HTMLElement): void => {
    selectAudio(clip.id);
    holdStill();
    openMenu({ x, y, title: sound?.name ?? 'Music', items: audioMenu(clip.id, onSeek, laneMs(x, element)) });
  };

  const laneMs = useCallback(
    (clientX: number, element: HTMLElement): number => {
      const lane = element.closest('[data-lane]');
      if (!lane) return 0;
      const box = lane.getBoundingClientRect();
      return pxToMs(clientX - box.left, box.width, durationMs);
    },
    [durationMs],
  );

  const name = sound?.name ?? media.get(clip.mediaId)?.name ?? clip.mediaId;
  const looping = isLooping(clip);
  const sourceMs = media.durationMsOf(clip.mediaId);
  const waveform = media.getWaveform(clip.mediaId);
  const length = clipDurationMs(clip);
  const left = msToPct(clip.startMs, durationMs);
  const width = Math.max(1.2, msToPct(clip.startMs + length, durationMs) - left);
  const active = selectedAudio === clip.id;

  const begin = (event: React.PointerEvent<HTMLElement>, mode: MusicDragMode): void => {
    if (event.button === 2) return; // The menu, not a drag.
    event.stopPropagation();
    const element = event.currentTarget;
    longPress.current.start(event, (x, y) => {
      dragRef.current = null;
      openClipMenu(x, y, element);
    });
    capturePointer(event.currentTarget, event.pointerId);
    const wasSelected = selectedAudio === clip.id;
    selectAudio(clip.id);
    holdStill();
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
    longPress.current.move(event);
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

    // A loop's edges do not depend on its file, so it can be trimmed while that loads.
    if (!sourceMs && !looping) return;

    /*
     * Trimming moves the window into the *source*, not the clip's place on the
     * timeline. Each edge is one atomic action carrying one coalesce key, so a
     * drag is a single undo step rather than one per pointermove.
     */
    if (drag.mode === 'trimStart') {
      const delta = snap(next.startMs, SNAP_MS, free) - clip.startMs;
      dispatch(actions.trimAudioStart(clip.id, delta, sourceMs ?? 0));
      return;
    }

    // A loop may be drawn out past the end of the lane — that is how it grows.
    const endMs = looping ? drag.endMs + rawDelta : next.endMs;
    const delta = snap(endMs, SNAP_MS, free) - (clip.startMs + length);
    dispatch(actions.trimAudioEnd(clip.id, delta, sourceMs ?? 0));
  };

  const end = (event: React.PointerEvent<HTMLElement>): void => {
    longPress.current.cancel();
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

  // Where in the source each drawn column sits, so a trim scrolls the shape
  // and a loop draws its section over and over — what is drawn is what plays.
  const sourceLength = sourceMs ?? 0;
  const columnAt = (column: number): number => {
    if (sourceLength <= 0) return 0;
    const intoClip = (column / COLUMNS) * length;
    return sourceMsAt(clip, intoClip) / sourceLength;
  };

  const { inMs, outMs } = resolvedFades(clip);

  /*
   * Where a loop goes round again, as faint marks — only while they are far
   * enough apart to read as marks rather than a texture.
   */
  const seams: number[] = [];
  if (looping && laneWidth > 0) {
    const window = loopWindowMs(clip);
    const widthPx = (length / Math.max(1, durationMs)) * laneWidth;
    if ((window / Math.max(1, length)) * widthPx >= 8) {
      for (let at = window - loopPhaseOf(clip); at < length && seams.length < 400; at += window) {
        if (at > 0) seams.push(at / length);
      }
    }
  }
  const seconds = (length / 1000).toFixed(1);
  const label = lane === 'sounds'
    ? `Sound clip, ${name}, ${seconds} seconds`
    : `Music clip, ${seconds} seconds${looping ? ', loops' : ''}${sound ? `, ${sound.name}` : ''}`;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={active}
        aria-label={label}
        title={`${name} · ${seconds}s${looping ? ' · loops' : ''}`}
        data-audio-clip={clip.id}
        onPointerDown={(e) => { begin(e, e.altKey ? 'slip' : 'move'); }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectAudio(clip.id); }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openClipMenu(e.clientX, e.clientY, e.currentTarget); }}
        className="absolute cursor-grab touch-none select-none overflow-hidden rounded-sm border"
        style={{
          top: row * AUDIO_ROW_PX + 4,
          height: AUDIO_ROW_PX - 8,
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

        {seams.map((at) => (
          <span
            key={at}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px"
            style={{ left: `${at * 100}%`, background: active ? 'var(--c-accent)' : 'var(--c-edge-strong)', opacity: 0.6 }}
          />
        ))}

        {waveform === null && (
          <span className="pointer-events-none absolute inset-0 truncate px-2 text-[10px] leading-[18px] text-ink-faint">
            {sound ? `Loading ${sound.name}…` : 'Decoding…'}
          </span>
        )}
        {/* Library sounds say which they are: a waveform alone does not. */}
        {waveform !== null && sound && (
          <span
            className="pointer-events-none absolute left-1.5 top-1/2 max-w-[calc(100%-12px)] -translate-y-1/2 truncate rounded-sm px-1 text-[9px] font-medium leading-[13px]"
            style={{
              color: active ? 'var(--c-accent)' : 'var(--c-ink-muted)',
              background: active ? 'var(--c-accent-soft)' : 'var(--c-panel-alt)',
            }}
          >
            {sound.name}{looping ? ' · loops' : ''}
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

      {/* A short sound effect is meant to be short; only music says so. */}
      {laneWidth > 0 && width < 3 && lane === 'music' && (
        <span className="pointer-events-none absolute right-2 text-[9px] leading-7 text-ink-faint" style={{ top: row * AUDIO_ROW_PX, height: AUDIO_ROW_PX }}>
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
