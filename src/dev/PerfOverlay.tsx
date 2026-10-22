import { useEffect, useState } from 'react';
import type { RenderRig } from '@/core/render/rig';

/**
 * §14's performance overlay: in development, and with `?perf=1` in a
 * production build so the owner can read the numbers off their own screen
 * (D-154). The shell decides whether it mounts at all, so a build without the
 * parameter runs no timer for it.
 *
 * Every figure is over the last half second, not the last frame: one slow
 * frame says little, and a readout that jumps every frame cannot be read.
 *
 * No backdrop blur behind it. It sits over the playing picture, and a blur
 * there is redone every frame, which made the development build look slower
 * than the code it was measuring.
 *
 * Heap is Chrome-only: performance.memory is non-standard, and the standard
 * replacement (measureUserAgentSpecificMemory) needs cross-origin isolation,
 * which nothing else in this app requires. Shown where available, omitted
 * elsewhere rather than adding COOP/COEP headers for a dev readout.
 */
type ChromeMemory = { usedJSHeapSize: number };

function heapMb(): number | null {
  const perf: unknown = globalThis.performance;
  if (typeof perf !== 'object' || perf === null || !('memory' in perf)) return null;
  const memory = (perf as { memory?: ChromeMemory }).memory;
  if (!memory || typeof memory.usedJSHeapSize !== 'number') return null;
  return memory.usedJSHeapSize / 1024 / 1024;
}

type Readout = {
  readonly fps: number;
  /** Mean time inside renderFrame per drawn frame. */
  readonly frameMs: number;
  /** Share of frames that arrived late while playing, or null while paused. */
  readonly dropped: number | null;
  readonly backing: string;
  readonly buildMs: number;
  readonly heap: number | null;
};

const EMPTY: Readout = { fps: 0, frameMs: 0, dropped: null, backing: '–', buildMs: 0, heap: null };

export function PerfOverlay({ rig }: { rig: RenderRig }): React.JSX.Element {
  const [readout, setReadout] = useState<Readout>(EMPTY);

  useEffect(() => {
    const stats = rig.stats;
    let last = { at: performance.now(), frames: stats.frameCount, ms: stats.frameMsTotal, played: stats.playedFrames, dropped: stats.droppedFrames };

    const handle = setInterval(() => {
      const now = { at: performance.now(), frames: stats.frameCount, ms: stats.frameMsTotal, played: stats.playedFrames, dropped: stats.droppedFrames };
      const frames = now.frames - last.frames;
      const elapsed = now.at - last.at;
      const played = now.played - last.played;
      setReadout({
        fps: elapsed > 0 ? (frames * 1000) / elapsed : 0,
        frameMs: frames > 0 ? (now.ms - last.ms) / frames : 0,
        dropped: played > 0 ? (now.dropped - last.dropped) / played : null,
        backing: stats.backingW > 0 ? `${String(stats.backingW)}×${String(stats.backingH)}` : '–',
        buildMs: stats.lastBuildMs,
        heap: heapMb(),
      });
      last = now;
    }, 500);

    return () => { clearInterval(handle); };
  }, [rig]);

  return (
    <div
      data-perf-overlay
      className="tabular pointer-events-none absolute left-3 top-3 rounded-md px-2 py-1.5 text-[10px] leading-snug"
      style={{
        background: 'color-mix(in srgb, var(--c-panel) 92%, transparent)',
        border: '1px solid var(--c-edge)',
        color: 'var(--c-ink-muted)',
      }}
    >
      {/* Paused, a picture that has not changed is not redrawn, so a low count then is right. */}
      <Row label="fps" value={readout.fps.toFixed(0)} warn={readout.dropped !== null && readout.fps < 30} />
      <Row label="frame" value={`${readout.frameMs.toFixed(2)}ms`} warn={readout.frameMs > 16} />
      <Row label="late" value={readout.dropped === null ? '–' : `${(readout.dropped * 100).toFixed(0)}%`} warn={readout.dropped !== null && readout.dropped > 0.1} />
      <Row label="size" value={readout.backing} warn={false} />
      <Row label="build" value={`${readout.buildMs.toFixed(2)}ms`} warn={readout.buildMs > 16} />
      {readout.heap !== null && <Row label="heap" value={`${readout.heap.toFixed(0)}MB`} warn={readout.heap > 900} />}
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn: boolean }): React.JSX.Element {
  return (
    <div className="flex gap-2">
      <span className="w-9 text-ink-faint">{label}</span>
      <span style={warn ? { color: 'var(--c-danger)', fontWeight: 600 } : undefined}>{value}</span>
    </div>
  );
}
