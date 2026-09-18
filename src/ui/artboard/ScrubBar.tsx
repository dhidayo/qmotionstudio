import { useEffect, useState } from 'react';
import type { PreviewClock } from '@/core/time/clock';

/**
 * §1.1: showcase scrubs with a simple slider, not a track timeline.
 *
 * The readout samples the clock on an interval rather than subscribing per
 * frame — the artboard is a canvas and re-rendering React at 60fps to move a
 * slider thumb would cost more than the frame it is reporting on.
 */
const READOUT_HZ = 12;

export function ScrubBar({ clock }: { clock: PreviewClock }): React.JSX.Element {
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
        }}
        aria-label="Scrub"
        className="h-1 flex-1 accent-[var(--c-accent)]"
      />

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
