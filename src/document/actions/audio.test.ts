import { describe, expect, it } from 'vitest';
import type { AudioClip, Project } from '@/document/types';
import { createProject } from '@/document/defaults';
import { clipDurationMs, clipEndMs, sourceMsAt } from '@/core/audio/envelope';
import { resolvedAudio, totalDurationMs } from '@/document/select/timeline';
import * as actions from './index';

/**
 * Music trimming, slipping and moving (§10).
 *
 * The gestures a long track needs. Before these existed a clip could only be
 * dragged and end-trimmed against a lane sized to the *video*, so a
 * four-minute track on a fifteen-second ad had its far edge off the end of the
 * timeline and could not be touched at all.
 */

const scope = actions.FIRST_SCENE;
const SOURCE_MS = 240_000; // four minutes

function withClip(patch: Partial<AudioClip> = {}): Project {
  const base = createProject();
  const clip: AudioClip = {
    id: 'aud_1',
    mediaId: 'track',
    startMs: 0,
    trimStartMs: 0,
    trimEndMs: 15_000,
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...patch,
  };
  return { ...base, audio: [clip] };
}

const clipOf = (project: Project): AudioClip => {
  const clip = project.audio[0];
  if (!clip) throw new Error('expected a clip');
  return clip;
};

describe('slipping — choosing which section plays', () => {
  it('moves the source window without moving or resizing the clip', () => {
    const before = withClip({ startMs: 3_000, trimStartMs: 0, trimEndMs: 15_000 });
    const after = clipOf(actions.slipAudio('aud_1', 90_000, SOURCE_MS).apply(before, scope));

    expect(after.trimStartMs).toBe(90_000);
    expect(after.trimEndMs).toBe(105_000);
    // The two properties that make it a slip rather than a trim or a move.
    expect(after.trimEndMs - after.trimStartMs).toBe(15_000);
    expect(after.startMs).toBe(3_000);
  });

  it('stops at the start of the source rather than going negative', () => {
    const after = clipOf(
      actions.slipAudio('aud_1', -50_000, SOURCE_MS).apply(withClip(), scope),
    );
    expect(after.trimStartMs).toBe(0);
    expect(after.trimEndMs).toBe(15_000);
  });

  it('stops at the end of the source with its length intact', () => {
    const after = clipOf(
      actions.slipAudio('aud_1', 999_000, SOURCE_MS).apply(withClip(), scope),
    );
    expect(after.trimEndMs).toBe(SOURCE_MS);
    expect(after.trimEndMs - after.trimStartMs).toBe(15_000);
  });

  it('coalesces into one undo step, separately from trimming', () => {
    const slip = actions.slipAudio('aud_1', 1_000, SOURCE_MS);
    const trim = actions.trimAudioStart('aud_1', 1_000, SOURCE_MS);
    expect(slip.coalesceKey).toBe('audioSlip:aud_1');
    expect(trim.coalesceKey).toBe('audioEdge:aud_1');
    expect(slip.coalesceKey).not.toBe(trim.coalesceKey);
  });
});

