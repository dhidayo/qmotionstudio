import { roleFill, type KineticMotion, type KineticOrder, type KineticUnit, type Layer, type Reveal, type Tracks } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { flag, num, pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate, TextSlotDef } from '../schema';
import { backgroundLayer, contentFloor } from '../_shared/chrome';
import { fillSlots, photoProps } from '../_shared/photo';
import { defineScene, headlineSlot, kf, measureSlot, placeText, rect, sublineSlot } from './kit';

/**
 * Text Motion (D-119): a story told in words.
 *
 * One headline that moves into place — letter by letter, word by word or a
 * line at a time, by any of the kinetic motions (D-118) — with an optional
 * second line, a second phrase it turns into, and an accent: a rule, an
 * underline that draws, a lower-third bar, corner brackets, a quote mark.
 * These are the scenes the text-only Corporate Ads are built from.
 */

type Layout = 'center' | 'lower' | 'stack' | 'third';
type Accent = 'none' | 'rule' | 'underline' | 'bar' | 'brackets' | 'quote';
type Backdrop = 'palette' | 'accent' | 'photo';
type Motion = KineticMotion | 'mask' | 'swap' | 'count' | 'fade' | 'punch' | 'tracking';

const MOTIONS: readonly Motion[] = [
  'rise', 'drop', 'pop', 'scatter', 'wave', 'focus', 'slideLeft', 'slideRight', 'split', 'flip', 'stretch',
  'glitch', 'typewriter', 'zoom', 'tilt', 'mask', 'swap', 'count', 'fade', 'punch', 'tracking',
];

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const motion = pick<Motion>(p, 'motion', MOTIONS, 'rise');
  const unit = pick<KineticUnit>(p, 'unit', ['char', 'word', 'line'], 'word');
  const layout = pick<Layout>(p, 'layout', ['center', 'lower', 'stack', 'third'], 'center');
  const accent = pick<Accent>(p, 'accent', ['none', 'rule', 'underline', 'bar', 'brackets', 'quote'], 'none');
  const backdrop = pick<Backdrop>(p, 'bg', ['palette', 'accent', 'photo'], 'palette');
  const order = pick<KineticOrder>(p, 'order', ['start', 'end', 'center', 'random'], 'start');
  const align = layout === 'lower' || layout === 'third' || text(p, 'align', 'center') === 'left' ? 'left' : 'center';
  const hasSub = flag(p, 'sub', true);
  const hasAlt = motion === 'swap' || motion === 'punch' || flag(p, 'second');

  const headline = headlineSlot(text(p, 'headline', 'Your words, in motion'), { align, ...(layout === 'stack' ? { sizePct: 100 } : {}) }, 90);
  const subline = sublineSlot(text(p, 'subline', 'Change the words — the motion stays'), { align });
  const alt: TextSlotDef = { ...headlineSlot(text(p, 'alt', 'Then say the next thing'), { align }, 90), id: 'alt', label: 'Second phrase' };
  const slots = [headline, ...(hasAlt ? [alt] : []), ...(hasSub ? [subline] : [])];

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { design, safe, durationMs } = ctx;
    const u = Math.min(design.w, design.h);
    const layers: Layer[] = [];
    const sizeShare = num(p, 'size', layout === 'stack' ? 0.15 : layout === 'third' ? 0.06 : 0.095);
    const size = u * sizeShare;
    const dur = num(p, 'dur', 700);
    const stagger = num(p, 'stagger', unit === 'char' ? 38 : unit === 'word' ? 110 : 260);
    const start = num(p, 'start', 300);
    const onAccent = backdrop === 'accent';
    const ink = onAccent ? roleFill('bg') : roleFill('ink');

    // The ground.
    if (backdrop === 'accent') {
      layers.push(rect(ctx, 'ground', { w: design.w, h: design.h, x: 0, y: 0, anchorX: 0, anchorY: 0, fill: roleFill('accent') }));
    } else if (backdrop === 'photo') {
      const [photo] = fillSlots(inputs.photos, 1);
      if (photo) {
        const props = photoProps(photo, Math.max(design.w, design.h) * 1.18);
        layers.push({
          id: ctx.id('photo'),
          type: 'image',
          startMs: 0,
          endMs: durationMs,
          tracks: {
            x: [kf(0, design.w / 2)],
            y: [kf(0, design.h / 2)],
            scaleX: [kf(0, 1, 'inOutSine'), kf(durationMs, 1.08, 'inOutSine')],
            scaleY: [kf(0, 1, 'inOutSine'), kf(durationMs, 1.08, 'inOutSine')],
            opacity: [kf(0, 0), kf(600, 1)],
          },
          props,
        });
      }
      layers.push(rect(ctx, 'scrim', { w: design.w, h: design.h, x: 0, y: 0, anchorX: 0, anchorY: 0, fill: roleFill('bg', 0.55) }));
    } else {
      layers.push(backgroundLayer(inputs, ctx));
    }

    // Where the words go.
    const maxW = layout === 'stack' ? u * 0.62 : layout === 'third' ? safe.w * 0.7 : safe.w * 0.88;
    const head = measureSlot(ctx, headline, inputs, size, maxW, layout === 'stack' ? 0.98 : 1.06);
    const subSize = u * 0.034;
    const sub = hasSub ? measureSlot(ctx, subline, inputs, subSize, maxW, 1.3) : { width: 0, height: 0 };
    const gap = u * 0.035;
    const blockH = head.height + (hasSub ? gap + sub.height : 0);
    const left = align === 'left';
    const x = left ? safe.x + (layout === 'third' ? u * 0.05 : 0) : design.w / 2;
    let top: number;
    if (layout === 'lower' || layout === 'third') top = contentFloor(design, safe) - blockH - (layout === 'third' ? u * 0.02 : 0);
    else top = design.h / 2 - blockH / 2;

    const reveal = revealFor(motion, unit, order, start, dur, stagger, durationMs, flag(p, 'exit'), text(p, 'alt', ''), inputs);
    const tracks: Tracks = motion === 'tracking'
      ? { letterSpacing: [kf(start, size * 0.6), kf(start + 1600, 0, 'outExpo')], opacity: [kf(start, 0), kf(start + 600, 1)] }
      : {};

    // The accent, under the words.
    const accentColour = onAccent ? roleFill('bg') : roleFill('accent');
    const blockW = left ? Math.min(maxW, Math.max(head.width, sub.width)) : Math.max(head.width, sub.width);
    const blockLeft = left ? x : x - blockW / 2;
    if (accent === 'bar' || layout === 'third') {
      const barH = blockH + u * 0.06;
      layers.push(rect(ctx, 'bar', {
        w: blockW + u * 0.1, h: barH, x: blockLeft - u * 0.05, y: top - u * 0.03, anchorX: 0, anchorY: 0,
        fill: roleFill(onAccent ? 'bg' : 'surface', 0.92), radius: u * 0.012,
        tracks: { scaleX: [kf(start - 200, 0), kf(start + 350, 1, 'outExpo')] },
      }));
      layers.push(rect(ctx, 'barEdge', {
        w: u * 0.012, h: barH, x: blockLeft - u * 0.05, y: top - u * 0.03, anchorX: 0, anchorY: 0, fill: roleFill('accent'),
        tracks: { scaleY: [kf(start - 200, 0), kf(start + 200, 1, 'outExpo')] },
      }));
    }
    if (accent === 'rule') {
      layers.push(rect(ctx, 'rule', {
        w: u * 0.11, h: Math.max(3, u * 0.008), x: left ? blockLeft : design.w / 2, y: top - u * 0.05, anchorX: left ? 0 : 0.5, fill: accentColour,
        tracks: { scaleX: [kf(start, 0), kf(start + 600, 1, 'outExpo')] },
      }));
    }
    if (accent === 'quote') {
      layers.push({
        id: ctx.id('quoteMark'),
        type: 'text',
        startMs: 0,
        endMs: durationMs,
        anchorX: left ? 0 : 0.5,
        anchorY: 0,
        // A text layer has no height to anchor on, so the mark is placed by its
        // top: its glyph sits in the upper part of its own line box.
        tracks: { x: [kf(0, left ? blockLeft : design.w / 2)], y: [kf(0, top - size * 1.55)], opacity: [kf(start - 200, 0), kf(start + 300, 1)], scaleX: [kf(start - 200, 0.6), kf(start + 400, 1, 'outBack')], scaleY: [kf(start - 200, 0.6), kf(start + 400, 1, 'outBack')] },
        props: {
          text: '“', fontId: 'headline', fontSizePx: size * 2.4, weight: 800, letterSpacingPct: 0, lineHeight: 1, align: 'left',
          fill: accentColour, maxWidthPx: null, reveal: { kind: 'none' },
        },
      });
    }
    if (accent === 'brackets') {
      const pad = u * 0.05;
      const arm = u * 0.06;
      const thick = Math.max(3, u * 0.007);
      const boxL = blockLeft - pad;
      const boxR = blockLeft + blockW + pad;
      const boxT = top - pad;
      const boxB = top + blockH + pad;
      const corners: [number, number, number, number][] = [[boxL, boxT, 1, 1], [boxR, boxT, -1, 1], [boxL, boxB, 1, -1], [boxR, boxB, -1, -1]];
      corners.forEach(([cx, cy, dx, dy], i) => {
        const inFrom = start - 100 + i * 60;
        const slide = { x: [kf(inFrom, cx - dx * u * 0.05), kf(inFrom + 500, cx, 'outExpo')], y: [kf(inFrom, cy - dy * u * 0.05), kf(inFrom + 500, cy, 'outExpo')], opacity: [kf(inFrom, 0), kf(inFrom + 300, 1)] };
        layers.push(rect(ctx, 'armH', { w: arm, h: thick, x: cx, y: cy, anchorX: dx > 0 ? 0 : 1, anchorY: dy > 0 ? 0 : 1, fill: accentColour, tracks: slide }));
        layers.push(rect(ctx, 'armV', { w: thick, h: arm, x: cx, y: cy, anchorX: dx > 0 ? 0 : 1, anchorY: dy > 0 ? 0 : 1, fill: accentColour, tracks: slide }));
      });
    }

    // The words.
    const clip = flag(p, 'clip');
    const placed = placeText(ctx, headline, inputs, {
      sizePx: size, maxWidthPx: maxW, reveal, x, y: top, anchorX: left ? 0 : 0.5, fill: ink,
      lineHeight: layout === 'stack' ? 0.98 : 1.06, tracks,
      ...(motion === 'punch' ? { endMs: Math.round(durationMs * 0.5) } : {}),
    });
    if (clip) {
      layers.push({
        id: ctx.id('clip'),
        type: 'mask',
        startMs: 0,
        endMs: durationMs,
        anchorX: 0,
        anchorY: 0,
        tracks: { x: [kf(0, left ? x : x - maxW / 2 - u * 0.02)], y: [kf(0, top - u * 0.01)] },
        props: { shape: 'rect', w: maxW + u * 0.04, h: head.height + u * 0.03 },
        children: [{ ...placed.layer, tracks: { ...placed.layer.tracks, x: [kf(0, left ? 0 : maxW / 2 + u * 0.02)], y: [kf(0, u * 0.01)] } }],
      });
    } else {
      layers.push(placed.layer);
    }

    if (motion === 'punch' && hasAlt) {
      const second = placeText(ctx, alt, inputs, {
        sizePx: size, maxWidthPx: maxW, x, y: top, anchorX: left ? 0 : 0.5, fill: ink,
        startMs: Math.round(durationMs * 0.5),
        reveal: { kind: 'kinetic', unit: 'word', motion: 'zoom', startMs: 0, durationMs: 520, staggerMs: 70 },
      });
      layers.push(second.layer);
    } else if (hasAlt && motion !== 'swap') {
      // A second phrase that arrives under the first: a question, then its answer.
      const answerTop = top + head.height + gap;
      const second = placeText(ctx, alt, inputs, {
        sizePx: size * 0.8, maxWidthPx: maxW, x, y: answerTop, anchorX: left ? 0 : 0.5, fill: roleFill(onAccent ? 'bg' : 'accent'),
        reveal: { kind: 'kinetic', unit: 'word', motion: 'pop', startMs: Math.round(durationMs * 0.42), durationMs: 520, staggerMs: 90 },
      });
      layers.push(second.layer);
    }

    if (accent === 'underline') {
      const lineW = Math.min(maxW, head.width);
      layers.push(rect(ctx, 'underline', {
        w: lineW, h: Math.max(4, u * 0.01), x: left ? x : design.w / 2 - lineW / 2, y: top + head.height + u * 0.012, anchorX: 0, anchorY: 0, fill: accentColour,
        tracks: { scaleX: [kf(start + dur, 0), kf(start + dur + 700, 1, 'outExpo')] },
      }));
    }

    // The second line waits for the headline to finish arriving, however long
    // its letters or words take.
    const words = (inputs.texts['headline'] ?? headline.placeholder).split(/\s+/).length;
    const letters = (inputs.texts['headline'] ?? headline.placeholder).replace(/\s/g, '').length;
    const units = unit === 'char' ? letters : unit === 'word' ? words : 1;
    const subStart = Math.min(durationMs * 0.6, start + dur + 250 + Math.max(0, units - 1) * (motion === 'mask' || motion === 'swap' || motion === 'count' || motion === 'tracking' ? 0 : stagger));
    if (hasSub) {
      const subTop = top + head.height + gap + (hasAlt && motion !== 'swap' && motion !== 'punch' ? head.height * 0.8 + gap : 0) + (accent === 'underline' ? u * 0.02 : 0);
      const subLayer = placeText(ctx, subline, inputs, {
        sizePx: subSize, maxWidthPx: maxW, x, y: subTop, anchorX: left ? 0 : 0.5,
        fill: onAccent ? roleFill('bg', 0.8) : roleFill('inkMuted'), lineHeight: 1.3,
        reveal: { kind: 'kinetic', unit: 'line', motion: 'rise', startMs: subStart, durationMs: 650, staggerMs: 120 },
      });
      layers.push(subLayer.layer);
    }

    return layers;
  };

  return defineScene(variant, { textSlots: slots, build });
}

