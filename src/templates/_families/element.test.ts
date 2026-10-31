import { describe, expect, it } from 'vitest';
import { slotOf } from '@/core/render/slots';
import { TEXT_STORY_SCENES } from '../_catalog/text';
import { buildVariant, describePartChecks, flatten } from '../_test/partChecks';
import { create } from './element';

/** Elements, part by part (D-159). */
const ELEMENTS = TEXT_STORY_SCENES.filter((v) => v.family === 'element');
describePartChecks(ELEMENTS, create);

describe('element parts', () => {
  const build = (id: string, texts: Readonly<Record<string, string>> = {}) => {
    const variant = ELEMENTS.find((v) => v.id === id);
    if (!variant) throw new Error(id);
    return [...flatten(buildVariant(create(variant), variant, '16:9', texts))];
  };

  it('counts down in the numbers typed, each typed into on its own', () => {
    const counts = build('el-countdown', { count: '5, 4, 3, 2, 1' }).filter((l) => l.type === 'text' && l.props.slot?.kind === 'text' && l.props.slot.key === 'count');
    expect(counts.map((l) => (l.type === 'text' ? l.props.text : ''))).toEqual(['5', '4', '3', '2', '1']);
  });

  it('types each chip on its own, and moves its pill with it', () => {
    const layers = build('el-chips', { chips: 'One, Two' });
    expect(layers.filter((l) => l.id.startsWith('chip-')).map((l) => l.follows)).toEqual(['text:chips#0', 'text:chips#1']);
    expect(layers.filter((l) => l.type === 'text' && slotOf(l)?.kind === 'text').map((l) => (l.type === 'text' ? l.props.text : ''))).toContain('Two');
  });
});
