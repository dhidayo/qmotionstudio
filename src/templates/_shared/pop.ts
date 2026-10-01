import {
  colorFill, roleFill, type Ease, type ImageProps, type Keyframe, type Layer, type SlotRef, type Tracks,
} from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { TextSlotDef } from '../schema';
import { BODY_STYLE, HEADLINE_STYLE } from './look';
import { frameBox, photoProps, untagged, type FilledSlot } from './photo';
import { specFor, textFor } from './text';
import { contentFloor } from './chrome';

/**
 * Soft Pop: the shared engine.
 *
 * Six templates, one family. Each shows photographs one after another: a photo
 * pops gently into place, eases slowly back while it is on screen, and leaves
 * with that template's own exit as the next one arrives. What differs is only
 * the exit, so everything else lives here and behaves identically in all six.
 *
 * "Soothing" is a set of hard numbers rather than a mood, and they are the
 * same throughout the family:
 *
 *   - **Nothing is quick.** Entrances take most of a second, exits well over
 *     one. The shortest motion anywhere in the family is longer than the
 *     *longest* in Kinetic Type.
 *   - **Nothing jolts.** Every curve is a sine or a cubic ease; the one spring
 *     is damped to a single settle a viewer feels rather than sees.
 *   - **Something is always moving, slowly.** The photo eases back from 110%
 *     the whole time it is on screen, so there is no frame where the reel is a
 *     still waiting for its next cut.
 *   - **Arrivals overlap departures.** The next photo is already coming in
 *     before the last has gone, so there is never an empty beat between them.
 */

export const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

/**
 * The family's one spring.
 *
 * Damping ratio about 0.86: it overshoots by roughly one percent and settles
 * once. Enough to read as a pop rather than a fade, and not enough for anybody
 * to notice it bounced.
 */
export const SOFT_POP: Ease = { kind: 'spring', stiffness: 110, damping: 18, mass: 1 };

/** How far the photo starts zoomed in before it eases back to 100%. */
export const ZOOM_FROM = 1.1;

// ── Timing ──────────────────────────────────────────────────────────────────

export type PopTurn = {
  readonly index: number;
  /** Scene time the photo's layers begin: its entrance starts here. */
  readonly startMs: number;
  /** Scene time they end, which is the moment its exit is complete. */
  readonly endMs: number;
  /** From startMs: when the entrance has settled. */
  readonly enterMs: number;
  /** From startMs: when the exit begins. */
  readonly exitAtMs: number;
  readonly exitMs: number;
  /** startMs to endMs, for building tracks that run the whole turn. */
  readonly spanMs: number;
};

/**
 * When each photo arrives and leaves.
 *
 * Every photo's exit finishes on its own turn boundary, and the next photo
 * starts arriving `overlapMs` before that — so the two are on screen together
 * for the last part of the exit, and the scene's final exit ends exactly at its
 * last frame. The loop therefore opens on the first photo arriving into an
 * empty stage, which reads as a breath rather than a jump.
 *
 * Everything is clamped against the turn, so a short scene with many photos
 * gets quicker motion rather than motion that runs past the next photo's turn.
 */
export function popTurns(
  count: number,
  durationMs: number,
  wanted: { enterMs: number; exitMs: number; overlapMs: number },
): PopTurn[] {
  const turnMs = durationMs / Math.max(1, count);
  const exitMs = Math.min(wanted.exitMs, turnMs * 0.48);
  const enterMs = Math.min(wanted.enterMs, turnMs * 0.34);
  const overlapMs = Math.min(wanted.overlapMs, turnMs * 0.62);

  return Array.from({ length: count }, (_, index) => {
    const boundary = (index + 1) * turnMs;
    const startMs = index === 0 ? 0 : Math.max(0, index * turnMs - overlapMs);
    return {
      index,
      startMs,
      endMs: boundary,
      enterMs,
      exitAtMs: boundary - exitMs - startMs,
      exitMs,
      spanMs: boundary - startMs,
    };
  });
}

// ── The photo as a card ─────────────────────────────────────────────────────

