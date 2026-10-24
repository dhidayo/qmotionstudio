import { describe, expect, it } from 'vitest';
import type { AudioClip } from '@/document/types';
import { loopPlan, oncePlan, scheduleClips } from './graph';

/**
 * One graph for preview and export (D-052), now with loops (D-156).
 *
 * A fake context records what the scheduler asks of each source — the same
 * calls a live AudioContext and the export's OfflineAudioContext receive.
 */

type SourceCall = { loop: boolean; loopStart: number; loopEnd: number; start: number[]; stop: number[] };

function fakeContext(): { ctx: BaseAudioContext; sources: SourceCall[] } {
  const sources: SourceCall[] = [];
  const param = { setValueAtTime: () => param, linearRampToValueAtTime: () => param };
  const ctx = {
    createGain: () => ({ gain: param, connect: () => undefined, disconnect: () => undefined }),
    createBufferSource: () => {
      const call: SourceCall = { loop: false, loopStart: 0, loopEnd: 0, start: [], stop: [] };
      sources.push(call);
      return {
        buffer: null,
        set loop(value: boolean) { call.loop = value; },
        set loopStart(value: number) { call.loopStart = value; },
        set loopEnd(value: number) { call.loopEnd = value; },
        connect: () => undefined,
        disconnect: () => undefined,
        start: (...args: number[]) => { call.start = args; },
        stop: (...args: number[]) => { call.stop = args; },
      };
    },
  } as unknown as BaseAudioContext;
  return { ctx, sources };
}

const buffer = { duration: 16.2 } as AudioBuffer;
const destination = {} as AudioNode;

function clip(patch: Partial<AudioClip> = {}): AudioClip {
  return { id: 'a', mediaId: 'm', startMs: 0, trimStartMs: 100, trimEndMs: 16_100, gainDb: 0, fadeInMs: 0, fadeOutMs: 0, ...patch };
}

describe('scheduling a loop', () => {
  it('lets the source node repeat the section and stops it when the clip ends', () => {
    const { ctx, sources } = fakeContext();
    scheduleClips(ctx, destination, [clip({ loop: true, lengthMs: 40_000 })], () => buffer, { fromMs: 0, atContextTime: 1 });
    const [source] = sources;
    expect(source?.loop).toBe(true);
    expect(source?.loopStart).toBeCloseTo(0.1, 9);
    expect(source?.loopEnd).toBeCloseTo(16.1, 9);
    // No duration on start(): older WebKit ignores it on a looping source.
    expect(source?.start).toEqual([1, 0.1]);
    expect(source?.stop).toEqual([41]);
  });

  it('starts part-way round when playback starts in the middle of the clip', () => {
    const { ctx, sources } = fakeContext();
    scheduleClips(ctx, destination, [clip({ startMs: 2_000, loop: true, lengthMs: 40_000 })], () => buffer, { fromMs: 22_000, atContextTime: 5 });
    // 20s into the clip is 4s into its second time round.
    expect(sources[0]?.start[1]).toBeCloseTo(4.1, 9);
    expect(sources[0]?.stop[0]).toBeCloseTo(5 + 20, 9);
  });

  it('plays a one-shot as it always did: start with a duration, no loop', () => {
    const { ctx, sources } = fakeContext();
    scheduleClips(ctx, destination, [clip({ trimEndMs: 5_100 })], () => buffer, { fromMs: 1_000, atContextTime: 0 });
    expect(sources[0]?.loop).toBe(false);
    expect(sources[0]?.start).toEqual([0, 1.1, 4]);
    expect(sources[0]?.stop).toEqual([]);
  });
});

describe('plans', () => {
  it('clamps a loop section to the file, like a trim', () => {
    const plan = loopPlan(clip({ loop: true, lengthMs: 30_000, trimEndMs: 99_000 }), 0, 30_000, 16_200);
    expect(plan).toMatchObject({ loop: true, loopStartMs: 100, loopEndMs: 16_200 });
  });

  it('refuses a section too short to loop', () => {
    expect(loopPlan(clip({ loop: true, trimEndMs: 110 }), 0, 1_000, 16_200)).toBeNull();
  });

  it('stops a one-shot where the file runs out', () => {
    expect(oncePlan(clip({ trimStartMs: 15_000, trimEndMs: 20_000 }), 0, 5_000, 16_200)).toMatchObject({ offsetMs: 15_000, playMs: 1_200 });
  });
});
