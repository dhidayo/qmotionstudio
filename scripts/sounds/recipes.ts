import {
  Biquad, Osc, TAU, Track, adsr, bands, clamp, compress, dbToGain, echo, filtered, hz, limit, loudness,
  momentaryMax, peak, gainToDb, render, reverb, rng, scaled, softClip, steadyState, wow,
} from './dsp';
import {
  bass, bell, boom, clap, crash, electricPiano, hat, kick, marimba, pad, piano, pluckedString,
  shaker, snare, synthPluck,
} from './instruments';

/**
 * What each sound in the library is, as a score (D-156).
 *
 * The four background loops are written like songs: a chord progression, a
 * bass line, drums and a hook, each part mixed to a loudness of its own
 * rather than by guesswork, then a gentle master — a low cut, a little glue
 * and a limiter — to a common loudness, so switching between them never
 * jumps in level. The effects are designed sounds, each layered from a few
 * simple parts.
 *
 * A loop is rendered on a circle (see dsp.ts), so its last bar flows into its
 * first exactly as it will when it repeats.
 */

export type Rendered =
  | { readonly kind: 'loop'; readonly sr: number; readonly loop: Float64Array }
  | { readonly kind: 'oneShot'; readonly sr: number; readonly data: Float64Array };

/** Background loops: 24kHz keeps the files small, and nothing above 12kHz belongs under a voice or a video. */
const BED_SR = 24_000;
/** Effects: 32kHz keeps the air in a swoosh. */
const FX_SR = 32_000;

/** How loud every background loop is, in LUFS, and the ceiling no peak passes. */
const BED_LUFS = -16;
/** How loud every effect is at its height, in LUFS (the loudest 400ms). */
const FX_LUFS = -14;
const CEILING_DB = -1;

// ── Mixing ───────────────────────────────────────────────────────────────────

type Stem = {
  readonly name: string;
  readonly track: Track;
  /** Its loudness in the mix, LUFS, measured over the whole loop. */
  readonly lufs: number;
  /** How much goes to the reverb, 0–1. */
  readonly reverb?: number;
  /** How much goes to the echo, 0–1. */
  readonly echo?: number;
};

/**
 * Sets each part to its loudness, adds the reverb and echo returns, and
 * masters the whole to the library's loudness. Every stateful stage runs on
 * the loop's steady state.
 */
function mixLoop(
  sr: number,
  stems: readonly Stem[],
  options: {
    readonly reverb: { seconds: number; size?: number; damping?: number; preDelayMs?: number; highCutHz?: number };
    readonly reverbLufs: number;
    readonly echo?: { seconds: number; feedback: number; lufs: number };
    readonly highCutHz?: number;
    readonly glue?: { thresholdDb: number; ratio: number };
    readonly drive?: number;
  },
): Float64Array {
  const length = stems[0]?.track.length ?? 0;
  const dry = new Float64Array(length);
  const reverbSend = new Float64Array(length);
  const echoSend = new Float64Array(length);
  for (const stem of stems) {
    if (process.env.SOUNDS_MUTE?.split(',').includes(stem.name)) continue;
    const gain = dbToGain(stem.lufs - loudness(stem.track.data, sr, { loop: true }));
    if (process.env.SOUNDS_DEBUG) {
      const b = bands(stem.track.data, sr);
      console.log(`  ${stem.name.padEnd(8)} ${stem.lufs} LUFS, peak ${gainToDb(peak(stem.track.data) * gain).toFixed(1)}, rms ${gainToDb(rmsOf(stem.track.data) * gain).toFixed(1)}dB, bands ${b.sub}/${b.low}/${b.mid}/${b.presence}/${b.air}`);
    }
    for (let i = 0; i < length; i++) {
      const v = (stem.track.data[i] ?? 0) * gain;
      dry[i] = (dry[i] ?? 0) + v;
      reverbSend[i] = (reverbSend[i] ?? 0) + v * (stem.reverb ?? 0);
      echoSend[i] = (echoSend[i] ?? 0) + v * (stem.echo ?? 0);
    }
  }
  const wet = steadyState(reverbSend, (x) => reverb(x, sr, options.reverb));
  const wetGain = dbToGain(options.reverbLufs - loudness(wet, sr, { loop: true }));
  let mix = dry.map((v, i) => v + (wet[i] ?? 0) * wetGain);
  if (options.echo) {
    const { seconds, feedback, lufs } = options.echo;
    const repeats = steadyState(echoSend, (x) => echo(x, sr, { seconds, feedback }));
    const echoGain = dbToGain(lufs - loudness(repeats, sr, { loop: true }));
    mix = mix.map((v, i) => v + (repeats[i] ?? 0) * echoGain);
  }
  return masterLoop(mix, sr, options);
}