describe('trimming the edges', () => {
  it('holds the audio still when the left edge moves', () => {
    /*
     * Dragging the left edge right by two seconds should reveal two seconds
     * later in the track *and* start the clip two seconds later, so the sound
     * under the cursor does not move. Doing only one of the two slides the
     * whole track, which is what a move is for.
     */
    const before = withClip({ startMs: 5_000, trimStartMs: 10_000, trimEndMs: 25_000 });
    const after = clipOf(actions.trimAudioStart('aud_1', 2_000, SOURCE_MS).apply(before, scope));

    expect(after.trimStartMs).toBe(12_000);
    expect(after.startMs).toBe(7_000);
    expect(after.trimEndMs).toBe(25_000);
  });

  it('moves the clip only as far as the clamp actually allowed', () => {
    // Asked to trim 10s off the left when only 1s of source precedes it.
    const before = withClip({ startMs: 5_000, trimStartMs: 0, trimEndMs: 15_000 });
    const after = clipOf(actions.trimAudioStart('aud_1', -10_000, SOURCE_MS).apply(before, scope));

    expect(after.trimStartMs).toBe(0);
    // Nothing was revealed, so nothing should have moved either.
    expect(after.startMs).toBe(5_000);
  });

  it('never lets an edge cross the other', () => {
    const before = withClip({ trimStartMs: 0, trimEndMs: 15_000 });
    const shrunk = clipOf(actions.trimAudioEnd('aud_1', -99_000, SOURCE_MS).apply(before, scope));
    expect(shrunk.trimEndMs).toBeGreaterThan(shrunk.trimStartMs);

    const pushed = clipOf(actions.trimAudioStart('aud_1', 99_000, SOURCE_MS).apply(before, scope));
    expect(pushed.trimEndMs).toBeGreaterThan(pushed.trimStartMs);
  });

  it('cannot extend past the end of the source', () => {
    const before = withClip({ trimStartMs: 0, trimEndMs: SOURCE_MS - 1_000 });
    const after = clipOf(actions.trimAudioEnd('aud_1', 99_000, SOURCE_MS).apply(before, scope));
    expect(after.trimEndMs).toBe(SOURCE_MS);
  });

  it('both edges share one coalesce key, so a drag is one undo step', () => {
    expect(actions.trimAudioStart('aud_1', 1, SOURCE_MS).coalesceKey)
      .toBe(actions.trimAudioEnd('aud_1', 1, SOURCE_MS).coalesceKey);
  });
});

describe('fit to video', () => {
  it('covers the video exactly, from the current section', () => {
    const before = withClip({ startMs: 4_000, trimStartMs: 90_000, trimEndMs: 105_000 });
    const after = clipOf(actions.fitAudioToProject('aud_1', 30_000, SOURCE_MS).apply(before, scope));

    expect(after.startMs).toBe(0);
    expect(after.trimStartMs).toBe(90_000);
    expect(after.trimEndMs).toBe(120_000);
  });

  it('pulls the section back when the source runs out first', () => {
    const before = withClip({ trimStartMs: 230_000, trimEndMs: 240_000 });
    const after = clipOf(actions.fitAudioToProject('aud_1', 30_000, SOURCE_MS).apply(before, scope));

    expect(after.trimEndMs).toBe(SOURCE_MS);
    expect(after.trimEndMs - after.trimStartMs).toBe(30_000);
  });

  it('loops a track shorter than the video to fill it, rather than leaving silence (D-156)', () => {
    const before = withClip({ startMs: 2_000, trimStartMs: 0, trimEndMs: 20_000 });
    const after = clipOf(actions.fitAudioToProject('aud_1', 60_000, 20_000).apply(before, scope));
    expect(after.startMs).toBe(0);
    expect(after.loop).toBe(true);
    expect(clipDurationMs(after)).toBe(60_000);
    // The section that repeats is the one that was playing.
    expect(after.trimStartMs).toBe(0);
    expect(after.trimEndMs).toBe(20_000);
    // And it keeps filling the video as scenes come and go.
    expect(after.fitsVideo).toBe(true);
  });

  it('is one undo step, not a coalescing drag', () => {
    expect(actions.fitAudioToProject('aud_1', 30_000, SOURCE_MS).coalesceKey).toBeUndefined();
  });
});

describe('reset', () => {
  it('goes back to the whole source', () => {
    const before = withClip({ trimStartMs: 90_000, trimEndMs: 105_000 });
    const after = clipOf(actions.resetAudioTrim('aud_1', SOURCE_MS).apply(before, scope));

    expect(after.trimStartMs).toBe(0);
    expect(after.trimEndMs).toBe(SOURCE_MS);
  });
});

describe('moving', () => {
  it('never starts before zero', () => {
    const after = clipOf(actions.setAudioStart('aud_1', -5_000).apply(withClip(), scope));
    expect(after.startMs).toBe(0);
  });

  it('may run past the end of the video — the lane shows it, the export cuts it', () => {
    const after = clipOf(actions.setAudioStart('aud_1', 120_000).apply(withClip(), scope));
    expect(after.startMs).toBe(120_000);
  });
});

