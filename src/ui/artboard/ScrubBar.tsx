import { useEffect, useState } from 'react';
import type { PreviewClock } from '@/core/time/clock';
import { hasNudgePoses, nudgePoses } from '@/core/render/slots';
import { spanOf } from '@/document/select/motion';
import * as actions from '@/document/actions';
import { useEditor } from '@/state/store';
import { MotionBar } from '@/ui/timeline/MotionBar';

/**
 * §1.1: showcase scrubs with a simple slider, not a track timeline.
 *
 * The readout samples the clock on an interval rather than subscribing per
 * frame — the artboard is a canvas and re-rendering React at 60fps to move a
 * slider thumb would cost more than the frame it is reporting on.
 */
const READOUT_HZ = 12;

export function ScrubBar({ clock }: { clock: PreviewClock }): React.JSX.Element {
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(clock.playing);

  useEffect(() => {
    const handle = setInterval(() => {
      setTimeMs(clock.timeMs);
      setPlaying(clock.playing);
    }, 1000 / READOUT_HZ);
    return () => { clearInterval(handle); };
  }, [clock]);

  const toggle = (): void => {
    if (clock.playing) clock.pause();
    else clock.play();
    setPlaying(clock.playing);
  };

  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-edge bg-panel px-3 py-2">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="w-16 rounded-md border border-edge px-2 py-1 text-[12px] hover:bg-panel-alt"
      >
        {playing ? 'Pause' : 'Play'}
      </button>

      {/*
        * The slider is Showcase's timeline, so the motion bar belongs on it.
        *
        * Showcase has no track timeline (§1.1) — which meant a motion added to
        * a template photo here had nowhere to show and could only be edited
        * through the panel. The same bar, against the same time axis, in the
        * one place this mode has for time.
        */}
      <div className="relative flex-1" data-lane>
        <input
          type="range"
          min={0}
          max={Math.max(1, clock.durationMs)}
          step={1}
          value={Math.round(timeMs)}
          onChange={(e) => {
            const next = Number(e.target.value);
            clock.seek(next);
            setTimeMs(next);
            setPlayhead(next);
          }}
          aria-label="Scrub"
          className="h-1 w-full accent-[var(--c-accent)]"
        />
        <ShowcaseMotion clock={clock} onSeek={(at) => { clock.pause(); clock.seek(at); setTimeMs(at); setPlayhead(at); }} />
      </div>

      <span className="tabular w-24 text-right text-[11px] text-ink-muted">
        {format(timeMs)} / {format(clock.durationMs)}
      </span>
    </div>
  );
}

function format(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const seconds = Math.floor(total);
  const hundredths = Math.floor((total - seconds) * 100);
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
  clock,
  onSeek,
}: {
  clock: PreviewClock;
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
      laneMs={Math.max(1, clock.durationMs)}
      onChange={(change) => {
        dispatch(actions.reshapeSlotMotion(selectedSlot, scene.durationMs, change));
      }}
      onCommit={endInteraction}
      onSeek={(atMs) => { onSeek(atMs * scale); }}
    />
  );
}
