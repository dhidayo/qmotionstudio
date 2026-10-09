import type { SceneVariant } from '../catalog';
import type { SceneTemplate } from '../schema';

export function create(variant: SceneVariant): SceneTemplate {
  throw new Error(`The ${variant.family} family is not built yet ("${variant.id}").`);
}
