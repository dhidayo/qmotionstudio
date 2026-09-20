import { describe, expect, it } from 'vitest';
import type { AudioClip, Project } from '@/document/types';
import { createProject } from '@/document/defaults';
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

  it('uses the whole source when the video is longer than the track', () => {
    const after = clipOf(actions.fitAudioToProject('aud_1', 60_000, 20_000).apply(withClip(), scope));
    expect(after.trimStartMs).toBe(0);
    expect(after.trimEndMs).toBe(20_000);
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
