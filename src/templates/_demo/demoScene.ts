import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import { SPRINGS } from '@/core/anim/spring';
import type { BuildContext } from '../buildContext';

/**
 * A hand-written scene — M1's acceptance case.
 *
 * Not a template: the template schema and registry are M2. This exists to
 * exercise every part of the render core at once and to give the frame-rate
 * budget something real to be measured against. It uses the repeaters, the
 * spring solver, staggered delays, depth sorting, masks, groups, blur and two
 * text reveal modes, so a regression in any of them is visible rather than
 * theoretical.
 *
 * It is replaced by real templates at M2 and kept only as a render-core fixture.
 */

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

export function buildDemoScene(ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const centreX = design.w / 2;

  // Type sits at the top and bottom of the safe area; everything else has to
  // fit the band between them. Sizing the arc off `unit` alone works at 9:16
  // and runs straight off the bottom at 16:9, where `unit` *is* the full height.
  //
  // This is a crude stand-in for §6.5's per-aspect layout hints, which arrive
  // with the template schema at M2. A real template will declare safeArea and
  // stackDirection, or declare that it does not support an aspect at all.
  const headlineSize = unit * 0.085;
  const subheadSize = unit * 0.028;

  const HEADLINE = 'MOTION IN THE BROWSER';
  const SUBHEAD = 'Nothing is uploaded. Everything renders on your device.';
  const headlineWrap = safe.w * 0.82;
  const subheadWrap = safe.w * 0.66;

  /**
   * Animated tracking does not re-wrap (see drawText): the run is measured
   * once and the boost is applied per character at paint time. So the wrap has
   * to be computed at the *widest* tracking the animation reaches, and the
   * boost animates up to that rather than past it — otherwise the lines grow
   * beyond the width they were wrapped for and overrun the safe area.
   *
   * Here: the static spacing is the settled value, and the boost runs from
   * negative to zero.
   */
  const subheadTrackingPct = 8;

  // Measured, not guessed. How many lines a string wraps to depends on the
  // face, and an assumed block height silently overflows the safe area the
  // moment the typeface changes — which is exactly what happened when the real
  // fonts landed and the subhead went from two lines to three.
  const headRun = ctx.measure({
    text: HEADLINE,
    font: fontString('headline', headlineSize, 800),
    fontSizePx: headlineSize,
    letterSpacingPx: headlineSize * -0.015,
    lineHeight: 1.08,
    align: 'center',
    maxWidthPx: headlineWrap,
  });
  const subRun = ctx.measure({
    text: SUBHEAD,
    font: fontString('body', subheadSize, 500),
    fontSizePx: subheadSize,
    letterSpacingPx: (subheadTrackingPct / 100) * subheadSize,
    lineHeight: 1.4,
    align: 'center',
    maxWidthPx: subheadWrap,
  });

  const headTop = safe.y + unit * 0.02;
  const subTop = safe.y + safe.h - subRun.height;
  const gutter = unit * 0.04;

  const bandTop = headTop + headRun.height + gutter;
  const bandBottom = subTop - gutter;
  const bandH = Math.max(unit * 0.2, bandBottom - bandTop);
  const bandCentreY = (bandTop + bandBottom) / 2;

  const radius = Math.min(unit * 0.3, bandH * 0.4);
  const cardW = Math.min(unit * 0.2, radius * 0.66);
  const cardH = cardW * 1.3;
  const glowSize = Math.min(unit * 0.62, bandH * 0.95);

  const layers: Layer[] = [];

  // ── Background ────────────────────────────────────────────────────────────
  layers.push({
    id: ctx.id('bg'),
    type: 'gradient',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0,
    anchorY: 0,
    tracks: { x: [kf(0, 0)], y: [kf(0, 0)] },
    props: {
      w: design.w,
      h: design.h,
      gradient: 'linear',
      angle: 115,
      stops: [
        { at: 0, paint: roleFill('surface') },
        { at: 1, paint: roleFill('bg') },
      ],
    },
  });

  // A soft accent glow, blurred. Exercises the offscreen blur pass and drifts
  // slowly so the loop never reads as static.
  layers.push({
    id: ctx.id('glow'),
    type: 'shape',
    startMs: 0,
    endMs: durationMs,
    tracks: {
      x: [kf(0, centreX - unit * 0.1, 'inOutSine'), kf(durationMs / 2, centreX + unit * 0.1, 'inOutSine'), kf(durationMs, centreX - unit * 0.1, 'inOutSine')],
      y: [kf(0, bandCentreY + bandH * 0.06)],
      blur: [kf(0, glowSize * 0.15)],
      opacity: [kf(0, 0, 'outCubic'), kf(1200, 0.5)],
    },
    props: {
      shape: 'ellipse',
      w: glowSize,
      h: glowSize,
      fill: roleFill('accent', 0.75),
    },
  });

  // ── An arc of cards, staggered in on springs ──────────────────────────────
  // Stands in for a photo repeater: exactly the shape a real multi-photo
  // template will take, minus the bitmaps.
  const CARD_COUNT = 7;
  const cards = Array.from({ length: CARD_COUNT }, (_, i) => i);

  const placements = ctx.arc(CARD_COUNT, {
    radius,
    startAngle: 158,
    endAngle: 22,
    cx: centreX,
    // The arc dips a full radius below its centre at the 90° point, so the
    // centre has to sit that far up plus half a card, or the lowest card
    // overruns the band and lands on top of the subhead.
    cy: bandBottom - radius - cardH * 0.5,
    faceOutward: true,
  });

  // Depth-sorted so the outer cards sit behind the middle ones. The renderer
  // has no z-buffer, so this is literally the draw order.
  const ordered = ctx.depthSort(
    ctx.repeat(cards, (_, i) => ({ i, placement: placements[i] })),
    ({ i }) => -Math.abs(i - (CARD_COUNT - 1) / 2),
  );

  for (const { i, placement } of ordered) {
    if (!placement) continue;
    const delay = ctx.stagger(i, CARD_COUNT, 70, 'center');

    layers.push({
      id: ctx.id('card'),
      type: 'shape',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, placement.x)],
        y: [kf(delay, placement.y + radius * 0.45), kf(delay + 700, placement.y, SPRINGS.snappy)],
        rotation: [kf(delay, placement.rotation - 8), kf(delay + 700, placement.rotation, SPRINGS.gentle)],
        scaleX: [kf(delay, 0.7), kf(delay + 700, 1, SPRINGS.bouncy)],
        scaleY: [kf(delay, 0.7), kf(delay + 700, 1, SPRINGS.bouncy)],
        opacity: [kf(delay, 0), kf(delay + 260, 1)],
      },
      props: {
        shape: 'rect',
        w: cardW,
        h: cardH,
        cornerRadius: cardW * 0.09,
        fill: i % 2 === 0 ? roleFill('ink', 0.92) : roleFill('accent'),
        shadow: { blur: cardW * 0.18, offsetX: 0, offsetY: cardW * 0.06, paint: colorFill('rgba(0,0,0,0.45)') },
      },
    });
  }

  // ── A masked group: a rotating bar clipped to a circle ────────────────────
  const maskSize = Math.min(unit * 0.17, bandH * 0.22);
  // Proves masks clip their children and that a group's children run on time
  // relative to the group, not to the scene.
  layers.push({
    id: ctx.id('mask'),
    type: 'mask',
    startMs: 600,
    endMs: durationMs,
    tracks: {
      x: [kf(0, centreX)],
      y: [kf(0, bandTop + maskSize * 0.75)],
      scaleX: [kf(0, 0), kf(900, 1, SPRINGS.snappy)],
      scaleY: [kf(0, 0), kf(900, 1, SPRINGS.snappy)],
    },
    props: { shape: 'ellipse', w: maskSize, h: maskSize },
    children: [
      {
        id: ctx.id('maskfill'),
        type: 'shape',
        startMs: 0,
        endMs: durationMs,
        anchorX: 0.5,
        anchorY: 0.5,
        tracks: {},
        props: { shape: 'rect', w: maskSize, h: maskSize, fill: roleFill('surface') },
      },
      {
        id: ctx.id('maskbar'),
        type: 'shape',
        startMs: 0,
        endMs: durationMs,
        tracks: {
          rotation: [kf(0, 0, 'linear'), kf(durationMs, 360, 'linear')],
        },
        props: { shape: 'rect', w: maskSize * 1.5, h: maskSize * 0.29, fill: roleFill('accent') },
      },
    ],
  });

  // ── Type ──────────────────────────────────────────────────────────────────
  layers.push({
    id: ctx.id('headline'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: {
      x: [kf(0, centreX)],
      y: [kf(0, headTop)],
    },
    props: {
      text: HEADLINE,
      fontId: 'headline',
      fontSizePx: headlineSize,
      weight: 800,
      letterSpacingPct: -1.5,
      lineHeight: 1.08,
      align: 'center',
      fill: roleFill('ink'),
      maxWidthPx: headlineWrap,
      reveal: { kind: 'perChar', startMs: 260, durationMs: 420, staggerMs: 26 },
    },
  });

  layers.push({
    id: ctx.id('subhead'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: {
      x: [kf(0, centreX)],
      y: [kf(0, subTop)],
      letterSpacing: [kf(1400, -subheadSize * 0.06), kf(2600, 0, 'outExpo')],
    },
    props: {
      text: SUBHEAD,
      fontId: 'body',
      fontSizePx: subheadSize,
      weight: 500,
      letterSpacingPct: subheadTrackingPct,
      lineHeight: 1.4,
      align: 'center',
      fill: roleFill('inkMuted'),
      maxWidthPx: subheadWrap,
      reveal: { kind: 'maskWipe', dir: 'right', startMs: 1400, durationMs: 900 },
    },
  });

  return layers;
}
