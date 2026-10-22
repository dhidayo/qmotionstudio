import { useMemo, useRef, useState } from 'react';
import type { PreviewClock } from '@/core/time/clock';
import { hasNudgePoses, nudgePoses } from '@/core/render/slots';
import { spanOf } from '@/document/select/motion';
import * as actions from '@/document/actions';
import { useEditor } from '@/state/store';
import { MotionBar } from '@/ui/timeline/MotionBar';
import { sceneSpans, timelineSpanMs } from '@/document/select/timeline';
import { EFFECT_ROW_PX, EffectClipView, laneEffects, packEffectRows } from '@/ui/timeline/EffectRows';
import { useOverlays } from '@/ui/shell/overlays';
import { useClockFrames } from '@/ui/hooks/useClockFrames';
import { useClockEnded } from '@/ui/hooks/useClockEnded';
import { continueAsVideo } from '@/ui/editing/commands';
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

  const openPicker = useOverlays((o) => o.openPicker);
  const seek = (at: number): void => { clock.pause(); clock.seek(at); setPlayhead(at); };

  return (
    <div className="shrink-0 border-t border-edge bg-panel">
      <div className="flex items-center gap-3 px-3 py-2">
        {/* Replay once an image has played and come to rest (D-155). */}
        {!phone && <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause' : ended ? 'Replay' : 'Play'}
          className="w-16 rounded-md border border-edge px-2 py-1 text-[12px] hover:bg-panel-alt"
        >
          {playing ? 'Pause' : ended ? 'Replay' : 'Play'}
        </button>}

        {/*
          * The slider is Showcase's timeline, so the motion bar belongs on it.
          *
          * Showcase has no track timeline (§1.1) — which meant a motion added to
          * a template photo here had nowhere to show and could only be edited
          * through the panel. The same bar, against the same time axis, in the
          * one place this mode has for time.
          */}
        {/* min-w-0, or a range input's intrinsic width pushes a phone screen sideways. */}
        <div className="relative min-w-0 flex-1" data-lane>
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
          <ShowcaseMotion durationMs={durationMs} onSeek={seek} />
        </div>

        {!phone && <span ref={readout} className="tabular w-20 shrink-0 text-right text-[11px] text-ink-muted sm:w-24">
          {format(0)} / {format(durationMs)}
        </span>}
        {!phone && <button
          type="button"
          onClick={() => { openPicker({ target: { kind: 'scene' } }); }}
          title="Add an effect — snow, sparkles, light, a shake, a film look…"
          aria-label="Add an effect"
          className="shrink-0 rounded-md border border-edge px-2 py-1 text-[11px] text-ink-muted hover:bg-panel-alt"
        >
          + <span className="hidden sm:inline">Effect</span><span className="sm:hidden">FX</span>
        </button>}
        {!phone && <button
          type="button"
          data-continue-video
          onClick={continueAsVideo}
          title="This image becomes scene 1 of a video, animated, and you pick what comes next"
          className="shrink-0 whitespace-nowrap rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-accent-ink hover:bg-accent-hover"
        >
          Make a video
        </button>}
      </div>
      <EffectStrip durationMs={durationMs} onSeek={seek} phone={phone} />
    </div>
  );
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
}: {
  durationMs: number;
  onSeek: (ms: number) => void;
  phone: boolean;
}): React.JSX.Element | null {
  const project = useEditor((s) => s.project);
  const rows = useMemo(
    () => packEffectRows(laneEffects(project, sceneSpans(project.scenes), durationMs)),
    [project, durationMs],
  );
  if (rows.length === 0 || durationMs <= 0) return null;

  return (
    <div className="flex gap-3 px-3 pb-2" aria-label="Effects in this scene">
      {!phone && <span className="w-16 shrink-0 pt-1.5 text-[10px] uppercase tracking-wide text-ink-faint">Effects</span>}
      {/* One layer for every row, so a clip that changes row moves rather than being rebuilt mid-drag. */}
      <div className="relative min-w-0 flex-1" style={{ height: rows.length * EFFECT_ROW_PX }} data-lane="true">
        {rows.flatMap((row, r) => row.map((fx) => (
          <EffectClipView key={fx.clip.id} fx={fx} row={r} durationMs={durationMs} onSeek={onSeek} showScene={false} />
        )))}
      </div>
      {!phone && <span className="w-20 shrink-0 sm:w-24" />}
      {!phone && <span className="w-[42px] shrink-0 sm:w-[58px]" />}
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

/**
 * The selected element's motion, over Showcase's scrubber.
 *
 * Showcase is a single scene, so the scene's clock and the project's are the
 * same one — no origin to offset by, and the speed remap is the only
 * conversion. That is why this is a few lines where the timeline's equivalent
 * needs a scene span to position against.
 */
function ShowcaseMotion({
  durationMs,
  onSeek,
}: {
  durationMs: number;
  onSeek: (projectMs: number) => void;
}): React.JSX.Element | null {
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const selectedSlot = useEditor((s) => s.selectedSlot);
  const scene = useEditor((s) => s.project.scenes[s.selectedScene]);
  const transform = useEditor((s) =>
    selectedSlot === null
      ? undefined
      : s.project.scenes[s.selectedScene]?.inputs.slotTransforms[selectedSlot],
  );

  if (selectedSlot === null || !scene || !transform || !hasNudgePoses(transform)) return null;

  const times = nudgePoses(transform).map((pose) => pose.atMs);
  const span = spanOf(times);
  if (!span) return null;

  const speed = scene.inputs.look.speed;
  const scale = speed === 0 ? 1 : 1 / speed;

  return (
    <MotionBar
      span={span}
      poseTimes={times}
      originMs={0}
      scale={scale}
      laneMs={Math.max(1, durationMs)}
      onChange={(change) => {
        dispatch(actions.reshapeSlotMotion(selectedSlot, scene.durationMs, change));
      }}
      onCommit={endInteraction}
      onSeek={(atMs) => { onSeek(atMs * scale); }}
    />
  );
}