/** A low cut, an optional top roll-off and glue, then loudness and a limiter. */
function masterLoop(
  mix: Float64Array,
  sr: number,
  options: { readonly highCutHz?: number; readonly glue?: { thresholdDb: number; ratio: number }; readonly drive?: number },
): Float64Array {
  let x = steadyState(mix, (d) => filtered(filtered(d, sr, 'highpass', 32, 0.7), sr, 'highpass', 32, 0.7));
  if (options.highCutHz !== undefined) {
    const cut = options.highCutHz;
    x = steadyState(x, (d) => filtered(d, sr, 'lowpass', cut, 0.6));
  }
  // Glue measured at the mix's working level, so thresholds mean the same in every loop.
  x = scaled(x, dbToGain(BED_LUFS - 2 - loudness(x, sr, { loop: true })));
  const glue = options.glue;
  if (glue) x = steadyState(x, (d) => compress(d, sr, { ...glue, attackMs: 15, releaseMs: 180 }));
  const drive = options.drive;
  if (drive !== undefined) x = x.map((v) => softClip(v, drive));

  let gain = dbToGain(BED_LUFS - loudness(x, sr, { loop: true }));
  let out = x;
  for (let pass = 0; pass < 4; pass++) {
    const g = gain;
    out = steadyState(x, (d) => limit(scaled(d, g), sr, { ceilingDb: CEILING_DB, releaseMs: 90 }));
    const miss = BED_LUFS - loudness(out, sr, { loop: true });
    if (Math.abs(miss) < 0.05) break;
    gain *= dbToGain(miss);
  }
  if (process.env.SOUNDS_DEBUG) {
    const before = scaled(x, gain);
    let worst = 0;
    let limited = 0;
    let total = 0;
    let over1 = 0;
    for (let i = 0; i < out.length; i++) {
      const a = Math.abs(before[i] ?? 0);
      if (a < 1e-3) continue;
      const reduction = gainToDb(Math.abs(out[i] ?? 0) / a);
      if (reduction < -0.1) { limited++; total += reduction; }
      if (reduction < -1) over1++;
      worst = Math.min(worst, reduction);
    }
    console.log(`  limiter: deepest ${worst.toFixed(1)}dB, ${((100 * limited) / out.length).toFixed(1)}% of samples touched (mean ${(total / Math.max(1, limited)).toFixed(2)}dB), ${((100 * over1) / out.length).toFixed(1)}% by over 1dB`);
  }
  return out;
}

/**
 * Masters an effect: a low cut, then up to its loudness — limited by at most
 * `squeezeDb` of limiting, so a hit keeps its snap.
 */
function masterShot(data: Float64Array, sr: number, squeezeDb = 0, lufs = FX_LUFS): Float64Array {
  const x = filtered(filtered(data, sr, 'highpass', 24, 0.7), sr, 'highpass', 24, 0.7);
  const toLoudness = lufs - momentaryMax(x, sr);
  const toCeiling = CEILING_DB - gainToDb(peak(x)) + squeezeDb;
  const gain = dbToGain(Math.min(toLoudness, toCeiling));
  // A quarter of a millisecond in, so even a hit starts from silence rather than on a step.
  const ramp = Math.round(0.00025 * sr);
  for (let i = 0; i < ramp; i++) x[i] = (x[i] ?? 0) * (i / ramp);
  return limit(scaled(x, gain), sr, { ceilingDb: CEILING_DB, releaseMs: 60, lookaheadMs: 1.5 });
}

/** Ducks a part under the kick: the "pump" that makes dance music breathe. */
function duck(track: Track, beatSeconds: number, depth: number, recoverSeconds: number): void {
  const { sr, data } = track;
  for (let i = 0; i < data.length; i++) {
    const since = (i / sr) % beatSeconds;
    const dip = (1 - Math.exp(-since / 0.005)) * Math.exp(-since / recoverSeconds);
    data[i] = (data[i] ?? 0) * (1 - depth * dip);
  }
}

/** A slow wobble in level, whole cycles per loop so it is seamless. */
function tremolo(track: Track, cycles: number, depth: number): void {
  const { data } = track;
  for (let i = 0; i < data.length; i++) {
    data[i] = (data[i] ?? 0) * (1 - depth / 2 + (depth / 2) * Math.sin((TAU * cycles * i) / data.length));
  }
}

/** Where things fall: bars and beats to seconds. */
function grid(bpm: number): { beat: number; bar: number; at: (bar: number, beat: number) => number } {
  const beat = 60 / bpm;
  return { beat, bar: beat * 4, at: (bar, q) => bar * beat * 4 + q * beat };
}

type Note = readonly [midi: number, beat: number, beats: number];

// ── Upbeat Pulse ─────────────────────────────────────────────────────────────

/**
 * 120 BPM, A minor, eight bars of Am–F–C–G. Four-on-the-floor kick, claps on
 * two and four, an open hat on every off-beat; a sub bass and chord stabs on
 * the off-beats over a pad that ducks under the kick. Bars 5–8 add a shaker and
 * a plucked hook with a dotted-eighth echo; bar 8 ends on a clap fill that
 * turns the loop round.
 */
