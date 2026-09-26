/**
 * Motion as a *span*, not as a scatter of points.
 *
 * What people ask for, and what every tool they have used gives them, is a bar
 * on the timeline: it starts here, it ends there, drag the ends to change how
 * long it takes. Point keyframes are the general case underneath, and the
 * general case is the wrong thing to lead with — it makes the simple job (move
 * this from here to there over a couple of seconds) as much work as the hard
 * one.
 *
 * So the document keeps poses, which the renderer already understands, and
 * this is the lens that reads a pair of them as a span with a start, an end
 * and a length. Three or more poses is still a path, and the editor says so
 * rather than pretending the bar describes it.
 */

/** How long a new motion runs unless the element is shorter. */
export const DEFAULT_MOTION_MS = 5_000;

/** Nothing shorter than this is a motion anyone can see or grab. */
export const MIN_MOTION_MS = 300;

export type MotionSpan = {
  readonly startMs: number;
  readonly endMs: number;
  /** True when there are more than two poses, i.e. a path rather than a move. */
  readonly custom: boolean;
};

/** The span a list of pose times describes, or null when there is no motion. */
export function spanOf(times: readonly number[]): MotionSpan | null {
  if (times.length < 2) return null;
  const sorted = [...times].sort((a, b) => a - b);
  const startMs = sorted[0];
  const endMs = sorted[sorted.length - 1];
  if (startMs === undefined || endMs === undefined) return null;
  return { startMs, endMs, custom: times.length > 2 };
}

/**
 * Where a new motion should run, given where the playhead is.
 *
 * Five seconds by default, and it slides back rather than being cut short when
 * the playhead is near the end — a motion the length you asked for, placed as
 * late as it fits, is a better answer than a half-second one starting exactly
 * where you pointed.
 */
export function newSpan(atMs: number, limitMs: number): MotionSpan {
  const length = Math.min(DEFAULT_MOTION_MS, Math.max(MIN_MOTION_MS, limitMs));
  const startMs = Math.max(0, Math.min(atMs, limitMs - length));
  return { startMs, endMs: startMs + length, custom: false };
}

/** Slides a whole span, keeping its length, without leaving the element. */
export function movedSpan(span: MotionSpan, deltaMs: number, limitMs: number): MotionSpan {
  const length = span.endMs - span.startMs;
  const startMs = Math.max(0, Math.min(span.startMs + deltaMs, Math.max(0, limitMs - length)));
  return { ...span, startMs, endMs: startMs + length };
}

/** Drags one end, never past the other. */
export function resizedSpan(
  span: MotionSpan,
  edge: 'start' | 'end',
  toMs: number,
  limitMs: number,
): MotionSpan {
  if (edge === 'start') {
    const startMs = Math.max(0, Math.min(toMs, span.endMs - MIN_MOTION_MS));
    return { ...span, startMs };
  }
  const endMs = Math.min(limitMs, Math.max(toMs, span.startMs + MIN_MOTION_MS));
  return { ...span, endMs };
}
