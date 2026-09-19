import { useCallback, useRef } from 'react';
import type { AudioClip } from '@/document/types';
import { clipDurationMs, gainAt, resolvedFades } from '@/core/audio/envelope';
import { peakAt } from '@/media/audio/waveform';
import * as actions from '@/document/actions';
import { useEditor } from '@/state/store';
import { useMediaRevision, useMediaStore } from '@/ui/media/MediaProvider';
import { dragResult, msToPct, pxToMs, snap, type ClipDrag } from './timelineGeometry';

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

export function MusicTrack({
  clip,
  durationMs,
  laneWidth,
}: {
  clip: AudioClip | undefined;
  durationMs: number;
  laneWidth: number;
}): React.JSX.Element {
  const media = useMediaStore();
  useMediaRevision();
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const selectedAudio = useEditor((s) => s.selectedAudio);
  const selectAudio = useEditor((s) => s.selectAudio);

  const dragRef = useRef<ClipDrag | null>(null);

  const laneMs = useCallback(
    (clientX: number, element: HTMLElement): number => {
      const lane = element.closest('[data-lane]');
      if (!lane) return 0;
      const box = lane.getBoundingClientRect();
      return pxToMs(clientX - box.left, box.width, durationMs);
    },
    [durationMs],
  );

  if (!clip) {
    return (
      <div className="relative h-7 border-b border-edge">
        <span className="absolute inset-y-0 left-2 text-[10px] leading-7 text-ink-faint">
          No music. Use “+ Music” above.
        </span>
      </div>
    );
  }

  const sourceMs = media.durationMsOf(clip.mediaId);
  const waveform = media.getWaveform(clip.mediaId);
  const length = clipDurationMs(clip);
  const left = msToPct(clip.startMs, durationMs);
  const width = Math.max(1.2, msToPct(clip.startMs + length, durationMs) - left);
  const active = selectedAudio === clip.id;

  const begin = (event: React.PointerEvent<HTMLElement>, mode: ClipDrag['mode']): void => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    selectAudio(clip.id);
    dragRef.current = {
      mode,
      id: clip.id,
      startMs: clip.startMs,
      endMs: clip.startMs + length,
      pointerMs: laneMs(event.clientX, event.currentTarget),
    };
  };

  const move = (event: React.PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (!drag || event.buttons === 0) return;

    const next = dragResult(drag, laneMs(event.clientX, event.currentTarget), {
      durationMs,
      minLengthMs: MIN_CLIP_MS,
    });
    const free = event.altKey;

    if (drag.mode === 'move') {
      dispatch(actions.setAudioStart(clip.id, snap(next.startMs, SNAP_MS, free)));
      return;
    }

    /*
     * Trimming moves the window into the *source*, not the clip's place on the
     * timeline. Dragging the left edge right therefore does two things at
     * once: it starts the clip later and it skips further into the track, so
     * the audio under the cursor stays put.
     */
    if (!sourceMs) return;

    if (drag.mode === 'trimStart') {
      const delta = snap(next.startMs, SNAP_MS, free) - clip.startMs;
      dispatch(actions.setAudioTrim(clip.id, { trimStartMs: clip.trimStartMs + delta }, sourceMs));
      dispatch(actions.setAudioStart(clip.id, clip.startMs + delta));
      return;
    }

    const delta = snap(next.endMs, SNAP_MS, free) - (clip.startMs + length);
    dispatch(actions.setAudioTrim(clip.id, { trimEndMs: clip.trimEndMs + delta }, sourceMs));
  };

  const end = (): void => {
    if (!dragRef.current) return;
    dragRef.current = null;
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
    <div className="relative h-7 border-b border-edge" data-lane>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={active}
        aria-label={`Music clip, ${(length / 1000).toFixed(1)} seconds`}
        title={`${media.get(clip.mediaId)?.name ?? clip.mediaId} · ${(length / 1000).toFixed(1)}s`}
        onPointerDown={(e) => { begin(e, 'move'); }}
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
    </div>
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
  onUp: () => void;
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
