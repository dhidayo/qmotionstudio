import {
  colorFill, roleFill,
  type Direction, type Keyframe, type Layer, type Paint, type Size, type Tracks,
} from '@/core/types';
import type { AnimPreset, Overlay } from '@/document/types';
import { easeOf, poseTrack } from '@/document/select/overlay';
import { sampleTrack } from '@/core/anim/interpolate';
import { timeElementEffects } from './tuning';

/**
 * Overlays → layers (§3C, §6.4 step 4).
 *
 * §3C is explicit that overlays are not scene layers: they sit on the *global*
 * timeline with their own start and end, they survive a template change, and
 * they composite over whatever the scenes produced. What they are not is a
 * second kind of drawable — once placed, an overlay is drawn by the same
 * `drawLayer` as everything else, which is why this file is a translation and
 * not a renderer.
 *
 * Time inside the returned layer is relative to the overlay's own `startMs`,
 * exactly as §6.1 says ("relative to its scene or overlay"), so the caller
 * draws it at `globalTimeMs - overlay.startMs`.
 *
 * ── How `transform` is read (D-044) ───────────────────────────────────────
 * §5 types an overlay's placement as `Partial<AnimatedProps>`, which is a set
 * of numbers with no units attached. This file fixes the reading:
 *
 *   x, y             normalised 0–1 within the design box, defaulting to the
 *                    centre. Design units would pin an overlay to one aspect —
 *                    §1.3 requires switching aspect to re-lay-out, not to leave
 *                    a caption hanging off the edge of a 16:9 frame.
 *   scaleX, scaleY   multiply the overlay's nominal size, not the frame.
 *   rotation         degrees.
 *   opacity          0–1, multiplied into whatever the enter/exit preset does.
 */

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

/** A photo overlay at scale 1 covers this much of the frame's short edge. */
export const PHOTO_BASE = 0.34;
/** A text overlay at 100% is this much of the short edge. */
export const TEXT_BASE = 0.062;

const ENTER_MS = 520;
const EXIT_MS = 420;

export type OverlayBuildContext = {
  readonly design: Size;
  /** Deterministic ids, like BuildContext — the cache key assumes stable output. */
  id(prefix: string): string;
};

export function overlayDurationMs(overlay: Overlay): number {
  return Math.max(0, overlay.endMs - overlay.startMs);
}

/**
 * Builds the layer for one overlay.
 *
 * Returns null for an overlay with no duration, which the timeline can produce
 * transiently while a clip is being dragged to zero width.
 */