function upbeatPulse(): Rendered {
  const sr = BED_SR;
  const { beat, bar, at } = grid(120);
  const bars = 8;
  const seconds = bars * bar;
  const track = (): Track => new Track(sr, seconds, true);
  const roots = [33, 29, 36, 31];
  const chords = [[57, 60, 64, 69], [57, 60, 65, 69], [55, 60, 64, 67], [55, 59, 62, 67]];

  const kicks = track(); const claps = track(); const hats = track(); const shakers = track();
  const bassLine = track(); const stabs = track(); const pads = track(); const lead = track(); const crashes = track();
  const kickNote = kick(sr, { seed: 11, punchHz: 165, toneHz: 56, decay: 0.22 });
  for (let b = 0; b < bars; b++) {
    const chord = chords[b % 4] ?? [];
    const root = roots[b % 4] ?? 33;
    for (let q = 0; q < 4; q++) {
      kicks.add(at(b, q), kickNote);
      if (q % 2 === 1) claps.add(at(b, q), clap(sr, { seed: 100 + b * 4 + q, decay: 0.09 }));
      for (let s = 0; s < 4; s++) {
        const open = s === 2;
        const note = hat(sr, { seed: 1000 + b * 16 + q * 4 + s, decay: open ? 0.16 : 0.03 });
        hats.add(at(b, q + s / 4), note, open ? 1 : s === 0 ? 0.55 : 0.32);
        if (b >= 4) shakers.add(at(b, q + s / 4), shaker(sr, { seed: 3000 + b * 16 + q * 4 + s }), s % 2 === 0 ? 0.6 : 1);
      }
      // Off-beat bass, and a lift into the next bar on the last one of bar 8.
      const bassNote = b === bars - 1 && q === 3 ? 40 : root;
      bassLine.add(at(b, q + 0.5), bass(sr, hz(bassNote), 0.19, { cutoffHz: 480, envelope: 2.5, saw: 0.8, sub: 0.55, decay: 0.2, sustain: 0.6 }));
      for (const n of chord) stabs.add(at(b, q + 0.5), synthPluck(sr, hz(n), 0.1, { cutoffHz: 1900, envelope: 2.5, decay: 0.12, sustain: 0.05 }));
    }
    for (const n of chord) pads.add(at(b, 0), pad(sr, hz(n), bar - 0.05, { seed: 400 + b * 8 + n, cutoffHz: 1900, attack: 0.04, release: 0.25, cents: 14 }));
  }
  // The turnaround: four claps rising into the top of the loop.
  for (let s = 0; s < 4; s++) claps.add(at(7, 3 + s / 4), clap(sr, { seed: 200 + s, decay: 0.06 }), 0.45 + s * 0.17);
  crashes.add(0, crash(sr, { seed: 77, decay: 1.2 }));

  const hook: readonly Note[][] = [
    [[69, 0, 1.5], [72, 1.5, 0.5], [76, 2, 1], [74, 3, 0.5], [72, 3.5, 0.5]],
    [[72, 0, 1.5], [69, 1.5, 0.5], [72, 2, 0.5], [74, 2.5, 1.5]],
    [[76, 0, 1.5], [79, 1.5, 0.5], [76, 2, 1], [74, 3, 0.5], [76, 3.5, 0.5]],
    [[74, 0, 2], [71, 2, 1], [67, 3, 1]],
  ];
  hook.forEach((notes, k) => {
    for (const [n, q, len] of notes) {
      const gate = len * beat * 0.9;
      lead.add(at(4 + k, q), synthPluck(sr, hz(n), gate, { cutoffHz: 2100, envelope: 1.6, decay: 0.3, sustain: 0.35, detune: 0.004 }));
      lead.add(at(4 + k, q), bell(sr, hz(n + 12), { decay: 0.6, level: 0.35 }));
    }
  });

  duck(pads, beat, 0.65, 0.11);
  duck(stabs, beat, 0.3, 0.11);

  const loop = mixLoop(sr, [
    { name: 'kick', track: kicks, lufs: -24 },
    { name: 'bass', track: bassLine, lufs: -25.5 },
    { name: 'clap', track: claps, lufs: -25, reverb: 0.25 },
    { name: 'hats', track: hats, lufs: -31, reverb: 0.05 },
    { name: 'shaker', track: shakers, lufs: -35 },
    { name: 'crash', track: crashes, lufs: -40 },
    { name: 'stabs', track: stabs, lufs: -25.5, reverb: 0.2 },
    { name: 'pad', track: pads, lufs: -28, reverb: 0.3 },
    { name: 'lead', track: lead, lufs: -25.5, reverb: 0.3, echo: 0.5 },
  ], {
    reverb: { seconds: 1.6, size: 1.1, damping: 0.4, highCutHz: 6500 },
    reverbLufs: -31,
    echo: { seconds: beat * 0.75, feedback: 0.32, lufs: -34 },
    glue: { thresholdDb: -20, ratio: 2 },
  });
  return { kind: 'loop', sr, loop };
}

// ── Lo-fi Haze ───────────────────────────────────────────────────────────────

/**
 * 80 BPM, four bars of Dm9–G13–Cmaj9–Am9 on a warm electric piano with a
 * slow tremolo, a round bass, a swung boom-bap beat, a felt-piano answer in
 * bars 2 and 4, vinyl crackle and a touch of tape wow — all softened at the top.
 */
