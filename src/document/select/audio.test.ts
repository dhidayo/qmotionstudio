import { describe, expect, it } from 'vitest';
import type { AudioClip } from '@/document/types';
import { fitClip, fittedClips, laneOf, packRows } from './audio';

/** Reading the audio track as it plays (D-156): fitted loops, lanes and rows. */

function clip(patch: Partial<AudioClip> = {}): AudioClip {
  return { id: 'a', mediaId: 'upload:song', startMs: 0, trimStartMs: 0, trimEndMs: 1_000, gainDb: 0, fadeInMs: 0, fadeOutMs: 0, ...patch };
}

describe('a loop that fits the video', () => {
  const fitted = clip({ startMs: 2_000, loop: true, lengthMs: 5_000, fitsVideo: true });

  it('runs from its start to the end of the video', () => {
    expect(fitClip(fitted, 30_000).lengthMs).toBe(28_000);
  });

  it('never shrinks below the shortest clip, even past the end of the video', () => {
    expect(fitClip(fitted, 1_000).lengthMs).toBe(300);
  });

  it('leaves every other clip alone, and the array itself when none fits', () => {
    const plain = clip({ loop: true, lengthMs: 5_000 });
    expect(fitClip(plain, 30_000)).toBe(plain);
    const clips = [plain, clip({ id: 'b' })];
    expect(fittedClips(clips, 30_000)).toBe(clips);
  });

  it('gives back the same array for the same clips and video', () => {
    const clips = [fitted];
    const once = fittedClips(clips, 30_000);
    expect(fittedClips(clips, 30_000)).toBe(once);
    expect(fittedClips(clips, 31_000)).not.toBe(once);
  });
});

describe('lanes', () => {
  it('puts library effects on the Sounds row and everything else on Music', () => {
    expect(laneOf(clip({ mediaId: 'sound:whoosh' }))).toBe('sounds');
    expect(laneOf(clip({ mediaId: 'sound:lofi-haze' }))).toBe('music');
    expect(laneOf(clip({ mediaId: 'upload:song' }))).toBe('music');
  });

  it('stacks clips that overlap in time, and reuses a row once it is free', () => {
    const { rowOf, rows } = packRows([
      clip({ id: 'pop', startMs: 0, trimEndMs: 300 }),
      clip({ id: 'whoosh', startMs: 100, trimEndMs: 1_000 }),
      clip({ id: 'click', startMs: 500, trimEndMs: 300 }),
    ]);
    expect(rows).toBe(2);
    expect(rowOf.get('pop')).toBe(0);
    expect(rowOf.get('whoosh')).toBe(1);
    expect(rowOf.get('click')).toBe(0);
  });
});
