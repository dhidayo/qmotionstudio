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
 * One lane for all of them. An overlay, a template photograph and a block of
 * template text are three different things in the document and exactly the same
 * thing here — something with a span of time attached — so giving each its own
 * row would be three rows of which two are always empty.
 *
 * The lane used to hold the way in, "+ Motion", and so had to be on screen
 * all the time. "+ Motion" is in the add bar now with everything else that can
 * be added (D-153), and the lane is a row like the others: there once
 * something moves, with a word on it when the selection does not. `quiet`
 * draws the bar and nothing else, for the slider a design has instead of a
 * timeline.
 */
export function MotionLane({
  spans,
  durationMs,
  onSeek,
  quiet = false,
}: {
  spans: readonly SceneSpan[];
  durationMs: number;
  onSeek: (projectMs: number) => void;
  quiet?: boolean;
}): React.JSX.Element | null {
  const overlay = useEditor((s) => s.project.overlays.find((o) => o.id === s.selectedOverlay) ?? null);
  const selectedSlot = useEditor((s) => s.selectedSlot);

  const note = (text: string): React.JSX.Element | null => (quiet ? null : <LaneNote>{text}</LaneNote>);
  if (overlay) return <OverlayMotion overlay={overlay} durationMs={durationMs} onSeek={onSeek} note={note} />;
  if (selectedSlot !== null) {
    return <SlotMotion slotKey={selectedSlot} spans={spans} durationMs={durationMs} onSeek={onSeek} note={note} />;
  }
  return note('Select something that moves to change when it moves.');
}

const STILL = 'This does not move. “+ Motion” above gives it a motion.';

function LaneNote({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[10px] text-ink-faint">
      {children}
    </span>
  );
}

/**
 * The selected template element's motion.
 *
 * Times are in the scene's own clock, after §8.4's speed remap, so they have to
 * be mapped back out to the project's before anything is drawn — a scene played
 * at half speed spreads its motion over twice as much timeline.
 */
function SlotMotion({
  slotKey,
  spans,
  durationMs,
  onSeek,
  note,
}: {
  slotKey: string;
  spans: readonly SceneSpan[];
  durationMs: number;
  onSeek: (projectMs: number) => void;
  note: (text: string) => React.JSX.Element | null;
}): React.JSX.Element | null {
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const selectedScene = useEditor((s) => s.selectedScene);
  const transform = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.slotTransforms[slotKey]);

  const sceneSpan = spans[selectedScene];
  if (!sceneSpan) return note('No scene selected.');

  const speed = sceneSpan.scene.inputs.look.speed;
  const scale = speed === 0 ? 1 : 1 / speed;
  const sceneMs = sceneSpan.scene.durationMs;

  const times = transform ? nudgePoses(transform).map((pose) => pose.atMs) : [];
  const span = spanOf(times);
  if (!span) return note(STILL);

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
    />
  );
}

/**
 * An overlay's motion.
 *
 * Times are the overlay's own (§6.1), so dragging the clip along the timeline
 * takes the motion with it and the bar follows on the next render.
 */
function OverlayMotion({
  overlay,
  durationMs,
  onSeek,
  note,
}: {
  overlay: Overlay;
  durationMs: number;
  onSeek: (projectMs: number) => void;
  note: (text: string) => React.JSX.Element | null;
}): React.JSX.Element | null {
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);

  const spanMs = Math.max(1, overlay.endMs - overlay.startMs);
  const times = posesOf(overlay).map((pose) => pose.atMs);
  const span = spanOf(times);
  if (!span) return note(STILL);

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
    />
  );
}
