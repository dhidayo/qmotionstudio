import { useEffect, useMemo, useRef, useState } from 'react';
import type { PreviewClock } from '@/core/time/clock';
import { useEditor } from '@/state/store';
import { sceneSpans, timelineSpanMs } from '@/document/select/timeline';
import { EFFECT_ROW_PX, EffectClipView, laneEffects, packEffectRows } from '@/ui/timeline/EffectRows';
import { MotionLane } from '@/ui/timeline/MotionLane';
import { AddBar } from '@/ui/editing/AddBar';
import { useClockFrames } from '@/ui/hooks/useClockFrames';
import { useClockEnded } from '@/ui/hooks/useClockEnded';
import { chosenMomentMs, restMomentMs } from '@/templates/restMoment';
import { setPictureMoment } from '@/document/actions';

/**
 * §1.1: showcase scrubs with a simple slider, not a track timeline.
 *
 * The thumb and the readout follow the clock frame by frame without
 * re-rendering React (D-112): written straight to the slider and the text, so
 * they move as smoothly as the picture and cost next to nothing.
 */

export function ScrubBar({
  clock,
  variant = 'full',
}: {
  clock: PreviewClock;
  /**
   * `phone` is the slider alone (D-109): the phone's transport line already
   * has play and the time, and its toolbar has Effects.
   */
  variant?: 'full' | 'phone';
}): React.JSX.Element {
  const phone = variant === 'phone';
  const setPlayhead = useEditor((s) => s.setPlayhead);
  /*
   * The length comes from the document, not from sampling the clock: paused,
   * nothing re-renders this, so a length read off the clock stayed stale after
   * a change of speed or design until something else happened to move.
   */
  const durationMs = useEditor((s) => timelineSpanMs(s.project));
  const [playing, setPlaying] = useState(clock.playing);
  const ended = useClockEnded(clock);
  // Where an image rests, and what Export → Image saves (D-155); null in a video.
  const pictureMs = useEditor((s) => restMomentMs(s.project));
  // A frame the person chose with "Use this frame" (D-163); null for the design's own.
  const chosenMs = useEditor((s) => chosenMomentMs(s.project));
  const dispatch = useEditor((s) => s.dispatch);
  /*
   * Paused on a frame that is not the picture, so "Use this frame" is
   * offered. Tracked here, with the thumb, rather than by re-rendering on
   * every frame of playback.
   */
  const [offPicture, setOffPicture] = useState(false);
  const shownOff = useRef(false);
  const shownPlaying = useRef(clock.playing);
  const range = useRef<HTMLInputElement>(null);
  const readout = useRef<HTMLSpanElement>(null);

  useClockFrames(clock, (timeMs, isPlaying) => {
    if (range.current) range.current.value = String(Math.round(timeMs));
    if (readout.current) readout.current.textContent = `${format(Math.min(timeMs, durationMs))} / ${format(durationMs)}`;
    if (isPlaying !== shownPlaying.current) {
      shownPlaying.current = isPlaying;
      setPlaying(isPlaying);
    }
    // The very start is not offered: most designs have not arrived there yet, and Export treats it as unchosen.
    const off = !isPlaying && pictureMs !== null && timeMs > 0 && Math.abs(timeMs - pictureMs) >= 1;
    if (off !== shownOff.current) {
      shownOff.current = off;
      setOffPicture(off);
    }
  });

  /** The frame on screen becomes the picture (D-163): where the design rests, and what Export → Image saves. */
  const useThisFrame = (): void => {
    const at = Math.max(0, Math.min(Math.round(clock.timeMs), Math.max(0, durationMs - 1)));
    dispatch(setPictureMoment(at));
  };
  const resetPicture = (): void => { dispatch(setPictureMoment(null)); };
  const frameButtons = pictureMs !== null && (offPicture || chosenMs !== null) ? (
    <FrameButtons
      offer={offPicture && !playing}
      chosen={chosenMs !== null}
      onUse={useThisFrame}
      onReset={resetPicture}
    />
  ) : null;

  const toggle = (): void => {
    if (clock.playing) clock.pause();
    else clock.play();
  };

  const scenes = useEditor((s) => s.project.scenes);
  const spans = useMemo(() => sceneSpans(scenes), [scenes]);
  const seek = (at: number): void => { clock.pause(); clock.seek(at); setPlayhead(at); };
  const slider = useRef<HTMLDivElement>(null);
  const sliderBox = useSliderBox(slider);

  return (
    <div className="shrink-0 border-t border-edge bg-panel">
      {/*
        * The one row of actions under the picture (D-162): play, the time,
        * then everything that can be done to the design — Choose a design,
        * + Photos, the rest of the add bar, Make a video — scrolled sideways
        * when it does not fit. A phone has its own transport and toolbar.
        */}
      {!phone && (
        <div className="flex items-center gap-2 border-b border-edge px-3 py-1.5" data-control-row>
          {/* Replay once an image has played and come to rest (D-155). */}
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? 'Pause' : ended ? 'Replay' : 'Play'}
            className="w-16 shrink-0 rounded-md border border-edge px-2 py-1 text-[12px] hover:bg-panel-alt"
          >
            {playing ? 'Pause' : ended ? 'Replay' : 'Play'}
          </button>
          <span ref={readout} className="tabular w-[5.5rem] shrink-0 text-[11px] text-ink-muted">
            {format(0)} / {format(durationMs)}
          </span>
          {frameButtons}
          <AddBar className="flex-1" />
        </div>
      )}

      {/*
        * The slider is Showcase's timeline (§1.1), the whole width under the
        * row of actions, so the motion bar belongs on it: a motion added to a
        * template photo here had nowhere else to show. The same bar, against
        * the same time axis, in the one place this mode has for time.
        */}
      <div className={phone ? 'px-3 py-2' : 'px-3 pb-2 pt-3.5'}>
        {/* min-w-0, or a range input's intrinsic width pushes a phone screen sideways. */}
        <div ref={slider} className="relative min-w-0" data-lane>
          <input
            type="range"
            min={0}
            max={Math.max(1, durationMs)}
            step={1}
            ref={range}
            defaultValue={0}
            onChange={(e) => {
              const next = Number(e.target.value);
              clock.seek(next);
              setPlayhead(next);
            }}
            aria-label="Scrub"
            // A phone's thumb needs something taller than a hairline to land on.
            className={`${phone ? 'h-7' : 'h-1'} w-full accent-[var(--c-accent)]`}
          />
          {pictureMs !== null && durationMs > 0 && (
            <PictureMark
              atMs={pictureMs}
              durationMs={durationMs}
              phone={phone}
              chosen={chosenMs !== null}
              onSeek={seek}
              onPreview={(at) => { clock.pause(); clock.seek(at); }}
              onChoose={(at) => { seek(at); dispatch(setPictureMoment(at)); }}
            />
          )}
          {/* Template elements and overlays alike (D-153), drawn only while they move. */}
          <MotionLane spans={spans} durationMs={durationMs} onSeek={seek} />
        </div>
      </div>
      {/* A phone has no row of actions, so the frame's buttons sit under the slider, only when they apply. */}
      {phone && frameButtons !== null && <div className="flex items-center gap-2 px-3 pb-2">{frameButtons}</div>}
      <EffectStrip durationMs={durationMs} onSeek={seek} phone={phone} under={sliderBox} />
    </div>
  );
}

