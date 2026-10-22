import { describe, expect, it } from 'vitest';
import { ASPECTS } from '@/core/types';
import { defaultImagePreset, IMAGE_PRESETS, imageFileName, imageSize, YOUTUBE_THUMBNAIL_BYTES } from './imagePresets';

/** iOS refuses a canvas larger than this many pixels. */
const IOS_CANVAS_PIXELS = 16_777_216;

const sizes = (aspect: (typeof ASPECTS)[number]): string[] =>
  IMAGE_PRESETS[aspect].map((preset) => {
    const size = imageSize(aspect, preset);
    return `${size.w}x${size.h}`;
  });

describe('image sizes for each frame shape (D-155)', () => {
  it('offers the sizes each destination expects', () => {
    expect(sizes('16:9')).toEqual(['1280x720', '1920x1080', '3840x2160']);
    expect(sizes('4:5')).toEqual(['1080x1350', '2160x2700']);
    expect(sizes('1:1')).toEqual(['1080x1080', '2160x2160']);
    expect(sizes('9:16')).toEqual(['1080x1920', '2160x3840']);
    expect(sizes('4:3')).toEqual(['1440x1080', '2880x2160']);
  });

  it('keeps every size inside what a phone can draw', () => {
    for (const aspect of ASPECTS) {
      for (const preset of IMAGE_PRESETS[aspect]) {
        const size = imageSize(aspect, preset);
        expect(size.w * size.h, `${aspect} ${preset.id}`).toBeLessThanOrEqual(IOS_CANVAS_PIXELS);
      }
    }
  });

  it('saves the YouTube thumbnail as a JPG under YouTube’s limit', () => {
    const youtube = IMAGE_PRESETS['16:9'].find((preset) => preset.id === 'youtube');
    expect(youtube?.format).toBe('jpeg');
    expect(youtube?.maxBytes).toBe(YOUTUBE_THUMBNAIL_BYTES);
  });

  it('gives every shape a full-HD size and a larger one', () => {
    for (const aspect of ASPECTS) {
      const edges = IMAGE_PRESETS[aspect].map((preset) => preset.shortEdge);
      expect(edges, aspect).toContain(1080);
      expect(edges, aspect).toContain(2160);
      expect(new Set(IMAGE_PRESETS[aspect].map((preset) => preset.id)).size, aspect).toBe(edges.length);
    }
  });

  it('opens on the first size the plan can save', () => {
    expect(defaultImagePreset('16:9', 1080).id).toBe('youtube');
    expect(defaultImagePreset('4:5', 1080).id).toBe('instagram');
    expect(defaultImagePreset('4:5', 720).id).toBe('instagram');
  });

  it('names the file after the project and the size', () => {
    expect(imageFileName('Summer Sale!', { w: 1080, h: 1350 }, 'png')).toBe('summer-sale-1080x1350.png');
    expect(imageFileName('  ', { w: 1280, h: 720 }, 'jpeg')).toBe('motion-studio-1280x720.jpg');
  });
});
