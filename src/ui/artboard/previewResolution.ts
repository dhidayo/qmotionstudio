import { aspectValue, renderSizeFor } from '@/core/math/aspect';
import { ASPECT_RATIO, type Aspect, type Size } from '@/core/types';

/**
 * How many pixels the preview draws (D-112, D-154).
 *
 * Pure, so the rules can be tested without a browser: the artboard measures
 * the stage and the device, and this decides the canvas backing store.
 */

/**
 * Preview renders at most this on the short edge regardless of display size.
 * A 5K monitor would otherwise have us shading 14 megapixels a frame to show a
 * picture that is about to be exported at 2.
 */
export const MAX_PREVIEW_SHORT_EDGE = 1080;

/*
 * A phone previews at most at 2× and 720 on the short edge (D-112).
 *
 * A 3× phone screen asked for a 922×1640 canvas — one and a half megapixels
 * redrawn every frame, through blur passes that cost in proportion — and
 * played at under twenty frames a second on a mid-range phone. The picture
 * on a six-inch screen at 2× is indistinguishable from 3× while it moves; the
 * export renders at full size regardless, from its own rig.
 */
export const PHONE_PREVIEW_SHORT_EDGE = 720;
export const PHONE_MAX_DPR = 2;

/**
 * How far the playing picture may step down on a device that still cannot
 * keep up — a phone since D-112, any device since D-154.
 */
export const QUALITY_STEPS = [1, 0.75, 0.5] as const;

/**
 * The most a computer or tablet draws per frame while the preview plays (D-154).
 *
 * "I am viewing on landscape on system, and I see that the motion drags." A
 * 16:9 picture on a wide, short stage is two to three times the pixels of a
 * 9:16 one, and a retina laptop asked for 1632×918 — every blur, shadow and
 * grain pass paying for 1.5 megapixels, sixty times a second, where a phone
 * had been capped since D-112. While the picture moves, about 0.8 megapixels
 * (1184×666 for 16:9) cannot be told from more; paused, it goes back to the
 * screen's full sharpness, which is when anyone looks closely.
 */
export const PLAYING_PIXEL_BUDGET = 800_000;

/**
 * The backing store while playing and while paused — the same object when
 * they agree — and the picture's box on screen, in CSS pixels.
 */
export type PreviewSizes = { readonly playing: Size; readonly paused: Size; readonly shown: Size };

/**
 * A size of exactly the frame shape, both edges even, no larger than `short`.
 *
 * Exact matters more than it looks. The renderer derives design units from
 * the backing store (`makeViewport`), and an edge rounded on its own — 1632×918
 * is 16:9.0007 — laid templates out 1923 units wide where the export has 1920.
 * Snapped to whole steps of the ratio (18px for 16:9: 32×18 per step), every
 * size of one shape has the same design box, so changing resolution between
 * playing and paused never rebuilds the template or moves anything, and the
 * preview lays out exactly as the export does.
 */
export function exactPreviewSize(aspect: Aspect, short: number): Size {
  const [a, b] = ASPECT_RATIO[aspect];
  // Twice the short side of the ratio keeps both edges even: 18 for 16:9 and
  // 9:16, 6 for 4:3, 8 for 4:5, 2 for 1:1.
  const unit = 2 * Math.min(a, b);
  const steps = Math.max(1, Math.floor(short / unit));
  return renderSizeFor(aspect, steps * unit);
}

/** The short edge that fills the playing budget at this frame shape. */
export function playingShortEdge(aspect: Aspect): number {
  const ratio = aspectValue(aspect);
  const longOverShort = ratio >= 1 ? ratio : 1 / ratio;
  return Math.sqrt(PLAYING_PIXEL_BUDGET / longOverShort);
}

export function previewSizes(options: {
  readonly aspect: Aspect;
  /** The largest box of the frame shape the stage can hold, in CSS pixels. */
  readonly display: Size;
  readonly dpr: number;
  readonly phone: boolean;
  /** Index into QUALITY_STEPS, raised each time playback keeps missing frames. */
  readonly step: number;
  /** `?thumb=`: a pinned short edge, for thumbnail capture. */
  readonly thumb: number | null;
}): PreviewSizes {
  const { aspect, display, dpr, phone, step, thumb } = options;
  const box: Size = { w: display.w, h: display.h };

  // Thumbnails keep the size they have always been captured at, playing or not.
  if (thumb !== null) {
    const pinned = renderSizeFor(aspect, Math.max(2, Math.round(thumb)));
    return { playing: pinned, paused: pinned, shown: box };
  }

  const edge = Math.min(display.w, display.h);
  const quality = QUALITY_STEPS[Math.min(Math.max(0, step), QUALITY_STEPS.length - 1)] ?? 1;

  // Paused: the screen's own pixels, within the caps.
  const sharp = phone
    ? Math.min(edge * Math.min(dpr, PHONE_MAX_DPR), PHONE_PREVIEW_SHORT_EDGE)
    : Math.min(edge * dpr, MAX_PREVIEW_SHORT_EDGE);
  const paused = exactPreviewSize(aspect, sharp);

  // Playing: within the budget on a computer or tablet (a phone's 720 cap is
  // already its budget), then stepped down if frames are still being missed.
  const budget = phone ? sharp : Math.min(sharp, playingShortEdge(aspect));
  const playingShort = budget * quality;
  const playing = playingShort >= sharp ? paused : exactPreviewSize(aspect, playingShort);

  /*
   * On a computer the box gives up less than one step of the ratio so that
   * the paused picture lands on whole device pixels. Snapped to the shape,
   * the backing store is a few pixels short of the box (800×450 drawn into
   * 812×456 at 1×), and stretching it that little way softened every edge in
   * it; drawn one to one, it is as sharp as the screen. Not when a cap already
   * holds the backing store below the screen's pixels, and not on a phone,
   * whose 2× cap (D-112) has the picture scaled to its 3× screen regardless.
   */
  const devicePixels = !phone && sharp === edge * dpr && shortEdge(paused) <= sharp;
  const shown = devicePixels ? { w: paused.w / dpr, h: paused.h / dpr } : box;
  return { playing, paused, shown };
}

function shortEdge(size: Size): number {
  return Math.min(size.w, size.h);
}
