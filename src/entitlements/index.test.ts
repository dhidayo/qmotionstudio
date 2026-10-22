import { describe, expect, it } from 'vitest';
import { getLimits } from './index';

describe('image sizes by plan (D-155)', () => {
  it('saves full-HD images free and 4K on Pro, in either mode', () => {
    for (const mode of ['showcase', 'motionAd'] as const) {
      expect(getLimits('free', mode).maxImageShortEdge).toBe(1080);
      expect(getLimits('pro', mode).maxImageShortEdge).toBe(2160);
    }
  });

  it('keeps the watermark on free images, as on free videos (§12)', () => {
    expect(getLimits('free', 'showcase').watermark).toBe(true);
    expect(getLimits('pro', 'showcase').watermark).toBe(false);
  });
});