export function overlayLayer(overlay: Overlay, ctx: OverlayBuildContext): Layer | null {
  const durationMs = overlayDurationMs(overlay);
  if (durationMs <= 0) return null;

  const { design } = ctx;
  const unit = Math.min(design.w, design.h);

  /*
   * The overlay's motion path, in the renderer's own units.
   *
   * An overlay that is not animated has exactly one pose, so there is one code
   * path rather than two — and with a single pose every track below collapses
   * to what it was before keyframes existed.
   */
  const pathX = poseTrack(overlay, 'x', (v) => design.w * v);
  const pathY = poseTrack(overlay, 'y', (v) => design.h * v);
  const pathScaleX = poseTrack(overlay, 'scaleX');
  const pathScaleY = poseTrack(overlay, 'scaleY');
  const pathRotation = poseTrack(overlay, 'rotation');
  const pathOpacity = poseTrack(overlay, 'opacity');

  const content = contentLayer(overlay, ctx, unit, durationMs);
  if (!content) return null;

  const enter = Math.min(ENTER_MS, durationMs / 3);
  const exit = Math.min(EXIT_MS, durationMs / 3);
  const pathEase = easeOf(overlay.easing);

  const shape = { durationMs, enter, exit, pathEase };
  const tracks: Tracks = {
    x: offsetTrack(pathX, unit, overlay.enterAnim, overlay.exitAnim, shape, 'x'),
    y: offsetTrack(pathY, unit, overlay.enterAnim, overlay.exitAnim, shape, 'y'),
    scaleX: scaleTrack(pathScaleX, overlay.enterAnim, overlay.exitAnim, shape),
    scaleY: scaleTrack(pathScaleY, overlay.enterAnim, overlay.exitAnim, shape),
    rotation: pathRotation,
    opacity: opacityTrack(pathOpacity, overlay.enterAnim, overlay.exitAnim, shape),
  };

  // Element effects (D-100) run across the overlay's whole life; an entrance
  // at its start, an exit at its end.
  const fx = timeElementEffects(overlay.effects, { start: 0, end: durationMs });
  const withFx = fx.length > 0 ? { fx } : {};

  // wipeIn is the one preset that is not a transform: the content has to stay
  // still while the window over it opens, which is what MaskProps.clipFrom and
  // §6.1's clipProgress are for.
  const wipes = overlay.enterAnim === 'wipeIn' || overlay.exitAnim === 'wipeIn';
  if (!wipes) {
    return { ...content, tracks: { ...content.tracks, ...tracks }, ...withFx };
  }

  const box = contentBox(content, unit);
  return {
    id: ctx.id('ovl-wipe'),
    type: 'mask',
    startMs: 0,
    endMs: durationMs,
    tracks: {
      ...tracks,
      clipProgress: clipTrack(overlay.enterAnim, overlay.exitAnim, durationMs, enter, exit),
    },
    props: {
      shape: 'rect',
      w: box.w,
      h: box.h,
      clipFrom: 'left',
    },
    ...withFx,
    children: [content],
  };
}

/** The drawable the overlay wraps, positioned about its own centre. */
function contentLayer(
  overlay: Overlay,
  ctx: OverlayBuildContext,
  unit: number,
  durationMs: number,
): Layer | null {
  const base = { startMs: 0, endMs: durationMs, tracks: {} } as const;

  switch (overlay.content.kind) {
    case 'photo': {
      const size = unit * PHOTO_BASE;
      return {
        ...base,
        id: ctx.id('ovl-photo'),
        type: 'image',
        props: {
          mediaId: overlay.content.mediaId,
          w: size,
          h: size,
          fit: 'cover',
          cornerRadius: unit * 0.02,
          shadow: { blur: unit * 0.04, offsetX: 0, offsetY: unit * 0.012, paint: colorFill('rgba(0,0,0,0.45)') },
        },
      };
    }

    case 'customMedia': {
      const size = unit * PHOTO_BASE;
      return {
        ...base,
        id: ctx.id('ovl-media'),
        type: 'video',
        props: { mediaId: overlay.content.mediaId, w: size, h: size, fit: 'cover', cornerRadius: unit * 0.02 },
      };
    }

    case 'text': {
      const style = overlay.content.style;
      const fontSizePx = unit * TEXT_BASE * (style.sizePct / 100);
      const fill: Paint = style.color.length > 0 ? colorFill(style.color) : style.pill ? roleFill('onAccent') : roleFill('ink');
      const maxWidthPx = style.wrap ? unit * 0.8 * (style.wrapWidthPct / 100) : null;

      return {
        ...base,
        id: ctx.id('ovl-text'),
        type: 'text',
        props: {
          text: overlay.content.text,
          fontId: style.fontId,
          fontSizePx,
          weight: style.weight,
          letterSpacingPct: style.letterSpacingPct,
          lineHeight: 1.16,
          align: style.align,
          fill,
          maxWidthPx,
          reveal: { kind: 'none' },
          ...(style.shadow
            ? { shadow: { blur: fontSizePx * 0.3, offsetX: 0, offsetY: fontSizePx * 0.07, paint: colorFill('rgba(0,0,0,0.55)') } }
            : {}),
          ...(style.outline ? { outline: { paint: roleFill('bg'), width: Math.max(1, fontSizePx * 0.055) } } : {}),
          ...(style.pill
            ? { pill: { paint: roleFill('accent'), paddingX: fontSizePx * 0.55, paddingY: fontSizePx * 0.3, radius: fontSizePx * 0.6 } }
            : {}),
        },
      };
    }
  }
}

