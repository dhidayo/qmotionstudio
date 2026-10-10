import { describe, expect, it } from 'vitest';
import { onAccent, resolvePaint } from './paint';
import { roleFill } from '@/core/types';
import { LOOK_PRESETS } from '@/templates/_shared/look';

describe('lettering on the accent (D-126)', () => {
  it('is white on a dark accent and near-black on a light one', () => {
    expect(onAccent('#1d3fcf')).toBe('#ffffff');
    expect(onAccent('#ffd23f')).toBe('#141418');
    expect(onAccent('#fff')).toBe('#141418');
  });

  it('does not follow the background colour', () => {
    const look = LOOK_PRESETS[0];
    if (!look) throw new Error('no looks');
    const before = resolvePaint(roleFill('onAccent'), look.palette);
    const after = resolvePaint(roleFill('onAccent'), { ...look.palette, bg: '#ff00ff' });
    expect(after).toBe(before);
  });

  it('reads on every look’s accent', () => {
    for (const look of LOOK_PRESETS) {
      const text = onAccent(look.palette.accent);
      expect(['#ffffff', '#141418']).toContain(text);
    }
  });
});