export type PopStage = { readonly cx: number; readonly cy: number; readonly w: number; readonly h: number };

export type PopCard = {
  /** The slot the whole card stands for: the group carries it, not the photo. */
  readonly slot: SlotRef;
  /** The photo at full card size, rounded, untagged. */
  readonly image: ImageProps;
  readonly w: number;
  readonly h: number;
  readonly radius: number;
};

/**
 * A photo sized to sit in the stage at its own frame ratio.
 *
 * Sized per photo rather than once for the template, because a 9:16 photo and
 * a 4:3 one need different boxes to fill the same stage, and the reel should
 * show each photo whole rather than force them all into one shape.
 */
export function popCard(photo: FilledSlot, stage: PopStage, inputs: SceneInputs, fill = 0.84): PopCard {
  const shape = frameBox(photo.frame, 1);
  const base = Math.min(stage.w / shape.w, stage.h / shape.h) * fill;
  const props = photoProps(photo, base, { cornerRadius: inputs.look.cornerRadius });
  return {
    slot: props.slot ?? { kind: 'photo', index: photo.slotIndex },
    image: untagged(props),
    w: props.w,
    h: props.h,
    radius: inputs.look.cornerRadius,
  };
}

/**
 * The card while it is on screen: a soft halo beneath it, and the photo seen
 * through a rounded window, easing back from `ZOOM_FROM` to 100%.
 *
 * The window is what makes the slow zoom a zoom *of the photo* rather than of
 * the card — the frame holds still and the picture settles inside it, which is
 * the calmer of the two by a distance.
 *
 * The shadow is a halo — a radial gradient, darkest under the middle — rather
 * than a filled box with a drop shadow, and that is for the exits. A filled
 * box shows its own colour through every gap the moment a photo breaks apart
 * or fades, as a pale ghost of the card; a halo shows only shade, which is
 * what the eye expects to see under something lifting away. It is a square
 * gradient stretched to the card's proportions, because a radial gradient is
 * always circular and a portrait card wants an oval beneath it.
 *
 * `hinge` anchors the window at its left edge instead of its centre, for a
 * card that turns like a page. Everything inside is offset to match, so the
 * picture sits exactly where it would have.
 */
export function cardLayers(
  ctx: BuildContext,
  card: PopCard,
  options: {
    /** From the group's start: the card is gone from here (exclusive). */
    readonly untilMs: number;
    /** From the group's start: when the zoom reaches 100%. */
    readonly settleMs: number;
    /** From the group's start: the halo is gone from here. Defaults to `untilMs`. */
    readonly haloUntilMs?: number;
    readonly windowTracks?: Tracks;
    readonly haloTracks?: Tracks;
    readonly hinge?: boolean;
    /** Drawn inside the window, over the photo. */
    readonly over?: readonly Layer[];
  },
): Layer[] {
  const unit = Math.min(ctx.design.w, ctx.design.h);
  const hinge = options.hinge === true;
  const at = hinge ? -card.w / 2 : 0;
  const inner = hinge ? card.w / 2 : 0;

  const HALO = 100;
  const halo: Layer = {
    id: ctx.id('pop-halo'),
    type: 'gradient',
    startMs: 0,
    endMs: options.haloUntilMs ?? options.untilMs,
    tracks: {
      y: [kf(0, unit * 0.024)],
      scaleX: [kf(0, (card.w * 1.5) / HALO)],
      scaleY: [kf(0, (card.h * 1.45) / HALO)],
      ...options.haloTracks,
    },
    props: {
      w: HALO,
      h: HALO,
      gradient: 'radial',
      stops: [
        { at: 0, paint: colorFill('rgba(0,0,0,0.42)') },
        { at: 0.6, paint: colorFill('rgba(0,0,0,0.3)') },
        { at: 1, paint: colorFill('rgba(0,0,0,0)') },
      ],
    },
  };

  const photo: Layer = {
    id: ctx.id('pop-photo'),
    type: 'image',
    startMs: 0,
    endMs: options.untilMs,
    tracks: {
      x: [kf(0, inner)],
      scaleX: [kf(0, ZOOM_FROM, 'linear'), kf(options.settleMs, 1, 'inOutSine')],
      scaleY: [kf(0, ZOOM_FROM, 'linear'), kf(options.settleMs, 1, 'inOutSine')],
    },
    props: card.image,
  };

  const frame: Layer = {
    id: ctx.id('pop-window'),
    type: 'mask',
    startMs: 0,
    endMs: options.untilMs,
    ...(hinge ? { anchorX: 0 } : {}),
    tracks: { x: [kf(0, at)], ...options.windowTracks },
    props: { shape: 'rect', w: card.w, h: card.h, cornerRadius: card.radius },
    children: [photo, ...(options.over ?? [])],
  };

  return [halo, frame];
}