/**
 * The mask's box for a wipe.
 *
 * Text has no intrinsic width until it is measured, and measuring here would
 * mean threading a measurement context through for one preset. The wrap width
 * is a generous upper bound and an over-wide mask simply reveals early at the
 * far edge — invisible, because there is nothing there to reveal.
 */
function contentBox(content: Layer, unit: number): Size {
  if (content.type === 'text') {
    return { w: content.props.maxWidthPx ?? unit * 0.8, h: content.props.fontSizePx * 4 };
  }
  if (content.type === 'group') return { w: unit, h: unit };
  return { w: content.props.w, h: content.props.h };
}

// ── Enter/exit presets ──────────────────────────────────────────────────────

const SLIDE_PCT = 0.18;
const RISE_PCT = 0.07;

function offsetFor(preset: AnimPreset, unit: number, axis: 'x' | 'y'): number {
  switch (preset) {
    case 'riseIn': return axis === 'y' ? unit * RISE_PCT : 0;
    case 'slideIn': return axis === 'x' ? -unit * SLIDE_PCT : 0;
    default: return 0;
  }
}

/** The shape of an overlay's entrance and exit, shared by every track. */
type Shape = {
  readonly durationMs: number;
  readonly enter: number;
  readonly exit: number;
  readonly pathEase: Keyframe['ease'];
};

/**
 * Lays an entrance and an exit over the user's path.
 *
 * The presets are transient: they act only in the first `enter` and last
 * `exit` milliseconds, and in between the path is left exactly as it was. So
 * the two compose rather than compete — "slide in" still slides in, and it
 * slides in to wherever the path says the overlay should be by then, instead
 * of to a fixed point it would then have to jump away from.
 *
 * Sampling the path at the boundaries is what makes that exact, and it is why
 * this needs no group wrapper and no second code path: an overlay with one
 * pose samples the same value everywhere, and every track below collapses to
 * precisely the keyframes these functions produced before keyframes existed.
 */
function composePath(
  path: readonly Keyframe[],
  shape: Shape,
  entrance: { readonly fromValue: number; readonly settleMs: number; readonly ease: Keyframe['ease'] } | null,
  departure: { readonly toValue: number; readonly startMs: number; readonly ease: Keyframe['ease'] } | null,
): readonly Keyframe[] {
  const at = (t: number): number => sampleTrack(path, t) ?? 0;
  const from = entrance ? entrance.settleMs : 0;
  const until = departure ? departure.startMs : shape.durationMs;

  const frames: Keyframe[] = [];

  if (entrance) {
    frames.push(kf(0, entrance.fromValue, 'linear'));
    frames.push(kf(from, at(from), entrance.ease));
  } else {
    frames.push(kf(0, at(0), 'linear'));
  }

  for (const key of path) {
    if (key.t > from && key.t < until) frames.push(key);
  }

  if (departure) {
    frames.push(kf(until, at(until), shape.pathEase));
    frames.push(kf(shape.durationMs, departure.toValue, departure.ease));
  } else {
    // Without an exit the path's own last keyframe is the end of the story,
    // and the loop above stops short of it.
    const last = path[path.length - 1];
    if (last && last.t >= until && last.t > from) frames.push(last);
  }

  return frames;
}

function offsetTrack(
  path: readonly Keyframe[],
  unit: number,
  enterAnim: AnimPreset,
  exitAnim: AnimPreset,
  shape: Shape,
  axis: 'x' | 'y',
): readonly Keyframe[] {
  const enterOffset = offsetFor(enterAnim, unit, axis);
  // Exits leave the way they would have come in, mirrored, so a slideIn/slideIn
  // pair travels across the frame rather than doubling back on itself.
  const exitOffset = -offsetFor(exitAnim, unit, axis);
  const at = (t: number): number => sampleTrack(path, t) ?? 0;

  return composePath(
    path,
    shape,
    enterOffset === 0
      ? null
      : { fromValue: at(0) + enterOffset, settleMs: shape.enter, ease: 'outCubic' },
    exitOffset === 0
      ? null
      : {
          toValue: at(shape.durationMs) + exitOffset,
          startMs: shape.durationMs - shape.exit,
          ease: 'inCubic',
        },
  );
}