function lofiHaze(): Rendered {
  const sr = BED_SR;
  const { beat, bar, at } = grid(80);
  const bars = 4;
  const seconds = bars * bar;
  const track = (): Track => new Track(sr, seconds, true);
  const swing = 0.09;
  const chords = [[53, 57, 60, 64], [53, 57, 59, 64], [52, 55, 59, 62], [55, 59, 60, 64]];
  const roots = [38, 31, 36, 33];

  const kicks = track(); const snares = track(); const hats = track(); const keys = track();
  const bassLine = track(); const melody = track(); const dust = track();
  const r = rng(808);
  for (let b = 0; b < bars; b++) {
    const chord = chords[b] ?? [];
    const root = roots[b] ?? 38;
    // Keys: a full chord on the one, a softer re-hit just after beat three, strummed upwards.
    chord.forEach((n, k) => {
      keys.add(at(b, 0) + k * 0.014, electricPiano(sr, hz(n), beat * 2.2, 0.62));
      keys.add(at(b, 2.5 + swing) + k * 0.012, electricPiano(sr, hz(n), beat * 1.1, 0.42));
    });
    bassLine.add(at(b, 0), bass(sr, hz(root), beat * 1.9, { cutoffHz: 300, envelope: 1.2, saw: 0.25, decay: 0.6, sustain: 0.7, release: 0.08 }));
    bassLine.add(at(b, 2.5 + swing), bass(sr, hz(root + 12), beat * 0.4, { cutoffHz: 300, envelope: 1.2, saw: 0.25, decay: 0.3, sustain: 0.6 }), 0.7);
    bassLine.add(at(b, 3), bass(sr, hz(root + 7), beat * 0.8, { cutoffHz: 300, envelope: 1.2, saw: 0.25, decay: 0.4, sustain: 0.6 }), 0.85);

    kicks.add(at(b, 0), kick(sr, { seed: 21, punchHz: 125, toneHz: 55, decay: 0.27, click: 0.12, drive: 1.3 }));
    kicks.add(at(b, 2.5 + swing), kick(sr, { seed: 22, punchHz: 125, toneHz: 55, decay: 0.24, click: 0.1, drive: 1.3 }), 0.8);
    if (b % 2 === 1) kicks.add(at(b, 1.75), kick(sr, { seed: 23, punchHz: 120, toneHz: 55, decay: 0.2, click: 0.08 }), 0.45);
    for (const q of [1, 3]) snares.add(at(b, q) + 0.012, snare(sr, { seed: 300 + b * 4 + q, toneHz: 170, decay: 0.17, brightHz: 2600, body: 0.7 }));
    for (let e = 0; e < 8; e++) {
      const q = e / 2 + (e % 2 === 1 ? swing : 0);
      hats.add(at(b, q), hat(sr, { seed: 500 + b * 8 + e, decay: 0.028, lowHz: 5500 }), e % 2 === 0 ? 0.75 : 0.45);
    }
  }
  const answers: readonly Note[][] = [
    [],
    [[79, 1, 0.5], [76, 1.5 + swing, 0.5], [74, 2, 1.5]],
    [],
    [[76, 1, 0.5], [74, 1.5 + swing, 0.5], [72, 2, 0.75], [69, 2.75, 1.25]],
  ];
  answers.forEach((notes, b) => {
    for (const [n, q, len] of notes) melody.add(at(b, q), piano(sr, hz(n), len * beat, 0.4, { seed: 600 + n, felt: 1200 }));
  });
  // Vinyl: sparse ticks and a faint hiss, the same on every turn of the loop.
  const hiss = new Biquad(sr, 'lowpass', 4500, 0.5);
  const hissHigh = new Biquad(sr, 'highpass', 900, 0.5);
  for (let i = 0; i < dust.length; i++) {
    let v = hissHigh.run(hiss.run(r() * 2 - 1)) * 0.02;
    if (r() > 0.99975) v += (r() - 0.5) * 0.9;
    dust.data[i] = v;
  }

  tremolo(keys, 42, 0.18);
  const warm = (t: Track): void => {
    const wobbled = steadyState(t.data, (d) => wow(d, sr, { depthMs: 1.4, periodSeconds: seconds / 4 }));
    t.data.set(wobbled);
  };
  warm(keys); warm(melody); warm(bassLine);

  const loop = mixLoop(sr, [
    { name: 'kick', track: kicks, lufs: -24.5 },
    { name: 'snare', track: snares, lufs: -25.5, reverb: 0.2 },
    { name: 'hats', track: hats, lufs: -34 },
    { name: 'bass', track: bassLine, lufs: -25 },
    { name: 'keys', track: keys, lufs: -23, reverb: 0.3 },
    { name: 'melody', track: melody, lufs: -29, reverb: 0.45, echo: 0.3 },
    { name: 'dust', track: dust, lufs: -45 },
  ], {
    reverb: { seconds: 1.8, size: 1.0, damping: 0.55, highCutHz: 4500 },
    reverbLufs: -31,
    echo: { seconds: beat * 0.75, feedback: 0.3, lufs: -36 },
    highCutHz: 7000,
    glue: { thresholdDb: -20, ratio: 2.2 },
    drive: 1.15,
  });
  return { kind: 'loop', sr, loop };
}

// ── Bright Corporate ─────────────────────────────────────────────────────────

/**
 * 100 BPM, D major, eight bars of D–A–Bm–G, D–A–G–A. A plucked-guitar
 * arpeggio in eighths, soft piano chords, a picked bass, shaker and claps
 * throughout; bars 5–8 add a fuller kick and hats and a glockenspiel melody
 * doubled on marimba, and a clap fill leads back to the top.
 */