/**
 * The family's entrance: up a little, in from 92%, settling with `SOFT_POP`.
 *
 * Group tracks, so a user's drag composes straight into them (D-090).
 */
export function popIn(at: { x: number; y: number }, enterMs: number, unit: number): Tracks {
  const rise = unit * 0.025;
  return {
    x: [kf(0, at.x)],
    y: [kf(0, at.y + rise), kf(enterMs, at.y, 'outCubic')],
    scaleX: [kf(0, 0.92), kf(enterMs, 1, SOFT_POP)],
    scaleY: [kf(0, 0.92), kf(enterMs, 1, SOFT_POP)],
    opacity: [kf(0, 0), kf(enterMs * 0.6, 1, 'outQuad')],
  };
}

/** The group that is one photo's whole turn: entrance, hold and exit. */
export function popGroup(
  ctx: BuildContext,
  card: PopCard,
  turn: PopTurn,
  tracks: Tracks,
  children: readonly Layer[],
): Layer {
  return {
    id: ctx.id('pop'),
    type: 'group',
    startMs: turn.startMs,
    endMs: turn.endMs,
    tracks,
    props: { slot: card.slot },
    children,
  };
}

// ── Pieces, for the exits that break the photo apart ────────────────────────

export type PopTile = {
  readonly index: number;
  /** Centre, relative to the card's centre. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Position across the card, each from -1 to 1. */
  readonly u: number;
  readonly v: number;
};

/** The card cut into a grid, in reading order. */
export function popTiles(card: PopCard, cols: number, rows: number): PopTile[] {
  const w = card.w / cols;
  const h = card.h / rows;
  const tiles: PopTile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = -card.w / 2 + w * (col + 0.5);
      const y = -card.h / 2 + h * (row + 0.5);
      tiles.push({
        index: tiles.length,
        x,
        y,
        w,
        h,
        u: cols > 1 ? (col / (cols - 1)) * 2 - 1 : 0,
        v: rows > 1 ? (row / (rows - 1)) * 2 - 1 : 0,
      });
    }
  }
  return tiles;
}

/**
 * One piece of the card: the whole photo, seen through a window the size of
 * the piece.
 *
 * Every piece draws the entire rounded photo and lets its window choose the
 * part, which is why the corners of the pieces are still rounded the moment
 * the card breaks — cropping each piece out of the source would give square
 * corners, and the card would visibly change shape at the instant it parts.
 *
 * Each window is a pixel larger than its share. Clipped edges anti-alias, and
 * two anti-aliased edges meeting exactly leave a hairline seam across the
 * photo for the first frame of every exit.
 */
export function tileLayer(
  ctx: BuildContext,
  card: PopCard,
  tile: PopTile,
  span: { readonly startMs: number; readonly endMs: number },
  tracks: Tracks,
): Layer {
  return {
    id: ctx.id('pop-piece'),
    type: 'mask',
    startMs: span.startMs,
    endMs: span.endMs,
    tracks,
    props: { shape: 'rect', w: tile.w + 1, h: tile.h + 1 },
    children: [
      {
        id: ctx.id('pop-piece-photo'),
        type: 'image',
        startMs: 0,
        endMs: span.endMs - span.startMs,
        tracks: { x: [kf(0, -tile.x)], y: [kf(0, -tile.y)] },
        props: card.image,
      },
    ],
  };
}

