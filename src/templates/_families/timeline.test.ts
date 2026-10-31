import { describe, expect, it } from 'vitest';
import { slotKey, slotOf } from '@/core/render/slots';
import { SHOWCASE_SCENES } from '../_catalog/showcase';
import { buildVariant, describePartChecks, flatten } from '../_test/partChecks';
import { create } from './timeline';

/** Timeline, part by part (D-159). */
const TIMELINES = SHOWCASE_SCENES.filter((v) => v.family === 'timeline');
describePartChecks(TIMELINES, create);

describe('timeline parts', () => {
  const build = (id: string, texts: Readonly<Record<string, string>> = {}) => {
    const variant = TIMELINES.find((v) => v.id === id);
    if (!variant) throw new Error(id);
    return [...flatten(buildVariant(create(variant), variant, '16:9', texts))];
  };

  it('makes the line one part, and each stop follow its milestone', () => {
    const layers = build('tl-track');
    expect(layers.filter((l) => slotOf(l)?.kind === 'shape' && slotKey(slotOf(l) ?? { kind: 'photo', index: 0 }) === 'shape:line')).toHaveLength(1);
    expect(layers.filter((l) => l.id.startsWith('stop-')).map((l) => l.follows)).toEqual(
      Array.from({ length: 6 }, (_, i) => `text:milestones#${i}`),
    );
  });

  it('types each milestone on its own', () => {
    const texts = build('tl-metro', { milestones: 'Plan, Pitch, Win' }).flatMap((l) => (l.type === 'text' && l.props.slot?.kind === 'text' && l.props.slot.item !== undefined ? [l.props.text] : []));
    expect(texts).toEqual(['Plan', 'Pitch', 'Win']);
  });
});