function corporateBright(): Rendered {
  const sr = BED_SR;
  const { beat, bar, at } = grid(100);
  const bars = 8;
  const seconds = bars * bar;
  const track = (): Track => new Track(sr, seconds, true);
  const D = [50, 57, 62, 66, 69];
  const A = [45, 52, 57, 61, 64];
  const Bm = [47, 54, 59, 62, 66];
  const G = [43, 50, 59, 62, 67];
  const progression = [D, A, Bm, G, D, A, G, A];
  const roots = [38, 33, 35, 31, 38, 33, 31, 33];
  const passing = [35, 37, 33, 37, 35, 35, 32, 37];
  const pianoVoicing = new Map([[D, [62, 66, 69]], [A, [61, 64, 69]], [Bm, [62, 66, 71]], [G, [62, 67, 71]]]);
  const pattern = [0, 2, 3, 4, 1, 3, 4, 2];

  const kicks = track(); const claps = track(); const shakers = track(); const hats = track(); const crashes = track();
  const guitar = track(); const keys = track(); const bassLine = track(); const glock = track();
  for (let b = 0; b < bars; b++) {
    const chord = progression[b] ?? D;
    const root = roots[b] ?? 38;
    pattern.forEach((index, e) => {
      const n = chord[index] ?? 62;
      guitar.add(at(b, e / 2), pluckedString(sr, hz(n), { seed: 700 + b * 8 + e, decay: 1.6, brightness: 0.5, pick: 0.13 }), e % 2 === 0 ? 1 : 0.8);
    });
    for (const q of [0, 2]) {
      for (const n of pianoVoicing.get(chord) ?? []) keys.add(at(b, q), piano(sr, hz(n), beat * 1.9, 0.3, { seed: 800 + n, felt: 1600 }));
    }
    for (let e = 0; e < 8; e++) {
      // The last eighth walks to the next chord's root.
      const n = e === 7 ? (passing[b] ?? root) : root;
      bassLine.add(at(b, e / 2), bass(sr, hz(n), beat * 0.42, { cutoffHz: 650, envelope: 1.5, saw: 0.7, sub: 0.6, decay: 0.15, sustain: 0.55 }), e % 2 === 0 ? 1 : 0.75);
    }
    const full = b >= 4;
    kicks.add(at(b, 0), kick(sr, { seed: 31, punchHz: 150, toneHz: 57, decay: 0.22, click: 0.2 }));
    kicks.add(at(b, 2), kick(sr, { seed: 31, punchHz: 150, toneHz: 57, decay: 0.22, click: 0.2 }), full ? 1 : 0.8);
    if (full) kicks.add(at(b, 2.5), kick(sr, { seed: 32, punchHz: 150, toneHz: 57, decay: 0.18, click: 0.15 }), 0.6);
    for (const q of [1, 3]) claps.add(at(b, q), clap(sr, { seed: 900 + b * 4 + q, decay: 0.1, centreHz: 1400 }));
    for (let s = 0; s < 16; s++) shakers.add(at(b, s / 4), shaker(sr, { seed: 1100 + b * 16 + s, decay: 0.04 }), s % 4 === 2 ? 1 : s % 2 === 0 ? 0.7 : 0.45);
    if (full) for (let e = 0; e < 8; e++) hats.add(at(b, e / 2), hat(sr, { seed: 1300 + b * 8 + e, decay: e % 2 === 1 ? 0.07 : 0.03 }), e % 2 === 1 ? 1 : 0.5);
  }
  for (let s = 0; s < 4; s++) claps.add(at(7, 3 + s / 4), clap(sr, { seed: 950 + s, decay: 0.06, centreHz: 1400 }), 0.4 + s * 0.15);
  crashes.add(0, crash(sr, { seed: 78, decay: 1.4 }));

  const melody: readonly Note[][] = [
    [[74, 0, 1], [76, 1, 0.5], [78, 1.5, 1.5], [81, 3, 1]],
    [[76, 0, 1.5], [73, 1.5, 0.5], [76, 2, 2]],
    [[74, 0, 1], [71, 1, 0.5], [74, 1.5, 1.5], [79, 3, 1]],
    [[78, 0, 1.5], [76, 1.5, 0.5], [73, 2, 1], [69, 3, 1]],
  ];
  melody.forEach((notes, k) => {
    for (const [n, q] of notes) {
      glock.add(at(4 + k, q), bell(sr, hz(n + 12), { decay: 1.1, level: 0.4 }));
      glock.add(at(4 + k, q), marimba(sr, hz(n), 0.7, { seed: 1500 + n }), 0.8);
    }
  });

  const loop = mixLoop(sr, [
    { name: 'kick', track: kicks, lufs: -26.5 },
    { name: 'clap', track: claps, lufs: -27.5, reverb: 0.3 },
    { name: 'shaker', track: shakers, lufs: -33.5 },
    { name: 'hats', track: hats, lufs: -36 },
    { name: 'crash', track: crashes, lufs: -42 },
    { name: 'bass', track: bassLine, lufs: -26 },
    { name: 'guitar', track: guitar, lufs: -23, reverb: 0.25, echo: 0.2 },
    { name: 'piano', track: keys, lufs: -28, reverb: 0.35 },
    { name: 'glock', track: glock, lufs: -28, reverb: 0.35, echo: 0.3 },
  ], {
    reverb: { seconds: 1.5, size: 1.0, damping: 0.4, highCutHz: 6500 },
    reverbLufs: -30,
    echo: { seconds: beat * 0.75, feedback: 0.25, lufs: -36 },
    glue: { thresholdDb: -20, ratio: 2 },
  });
  return { kind: 'loop', sr, loop };
}

// ── Cinematic Dawn ───────────────────────────────────────────────────────────

