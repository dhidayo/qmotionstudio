import type { Overlay } from '@/document/types';
import type { SceneSpan } from '@/document/select/timeline';
import * as actions from '@/document/actions';
import { posesOf } from '@/document/select/overlay';
import { nudgePoses } from '@/core/render/slots';
import { spanOf } from '@/document/select/motion';
import { useEditor } from '@/state/store';
import { MotionBar } from './MotionBar';

/**
 * Whatever is selected, and what its motion is doing.
 *
 * An overlay, a template photograph and a block of template text are three
 * different things in the document and exactly the same thing here —
 * something with a span of time attached — so they share one bar.
 *
 * There is no Motion row any more (D-162): "I would also no specialized rows
 * for items that can stack somewhere else". On the timeline a moving layer's
 * bar is drawn on its own clip while it is selected, and a moving template
 * element's on its scene's clip (`OverlayMotionBar`, `SlotMotionBar`). An
 * image has a slider rather than a timeline, and `MotionLane` draws the
 * selection's bar on that.
 */
export function MotionLane({
  spans,
  durationMs,
  onSeek,
}: {
  spans: readonly SceneSpan[];
  durationMs: number;
  onSeek: (projectMs: number) => void;
}): React.JSX.Element | null {
  const overlay = useEditor((s) => s.project.overlays.find((o) => o.id === s.selectedOverlay) ?? null);
  const selectedSlot = useEditor((s) => s.selectedSlot);

  if (overlay) return <OverlayMotionBar overlay={overlay} durationMs={durationMs} onSeek={onSeek} />;
  if (selectedSlot !== null) {
    return <SlotMotionBar slotKey={selectedSlot} spans={spans} durationMs={durationMs} onSeek={onSeek} />;
  }
  return null;
}

/**
 * The selected template element's motion, or nothing while it does not move.
 *
 * Times are in the scene's own clock, after §8.4's speed remap, so they have to
 * be mapped back out to the project's before anything is drawn — a scene played
 * at half speed spreads its motion over twice as much timeline.
 */
export function SlotMotionBar({
  slotKey,
  spans,
  durationMs,
  onSeek,
  fill = false,
}: {
  slotKey: string;
  spans: readonly SceneSpan[];
  durationMs: number;
  onSeek: (projectMs: number) => void;
  /** Fills the strip it is drawn in: on the scene's clip (D-162). */
  fill?: boolean;
}): React.JSX.Element | null {
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const selectedScene = useEditor((s) => s.selectedScene);
  const transform = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.slotTransforms[slotKey]);

  const sceneSpan = spans[selectedScene];
  if (!sceneSpan) return null;

  const speed = sceneSpan.scene.inputs.look.speed;
  const scale = speed === 0 ? 1 : 1 / speed;
  const sceneMs = sceneSpan.scene.durationMs;

  const times = transform ? nudgePoses(transform).map((pose) => pose.atMs) : [];
  const span = spanOf(times);
  if (!span) return null;

  return (
    <MotionBar
      span={span}
      poseTimes={times}
      originMs={sceneSpan.startMs}
      scale={scale}
      laneMs={Math.max(1, durationMs)}
      onChange={(change) => { dispatch(actions.reshapeSlotMotion(slotKey, sceneMs, change)); }}
      onCommit={endInteraction}
      onSeek={(atMs) => { onSeek(sceneSpan.startMs + Math.min(atMs, sceneMs - 1) * scale); }}
      fill={fill}
    />
  );
}

/**
 * An overlay's motion, or nothing while it does not move.
 *
 * Times are the overlay's own (§6.1), so dragging the clip along the timeline
 * takes the motion with it and the bar follows on the next render.
 */
export function OverlayMotionBar({
  overlay,
  durationMs,
  onSeek,
  fill = false,
}: {
  overlay: Overlay;
  durationMs: number;
  onSeek: (projectMs: number) => void;
  /** Fills the strip it is drawn in: on the layer's own clip (D-162). */
  fill?: boolean;
}): React.JSX.Element | null {
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);

  const spanMs = Math.max(1, overlay.endMs - overlay.startMs);
  const times = posesOf(overlay).map((pose) => pose.atMs);
  const span = spanOf(times);
  if (!span) return null;

  return (
    <MotionBar
      span={span}
      poseTimes={times}
      originMs={overlay.startMs}
      scale={1}
      laneMs={Math.max(1, durationMs)}
      onChange={(change) => { dispatch(actions.reshapeOverlayMotion(overlay.id, change)); }}
      onCommit={endInteraction}
      /*
       * Never the exact end: a layer's range is half-open, so the instant a
       * motion finishes is the first instant the overlay is gone, and standing
       * there leaves nothing on screen to drag.
       */
      onSeek={(atMs) => { onSeek(overlay.startMs + Math.min(atMs, spanMs - 1)); }}
      fill={fill}
    />
  );
}
