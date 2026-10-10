import { describe, expect, it } from 'vitest';
import { watermarkInk } from './postFx';
import { LOOK_PRESETS } from '@/templates/_shared/look';

describe('the watermark (D-121)', () => {
  it('is dark on light grounds and light on dark ones', () => {
    expect(watermarkInk('#f2e6d0').fill).toMatch(/^rgba\(20,/);
    expect(watermarkInk('#ffd23f').fill).toMatch(/^rgba\(20,/);
    expect(watermarkInk('#0c0c11').fill).toMatch(/^rgba\(255,/);
    expect(watermarkInk('#1d3fcf').fill).toMatch(/^rgba\(255,/);
  });

  it('goes dark on every light look and light on every dark one', () => {
    for (const look of LOOK_PRESETS) {
      const dark = watermarkInk(look.palette.bg).fill.startsWith('rgba(20,');
      if (look.tone === 'light') expect(dark, look.id).toBe(true);
      if (look.tone === 'dark') expect(dark, look.id).toBe(false);
    }
  });
});
