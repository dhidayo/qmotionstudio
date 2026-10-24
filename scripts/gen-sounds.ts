import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SOUND_LIBRARY, type LibrarySound } from '../src/audio/library';
import { RECIPES } from './sounds/recipes';
import { bands, gainToDb, loudness, mean, momentaryMax, peak, quantise, rms, wavFile } from './sounds/dsp';

/**
 * Renders the sound library into `public/sounds/` (D-156): `npm run sounds`.
 *
 * Every sound is synthesised from the scores in scripts/sounds/recipes.ts, in
 * plain TypeScript with seeded noise, so the output is the same bytes on
 * every run and every machine — a regeneration is only a diff when a recipe
 * changed. `npm run sounds -- --check` renders without writing and fails if
 * any committed file differs.
 *
 * Each file is checked as it is written, and the run fails on any of:
 *   – a length or loop point that disagrees with src/audio/library.ts;
 *   – a peak above −1dBFS (no clipping, room for the decoder's resampling);
 *   – a DC offset;
 *   – a loop whose file is not exactly periodic across its seam;
 *   – an effect that does not end in silence;
 *   – a library over 4MB.
 * and prints, per sound, its peak, loudness, DC offset, seam and where its
 * energy sits across the spectrum.
 */

const OUT_DIR = resolve(process.cwd(), 'public/sounds');
const MAX_TOTAL_BYTES = 4_000_000;
const CHECK = process.argv.includes('--check');

type Row = Record<string, string | number>;

function samplesAt(ms: number, sr: number): number {
  const n = (ms * sr) / 1000;
  if (!Number.isInteger(n)) throw new Error(`${ms}ms is not a whole number of samples at ${sr}Hz.`);
  return n;
}

function build(sound: LibrarySound, seed: number): { bytes: Uint8Array; row: Row; problems: string[] } {
  const recipe = RECIPES[sound.id];
  if (!recipe) throw new Error(`No recipe for "${sound.id}".`);
  const rendered = recipe();
  const problems: string[] = [];
  if (rendered.sr !== sound.sampleRate) problems.push(`renders at ${rendered.sr}Hz, the library says ${sound.sampleRate}Hz`);
  const sr = rendered.sr;
  const total = samplesAt(sound.durationMs, sr);

  let samples: Int16Array;
  const row: Row = { id: sound.id };
  if (rendered.kind === 'loop') {
    if (!sound.loop) throw new Error(`"${sound.id}" renders a loop but has no loop points.`);
    const start = samplesAt(sound.loop.startMs, sr);
    const period = rendered.loop.length;
    const end = start + period;
    if (end !== samplesAt(sound.loop.endMs, sr)) problems.push(`loop is ${(period / sr) * 1000}ms, the library says ${sound.loop.endMs - sound.loop.startMs}ms`);
    const after = total - end;
    if (after < 0 || after > period || start > period) problems.push('pre- or post-roll does not fit');
    // Pre-roll is the loop's own end, post-roll its own start: the steady state either side of the join.
    const data = new Float64Array(total);
    data.set(rendered.loop.subarray(period - start), 0);
    data.set(rendered.loop, start);
    data.set(rendered.loop.subarray(0, Math.max(0, after)), end);
    samples = quantise(data, seed, { offset: start, period });

    let periodic = true;
    for (let k = 0; k < after; k++) if (samples[end + k] !== samples[start + k]) periodic = false;
    for (let k = 1; k <= start; k++) if (samples[start - k] !== samples[end - k]) periodic = false;
    if (!periodic) problems.push('the file is not periodic across the seam');
    // The step the join makes, against the steps the music makes anyway.
    const steps: number[] = [];
    for (let i = start + 1; i < end; i++) steps.push(Math.abs((samples[i] ?? 0) - (samples[i - 1] ?? 0)));
    steps.sort((a, b) => a - b);
    const typical = steps[Math.floor(steps.length * 0.99)] ?? 1;
    const join = Math.abs((samples[start] ?? 0) - (samples[end - 1] ?? 0));
    if (join > typical) problems.push(`the join steps ${join}, more than 99% of the music's own steps (${typical})`);
    row.loop = `${sound.loop.startMs}–${sound.loop.endMs}ms`;
    row.seam = periodic ? `exact, step ${join} (p99 ${typical})` : 'BROKEN';
    const asFloat = Float64Array.from(samples.subarray(start, end), (v) => v / 32768);
    row.lufs = loudness(asFloat, sr, { loop: true }).toFixed(1);
  } else {
    if (rendered.data.length !== total) problems.push(`renders ${(rendered.data.length / sr) * 1000}ms, the library says ${sound.durationMs}ms`);
    const data = new Float64Array(total);
    data.set(rendered.data.subarray(0, total));
    samples = quantise(data, seed);
    const tail = rms(Float64Array.from(samples.subarray(total - Math.round(sr / 100)), (v) => v / 32768));
    if (gainToDb(tail) > -60) problems.push(`does not end in silence (last 10ms at ${gainToDb(tail).toFixed(0)}dBFS)`);
    if (Math.abs(samples[0] ?? 0) > 64) problems.push(`starts on a step (${samples[0] ?? 0})`);
    row.lufs = `${momentaryMax(Float64Array.from(samples, (v) => v / 32768), sr).toFixed(1)} (max)`;
    row.loop = '';
    row.seam = '';
  }

  const asFloat = Float64Array.from(samples, (v) => v / 32768);
  const peakDb = gainToDb(peak(asFloat));
  const dc = mean(asFloat);
  if (peakDb > -0.9) problems.push(`peaks at ${peakDb.toFixed(2)}dBFS`);
  if (Math.abs(dc) > 0.001) problems.push(`DC offset ${dc.toFixed(5)}`);
  const spread = bands(asFloat, sr);
  const bytes = wavFile(samples, sr);
  Object.assign(row, {
    sr,
    seconds: (total / sr).toFixed(2),
    kB: Math.round(bytes.length / 1024),
    peak: peakDb.toFixed(2),
    rms: gainToDb(rms(asFloat)).toFixed(1),
    dc: dc.toExponential(1),
    'bands sub/low/mid/pres/air dB': `${spread.sub} / ${spread.low} / ${spread.mid} / ${spread.presence} / ${spread.air}`,
  });
  return { bytes, row, problems };
}