/**
 * A deterministic number in [0, 1) for item `i`.
 *
 * Integer arithmetic rather than `Math.sin`, so two builds of the same scene —
 * one in the editor, one in the export worker — agree to the last bit (§3B).
 */
export function jitter(i: number, salt = 0): number {
  let h = (Math.imul(i + 1, 374761393) + Math.imul(salt + 1, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ── Type ────────────────────────────────────────────────────────────────────

export const POP_SLOTS = {
  headline: {
    id: 'headline',
    label: 'Headline',
    placeholder: 'Slow down and look',
    maxChars: 40,
    defaultStyle: { ...HEADLINE_STYLE, align: 'center' as const, weight: 700 as const, letterSpacingPct: -1 },
  },
  caption: {
    id: 'caption',
    label: 'Caption',
    placeholder: 'A few favourites',
    maxChars: 56,
    defaultStyle: { ...BODY_STYLE, align: 'center' as const, letterSpacingPct: 10, weight: 500 as const },
  },
} satisfies Record<string, TextSlotDef>;

export type PopType = {
  readonly layers: Layer[];
  /** The stage between the headline and the caption, where the photos go. */
  readonly stage: PopStage;
};

/**
 * Headline above, caption below, and the stage between them.
 *
 * Both arrive slowly — words a beat apart, a caption that takes over a second
 * to fade up — because type that snaps in breaks a calm reel faster than any
 * cut. The caption sits on `contentFloor`, clear of the free-tier mark.
 */
export function popType(
  ctx: BuildContext,
  inputs: SceneInputs,
  options: {
    readonly headline?: TextSlotDef;
    readonly caption?: TextSlotDef;
    /**
     * Set when the type sits over photographs rather than over the background.
     * The palette's ink is chosen to read on the palette's own ground, which on
     * Paper is near-black — and near-black on a darkened photo is invisible.
     */
    readonly onPhoto?: boolean;
  } = {},
): PopType {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const headSlot = options.headline ?? POP_SLOTS.headline;
  const capSlot = options.caption ?? POP_SLOTS.caption;

  const headline = textFor(headSlot, inputs, {
    baseSizePx: unit * 0.058,
    maxWidthPx: safe.w * 0.84,
    reveal: { kind: 'perWord', startMs: 450, durationMs: 760, staggerMs: 120 },
    lineHeight: 1.1,
    ...(options.onPhoto === true ? { fallbackFill: colorFill('#ffffff') } : {}),
  });
  const caption = textFor(capSlot, inputs, {
    baseSizePx: unit * 0.021,
    maxWidthPx: safe.w * 0.72,
    reveal: { kind: 'fade', startMs: 1_100, durationMs: 1_200 },
    fallbackFill: options.onPhoto === true ? colorFill('rgba(255,255,255,0.82)') : roleFill('inkMuted'),
  });

  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));
  const capRun = ctx.measure(specFor(caption, fontString(caption.fontId, caption.fontSizePx, caption.weight)));

  const floor = contentFloor(design, safe);
  const capTop = floor - capRun.height;
  const top = safe.y + headRun.height + unit * 0.045;
  const bottom = capTop - unit * 0.04;

  const layers: Layer[] = [
    {
      id: ctx.id('headline'),
      type: 'text',
      startMs: 0,
      endMs: durationMs,
      anchorX: 0.5,
      anchorY: 0,
      tracks: {
        x: [kf(0, design.w / 2)],
        // A drift up into place under the word reveal, so the line settles
        // rather than appears.
        y: [kf(300, safe.y + unit * 0.012), kf(1_500, safe.y, 'outCubic')],
      },
      props: headline,
    },
    {
      id: ctx.id('caption'),
      type: 'text',
      startMs: 0,
      endMs: durationMs,
      anchorX: 0.5,
      anchorY: 0,
      tracks: { x: [kf(0, design.w / 2)], y: [kf(0, capTop)] },
      props: caption,
    },
  ];

  return {
    layers,
    stage: {
      cx: design.w / 2,
      cy: (top + bottom) / 2,
      w: safe.w,
      h: Math.max(unit * 0.3, bottom - top),
    },
  };
}
