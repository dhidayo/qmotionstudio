import { roleFill, type Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { flag, num, pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';
import { backgroundLayer } from '../_shared/chrome';
import { fillSlots, untagged } from '../_shared/photo';
import { cardCount, cardProps, defineScene, depthGroup, FOCUS, focusCurve, headlineAndStage, headlineSlot, kf, linger, part, rect, sampled, shapeSlot } from './kit';
import { focusIn, lingerAt } from './emphasis';

/**
 * Marquee (D-119): rows and columns of photographs that never stop — a
 * ticker, a tilted wall, a film strip, columns drifting at their own pace.
 *
 * A row is longer than the frame and wraps; the wrap is a cut (see
 * `sampled`), so no card ever streaks back across. Only the first copy of each
 * photo is the selectable original; the copies that fill the rows repeat it.
 *
 * One photo is in focus at every moment (D-157): the middle lane (or the two
 * middle lanes, taking turns) slows a little as each photo reaches the centre
 * of the frame, and that photo grows and comes forward while every other
 * steps back and darkens — by shade, not opacity, which the rows' own fade-in
 * uses.
 */

type Shape = 'ticker' | 'tilted' | 'mosaic' | 'columns' | 'wall' | 'pillar' | 'filmstrip';

const SHAPES: readonly Shape[] = ['ticker', 'tilted', 'mosaic', 'columns', 'wall', 'pillar', 'filmstrip'];

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const shape = pick<Shape>(p, 'shape', SHAPES, 'ticker');
  const headline = headlineSlot(text(p, 'headline', 'Always something new'), {}, 50);

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { durationMs, design } = ctx;
    const n = cardCount(inputs, variant);
    const photos = fillSlots(inputs.photos, n);
    const { headline: head, stage } = headlineAndStage(ctx, inputs, headline, { bottom: flag(p, 'textBelow') });
    const u = Math.min(design.w, design.h);
    const vertical = shape === 'columns' || shape === 'wall' || shape === 'pillar';
    const lanes = shape === 'ticker' || shape === 'filmstrip' || shape === 'pillar' ? 1 : num(p, 'lanes', shape === 'wall' ? 4 : 3);
    const angle = shape === 'tilted' ? num(p, 'angle', -12) : 0;
    const rad = (angle * Math.PI) / 180;

    // Lane geometry: lanes across the short way, cards along the long way.
    const across = vertical ? stage.w : stage.h;
    // A single horizontal row in a tall frame is limited by the width, or one
    // card fills the screen.
    const single = shape === 'ticker' || shape === 'filmstrip';
    const laneSize = Math.min(
      (across / lanes) * (single ? 0.62 : shape === 'pillar' ? 0.5 : 0.9),
      single ? stage.w * 0.42 : Number.POSITIVE_INFINITY,
      // A pillar in a wide frame is limited by the height, so the photo in
      // focus fits the stage.
      shape === 'pillar' ? stage.h * 0.6 : Number.POSITIVE_INFINITY,
    );
    const card = laneSize * 0.92;
    const step = card * (shape === 'filmstrip' ? 1.08 : 1.12);
    const along = (vertical ? design.h : Math.hypot(design.w, design.h)) + step * 2;
    const perLane = Math.ceil(along / step) + 1;
    const span = perLane * step;
    const cycleMs = durationMs / Math.max(1, Math.round(num(p, 'loops', 1)));

    const layers: Layer[] = [backgroundLayer(inputs, ctx)];
    if (shape === 'filmstrip') {
      // The strip itself, with sprocket holes along both edges.
      const stripH = card * 1.32;
      const film: Layer[] = [rect(ctx, 'strip', { w: design.w * 1.2, h: stripH, x: stage.cx, y: stage.cy, fill: roleFill('surface') })];
      const holes = Math.ceil(design.w / (u * 0.05)) + 2;
      for (const edge of [-1, 1]) {
        for (let h = 0; h < holes; h++) {
          const baseX = h * u * 0.05;
          film.push(rect(ctx, 'hole', {
            w: u * 0.024, h: u * 0.018, x: 0, y: stage.cy + edge * stripH * 0.42, radius: u * 0.004, fill: roleFill('bg'),
            tracks: sampled(0, durationMs, 100, (ms) => ({ x: ((baseX - (ms / cycleMs) * span) % (holes * u * 0.05) + holes * u * 0.05) % (holes * u * 0.05) - u * 0.05, y: stage.cy + edge * stripH * 0.42 }), u * 0.5),
          }));
        }
      }
      // The strip and its holes, one part (D-159). It runs the width of the picture behind the photos, so it is
      // recoloured or deleted from Style rather than picked, and a click beside a photo still reaches the background.
      layers.push(part(ctx, 'film', shapeSlot('filmStrip', 'Film strip', { tint: 'surface', pick: false }), { x: stage.cx, y: stage.cy }, film));
    }

    // The lanes that carry the focus: the middle one, or the middle two
    // taking turns, half a card apart (D-157).
    const focusLanes = lanes % 2 === 1 ? [(lanes - 1) / 2] : [lanes / 2 - 1, lanes / 2];
    const sharing = focusLanes.length > 1;
    const peak = shape === 'filmstrip' ? 1.12 : lanes === 1 ? FOCUS.peak : 1.3;
    const directionOf = (lane: number): number => (shape === 'wall' || shape === 'mosaic' || shape === 'tilted' ? (lane % 2 === 0 ? 1 : -1) : shape === 'pillar' ? -1 : 1);
    const staggerOf = (lane: number): number => (shape === 'mosaic' || shape === 'wall' || shape === 'columns' ? (lane % 2) * 0.5 : 0);
    // Two lanes sharing the focus must reach the centre half a card apart;
    // when their own stagger does not already do that, the second one shifts.
    const beatOf = (lane: number): number => (((staggerOf(lane) + ((directionOf(lane) - 1) * perLane) / 2) % 1) + 1) % 1;
    const sameBeat = sharing && Math.abs(beatOf(focusLanes[0] ?? 0) - beatOf(focusLanes[1] ?? 0)) < 0.25;
    const cards: Layer[] = [];
    let k = 0;
    for (let lane = 0; lane < lanes; lane++) {
      const offsetAcross = (lane - (lanes - 1) / 2) * (across / lanes);
      const direction = directionOf(lane);
      const speed = shape === 'columns' ? 0.6 + (lane % 3) * 0.3 : shape === 'mosaic' ? 0.8 + (lane % 2) * 0.4 : 1;
      const stagger = staggerOf(lane) + (sharing && lane === focusLanes[1] && sameBeat ? 0.5 : 0);
      const focused = focusLanes.includes(lane);
      /** How far the lane has run, in card steps; a focus lane lingers as each photo reaches the centre. */
      const run = (ms: number): number => {
        const raw = (ms / cycleMs) * perLane * speed;
        if (!focused) return direction * raw;
        if (sharing) return direction * (linger((raw - perLane / 2) * 2) / 2 + perLane / 2);
        return lingerAt(direction * raw, stagger - perLane / 2);
      };
      for (let c = 0; c < perLane; c++) {
        const photo = photos[k % n];
        if (!photo) continue;
        const original = k < n;
        k += 1;
        const props = cardProps(photo, card, inputs, u, shape !== 'filmstrip');
        const box = { w: props.w, h: props.h };
        const tracks = sampled(0, durationMs, 80, (ms) => {
          const steps = (((c + stagger + run(ms)) % perLane) + perLane) % perLane - perLane / 2;
          const pos = steps * step;
          const ax = vertical ? stage.cx + offsetAcross : stage.cx + pos * Math.cos(rad) - offsetAcross * Math.sin(rad);
          const ay = vertical ? stage.cy + pos : stage.cy + pos * Math.sin(rad) + offsetAcross * Math.cos(rad);
          const f = focused ? focusCurve(steps, sharing ? FOCUS.reach / 2 : FOCUS.reach) : 0;
          return focusIn({ x: ax, y: ay, rotation: angle }, f, stage, box, peak);
        }, step * 3);
        cards.push({
          id: ctx.id('tile'),
          type: 'image',
          startMs: 0,
          endMs: durationMs,
          tracks: { ...tracks, opacity: [kf(0, 0), kf(400 + lane * 120, 1)] },
          props: original ? props : untagged(props),
        });
      }
    }
    layers.push(depthGroup(ctx, 'lanes', cards));
    // Rows that run edge to edge pass under the headline: a band of the
    // background behind it keeps the words legible.
    const bandBottom = stage.cy - stage.h / 2;
    // Light for legibility rather than a shape anyone picks; it goes where the headline goes (D-159).
    layers.push(rect(ctx, 'headBand', { w: design.w, h: bandBottom, x: 0, y: 0, anchorX: 0, anchorY: 0, fill: roleFill('bg', 0.82), follows: `text:${headline.id}` }));
    layers.push(head);
    return layers;
  };

  return defineScene(variant, { textSlots: [headline], build });
}
