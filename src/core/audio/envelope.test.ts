import { describe, expect, it } from 'vitest';
import type { AudioClip } from '@/document/types';
import {
  audioEndMs, clipDurationMs, clipEndMs, dbToGain, envelopeFrom, gainAt, gainToDb,
  isActiveAt, resolvedFades,
} from './envelope';

/**
 * §10's per-clip trim, gain and fades.
 *
 * Pure on purpose (D-052): the preview schedules live Web Audio nodes and the
 * export renders through an OfflineAudioContext, and the one thing that must
 * not drift between them is what the envelope says. Testing it here pins that
 * down without a browser on either side.
 */

function clip(patch: Partial<AudioClip> = {}): AudioClip {
  return {
    id: 'aud_1',
    mediaId: 'track',
    startMs: 2_000,
    trimStartMs: 0,
    trimEndMs: 10_000,
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...patch,
  };
}

describe('decibels', () => {
  it('treats 0dB as unity', () => {
    expect(dbToGain(0)).toBe(1);
  });

  it('halves amplitude about every six decibels', () => {
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(dbToGain(6)).toBeCloseTo(1.995, 3);
  });

  it('bottoms out at silence rather than an ever-smaller number', () => {
    // A slider that never quite reaches zero is a slider that cannot mute.
    expect(dbToGain(-60)).toBe(0);
    expect(dbToGain(-90)).toBe(0);
  });

  it('round-trips through gainToDb', () => {
    for (const db of [-30, -12, -6, 0, 6]) {
      expect(gainToDb(dbToGain(db))).toBeCloseTo(db, 6);
    }
  });
});

describe('trimming places a clip on the timeline', () => {
  it('plays for its trimmed length, not the source length', () => {
    const c = clip({ trimStartMs: 3_000, trimEndMs: 8_000 });
    expect(clipDurationMs(c)).toBe(5_000);
    expect(clipEndMs(c)).toBe(7_000);
  });

  it('treats the end as exclusive, so butted clips never both play', () => {
    const c = clip({ startMs: 0, trimEndMs: 1_000 });
    expect(isActiveAt(c, 0)).toBe(true);
    expect(isActiveAt(c, 999)).toBe(true);
    expect(isActiveAt(c, 1_000)).toBe(false);
  });

  it('survives an inverted trim without producing negative time', () => {
    expect(clipDurationMs(clip({ trimStartMs: 8_000, trimEndMs: 3_000 }))).toBe(0);
  });

  it('reports the furthest clip end for the project duration', () => {
    expect(audioEndMs([
      clip({ startMs: 0, trimEndMs: 4_000 }),
      clip({ startMs: 12_000, trimEndMs: 3_000 }),
    ])).toBe(15_000);
    expect(audioEndMs([])).toBe(0);
  });
});

describe('fades', () => {
  it('ramps from silence to the clip gain', () => {
    const c = clip({ trimEndMs: 4_000, fadeInMs: 1_000 });
    expect(gainAt(c, 0)).toBe(0);
    expect(gainAt(c, 500)).toBeCloseTo(0.5, 6);
    expect(gainAt(c, 1_000)).toBe(1);
    expect(gainAt(c, 2_000)).toBe(1);
  });

  it('ramps back down to silence at the very end', () => {
    const c = clip({ trimEndMs: 4_000, fadeOutMs: 1_000 });
    expect(gainAt(c, 3_000)).toBe(1);
    expect(gainAt(c, 3_500)).toBeCloseTo(0.5, 6);
    expect(gainAt(c, 4_000)).toBe(0);
  });

  it('scales both fades in proportion when they would overlap', () => {
    // Two seconds of clip, three seconds of requested fades.
    const c = clip({ trimEndMs: 2_000, fadeInMs: 2_000, fadeOutMs: 1_000 });
    const { inMs, outMs } = resolvedFades(c);

    expect(inMs + outMs).toBeCloseTo(2_000, 6);
    expect(inMs / outMs).toBeCloseTo(2, 6);
    // Both still audible — the whole point of scaling rather than truncating.
    expect(gainAt(c, inMs)).toBeCloseTo(1, 6);
  });

  it('applies the clip gain underneath the fade, not instead of it', () => {
    const c = clip({ trimEndMs: 4_000, fadeInMs: 1_000, gainDb: -6 });
    expect(gainAt(c, 500)).toBeCloseTo(dbToGain(-6) * 0.5, 6);
    expect(gainAt(c, 2_000)).toBeCloseTo(dbToGain(-6), 6);
  });

  it('is silent outside the clip', () => {
    const c = clip({ trimEndMs: 4_000 });
    expect(gainAt(c, -1)).toBe(0);
    expect(gainAt(c, 4_001)).toBe(0);
  });
});

describe('envelopeFrom — starting playback mid-clip', () => {
  it('starts at full gain for a clip with no fades', () => {
    const points = envelopeFrom(clip({ trimEndMs: 4_000 }), 0);
    expect(points[0]).toEqual({ atMs: 0, gain: 1 });
    expect(points.at(-1)).toEqual({ atMs: 4_000, gain: 1 });
  });

  it('resumes a fade-in at the level already reached', () => {
    /*
     * The case that matters: the user scrubs into the middle of a fade and
     * presses play. Scheduling the ramp from zero would make it audibly
     * restart; the first point has to carry the gain already in effect.
     */
    const points = envelopeFrom(clip({ trimEndMs: 4_000, fadeInMs: 1_000 }), 500);
    expect(points[0]?.atMs).toBe(500);
    expect(points[0]?.gain).toBeCloseTo(0.5, 6);
    expect(points[1]).toEqual({ atMs: 1_000, gain: 1 });
  });

  it('drops points already behind the playhead', () => {
    const points = envelopeFrom(clip({ trimEndMs: 4_000, fadeInMs: 1_000, fadeOutMs: 1_000 }), 3_500);
    expect(points.every((p) => p.atMs >= 3_500)).toBe(true);
    expect(points.at(-1)).toEqual({ atMs: 4_000, gain: 0 });
  });

  it('ends at silence when there is a fade out and at gain when there is not', () => {
    expect(envelopeFrom(clip({ trimEndMs: 4_000, fadeOutMs: 800 }), 0).at(-1)?.gain).toBe(0);
    expect(envelopeFrom(clip({ trimEndMs: 4_000 }), 0).at(-1)?.gain).toBe(1);
  });

  it('rises monotonically through a fade in and falls through a fade out', () => {
    const points = envelopeFrom(clip({ trimEndMs: 6_000, fadeInMs: 1_000, fadeOutMs: 1_000 }), 0);
    expect(points.map((p) => p.atMs)).toEqual([0, 1_000, 5_000, 6_000]);
    expect(points.map((p) => p.gain)).toEqual([0, 1, 1, 0]);
  });

  it('returns nothing for a clip with no duration', () => {
    expect(envelopeFrom(clip({ trimStartMs: 1_000, trimEndMs: 1_000 }), 0)).toEqual([]);
  });

  it('clamps a start beyond the clip rather than emitting stray points', () => {
    const points = envelopeFrom(clip({ trimEndMs: 4_000 }), 99_000);
    expect(points).toHaveLength(1);
    expect(points[0]?.atMs).toBe(4_000);
  });
});