/**
 * Where the slider sits in its row, so the effects under it line up with it
 * whatever the row's padding (D-153).
 */
function useSliderBox(slider: React.RefObject<HTMLDivElement | null>): { left: number; width: number } | null {
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const el = slider.current;
    const row = el?.parentElement;
    if (!el || !row) return undefined;
    const measure = (): void => {
      const left = Math.round(el.getBoundingClientRect().left - row.getBoundingClientRect().left);
      const width = Math.round(el.getBoundingClientRect().width);
      setBox((now) => (now?.left === left && now.width === width ? now : { left, width }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(row);
    return () => { observer.disconnect(); };
  }, [slider]);
  return box;
}

/**
 * Where this scene's effects sit in time, under the slider (D-100, D-106).
 *
 * Lifestyle has no track timeline (§1.1), so this is its effects lane: the
 * same clips as Corporate Ads' FX rows — drag to move, drag the dotted ends to
 * resize, right-click or hold for the menu — and overlapping effects stack on
 * rows of their own so each can be picked up.
 */
function EffectStrip({
  durationMs,
  onSeek,
  phone,
  under,
}: {
  durationMs: number;
  onSeek: (ms: number) => void;
  phone: boolean;
  /** The slider's place in the row above, to line up with; until measured, the full width. */
  under: { left: number; width: number } | null;
}): React.JSX.Element | null {
  const project = useEditor((s) => s.project);
  const rows = useMemo(
    () => packEffectRows(laneEffects(project, sceneSpans(project.scenes), durationMs)),
    [project, durationMs],
  );
  if (rows.length === 0 || durationMs <= 0) return null;

  return (
    // No label of its own: the slider now runs the full width, and each clip says what it is (✦ Snow) (D-162).
    <div className={`relative pb-2 ${under === null ? 'px-3' : ''} ${phone ? '' : '-mt-1'}`} aria-label="Effects in this scene">

      {/* One layer for every row, so a clip that changes row moves rather than being rebuilt mid-drag. */}
      <div
        className="relative"
        style={{
          height: rows.length * EFFECT_ROW_PX,
          ...(under === null ? {} : { marginLeft: under.left, width: under.width }),
        }}
        data-lane="true"
      >
        {rows.flatMap((row, r) => row.map((fx) => (
          <EffectClipView key={fx.clip.id} fx={fx} row={r} durationMs={durationMs} onSeek={onSeek} showScene={false} />
        )))}
      </div>
    </div>
  );
}

/**
 * "Use this frame" and "Reset" (D-163): "let the animation stop on a specific
 * image so that it can be the basis for export to JPG." Paused on a frame
 * that is not the picture, the first makes it the picture — the design plays
 * once and rests there, and Export → Image saves it. Once one is chosen,
 * Reset goes back to the design's own picture moment. Both are undoable and
 * saved with the project.
 */
function FrameButtons({
  offer,
  chosen,
  onUse,
  onReset,
}: {
  offer: boolean;
  chosen: boolean;
  onUse: () => void;
  onReset: () => void;
}): React.JSX.Element {
  return (
    <span className="flex shrink-0 items-center gap-1.5" data-frame-buttons>
      {offer && (
        <button
          type="button"
          data-use-frame
          onClick={onUse}
          title="Rest the design on this frame, and save it when you export an image"
          className="flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-accent bg-accent-soft px-2.5 text-[12px] font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-ink"
        >
          <span aria-hidden className="block size-2 rotate-45 rounded-[2px]" style={{ background: 'var(--c-accent)' }} />
          Use this frame
        </button>
      )}
      {chosen && (
        <button
          type="button"
          data-reset-frame
          onClick={onReset}
          title="Go back to the design’s own picture moment"
          className="flex h-7 shrink-0 items-center whitespace-nowrap rounded-md border border-edge-strong bg-panel px-2.5 text-[12px] font-medium text-ink transition-colors hover:border-accent hover:bg-accent-soft"
        >
          Reset frame
        </button>
      )}
    </span>
  );
}

/**
 * The picture moment, marked on the slider (D-155): where the image comes to
 * rest once it has played, and the frame Export → Image saves unless you pause
 * on another. Pressing it goes there; dragging it chooses another moment,
 * showing each frame on the way (D-163). A chosen moment is drawn solid, the
 * design's own as an outline.
 */
function PictureMark({
  atMs,
  durationMs,
  phone,
  chosen,
  onSeek,
  onPreview,
  onChoose,
}: {
  atMs: number;
  durationMs: number;
  phone: boolean;
  chosen: boolean;
  onSeek: (ms: number) => void;
  /** Shows a frame while the mark is dragged, without choosing it yet. */
  onPreview: (ms: number) => void;
  /** The mark was dropped here: this is the picture now. */
  onChoose: (ms: number) => void;
}): React.JSX.Element {
  const [dragMs, setDragMs] = useState<number | null>(null);
  const drag = useRef<{ startX: number; moved: boolean } | null>(null);
  // A drag ends in a click too; it must not then jump back to the old moment.
  const dragged = useRef(false);
  const shown = dragMs ?? atMs;
  const share = Math.max(0, Math.min(1, shown / durationMs));

  const msAt = (target: HTMLElement, clientX: number): number => {
    const lane = target.parentElement?.getBoundingClientRect();
    if (!lane || lane.width <= 16) return atMs;
    const along = Math.max(0, Math.min(1, (clientX - lane.left - 8) / (lane.width - 16)));
    return Math.max(0, Math.min(durationMs - 1, Math.round(along * durationMs)));
  };

  return (
    <button
      type="button"
      data-picture-mark={chosen ? 'chosen' : 'design'}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startX: event.clientX, moved: false };
      }}
      onPointerMove={(event) => {
        const state = drag.current;
        if (!state) return;
        if (!state.moved && Math.abs(event.clientX - state.startX) < 3) return;
        state.moved = true;
        const at = msAt(event.currentTarget, event.clientX);
        setDragMs(at);
        onPreview(at);
      }}
      onPointerUp={(event) => {
        const state = drag.current;
        drag.current = null;
        dragged.current = state?.moved === true;
        if (state?.moved) onChoose(msAt(event.currentTarget, event.clientX));
        setDragMs(null);
      }}
      onPointerCancel={() => { drag.current = null; setDragMs(null); }}
      onClick={() => {
        if (dragged.current) { dragged.current = false; return; }
        onSeek(atMs);
      }}
      aria-label={`Go to the picture moment, ${format(atMs)}${chosen ? ', the frame you chose' : ''}`}
      title={chosen
        ? 'Your chosen picture: where the design rests, and what Export → Image saves. Drag to choose another.'
        : 'The picture: where the design rests, and what Export → Image saves. Drag to choose another.'}
      className={`absolute grid -translate-x-1/2 cursor-ew-resize touch-none place-items-center ${phone ? '-top-3 size-6' : '-top-3 size-4'}`}
      // The thumb's centre travels the track less one thumb's width.
      style={{ left: `calc(8px + (100% - 16px) * ${share})` }}
    >
      <span
        aria-hidden
        className="block size-2.5 rotate-45 rounded-[2px] border-2"
        style={{ borderColor: 'var(--c-accent)', background: chosen ? 'var(--c-accent)' : 'var(--c-panel)' }}
      />
    </button>
  );
}

function format(ms: number): string {
  // In whole hundredths, so 2400ms — a picture moment — reads 2.40s, not 2.39s (D-155).
  const total = Math.floor(Math.max(0, ms) / 10);
  const seconds = Math.floor(total / 100);
  const hundredths = total % 100;
  return `${seconds}.${hundredths.toString().padStart(2, '0')}s`;
}