function scaleTrack(
  path: readonly Keyframe[],
  enterAnim: AnimPreset,
  exitAnim: AnimPreset,
  shape: Shape,
): readonly Keyframe[] {
  const at = (t: number): number => sampleTrack(path, t) ?? 1;

  return composePath(
    path,
    shape,
    enterAnim === 'popIn'
      ? {
          fromValue: at(0) * 0.82,
          settleMs: Math.min(shape.enter * 1.6, shape.durationMs),
          // A spring, because a pop that eases out does not pop (§6.1's solver
          // is baked to a LUT at build time, so this costs nothing per frame).
          ease: { kind: 'spring', stiffness: 260, damping: 18, mass: 1 },
        }
      : null,
    exitAnim === 'popIn'
      ? {
          toValue: at(shape.durationMs) * 0.86,
          startMs: shape.durationMs - shape.exit,
          ease: 'inCubic',
        }
      : null,
  );
}

function opacityTrack(
  path: readonly Keyframe[],
  enterAnim: AnimPreset,
  exitAnim: AnimPreset,
  shape: Shape,
): readonly Keyframe[] {
  // Every preset but 'none' fades: an element that slides in at full opacity
  // reads as a glitch, not as a move. wipeIn is the exception — the mask is
  // already doing the reveal and a fade on top of it looks like a mistake.
  const fadesIn = enterAnim !== 'none' && enterAnim !== 'wipeIn';
  const fadesOut = exitAnim !== 'none' && exitAnim !== 'wipeIn';

  return composePath(
    path,
    shape,
    fadesIn ? { fromValue: 0, settleMs: shape.enter, ease: 'outCubic' } : null,
    fadesOut
      ? { toValue: 0, startMs: shape.durationMs - shape.exit, ease: 'inCubic' }
      : null,
  );
}

function clipTrack(
  enterAnim: AnimPreset,
  exitAnim: AnimPreset,
  durationMs: number,
  enter: number,
  exit: number,
): readonly Keyframe[] {
  const frames: Keyframe[] = [];

  if (enterAnim === 'wipeIn') frames.push(kf(0, 0), kf(enter, 1, 'outExpo'));
  else frames.push(kf(0, 1));

  if (exitAnim === 'wipeIn') frames.push(kf(durationMs - exit, 1), kf(durationMs, 0, 'inCubic'));

  return frames;
}

/**
 * Memoisation key for one overlay's layer.
 *
 * Everything that changes the built layer and nothing that does not: the
 * palette is absent because overlay colours resolve at draw time through Paint
 * roles, exactly like a scene's (D-006), and `startMs` is absent because the
 * layer is built in the overlay's own local time — dragging a clip along the
 * timeline moves when it draws, not what it draws.
 */
export function overlayKey(overlay: Overlay, design: Size): string {
  const content = overlay.content;
  return JSON.stringify([
    overlay.id,
    Math.round(design.w),
    Math.round(design.h),
    overlayDurationMs(overlay),
    overlay.enterAnim,
    overlay.exitAnim,
    overlay.transform,
    // The path and its easing both change what is built, so both belong in the
    // key. Without them a keyframe edit would be served the previous layer and
    // the overlay would simply not move.
    overlay.poses ?? null,
    overlay.easing ?? null,
    overlay.effects ?? null,
    content.kind,
    content.kind === 'text' ? [content.text, content.style] : content.mediaId,
  ]);
}

export const ANIM_PRESETS: readonly AnimPreset[] = [
  'none', 'fade', 'riseIn', 'popIn', 'slideIn', 'wipeIn',
];

export type { Direction };
