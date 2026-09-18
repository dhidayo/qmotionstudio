import { useEffect, useState } from 'react';
import type { RenderRig } from '@/core/render/rig';

/**
 * §14's dev-only performance overlay.
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

export function PerfOverlay({ rig }: { rig: RenderRig }): React.JSX.Element | null {
  const [stats, setStats] = useState({ fps: 0, frameMs: 0, buildMs: 0, heap: heapMb() });

  useEffect(() => {
    let lastCount = rig.stats.frameCount;
    let lastAt = performance.now();

    const handle = setInterval(() => {
      const now = performance.now();
      const frames = rig.stats.frameCount - lastCount;
      const elapsed = now - lastAt;
      lastCount = rig.stats.frameCount;
      lastAt = now;

      setStats({
        fps: elapsed > 0 ? (frames * 1000) / elapsed : 0,
        frameMs: rig.stats.lastFrameMs,
        buildMs: rig.stats.lastBuildMs,
        heap: heapMb(),
      });
    }, 500);

    return () => { clearInterval(handle); };
  }, [rig]);

  if (!import.meta.env.DEV) return null;

  return (
    <div
      className="tabular pointer-events-none absolute left-3 top-3 rounded-md px-2 py-1.5 text-[10px] leading-snug"
      style={{
        background: 'color-mix(in srgb, var(--c-panel) 82%, transparent)',
        border: '1px solid var(--c-edge)',
        color: 'var(--c-ink-muted)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <Row label="fps" value={stats.fps.toFixed(0)} warn={stats.fps < 30} />
      <Row label="frame" value={`${stats.frameMs.toFixed(2)}ms`} warn={stats.frameMs > 16} />
      <Row label="build" value={`${stats.buildMs.toFixed(2)}ms`} warn={stats.buildMs > 16} />
      {stats.heap !== null && <Row label="heap" value={`${stats.heap.toFixed(0)}MB`} warn={stats.heap > 900} />}
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
