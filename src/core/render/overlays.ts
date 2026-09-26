import {
  colorFill, roleFill,
  type Direction, type Keyframe, type Layer, type Paint, type Size, type Tracks,
} from '@/core/types';
import type { AnimPreset, Overlay } from '@/document/types';

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
  const t = overlay.transform;

  const x = design.w * (t.x ?? 0.5);
  const y = design.h * (t.y ?? 0.5);
  const scaleX = t.scaleX ?? 1;
  const scaleY = t.scaleY ?? t.scaleX ?? 1;
  const rotation = t.rotation ?? 0;
  const opacity = t.opacity ?? 1;

  const content = contentLayer(overlay, ctx, unit, durationMs);
  if (!content) return null;

  const enter = Math.min(ENTER_MS, durationMs / 3);
  const exit = Math.min(EXIT_MS, durationMs / 3);

  const tracks: Tracks = {
    x: offsetTrack(x, unit, overlay.enterAnim, overlay.exitAnim, durationMs, enter, exit, 'x'),
    y: offsetTrack(y, unit, overlay.enterAnim, overlay.exitAnim, durationMs, enter, exit, 'y'),
    scaleX: scaleTrack(scaleX, overlay.enterAnim, overlay.exitAnim, durationMs, enter, exit),
    scaleY: scaleTrack(scaleY, overlay.enterAnim, overlay.exitAnim, durationMs, enter, exit),
    rotation: [kf(0, rotation)],
    opacity: opacityTrack(opacity, overlay.enterAnim, overlay.exitAnim, durationMs, enter, exit),
  };

  // wipeIn is the one preset that is not a transform: the content has to stay
  // still while the window over it opens, which is what MaskProps.clipFrom and
  // §6.1's clipProgress are for.
  const wipes = overlay.enterAnim === 'wipeIn' || overlay.exitAnim === 'wipeIn';
  if (!wipes) {
    return { ...content, tracks: { ...content.tracks, ...tracks } };
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
      const fill: Paint = style.color.length > 0 ? colorFill(style.color) : roleFill('ink');
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

function offsetTrack(
  value: number,
  unit: number,
  enterAnim: AnimPreset,
  exitAnim: AnimPreset,
  durationMs: number,
  enter: number,
  exit: number,
  axis: 'x' | 'y',
): readonly Keyframe[] {
  const enterOffset = offsetFor(enterAnim, unit, axis);
  // Exits leave the way they would have come in, mirrored, so a slideIn/slideIn
  // pair travels across the frame rather than doubling back on itself.
  const exitOffset = -offsetFor(exitAnim, unit, axis);

  const frames: Keyframe[] = [];
  if (enterOffset !== 0) {
    frames.push(kf(0, value + enterOffset), kf(enter, value, 'outCubic'));
  } else {
    frames.push(kf(0, value));
  }
  if (exitOffset !== 0) {
    frames.push(kf(durationMs - exit, value), kf(durationMs, value + exitOffset, 'inCubic'));
  }
  return frames;
}

function scaleTrack(
  value: number,
  enterAnim: AnimPreset,
  exitAnim: AnimPreset,
  durationMs: number,
  enter: number,
  exit: number,
): readonly Keyframe[] {
  const frames: Keyframe[] = [];

  if (enterAnim === 'popIn') {
    // A spring, because a pop that eases out does not pop (§6.1's solver is
    // baked to a LUT at build time, so this costs nothing per frame).
    frames.push(
      kf(0, value * 0.82),
      kf(enter * 1.6, value, { kind: 'spring', stiffness: 260, damping: 18, mass: 1 }),
    );
  } else {
    frames.push(kf(0, value));
  }

  if (exitAnim === 'popIn') {
    frames.push(kf(durationMs - exit, value), kf(durationMs, value * 0.86, 'inCubic'));
  }
  return frames;
}

function opacityTrack(
  value: number,
  enterAnim: AnimPreset,
  exitAnim: AnimPreset,
  durationMs: number,
  enter: number,
  exit: number,
): readonly Keyframe[] {
  const frames: Keyframe[] = [];

  // Every preset but 'none' fades: an element that slides in at full opacity
  // reads as a glitch, not as a move. wipeIn is the exception — the mask is
  // already doing the reveal and a fade on top of it looks like a mistake.
  const fadesIn = enterAnim !== 'none' && enterAnim !== 'wipeIn';
  const fadesOut = exitAnim !== 'none' && exitAnim !== 'wipeIn';

  if (fadesIn) frames.push(kf(0, 0), kf(enter, value));
  else frames.push(kf(0, value));

  if (fadesOut) frames.push(kf(durationMs - exit, value), kf(durationMs, 0, 'inCubic'));

  return frames;
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
    content.kind,
    content.kind === 'text' ? [content.text, content.style] : content.mediaId,
  ]);
}

export const ANIM_PRESETS: readonly AnimPreset[] = [
  'none', 'fade', 'riseIn', 'popIn', 'slideIn', 'wipeIn',
];

export type { Direction };
