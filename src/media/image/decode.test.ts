import { describe, expect, it } from 'vitest';
import { previewSize, targetSize } from './decode';

/**
 * The preview keeps photos at the size the preview can show (D-171); the
 * export keeps §9's twice the artboard.
 */
describe('photo sizes', () => {
  it('keeps a 4000×3000 phone photo at 2560×1920 for the preview, a quarter of the pixels the export size has', () => {
    expect(previewSize(4000, 3000, 1920)).toEqual({ w: 2560, h: 1920 });
    expect(targetSize(4000, 3000, 1920)).toEqual({ w: 3840, h: 2880 });
  });

  it('covers the frame either way round: the short edge reaches the artboard’s long edge', () => {
    const portrait = previewSize(3000, 4000, 1920);
    expect(Math.min(portrait.w, portrait.h)).toBe(1920);
  });

  it('never enlarges, and leaves a photo that is already small enough alone', () => {
    expect(previewSize(1200, 800, 1920)).toEqual({ w: 1200, h: 800 });
    expect(previewSize(1920, 1920, 1920)).toEqual({ w: 1920, h: 1920 });
  });

  it('still holds a panorama to twice the artboard on its long edge', () => {
    expect(previewSize(12000, 3000, 1920)).toEqual({ w: 3840, h: 960 });
  });
});
