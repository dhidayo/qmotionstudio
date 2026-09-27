import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_BLEED_LOOK, BODY_STYLE, HEADLINE_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';
import { logoLayers } from '../_shared/chrome';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

const SLOTS = {
  figure: {
    id: 'figure',
    label: 'Figure',
    placeholder: '98%',
    maxChars: 8,
    // Mono, because a figure is a figure: proportional digits in a headline
    // face sit unevenly at this size and the eye reads the gaps as a stumble.
    defaultStyle: {
      ...HEADLINE_STYLE, fontId: 'mono', weight: 800 as const, align: 'center' as const, letterSpacingPct: -3,
    },
  },
  label: {
    id: 'label',
    label: 'What it measures',
    placeholder: 'came back within a month',
    maxChars: 52,
    defaultStyle: { ...HEADLINE_STYLE, weight: 700 as const, align: 'center' as const, letterSpacingPct: -0.5 },
  },
  source: {
    id: 'source',
    label: 'Source',
    placeholder: 'Across 1,200 orders, 2025',
    maxChars: 56,
    defaultStyle: { ...BODY_STYLE, align: 'center' as const, letterSpacingPct: 8, weight: 600 as const },
  },
};

/**
 * Big Number.
 *
 * One figure, what it measures, and where it came from, over a photograph. The
 * single most shared kind of post there is, and the library had no way to make
 * one: Statement can carry a sentence but a sentence set at headline size is not
 * a statistic, and a statistic set as a sentence gets scrolled past.
 *
 * The figure arrives per character with a spring, so a percentage lands digit by
 * digit and reads as a count rather than as a caption fading up. Everything else
 * waits for it — the label is the punchline and the punchline goes second.
 *
 * The rule between the figure and the label is drawn from the centre outwards and
 * measured to the label's width, so it belongs to the pair rather than being a
 * decoration of a fixed length that happens to sit near them.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [];

  const [photo] = fillSlots(inputs.photos, 1);
  if (photo) {
    // Full bleed, oversized so the slow push never exposes an edge.
    const props = photoProps(photo, Math.max(design.w, design.h) * 1.18);
    layers.push({
      id: ctx.id('photo'),
      type: 'image',
      startMs: 0,
      endMs: durationMs,
      tracks: {
        x: [kf(0, design.w / 2)],
        y: [kf(0, design.h / 2)],
        scaleX: [kf(0, 1, 'inOutSine'), kf(durationMs, 1.1, 'inOutSine')],
        scaleY: [kf(0, 1, 'inOutSine'), kf(durationMs, 1.1, 'inOutSine')],
        opacity: [kf(0, 0), kf(420, 1)],
      },
      props,
    });
  }

  // A figure has to read instantly, so the scrim is heavier than Statement's and
  // weighted to the middle rather than to the bottom.
  layers.push({
    id: ctx.id('scrim'),
    type: 'gradient',
    startMs: 0,
    endMs: durationMs,
    tracks: { x: [kf(0, design.w / 2)], y: [kf(0, design.h / 2)] },
    props: {
      w: design.w,
      h: design.h,
      gradient: 'radial',
      stops: [
        { at: 0, paint: colorFill('rgba(0,0,0,0.74)') },
        { at: 0.7, paint: colorFill('rgba(0,0,0,0.5)') },
        { at: 1, paint: colorFill('rgba(0,0,0,0.72)') },
      ],
    },
  });

  const figure = textFor(SLOTS.figure, inputs, {
    baseSizePx: unit * 0.26,
    maxWidthPx: safe.w,
    reveal: { kind: 'perChar', startMs: 260, durationMs: 380, staggerMs: 90 },
    lineHeight: 1,
  });
  const label = textFor(SLOTS.label, inputs, {
    baseSizePx: unit * 0.054,
    maxWidthPx: safe.w * 0.82,
    reveal: { kind: 'perWord', startMs: 1_000, durationMs: 460, staggerMs: 76 },
    lineHeight: 1.12,
  });
  const source = textFor(SLOTS.source, inputs, {
    baseSizePx: unit * 0.02,
    maxWidthPx: safe.w * 0.72,
    reveal: { kind: 'fade', startMs: 1_700, durationMs: 640 },
    fallbackFill: roleFill('inkMuted'),
  });

  const figRun = ctx.measure(specFor(figure, fontString(figure.fontId, figure.fontSizePx, figure.weight)));
  const labRun = ctx.measure(specFor(label, fontString(label.fontId, label.fontSizePx, label.weight)));
  const srcRun = ctx.measure(specFor(source, fontString(source.fontId, source.fontSizePx, source.weight)));

  const ruleGap = unit * 0.03;
  const ruleH = Math.max(2, unit * 0.004);
  const blockH = figRun.height + ruleGap * 2 + ruleH + labRun.height + unit * 0.03 + srcRun.height;
  const blockTop = safe.y + Math.max(0, (safe.h - blockH) / 2);
  const centreX = design.w / 2;

  layers.push({
    id: ctx.id('figure'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: {
      x: [kf(0, centreX)],
      y: [kf(0, blockTop)],
      // A small settle on the whole figure under the per-character reveal, so
      // the digits land as one object rather than as separate arrivals.
      scaleX: [kf(0, 0.94), kf(760, 1, { kind: 'spring', stiffness: 160, damping: 16, mass: 1 })],
      scaleY: [kf(0, 0.94), kf(760, 1, { kind: 'spring', stiffness: 160, damping: 16, mass: 1 })],
    },
    props: figure,
  });

  const ruleY = blockTop + figRun.height + ruleGap;
  layers.push({
    id: ctx.id('rule'),
    type: 'shape',
    startMs: 0,
    endMs: durationMs,
    tracks: {
      x: [kf(0, centreX)],
      y: [kf(0, ruleY + ruleH / 2)],
      scaleX: [kf(760, 0), kf(1_340, 1, 'outExpo')],
      opacity: [kf(700, 0), kf(820, 1)],
    },
    props: {
      shape: 'rect',
      // Measured to the label, so the rule belongs to the pair it separates.
      w: Math.max(unit * 0.08, Math.min(labRun.width, safe.w * 0.82)),
      h: ruleH,
      fill: roleFill('accent'),
      cornerRadius: ruleH / 2,
    },
  });

  layers.push({
    id: ctx.id('label'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: { x: [kf(0, centreX)], y: [kf(0, ruleY + ruleH + ruleGap)] },
    props: label,
  });

  layers.push({
    id: ctx.id('source'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: {
      x: [kf(0, centreX)],
      y: [kf(0, ruleY + ruleH + ruleGap + labRun.height + unit * 0.03)],
    },
    props: source,
  });

  layers.push(...logoLayers(inputs, ctx));

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'kinetic-counter',
  name: 'Big Number',
  category: 'Kinetic Type',
  mode: 'both',
  tier: 'free',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 6_000,
  minDurationMs: 3_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 1, max: 1, default: 1 },
  textSlots: [SLOTS.figure, SLOTS.label, SLOTS.source],
  supportsLogo: true,
  look: FULL_BLEED_LOOK,
  build,
};

export default template;
