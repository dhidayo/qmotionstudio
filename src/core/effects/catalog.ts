import { ATMOSPHERE } from './frame/atmosphere';
import { CAMERA } from './frame/camera';
import { LIGHT } from './frame/light';
import { STYLIZE } from './frame/stylize';
import { ELEMENT_EFFECTS } from './element';
import type { ElementEffectDef, FrameEffectDef } from './types';

/**
 * The effect library, in one list per kind (D-100).
 *
 * Ids are stored in documents, so they are permanent: rename an effect's
 * `name` freely, never its `id`. An id the catalogue no longer knows draws
 * nothing rather than throwing — a project saved with an effect that has
 * since been retired still opens.
 */

export const FRAME_EFFECTS: readonly FrameEffectDef[] = [...ATMOSPHERE, ...LIGHT, ...CAMERA, ...STYLIZE];

export { ELEMENT_EFFECTS };

const frameById = new Map(FRAME_EFFECTS.map((def) => [def.id, def]));
const elementById = new Map(ELEMENT_EFFECTS.map((def) => [def.id, def]));

export function frameEffect(id: string): FrameEffectDef | undefined {
  return frameById.get(id);
}

export function elementEffect(id: string): ElementEffectDef | undefined {
  return elementById.get(id);
}

/** A name for any effect id, for labels on the timeline and in lists. */
export function effectName(id: string): string {
  return frameById.get(id)?.name ?? elementById.get(id)?.name ?? id;
}
