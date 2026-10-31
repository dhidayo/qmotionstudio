import { describe, expect, it } from 'vitest';
import { slotOf } from '@/core/render/slots';
import { TEXT_STORY_SCENES } from '../_catalog/text';
import { buildVariant, describePartChecks, flatten } from '../_test/partChecks';
import { create } from './type';

/** Text Motion, part by part (D-159). */
const TYPES = TEXT_STORY_SCENES.filter((v) => v.family === 'type');
describePartChecks(TYPES, create);

describe('type parts', () => {
  it('moves the accent under the words with them', () => {
    for (const variant of TYPES) {
      const layers = [...flatten(buildVariant(create(variant), variant))];
      for (const layer of layers) {
        if (slotOf(layer)?.kind !== 'shape') continue;
        const clipped = layers.some((l) => l.type === 'mask' && l.id.startsWith('clip-'));
        expect(layer.follows, `${variant.id} ${layer.id}`).toBe(clipped ? undefined : 'text:headline');
      }
    }
  });
});