/**
 * 60 BPM, D major, four bars of Bm–G–D–A held by a string pad with a slow
 * swell, a harp ostinato in eighths with an echo, a felt-piano melody, a sub
 * under each chord and a deep pulse on every bar, in a large hall.
 */
function cinematicDawn(): Rendered {
  const sr = BED_SR;
  const { beat, bar, at } = grid(60);
  const bars = 4;
  const seconds = bars * bar;
  const track = (): Track => new Track(sr, seconds, true);
  const voicings = [[47, 54, 59, 62, 66], [43, 50, 59, 62, 67], [50, 57, 62, 66, 69], [45, 52, 61, 64, 69]];
  const tops = [[66, 71, 74, 78], [67, 71, 74, 79], [66, 69, 74, 78], [64, 69, 73, 76]];
  const roots = [35, 31, 38, 33];
  const ostinato = [0, 2, 1, 3, 0, 2, 1, 3];

  const strings = track(); const harp = track(); const keys = track(); const low = track(); const pulse = track();
  for (let b = 0; b < bars; b++) {
    for (const n of voicings[b] ?? []) strings.add(at(b, 0), pad(sr, hz(n), bar, { seed: 1700 + b * 10 + n, cutoffHz: 3000, attack: 1.0, release: 0.9, cents: 9, voices: 6, vibrato: 0.0025 }));
    ostinato.forEach((index, e) => {
      const n = tops[b]?.[index] ?? 74;
      harp.add(at(b, e / 2), pluckedString(sr, hz(n), { seed: 1900 + b * 8 + e, decay: 2.2, brightness: 0.5, pick: 0.2 }), e % 4 === 0 ? 1 : 0.7);
    });
    const root = roots[b] ?? 35;
    const sub = new Osc(sr, hz(root), 'sine');
    low.add(at(b, 0), render(sr, bar + 1.5, (t) => sub.next() * adsr(t, bar - 0.2, 0.6, 1, 1, 0.6)));
    pulse.add(at(b, 0), boom(sr, { seed: 2100 + b, fromHz: 70, toHz: 42, decay: 0.8 }));
    pulse.add(at(b, 2), boom(sr, { seed: 2200 + b, fromHz: 70, toHz: 42, decay: 0.6 }), 0.45);
  }
  const line: readonly Note[][] = [
    [[78, 0, 2], [76, 2, 1], [74, 3, 1]],
    [[74, 0, 2], [71, 2, 2]],
    [[69, 0, 1], [74, 1, 1], [78, 2, 2]],
    [[76, 0, 3], [73, 3, 1]],
  ];
  line.forEach((notes, b) => {
    for (const [n, q, len] of notes) keys.add(at(b, q), piano(sr, hz(n), len * beat, 0.45, { seed: 2300 + b * 10 + n, felt: 1300 }));
  });

  const loop = mixLoop(sr, [
    { name: 'strings', track: strings, lufs: -21, reverb: 0.4 },
    { name: 'harp', track: harp, lufs: -27, reverb: 0.4, echo: 0.45 },
    { name: 'piano', track: keys, lufs: -24, reverb: 0.5 },
    { name: 'sub', track: low, lufs: -33 },
    { name: 'pulse', track: pulse, lufs: -31, reverb: 0.2 },
  ], {
    reverb: { seconds: 3.4, size: 1.45, damping: 0.4, preDelayMs: 28, highCutHz: 7000 },
    reverbLufs: -23,
    echo: { seconds: beat * 0.75, feedback: 0.35, lufs: -33 },
    glue: { thresholdDb: -22, ratio: 1.6 },
  });
  return { kind: 'loop', sr, loop };
}

// ── Effects ──────────────────────────────────────────────────────────────────

/** A buffer of `seconds` drawn by a voice, for effects that are one continuous gesture. */
function shot(seconds: number, voice: (t: number, i: number) => number): Float64Array {
  return render(FX_SR, seconds, voice);
}

/** Adds a room to a one-shot, inside its own length. */
function withRoom(dry: Float64Array, options: { seconds: number; size?: number; mix: number; highCutHz?: number }): Float64Array {
  const wet = reverb(dry, FX_SR, { seconds: options.seconds, size: options.size ?? 1, damping: 0.45, highCutHz: options.highCutHz ?? 8000, lowCutHz: 150 });
  const scale = rmsOf(dry) / Math.max(1e-9, rmsOf(wet));
  return dry.map((v, i) => v + (wet[i] ?? 0) * scale * options.mix);
}

function rmsOf(data: Float64Array): number {
  let sum = 0;
  for (const v of data) sum += v * v;
  return Math.sqrt(sum / Math.max(1, data.length));
}

/** Ends a one-shot on true silence with a raised-cosine fade. */
function settle(data: Float64Array, fadeSeconds: number): Float64Array {
  const n = Math.min(data.length, Math.round(fadeSeconds * FX_SR));
  for (let i = 0; i < n; i++) {
    const at = data.length - n + i;
    data[at] = (data[at] ?? 0) * (0.5 + 0.5 * Math.cos((Math.PI * i) / n));
  }
  return data;
}

