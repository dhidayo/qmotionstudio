import { useEffect, useState } from 'react';
import type { PreviewClock } from '@/core/time/clock';
import { hasNudgePoses, nudgePoses } from '@/core/render/slots';
import { spanOf } from '@/document/select/motion';
import * as actions from '@/document/actions';
import { useEditor } from '@/state/store';
import { MotionBar } from '@/ui/timeline/MotionBar';
import { effectName } from '@/core/effects/catalog';
import { useOverlays } from '@/ui/shell/overlays';

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

  const openPicker = useOverlays((o) => o.openPicker);
  const seek = (at: number): void => { clock.pause(); clock.seek(at); setTimeMs(at); setPlayhead(at); };

  return (
    <div className="shrink-0 border-t border-edge bg-panel">
      <div className="flex items-center gap-3 px-3 py-2">
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
        {/* min-w-0, or a range input's intrinsic width pushes a phone screen sideways. */}
        <div className="relative min-w-0 flex-1" data-lane>
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

        <span className="tabular w-20 shrink-0 text-right text-[11px] text-ink-muted sm:w-24">
          {format(timeMs)} / {format(clock.durationMs)}
        </span>
        <button
          type="button"
          onClick={() => { openPicker({ target: { kind: 'scene' } }); }}
          title="Add an effect — snow, sparkles, light, a shake, a film look…"
          aria-label="Add an effect"
          className="shrink-0 rounded-md border border-edge px-2 py-1 text-[11px] text-ink-muted hover:bg-panel-alt"
        >
          + <span className="hidden sm:inline">Effect</span><span className="sm:hidden">FX</span>
        </button>
      </div>
      <EffectStrip durationMs={clock.durationMs} onSeek={seek} />
    </div>
  );
}

/**
 * Where this scene's effects sit in time, under the slider (D-100).
 *
 * Lifestyle has no track timeline (§1.1), so without this an effect placed at
 * a moment — a flash on the beat, a burst of confetti — could only be found by
 * reading the panel. Clicking one takes the playhead there and opens Motion,
 * where it is edited.
 */
function EffectStrip({ durationMs, onSeek }: { durationMs: number; onSeek: (ms: number) => void }): React.JSX.Element | null {
  const effects = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.effects);
  const setTab = useEditor((s) => s.setInspectorTab);
  if (!effects || effects.length === 0 || durationMs <= 0) return null;
  const pct = (ms: number): number => Math.max(0, Math.min(100, (ms / durationMs) * 100));

  return (
    <div className="flex items-center gap-3 px-3 pb-2">
      <span className="w-16 text-[10px] uppercase tracking-wide text-ink-faint">Effects</span>
      <div className="relative h-5 flex-1" aria-label="Effects in this scene">
        {effects.map((clip, i) => (
          <button
            key={clip.id}
            type="button"
            data-scene-fx={clip.effectId}
            onClick={() => { onSeek(clip.startMs); setTab('motion'); }}
            title={`${effectName(clip.effectId)} · ${format(clip.startMs)} – ${format(Math.min(clip.endMs, durationMs))}`}
            className="absolute truncate rounded-sm border px-1 text-left text-[9px] leading-[14px]"
            style={{
              left: `${pct(clip.startMs)}%`,
              width: `${Math.max(2, pct(clip.endMs) - pct(clip.startMs))}%`,
              top: (i % 2) * 6,
              borderColor: 'color-mix(in srgb, var(--c-pro) 45%, var(--c-edge-strong))',
              background: 'color-mix(in srgb, var(--c-pro-soft) 70%, var(--c-panel-alt))',
              color: 'var(--c-ink-muted)',
            }}
          >
            ✦ {effectName(clip.effectId)}
          </button>
        ))}
      </div>
      <span className="w-20 shrink-0 sm:w-24" />
      <span className="w-[42px] shrink-0 sm:w-[58px]" />
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
