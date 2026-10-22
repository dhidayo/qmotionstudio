import { describe, expect, it } from 'vitest';
import { pictureMomentMs } from './picture';

const at = (over: Partial<Parameters<typeof pictureMomentMs>[0]>): ReturnType<typeof pictureMomentMs> =>
  pictureMomentMs({ videoMs: 6_000, restMs: 2_400, clockMs: 0, playing: false, ended: false, ...over });

describe('the frame Export → Image saves (D-155)', () => {
  it('is the picture moment while the design is still playing', () => {
    expect(at({ playing: true, clockMs: 4_100 })).toEqual({ atMs: 2_400, source: 'rest' });
  });

  it('is the picture moment once it has played and come to rest', () => {
    expect(at({ ended: true, clockMs: 2_400 })).toEqual({ atMs: 2_400, source: 'rest' });
  });

  it('is the picture moment when parked at the very start', () => {
    expect(at({ clockMs: 0 })).toEqual({ atMs: 2_400, source: 'rest' });
  });

  it('is the frame the person paused on anywhere else', () => {
    expect(at({ clockMs: 4_100 })).toEqual({ atMs: 4_100, source: 'paused' });
  });

  it('calls a pause on the picture moment the picture moment', () => {
    expect(at({ clockMs: 2_400.4 })).toEqual({ atMs: 2_400, source: 'rest' });
  });

  it('never saves a frame past the end, where nothing is drawn', () => {
    expect(at({ clockMs: 6_000 })).toEqual({ atMs: 5_999, source: 'paused' });
    expect(at({ restMs: null, playing: true })).toEqual({ atMs: 5_999, source: 'rest' });
    expect(at({ restMs: 9_000, ended: true })).toEqual({ atMs: 5_999, source: 'rest' });
  });
});