describe('addressing a section absolutely', () => {
  it('reaches deep into a long track, which dragging cannot', () => {
    /*
     * The complaint this exists for: "if I want music at 1:30 to be the start
     * of the timeline, how do I do that?" A slip drag maps pixels against the
     * lane, so on a fifteen-second lane the whole width is fifteen seconds of
     * slip — 1:30 is six full drags away. Absolute addressing is the answer.
     */
    const after = clipOf(
      actions.setAudioSection('aud_1', 90_000, SOURCE_MS).apply(withClip(), scope),
    );
    expect(after.trimStartMs).toBe(90_000);
    expect(after.trimEndMs).toBe(105_000);
  });

  it('keeps the clip the same length', () => {
    const before = withClip({ trimStartMs: 0, trimEndMs: 15_000 });
    const after = clipOf(actions.setAudioSection('aud_1', 200_000, SOURCE_MS).apply(before, scope));
    expect(after.trimEndMs - after.trimStartMs).toBe(15_000);
  });

  it('stops where the window would run off the end of the track', () => {
    const after = clipOf(
      actions.setAudioSection('aud_1', 999_000, SOURCE_MS).apply(withClip(), scope),
    );
    expect(after.trimEndMs).toBe(SOURCE_MS);
  });

  it('sets how much of the track is used, from the chosen start', () => {
    const before = withClip({ trimStartMs: 90_000, trimEndMs: 105_000 });
    const after = clipOf(actions.setAudioLength('aud_1', 40_000, SOURCE_MS).apply(before, scope));
    expect(after.trimStartMs).toBe(90_000);
    expect(after.trimEndMs).toBe(130_000);
  });

  it('cannot be lengthened past the end of the track', () => {
    const before = withClip({ trimStartMs: 230_000, trimEndMs: 235_000 });
    const after = clipOf(actions.setAudioLength('aud_1', 99_000, SOURCE_MS).apply(before, scope));
    expect(after.trimEndMs).toBe(SOURCE_MS);
  });
});

describe('splitting — cutting a section out', () => {
  it('splits into two clips that together cover the original', () => {
    const before = withClip({ startMs: 0, trimStartMs: 10_000, trimEndMs: 25_000 });
    const after = actions.splitAudio('aud_1', 6_000).apply(before, scope);

    expect(after.audio).toHaveLength(2);
    const [left, right] = after.audio;
    if (!left || !right) throw new Error('expected two clips');

    expect(left.startMs).toBe(0);
    expect(left.trimEndMs).toBe(16_000);
    expect(right.startMs).toBe(6_000);
    expect(right.trimStartMs).toBe(16_000);
    expect(right.trimEndMs).toBe(25_000);

    // No gap and no overlap: the cut is exactly where the playhead was.
    expect(right.trimStartMs).toBe(left.trimEndMs);
  });

  it('gives the halves distinct ids, so they edit independently', () => {
    const after = actions.splitAudio('aud_1', 6_000).apply(withClip(), scope);
    expect(after.audio[0]?.id).not.toBe(after.audio[1]?.id);
  });

  it('keeps the outer fades and butts the new inner edges', () => {
    const before = withClip({ fadeInMs: 1_000, fadeOutMs: 2_000 });
    const after = actions.splitAudio('aud_1', 7_000).apply(before, scope);
    const [left, right] = after.audio;

    expect(left?.fadeInMs).toBe(1_000);
    expect(left?.fadeOutMs).toBe(0);
    expect(right?.fadeInMs).toBe(0);
    expect(right?.fadeOutMs).toBe(2_000);
  });

  it('refuses a split that would leave a sliver', () => {
    const before = withClip({ startMs: 0, trimEndMs: 15_000 });
    expect(actions.splitAudio('aud_1', 100).apply(before, scope)).toBe(before);
    expect(actions.splitAudio('aud_1', 14_950).apply(before, scope)).toBe(before);
  });

  it('refuses a split outside the clip', () => {
    const before = withClip({ startMs: 5_000, trimEndMs: 15_000 });
    expect(actions.splitAudio('aud_1', 1_000).apply(before, scope)).toBe(before);
    expect(actions.splitAudio('aud_1', 99_000).apply(before, scope)).toBe(before);
  });

  it('leaves the far half alone when one is removed', () => {
    const split = actions.splitAudio('aud_1', 6_000).apply(withClip(), scope);
    const rightId = split.audio[1]?.id;
    if (!rightId) throw new Error('expected a right half');

    const after = actions.removeAudio(rightId).apply(split, scope);
    expect(after.audio).toHaveLength(1);
    expect(after.audio[0]?.id).toBe('aud_1');
  });
});

