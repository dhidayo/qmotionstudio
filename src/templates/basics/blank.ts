import type { Layer } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import type { SceneTemplate } from '../schema';
import { FULL_LOOK } from '../_shared/look';
import { backgroundLayer } from '../_shared/chrome';

/**
 * Blank.
 *
 * Just the background and the logo — a canvas to build on from scratch with
 * the timeline's own tools: photos, text and video as layers, each with its
 * own motion. Asked for directly: "I should be able to create new/empty canva
 * to design from scratch."
 *
 * A template rather than a special case, so everything a scene can do still
 * works on it — the Look tab's backgrounds and palettes, the logo, transitions
 * in and out, export. It has no photo or text slots of its own on purpose:
 * what goes on a blank canvas is the person's choice, and a slot is the
 * template choosing for them.
 *
 * Not listed in the library (`listed: false` in the manifest). A blank card
 * among thirty designed ones reads as a broken thumbnail; it is offered where
 * starting from nothing is the question being asked — adding a scene, and
 * starting a project.
 */
function build(inputs: SceneInputs, ctx: BuildContext): Layer[] {
  return [backgroundLayer(inputs, ctx)];
}

const template: SceneTemplate = {
  kind: 'scene',
  id: 'blank',
  name: 'Blank',
  category: 'Basics',
  mode: 'both',
  tier: 'free',
  designSize: { w: 1080, h: 1080 },
  supportedAspects: ['16:9', '4:3', '1:1', '4:5', '9:16'],
  defaultDurationMs: 6_000,
  minDurationMs: 1_000,
  maxDurationMs: 60_000,
  photoSlots: { min: 0, max: 0, default: 0 },
  textSlots: [],
  supportsLogo: true,
  look: FULL_LOOK,
  build,
};

export default template;
