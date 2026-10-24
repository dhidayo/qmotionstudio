import { useEffect, useMemo, useRef, useState } from 'react';
import type { PreviewClock } from '@/core/time/clock';
import { useEditor } from '@/state/store';
import { sceneSpans, timelineSpanMs } from '@/document/select/timeline';
import { EFFECT_ROW_PX, EffectClipView, laneEffects, packEffectRows } from '@/ui/timeline/EffectRows';
import { MotionLane } from '@/ui/timeline/MotionLane';
import { AddBar } from '@/ui/editing/AddBar';
import { useClockFrames } from '@/ui/hooks/useClockFrames';
import { useClockEnded } from '@/ui/hooks/useClockEnded';
import { restMomentMs } from '@/templates/restMoment';

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
  });

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
            <PictureMark atMs={pictureMs} durationMs={durationMs} phone={phone} onSeek={seek} />
          )}
          {/* Template elements and overlays alike (D-153), drawn only while they move. */}
          <MotionLane spans={spans} durationMs={durationMs} onSeek={seek} />
        </div>
      </div>
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
 * The picture moment, marked on the slider (D-155): where the image comes to
 * rest once it has played, and the frame Export → Image saves unless you pause
 * on another. Pressing it goes there.
 */
function PictureMark({
  atMs,
  durationMs,
  phone,
  onSeek,
}: {
  atMs: number;
  durationMs: number;
  phone: boolean;
  onSeek: (ms: number) => void;
}): React.JSX.Element {
  const share = Math.max(0, Math.min(1, atMs / durationMs));
  return (
    <button
      type="button"
      data-picture-mark
      onClick={() => { onSeek(atMs); }}
      aria-label={`Go to the picture moment, ${format(atMs)}`}
      title="The picture: where the design rests, and what Export → Image saves"
      className={`absolute grid -translate-x-1/2 place-items-center ${phone ? '-top-3 size-5' : '-top-3 size-4'}`}
      // The thumb's centre travels the track less one thumb's width.
      style={{ left: `calc(8px + (100% - 16px) * ${share})` }}
    >
      <span aria-hidden className="block size-2 rotate-45 rounded-[2px]" style={{ background: 'var(--c-accent)' }} />
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