describe('several clips on one track', () => {
  it('adds rather than replaces, so a second passage can be dropped in', () => {
    const second = actions.makeAudioClip('track', { startMs: 20_000, durationMs: 10_000 });
    const after = actions.addAudio(second).apply(withClip(), scope);

    expect(after.audio).toHaveLength(2);
    expect(after.audio[1]?.startMs).toBe(20_000);
  });
});

/**
 * Loops (D-156): a clip whose section repeats for as long as the clip runs.
 *
 * The property every gesture must keep is continuity: what plays at a given
 * moment on the timeline is the same before and after a trim of the other
 * edge, a split or a left-edge trim. `sourceMsAt` says what plays, so the
 * tests compare it.
 */
describe('looping', () => {
  const LOOP: Partial<AudioClip> = { trimStartMs: 100, trimEndMs: 8_100, loop: true, lengthMs: 30_000 };
  /** What the clip plays at a moment on the project timeline. */
  const heard = (clip: AudioClip, atMs: number): number => sourceMsAt(clip, atMs - clip.startMs);

  it('makes a loop clip from a library window', () => {
    const clip = actions.makeAudioClip('sound:upbeat-pulse', {
      durationMs: 16_200, loop: { startMs: 100, endMs: 16_100 }, lengthMs: 45_000, fitsVideo: true, gainDb: -3,
    });
    expect(clip).toMatchObject({ trimStartMs: 100, trimEndMs: 16_100, loop: true, lengthMs: 45_000, fitsVideo: true, gainDb: -3 });
    expect(clipDurationMs(clip)).toBe(45_000);
  });

  it('keeps one-shot clips exactly as they were', () => {
    const clip = actions.makeAudioClip('track', { startMs: 1_000, durationMs: 8_000 });
    expect(clip.loop).toBeUndefined();
    expect(clip).toMatchObject({ startMs: 1_000, trimStartMs: 0, trimEndMs: 8_000, gainDb: 0, fadeInMs: 0, fadeOutMs: 1_200 });
  });

  it('runs past the end of its file when its end is dragged', () => {
    const before = withClip(LOOP);
    const after = clipOf(actions.trimAudioEnd('aud_1', 20_000, 8_200).apply(before, scope));
    expect(clipDurationMs(after)).toBe(50_000);
    // The section itself is untouched.
    expect(after.trimStartMs).toBe(100);
    expect(after.trimEndMs).toBe(8_100);
  });

  it('holds the sound still under a left-edge trim', () => {
    const before = withClip({ ...LOOP, startMs: 2_000 });
    const after = clipOf(actions.trimAudioStart('aud_1', 5_300, 8_200).apply(before, scope));
    expect(after.startMs).toBe(7_300);
    expect(clipEndMs(after)).toBe(clipEndMs(clipOf(before)));
    for (const at of [7_300, 9_999, 20_000, 31_000]) expect(heard(after, at)).toBe(heard(clipOf(before), at));
  });

  it('splits into two loops that carry on exactly where the one was', () => {
    const before = withClip({ ...LOOP, startMs: 1_000, loopPhaseMs: 2_500 });
    const after = actions.splitAudio('aud_1', 13_700).apply(before, scope);
    const [left, right] = after.audio;
    if (!left || !right) throw new Error('expected two clips');
    expect(clipDurationMs(left) + clipDurationMs(right)).toBe(30_000);
    expect(right.startMs).toBe(clipEndMs(left));
    const whole = clipOf(before);
    for (const at of [1_000, 9_000, 13_699]) expect(heard(left, at)).toBe(heard(whole, at));
    for (const at of [13_700, 20_000, 30_999]) expect(heard(right, at)).toBe(heard(whole, at));
  });

  it('slips round its own section and never runs out', () => {
    const before = withClip(LOOP);
    const after = clipOf(actions.slipAudio('aud_1', 9_000, 8_200).apply(before, scope));
    expect(after.loopPhaseMs).toBe(1_000);
    expect(clipDurationMs(after)).toBe(30_000);
    expect(after.trimStartMs).toBe(100);
  });

  it('turns looping on without changing how it sounds', () => {
    const before = withClip({ trimStartMs: 3_000, trimEndMs: 9_000 });
    const after = clipOf(actions.setAudioLoop('aud_1', true, 20_000).apply(before, scope));
    expect(after.loop).toBe(true);
    expect(clipDurationMs(after)).toBe(6_000);
    for (const at of [0, 2_000, 5_999]) expect(heard(after, at)).toBe(heard(clipOf(before), at));
  });

  it('turns looping off playing on from where the loop was', () => {
    const before = withClip({ ...LOOP, lengthMs: 4_000, loopPhaseMs: 1_000, fitsVideo: true });
    const after = clipOf(actions.setAudioLoop('aud_1', false, 8_200).apply(before, scope));
    expect(after.loop).toBeUndefined();
    expect(after.lengthMs).toBeUndefined();
    expect(after.fitsVideo).toBeUndefined();
    expect(after.trimStartMs).toBe(1_100);
    expect(heard(after, 0)).toBe(heard(clipOf(before), 0));
  });

  it('sets a loop’s length on the timeline, which then no longer follows the video', () => {
    const before = withClip({ ...LOOP, fitsVideo: true });
    const after = clipOf(actions.setAudioClipLength('aud_1', 12_000).apply(before, scope));
    expect(clipDurationMs(after)).toBe(12_000);
    expect(after.fitsVideo).toBeUndefined();
  });

  it('follows the video when fitted: add a scene and the music runs on', () => {
    const before = withClip({ ...LOOP, startMs: 0, fitsVideo: true });
    const video = totalDurationMs(before);
    expect(clipDurationMs(resolvedAudio(before)[0] ?? clipOf(before))).toBe(video);

    const longer = actions.duplicateScene(0).apply(before, scope);
    expect(totalDurationMs(longer)).toBeGreaterThan(video);
    expect(clipEndMs(resolvedAudio(longer)[0] ?? clipOf(longer))).toBe(totalDurationMs(longer));
  });

  it('keeps a fitted loop fitted when its start is trimmed', () => {
    const before = withClip({ ...LOOP, startMs: 0, fitsVideo: true });
    const after = actions.trimAudioStart('aud_1', 2_000, 8_200).apply(before, scope);
    const clip = resolvedAudio(after)[0];
    expect(clip?.startMs).toBe(2_000);
    expect(clip && clipEndMs(clip)).toBe(totalDurationMs(after));
  });

  it('returns the same array while nothing has changed, so playback is not rescheduled', () => {
    const fitted = withClip({ ...LOOP, fitsVideo: true });
    expect(resolvedAudio(fitted)).toBe(resolvedAudio({ ...fitted, name: 'Renamed' }));
    const plain = withClip();
    expect(resolvedAudio(plain)).toBe(plain.audio);
  });

  it('swaps one clip for another in a single step', () => {
    const before = withClip();
    const next = actions.makeAudioClip('sound:lofi-haze', { durationMs: 12_200, loop: { startMs: 100, endMs: 12_100 }, lengthMs: 15_000 });
    const action = actions.replaceAudio('aud_1', next);
    const after = action.apply(before, scope);
    expect(after.audio).toHaveLength(1);
    expect(after.audio[0]?.id).toBe(next.id);
    expect(action.coalesceKey).toBeUndefined();
  });

  it('labels what was added', () => {
    const clip = actions.makeAudioClip('sound:pop', { durationMs: 300 });
    expect(actions.addAudio(clip).label).toBe('Add music');
    expect(actions.addAudio(clip, 'Add sound').label).toBe('Add sound');
  });
});
