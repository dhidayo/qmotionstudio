/**
 * Which frame Export → Image saves (D-155): the one on screen.
 *
 * An image rests on its picture moment once it has played (see
 * `templates/restMoment.ts`), so the frame on screen is normally that one.
 * Paused somewhere else — the person scrubbed to a frame they like better —
 * the frame they paused on is the picture. While it is still playing, or
 * parked at the very start (where most designs have not arrived yet), there
 * is no frame they have chosen, and the picture moment is used.
 */
export type PictureMoment = {
  /** On the project clock, in ms. */
  readonly atMs: number;
  /** 'rest' is the design's own picture moment; 'paused' is a frame the person stopped on. */
  readonly source: 'rest' | 'paused';
};

export function pictureMomentMs(state: {
  /** The video's length; a frame at or past it would be blank. */
  readonly videoMs: number;
  /** The picture moment, or null for the last frame. */
  readonly restMs: number | null;
  readonly clockMs: number;
  readonly playing: boolean;
  /** Whether playback finished by itself and is resting on the picture moment. */
  readonly ended: boolean;
}): PictureMoment {
  const last = Math.max(0, state.videoMs - 1);
  const rest = Math.max(0, Math.min(state.restMs ?? last, last));
  if (state.playing || state.ended || state.clockMs <= 0) return { atMs: rest, source: 'rest' };
  const at = Math.max(0, Math.min(state.clockMs, last));
  // Stopped on the picture moment by hand is still the picture moment.
  if (Math.abs(at - rest) < 1) return { atMs: rest, source: 'rest' };
  return { atMs: at, source: 'paused' };
}