/** Air rushing past: a resonant band of noise sweeping up and back down, over a low body. */
function whoosh(): Rendered {
  const r = rng(41);
  const band = new Biquad(FX_SR, 'bandpass', 400, 1.4);
  const band2 = new Biquad(FX_SR, 'bandpass', 400, 2.2);
  const body = new Biquad(FX_SR, 'lowpass', 280, 0.7);
  const peakAt = 0.42;
  const data = shot(1.0, (t, i) => {
    const p = t < peakAt ? t / peakAt : 1 - (t - peakAt) / (1.0 - peakAt);
    const centre = 260 * (2600 / 260) ** clamp(t < peakAt ? (t / peakAt) ** 1.4 : 1 - ((t - peakAt) / (1 - peakAt)) ** 0.8 * 0.75, 0, 1);
    if (i % 16 === 0) { band.set('bandpass', centre, 1.4); band2.set('bandpass', centre * 1.9, 2.2); }
    const env = t < peakAt ? (t / peakAt) ** 2.2 : Math.exp(-(t - peakAt) / 0.16);
    const noise = r() * 2 - 1;
    const air = band.run(noise) * 1.0 + band2.run(noise) * 0.35;
    const low = body.run(noise) * 0.5 * env;
    return (air * env + low) * clamp(p * 4, 0, 1) * 1.2;
  });
  return { kind: 'oneShot', sr: FX_SR, data: settle(masterShot(withRoom(data, { seconds: 0.6, mix: 0.25 }), FX_SR, 2), 0.05) };
}

/** A quick swipe: bright noise sweeping upward, fast in, faster out. */
function swoosh(): Rendered {
  const r = rng(42);
  const band = new Biquad(FX_SR, 'bandpass', 1000, 1.6);
  const high = new Biquad(FX_SR, 'highpass', 1800, 0.7);
  const top = new Biquad(FX_SR, 'lowpass', 11_000, 0.7);
  const peakAt = 0.11;
  const data = shot(0.6, (t, i) => {
    const sweep = clamp(t / 0.3, 0, 1);
    if (i % 16 === 0) band.set('bandpass', 900 * (7000 / 900) ** (sweep ** 0.7), 1.6);
    const env = t < peakAt ? Math.sin((Math.PI / 2) * (t / peakAt)) ** 2 : Math.exp(-(t - peakAt) / 0.07);
    const noise = r() * 2 - 1;
    return top.run(band.run(noise) * 1.2 + high.run(noise) * 0.25) * env;
  });
  return { kind: 'oneShot', sr: FX_SR, data: settle(masterShot(withRoom(data, { seconds: 0.4, mix: 0.2 }), FX_SR, 2), 0.04) };
}

/** A bubble popping: a sine whose pitch jumps up as it fades, with a soft tick on top. */
function pop(): Rendered {
  const r = rng(43);
  const tick = new Biquad(FX_SR, 'bandpass', 3200, 1.2);
  let phase = 0;
  const data = shot(0.3, (t) => {
    const f = 380 + 720 * (1 - Math.exp(-t / 0.018));
    phase += f / FX_SR;
    const env = Math.min(1, t / 0.0012) * Math.exp(-t / 0.045);
    const tone = Math.sin(TAU * phase) + 0.18 * Math.sin(TAU * phase * 2);
    const click = tick.run(r() * 2 - 1) * Math.exp(-t / 0.0015) * 0.5;
    return tone * env + click;
  });
  return { kind: 'oneShot', sr: FX_SR, data: settle(masterShot(data, FX_SR, 0, -16), 0.02) };
}

/** A crisp tap: a short bright transient over a small wooden knock. */
function click(): Rendered {
  const r = rng(44);
  const crack = new Biquad(FX_SR, 'bandpass', 4200, 1.0);
  const data = shot(0.3, (t) => {
    const transient = crack.run(r() * 2 - 1) * Math.exp(-t / 0.0011) * 1.4;
    const tick = Math.sin(TAU * 2900 * t) * Math.exp(-t / 0.0035) * 0.45;
    const knock = Math.sin(TAU * 950 * t) * Math.exp(-t / 0.007) * 0.55;
    return (transient + tick + knock) * Math.min(1, t / 0.0002);
  });
  return { kind: 'oneShot', sr: FX_SR, data: settle(masterShot(data, FX_SR, 0, -18), 0.02) };
}

/**
 * Building tension for three seconds: noise opening upwards, a detuned saw
 * chord gliding up an octave, a flutter that speeds up — then a clean cut
 * into its own reverb, so the next thing lands on the silence.
 */
function riser(): Rendered {
  const r = rng(45);
  const rise = 3.0;
  const band = new Biquad(FX_SR, 'bandpass', 400, 0.9);
  const tone = new Biquad(FX_SR, 'lowpass', 500, 0.8);
  const glide = 2 ** 1.2;
  // Band-limited for the top of the glide, so nothing folds back as it climbs.
  const voices = [0, 7, 12].flatMap((iv) => [-0.004, 0.004].map((d) => {
    const base = hz(45 + iv) * (1 + d);
    return new Osc(FX_SR, base, 'saw', r(), Math.floor((FX_SR * 0.45) / (base * glide)));
  }));
  let flutter = 0;
  const dry = shot(3.5, (t, i) => {
    const p = clamp(t / rise, 0, 1);
    if (i % 16 === 0) {
      band.set('bandpass', 350 * (6500 / 350) ** p, 1.1);
      tone.set('lowpass', 400 * (6000 / 400) ** (p ** 1.3), 0.8);
    }
    let saw = 0;
    for (const voice of voices) saw += voice.next(2 ** (p * 1.2));
    flutter += (5 + 17 * p * p) / FX_SR;
    const wobble = 0.75 + 0.25 * Math.sin(TAU * flutter);
    const cut = t < rise ? 1 : Math.max(0, 1 - (t - rise) / 0.012);
    const swell = p ** 2.2;
    return (band.run(r() * 2 - 1) * 0.6 + tone.run(saw / voices.length) * 0.75 * wobble) * swell * cut;
  });
  const wet = reverb(dry, FX_SR, { seconds: 1.6, size: 1.3, damping: 0.4, highCutHz: 7000, lowCutHz: 200 });
  const scale = rmsOf(dry) / Math.max(1e-9, rmsOf(wet));
  const data = dry.map((v, i) => v + (wet[i] ?? 0) * scale * 0.35);
  return { kind: 'oneShot', sr: FX_SR, data: settle(masterShot(data, FX_SR, 1.5), 0.15) };
}

