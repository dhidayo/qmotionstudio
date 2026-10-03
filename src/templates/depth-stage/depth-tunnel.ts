import { colorFill, roleFill, type Keyframe, type Layer } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK, BODY_STYLE, HEADLINE_STYLE } from '../_shared/look';
import { fillSlots, photoProps } from '../_shared/photo';
import { specFor, textFor } from '../_shared/text';
import { backgroundLayer, contentFloor } from '../_shared/chrome';

const kf = (t: number, v: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe => ({ t, v, ease });

const SLOTS = {
  headline: {
    id: 'headline',
    label: 'Headline',
    placeholder: 'Every angle of it',
    maxChars: 42,
    defaultStyle: { ...HEADLINE_STYLE, align: 'center' as const },
  },
  caption: {
    id: 'caption',
    label: 'Caption',
    placeholder: 'Swipe up to see the range',
    maxChars: 56,
    defaultStyle: { ...BODY_STYLE, align: 'center' as const },
  },
};

/**
 * Depth Tunnel.
 *
 * Photographs travelling out of a vanishing point and past the camera, one
 * after another, for as long as the scene runs. Where Parallax Depth eases a
 * fixed arrangement forward once and Card Stack deals cards face-on, this never
 * settles: there is always something arriving and something leaving, which is
 * what holds a thumb on a feed.
 *
 * Scale and position do all the work. Canvas has no perspective transform, so
 * distance is expressed as a geometric scale ramp plus an offset that grows with
 * it — a photo near the camera sits further off-axis than the same photo did
 * when it was distant, which is exactly what perspective divergence looks like.
 * Deliberately no blur: it is the honest depth cue here, and it would mean an
 * offscreen pass per photo per frame against §14's budget.
 *
 * Seamless, and the arithmetic for that is the whole design. Layers are *legs*
 * of the journey, not photos (the same reasoning as Card Stack's slots): leg s
 * carries whichever photo is travelling from station s to station s + 1 during
 * this turn, so draw order is leg order and never changes. At the loop point the
 * photo leaving the camera is at zero opacity and the photo entering at the
 * vanishing point is too, so the wrap has nothing to show.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  const { design, safe, durationMs } = ctx;
  const unit = Math.min(design.w, design.h);
  const layers: Layer[] = [backgroundLayer(inputs, ctx)];

  const count = Math.max(2, Math.min(inputs.photos.length || 4, 8));
  const photos = fillSlots(inputs.photos, count);
  const legMs = durationMs / count;

  const cx = design.w / 2;
  const cy = design.h / 2;
  const baseSize = unit * 0.66;

  /*
   * How much smaller the furthest station is than the nearest.
   *
   * Fixed as a ratio rather than as a per-station factor, so eight photos make
   * a longer tunnel rather than a tunnel whose far end is a speck: a per-station
   * 1.6 over eight stations would put the first arrival at 2% of full size,
   * which reads as dirt on the lens.
   */
  const FAR = 0.26;
  const growth = count > 1 ? Math.min(1.8, (1 / FAR) ** (1 / (count - 1))) : 1.6;
  const scaleAt = (station: number): number => growth ** (station - (count - 1));

  /*
   * Each photo keeps its own bearing out of the centre, spaced by the golden
   * angle so no two consecutive arrivals leave along the same line.
   *
   * The divergence is large on purpose. Flying straight down the axis is what a
   * tunnel actually is, and it looks like a single photograph growing, because
   * everything behind the nearest one is directly behind the nearest one. A
   * photograph that swings well off-axis as it approaches — and leaves the frame
   * at the edge rather than at the centre — is what opens the view back down the
   * tunnel and lets four distances be visible at once.
   */
  const GOLDEN_DEG = 137.508;
  const driftPx = unit * 0.4;
  const bearing = (photoIndex: number): { cos: number; sin: number } => {
    const radians = (photoIndex * GOLDEN_DEG * Math.PI) / 180;
    return { cos: Math.cos(radians), sin: Math.sin(radians) };
  };

  for (let leg = 0; leg < count; leg++) {
    const fromScale = scaleAt(leg);
    const toScale = scaleAt(leg + 1);
    // One extra sample at the geometric mean. Interpolating a geometric ramp
    // linearly leaves a visible kink at each station; halving the error is
    // enough to lose it, and cheaper than easing every leg separately.
    const midScale = Math.sqrt(fromScale * toScale);

    const isFirst = leg === 0;
    const isLast = leg === count - 1;

    for (let photoIndex = 0; photoIndex < count; photoIndex++) {
      const photo = photos[photoIndex];
      if (!photo) continue;

      // The turn during which this photo walks this leg. Derived so that the
      // photo which arrives at station s + 1 is the one that departs from it
      // next turn — that identity is what makes the loop close.
      const turn = ((leg - photoIndex) % count + count) % count;
      const from = turn * legMs;

      const { cos, sin } = bearing(photoIndex);
      const px = (scale: number): number => cx + cos * driftPx * scale;
      const py = (scale: number): number => cy + sin * driftPx * scale;

      /*
       * A hairline border, and it is not decoration.
       *
       * The far end of the tunnel is a small dark rectangle on a dark ground,
       * and without an edge it reads as a smudge rather than as a photograph
       * arriving. The border is what makes the distance legible.
       */
      const props = photoProps(photo, baseSize, {
        cornerRadius: inputs.look.cornerRadius,
        shadow: { blur: unit * 0.05, offsetX: 0, offsetY: unit * 0.012, paint: colorFill('rgba(0,0,0,0.5)') },
        border: { inset: 0, paint: roleFill('ink', 0.22), width: Math.max(1, unit * 0.0022) },
      });

      const opacity: Keyframe[] = isFirst
        ? [kf(0, 0), kf(legMs * 0.55, 1, 'outQuad')]
        : isLast
          ? [kf(0, 1), kf(legMs * 0.4, 1), kf(legMs, 0, 'inQuad')]
          : [kf(0, 1)];

      layers.push({
        id: ctx.id(`leg${leg}`),
        type: 'image',
        startMs: from,
        endMs: from + legMs,
        tracks: {
          x: [kf(0, px(fromScale), 'linear'), kf(legMs / 2, px(midScale), 'linear'), kf(legMs, px(toScale), 'linear')],
          y: [kf(0, py(fromScale), 'linear'), kf(legMs / 2, py(midScale), 'linear'), kf(legMs, py(toScale), 'linear')],
          scaleX: [kf(0, fromScale, 'linear'), kf(legMs / 2, midScale, 'linear'), kf(legMs, toScale, 'linear')],
          scaleY: [kf(0, fromScale, 'linear'), kf(legMs / 2, midScale, 'linear'), kf(legMs, toScale, 'linear')],
          // A fixed lean per photo, so the tunnel is not a column of squares.
          rotation: [kf(0, (photoIndex % 2 === 0 ? 1 : -1) * 3)],
          opacity,
        },
        props,
      });
    }
  }

  const headline = textFor(SLOTS.headline, inputs, {
    baseSizePx: unit * 0.068,
    maxWidthPx: safe.w * 0.86,
    reveal: { kind: 'perWord', startMs: 240, durationMs: 460, staggerMs: 70 },
    lineHeight: 1.08,
  });
  const caption = textFor(SLOTS.caption, inputs, {
    baseSizePx: unit * 0.024,
    maxWidthPx: safe.w * 0.7,
    reveal: { kind: 'fade', startMs: 900, durationMs: 620 },
    fallbackFill: roleFill('inkMuted'),
  });

  const headRun = ctx.measure(specFor(headline, fontString(headline.fontId, headline.fontSizePx, headline.weight)));
  const capRun = ctx.measure(specFor(caption, fontString(caption.fontId, caption.fontSizePx, caption.weight)));

  // Photographs pass over both ends of the frame, so the type needs its own
  // ground rather than trusting whatever happens to be behind it that second.
  const scrim = (atY: number, height: number, angle: number, id: string): Layer => ({
    id: ctx.id(id),
    type: 'gradient',
    startMs: 0,
    endMs: durationMs,
    tracks: { x: [kf(0, cx)], y: [kf(0, atY)] },
    props: {
      w: design.w,
      h: height,
      gradient: 'linear',
      angle,
      stops: [
        { at: 0, paint: colorFill('rgba(0,0,0,0.72)') },
        { at: 1, paint: colorFill('rgba(0,0,0,0)') },
      ],
    },
  });

  const floor = contentFloor(design, safe);
  const topH = headRun.height + unit * 0.12;
  const bottomH = capRun.height + unit * 0.14;
  layers.push(scrim(topH / 2, topH, 90, 'scrim-top'));
  layers.push(scrim(design.h - bottomH / 2, bottomH, 270, 'scrim-bottom'));

  layers.push({
    id: ctx.id('headline'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    tracks: { x: [kf(0, cx)], y: [kf(0, safe.y)] },
    props: headline,
  });

  layers.push({
    id: ctx.id('caption'),
    type: 'text',
    startMs: 0,
    endMs: durationMs,
    anchorX: 0.5,
    anchorY: 0,
    // Text runs downward from its anchor whatever anchorY says, so the line
    // is placed by its top: one line above the floor.
    tracks: { x: [kf(0, cx)], y: [kf(0, floor - capRun.height)] },
    props: caption,
  });

  return layers;
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'depth-tunnel',
  name: 'Depth Tunnel',
  category: 'Depth Stage',
  mode: 'both',
  tier: 'free',
  isNew: true,
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 8_000,
  minDurationMs: 4_000,
  maxDurationMs: 30_000,
  photoSlots: { min: 2, max: 8, default: 4 },
  textSlots: [SLOTS.headline, SLOTS.caption],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
