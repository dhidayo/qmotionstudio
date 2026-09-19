import { expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';

/**
 * Shared plumbing for §10's audio tests.
 *
 * The fixture alternates one-second bursts of 440Hz with one-second silences.
 * That shape is what makes synchronisation testable with an RMS window and no
 * FFT: aligned audio is loud at 0.5s, silent at 1.5s, loud at 2.5s. Shift the
 * track by a quarter of a second and the pattern smears; shift it by one and
 * it inverts.
 */

export const AUDIO_FIXTURE = resolve(process.cwd(), 'tests/fixtures/beat-bands.wav');

/** Seconds into the fixture, and whether a burst should be sounding there. */
export const EXPECTED = [
  { atS: 0.5, loud: true },
  { atS: 1.5, loud: false },
  { atS: 2.5, loud: true },
  { atS: 3.5, loud: false },
  { atS: 4.5, loud: true },
] as const;

export async function addMusic(page: Page): Promise<void> {
  await page.getByLabel('Add a music track').setInputFiles(AUDIO_FIXTURE);
  await expect(page.getByLabel('Music inspector')).toBeVisible({ timeout: 20_000 });
}

/**
 * RMS of a short window of a decoded buffer.
 *
 * Runs in the page because that is where `decodeAudioData` lives — and where
 * the exported blob already is.
 */
export const RMS_SOURCE = `
window.__rmsAt = async function (blob, points, windowS) {
  const ctx = new OfflineAudioContext(1, 1, 48000);
  const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;

  return {
    durationS: buffer.duration,
    channels: buffer.numberOfChannels,
    sampleRate: rate,
    levels: points.map(function (atS) {
      const start = Math.max(0, Math.floor((atS - windowS / 2) * rate));
      const end = Math.min(data.length, Math.floor((atS + windowS / 2) * rate));
      let sum = 0;
      for (let i = start; i < end; i++) sum += data[i] * data[i];
      const n = Math.max(1, end - start);
      return Math.sqrt(sum / n);
    })
  };
};
`;