async function main(): Promise<void> {
  const started = performance.now();
  await mkdir(OUT_DIR, { recursive: true });
  const rows: Row[] = [];
  const failures: string[] = [];
  let totalBytes = 0;
  let seed = 9_000;

  // `--only=<id>,<id>` renders some sounds while their recipes are being worked on.
  const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length).split(',');
  for (const sound of SOUND_LIBRARY) {
    const soundSeed = seed++;
    if (only !== undefined && !only.includes(sound.id)) continue;
    if (process.env.SOUNDS_DEBUG) console.log(sound.id);
    const { bytes, row, problems } = build(sound, soundSeed);
    totalBytes += bytes.length;
    rows.push(row);
    for (const problem of problems) failures.push(`${sound.id}: ${problem}`);
    const path = resolve(OUT_DIR, `${sound.id}.wav`);
    if (CHECK) {
      const existing = await readFile(path).catch(() => null);
      if (!existing || Buffer.compare(existing, Buffer.from(bytes)) !== 0) failures.push(`${sound.id}: public/sounds/${sound.id}.wav is out of date — run npm run sounds`);
    } else {
      await writeFile(path, bytes);
    }
  }
  for (const id of Object.keys(RECIPES)) {
    if (!SOUND_LIBRARY.some((sound) => sound.id === id)) failures.push(`${id}: a recipe with no library entry`);
  }
  if (only === undefined && totalBytes > MAX_TOTAL_BYTES) failures.push(`the library is ${(totalBytes / 1e6).toFixed(2)}MB, over ${MAX_TOTAL_BYTES / 1e6}MB`);

  console.table(rows);
  console.log(`${CHECK ? 'Checked' : 'Wrote'} ${rows.length} sounds, ${(totalBytes / 1e6).toFixed(2)}MB, in ${((performance.now() - started) / 1000).toFixed(1)}s.`);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`✗ ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