function revealFor(
  motion: Motion,
  unit: KineticUnit,
  order: KineticOrder,
  start: number,
  dur: number,
  stagger: number,
  durationMs: number,
  exits: boolean,
  altText: string,
  inputs: SceneInputs,
): Reveal {
  switch (motion) {
    case 'mask':
      return { kind: 'maskWipe', dir: 'right', startMs: start, durationMs: dur + 300 };
    case 'swap':
      return { kind: 'swap', altText: inputs.texts['alt'] ?? altText, atMs: Math.round(durationMs * 0.48), durationMs: 800 };
    case 'count':
      return { kind: 'count', startMs: start, durationMs: Math.max(1200, dur * 2.2) };
    case 'fade':
      return { kind: 'perWord', startMs: start, durationMs: dur, staggerMs: stagger };
    case 'tracking':
      return { kind: 'fade', startMs: start, durationMs: 500 };
    case 'punch':
      return {
        kind: 'kinetic', unit, motion: 'pop', startMs: start, durationMs: dur, staggerMs: stagger, order,
        exit: { atMs: Math.round(durationMs * 0.5) - 420, durationMs: 360, staggerMs: 0, motion: 'zoom' },
      };
    default:
      return {
        kind: 'kinetic', unit, motion, startMs: start, durationMs: dur, staggerMs: stagger, order,
        ...(motion === 'typewriter' ? { caret: true } : {}),
        ...(exits ? { exit: { atMs: durationMs - 900, durationMs: 500, staggerMs: Math.round(stagger * 0.4), motion: 'fade' as const } } : {}),
      };
  }
}
