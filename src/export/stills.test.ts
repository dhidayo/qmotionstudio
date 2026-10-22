import { describe, expect, it } from 'vitest';
import { encodeWithin, JPEG_QUALITIES } from './stills';

/** A pretend encoder whose file shrinks as the quality drops. */
const encoder = (bytesAt: (quality: number) => number) => {
  const asked: number[] = [];
  const encode = (quality: number): Promise<Blob> => {
    asked.push(quality);
    return Promise.resolve(new Blob([new Uint8Array(bytesAt(quality))]));
  };
  return { encode, asked };
};

describe('saving a picture under a size limit (D-155)', () => {
  it('keeps the first quality when there is no limit', async () => {
    const { encode, asked } = encoder(() => 5_000_000);
    const result = await encodeWithin(encode, 'jpeg', undefined);
    expect(asked).toEqual([JPEG_QUALITIES[0]]);
    expect(result.fits).toBe(true);
  });

  it('steps the quality down until the file fits', async () => {
    const { encode, asked } = encoder((quality) => Math.round(quality * 2_500_000));
    const result = await encodeWithin(encode, 'jpeg', 2_000_000);
    expect(asked).toEqual([0.92, 0.85, 0.78]);
    expect(result.blob.size).toBeLessThanOrEqual(2_000_000);
    expect(result.fits).toBe(true);
  });

  it('says so when even the lowest quality is too large', async () => {
    const { encode, asked } = encoder(() => 3_000_000);
    const result = await encodeWithin(encode, 'jpeg', 2_000_000);
    expect(asked).toEqual([...JPEG_QUALITIES]);
    expect(result.fits).toBe(false);
  });

  it('encodes a PNG once, since it has no quality to lower', async () => {
    const { encode, asked } = encoder(() => 3_000_000);
    const result = await encodeWithin(encode, 'png', 2_000_000);
    expect(asked).toHaveLength(1);
    expect(result.fits).toBe(false);
  });
});