/** A cinematic boom: a sub that drops, a cracking transient and a dark hall behind. */
function impact(): Rendered {
  const r = rng(46);
  const crack = new Biquad(FX_SR, 'lowpass', 3200, 0.7);
  const thudBand = new Biquad(FX_SR, 'bandpass', 160, 0.8);
  let phase = 0;
  const dry = shot(2.5, (t) => {
    phase += (48 + 72 * Math.exp(-t / 0.11)) / FX_SR;
    const sub = Math.sin(TAU * phase) * Math.exp(-t / 0.6) * Math.min(1, t / 0.002);
    const noise = r() * 2 - 1;
    const hit = crack.run(noise) * Math.exp(-t / 0.03) * 1.1;
    const thud = thudBand.run(noise) * Math.exp(-t / 0.16) * 4.2;
    // Harmonics of the drop, so it is heard on a phone's speaker as well as felt on a big one.
    const growl = (Math.sin(TAU * phase * 2) * 0.6 + Math.sin(TAU * phase * 3) * 0.25) * Math.exp(-t / 0.35);
    return softClip(sub + growl + hit + thud, 2.2);
  });
  const wet = reverb(dry, FX_SR, { seconds: 2.2, size: 1.5, damping: 0.6, highCutHz: 2500, lowCutHz: 60 });
  const scale = rmsOf(dry) / Math.max(1e-9, rmsOf(wet));
  const data = dry.map((v, i) => v + (wet[i] ?? 0) * scale * 0.4);
  return { kind: 'oneShot', sr: FX_SR, data: settle(masterShot(data, FX_SR, 4), 0.3) };
}

/** A bright, rising C-major arpeggio on a struck bell. */
function chime(): Rendered {
  const track = new Track(FX_SR, 1.6, false);
  const notes = [84, 88, 91];
  notes.forEach((n, k) => {
    track.add(k * 0.085, bell(FX_SR, hz(n), { decay: 0.55, level: 0.5 }), 1 - k * 0.12);
    track.add(k * 0.085, bell(FX_SR, hz(n + 12), { decay: 0.25, level: 0.12 }));
  });
  const data = withRoom(track.data, { seconds: 1.1, size: 0.9, mix: 0.3, highCutHz: 9000 });
  return { kind: 'oneShot', sr: FX_SR, data: settle(masterShot(data, FX_SR, 1), 0.12) };
}

/**
 * A room applauding: thirty people, each clapping at a pace of their own with
 * hands of their own, swelling in and tailing off one by one, in a hall.
 */
function applause(): Rendered {
  const r = rng(47);
  const track = new Track(FX_SR, 3.6, false);
  for (let person = 0; person < 30; person++) {
    const pace = 3.3 + r() * 1.6;
    const centre = 850 + r() * 1700;
    const q = 0.9 + r() * 0.7;
    const decay = 0.007 + r() * 0.006;
    const loudness = 0.45 + r() * 0.55;
    let t = r() * 0.35;
    const stop = 2.2 + r() * 0.8;
    while (t < stop) {
      const band = new Biquad(FX_SR, 'bandpass', centre * (0.92 + r() * 0.16), q);
      const low = new Biquad(FX_SR, 'highpass', 350, 0.7);
      const swell = Math.min(1, t / 0.35) * (t > stop - 0.6 ? Math.max(0.2, (stop - t) / 0.6) : 1);
      const amp = loudness * swell * (0.8 + r() * 0.4);
      track.add(t, render(FX_SR, 0.06, (u) => low.run(band.run(r() * 2 - 1)) * Math.exp(-u / decay) * Math.min(1, u / 0.0005)), amp);
      t += (1 / pace) * (0.85 + r() * 0.3);
    }
  }
  const data = withRoom(track.data, { seconds: 1.2, size: 1.2, mix: 0.45, highCutHz: 7000 });
  return { kind: 'oneShot', sr: FX_SR, data: settle(masterShot(data, FX_SR, 2), 0.3) };
}

/** Every sound in the library, by id. The generator fails on any id without one. */
export const RECIPES: Readonly<Record<string, () => Rendered>> = {
  'upbeat-pulse': upbeatPulse,
  'lofi-haze': lofiHaze,
  'corporate-bright': corporateBright,
  'cinematic-dawn': cinematicDawn,
  whoosh,
  swoosh,
  pop,
  click,
  riser,
  impact,
  chime,
  applause,
};
