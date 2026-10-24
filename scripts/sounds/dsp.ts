/**
 * A small, deterministic DSP kit for `npm run sounds` (D-156).
 *
 * Everything the generated library is made from: a seeded random source,
 * band-limited oscillators, RBJ filters, a feedback-delay-network reverb, a
 * look-ahead limiter, loudness measurement and a 16-bit WAV writer. Pure
 * TypeScript on plain arrays — no browser and no audio library — so the same
 * source renders the same bytes on every machine and every run.
 *
 * Loops are drawn on a *circle*: a note that runs past the end of the loop
 * carries on at its start, the way it would be heard on the second time round.
 * The dry mix is therefore exactly periodic by construction, and the effects
 * that keep state (reverb, delay, limiter) run over three turns of it, keeping
 * the last, so their tails are already present where the loop begins.
 */

export const TAU = Math.PI * 2;

/** Mulberry32: tiny, fast, and the same sequence for the same seed everywhere. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Equal temperament, A4 = 440Hz = MIDI 69. */
export function hz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

export function gainToDb(gain: number): number {
  return gain <= 1e-12 ? -240 : 20 * Math.log10(gain);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

// ── Tracks ────────────────────────────────────────────────────────────────────

/**
 * Somewhere to draw sound. A loop track wraps what is added past its end round
 * to its start; a one-shot track drops it.
 */
export class Track {
  readonly data: Float64Array;

  constructor(
    readonly sr: number,
    seconds: number,
    readonly loop: boolean,
  ) {
    this.data = new Float64Array(Math.round(seconds * sr));
  }

  get length(): number {
    return this.data.length;
  }

  /** Adds `note` starting `atSec` in, scaled by `gain`. */
  add(atSec: number, note: Float64Array, gain = 1): void {
    const start = Math.round(atSec * this.sr);
    const n = this.data.length;
    for (let i = 0; i < note.length; i++) {
      let at = start + i;
      if (this.loop) at = ((at % n) + n) % n;
      else if (at < 0 || at >= n) continue;
      this.data[at] = (this.data[at] ?? 0) + (note[i] ?? 0) * gain;
    }
  }

  /** Mixes another track of the same shape in. */
  mix(other: Float64Array, gain = 1): void {
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] = (this.data[i] ?? 0) + (other[i] ?? 0) * gain;
    }
  }
}

/**
 * Runs a stateful process over a loop so that its output is periodic too.
 *
 * Three turns of the input go through; the third turn comes out. Reverb tails,
 * delay repeats and limiter release from the end of the loop are then already
 * sounding at its start, which is what the seam will play.
 */
export function steadyState(loop: Float64Array, process: (input: Float64Array) => Float64Array): Float64Array {
  const n = loop.length;
  const turns = new Float64Array(n * 3);
  for (let k = 0; k < 3; k++) turns.set(loop, k * n);
  return process(turns).slice(2 * n, 3 * n);
}

export function scaled(data: Float64Array, gain: number): Float64Array {
  return data.map((v) => v * gain);
}

// ── Oscillators ───────────────────────────────────────────────────────────────

const TABLE_SIZE = 2048;
const tables = new Map<string, Float64Array>();

/**
 * One cycle of a band-limited wave with exactly `harmonics` harmonics,
 * normalised to ±1. Cached, because a chord asks for the same few dozen.
 */
function waveTable(shape: 'saw' | 'square' | 'triangle', harmonics: number): Float64Array {
  const key = `${shape}:${harmonics}`;
  const hit = tables.get(key);
  if (hit) return hit;
  const table = new Float64Array(TABLE_SIZE + 1);
  for (let h = 1; h <= harmonics; h++) {
    let amp = 0;
    if (shape === 'saw') amp = 1 / h;
    else if (h % 2 === 1) amp = shape === 'square' ? 1 / h : ((((h - 1) / 2) % 2 === 0 ? 1 : -1) / (h * h));
    if (amp === 0) continue;
    for (let i = 0; i < TABLE_SIZE; i++) {
      const value = (table[i] ?? 0) + amp * Math.sin((TAU * h * i) / TABLE_SIZE);
      table[i] = value;
    }
  }
  let peak = 0;
  for (let i = 0; i < TABLE_SIZE; i++) peak = Math.max(peak, Math.abs(table[i] ?? 0));
  for (let i = 0; i < TABLE_SIZE; i++) table[i] = (table[i] ?? 0) / (peak || 1);
  table[TABLE_SIZE] = table[0] ?? 0;
  tables.set(key, table);
  return table;
}

/**
 * A band-limited oscillator: no harmonic above 45% of the sample rate, so
 * nothing folds back as the inharmonic fizz that makes cheap synths harsh.
 * Phase is in cycles, so callers can start voices at fixed offsets.
 */
export class Osc {
  #phase: number;
  readonly #table: Float64Array;
  readonly #step: number;

  constructor(
    sr: number,
    readonly freq: number,
    shape: 'saw' | 'square' | 'triangle' | 'sine',
    phase = 0,
    /** Fewer harmonics than the limit, for a softer tone. */
    maxHarmonics = 64,
  ) {
    this.#phase = phase - Math.floor(phase);
    this.#step = freq / sr;
    const limit = Math.max(1, Math.min(maxHarmonics, Math.floor((sr * 0.45) / Math.max(1, freq))));
    this.#table = shape === 'sine' ? waveTable('saw', 1) : waveTable(shape, limit);
  }

  /** The next sample; `bend` multiplies the frequency for this sample only. */
  next(bend = 1): number {
    const position = this.#phase * TABLE_SIZE;
    const i = Math.floor(position);
    const frac = position - i;
    const a = this.#table[i] ?? 0;
    const b = this.#table[i + 1] ?? 0;
    this.#phase += this.#step * bend;
    this.#phase -= Math.floor(this.#phase);
    return a + (b - a) * frac;
  }
}

// ── Filters ───────────────────────────────────────────────────────────────────

export type BiquadType = 'lowpass' | 'highpass' | 'bandpass' | 'peak' | 'lowshelf' | 'highshelf';

/** The RBJ cookbook biquad, transposed direct form II. */
export class Biquad {
  #b0 = 1; #b1 = 0; #b2 = 0; #a1 = 0; #a2 = 0;
  #z1 = 0; #z2 = 0;

  constructor(readonly sr: number, type: BiquadType = 'lowpass', freq = 1000, q = 0.707, gainDb = 0) {
    this.set(type, freq, q, gainDb);
  }

  set(type: BiquadType, freq: number, q = 0.707, gainDb = 0): this {
    const w = (TAU * clamp(freq, 5, this.sr * 0.49)) / this.sr;
    const cos = Math.cos(w);
    const sin = Math.sin(w);
    const alpha = sin / (2 * Math.max(0.05, q));
    const A = 10 ** (gainDb / 40);
    let b0: number; let b1: number; let b2: number; let a0: number; let a1: number; let a2: number;
    switch (type) {
      case 'lowpass':
        b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
        break;
      case 'highpass':
        b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
        break;
      case 'bandpass':
        b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
        break;
      case 'peak':
        b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
        break;
      case 'lowshelf': {
        const r = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) - (A - 1) * cos + r); b1 = 2 * A * ((A - 1) - (A + 1) * cos); b2 = A * ((A + 1) - (A - 1) * cos - r);
        a0 = (A + 1) + (A - 1) * cos + r; a1 = -2 * ((A - 1) + (A + 1) * cos); a2 = (A + 1) + (A - 1) * cos - r;
        break;
      }
      case 'highshelf': {
        const r = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) + (A - 1) * cos + r); b1 = -2 * A * ((A - 1) + (A + 1) * cos); b2 = A * ((A + 1) + (A - 1) * cos - r);
        a0 = (A + 1) - (A - 1) * cos + r; a1 = 2 * ((A - 1) - (A + 1) * cos); a2 = (A + 1) - (A - 1) * cos - r;
        break;
      }
    }
    this.#b0 = b0 / a0; this.#b1 = b1 / a0; this.#b2 = b2 / a0; this.#a1 = a1 / a0; this.#a2 = a2 / a0;
    return this;
  }

  run(x: number): number {
    const y = this.#b0 * x + this.#z1;
    this.#z1 = this.#b1 * x - this.#a1 * y + this.#z2;
    this.#z2 = this.#b2 * x - this.#a2 * y;
    return y;
  }

  process(data: Float64Array): Float64Array {
    return data.map((x) => this.run(x));
  }
}

/** One filter over a whole buffer, as a pure function. */
export function filtered(data: Float64Array, sr: number, type: BiquadType, freq: number, q = 0.707, gainDb = 0): Float64Array {
  return new Biquad(sr, type, freq, q, gainDb).process(data);
}

// ── Envelopes ────────────────────────────────────────────────────────────────

/**
 * Attack–decay–sustain–release, with a curved attack and exponential decay
 * and release — the shapes an instrument makes, rather than straight lines.
 */
export function adsr(t: number, gate: number, a: number, d: number, s: number, r: number): number {
  let level: number;
  const held = Math.min(t, gate);
  if (held < a) level = Math.sin((Math.PI / 2) * (held / a));
  else level = s + (1 - s) * Math.exp(-(held - a) / Math.max(1e-4, d));
  if (t <= gate) return level;
  return level * Math.exp(-(t - gate) / Math.max(1e-4, r));
}

/** A short raised-cosine ramp to zero over the last `seconds` of a note, so nothing ends on a step. */
export function fadeTail(note: Float64Array, sr: number, seconds = 0.01): Float64Array {
  const n = Math.min(note.length, Math.round(seconds * sr));
  for (let i = 0; i < n; i++) {
    const at = note.length - 1 - i;
    note[at] = (note[at] ?? 0) * (0.5 - 0.5 * Math.cos((Math.PI * i) / n));
  }
  return note;
}

/** Renders `seconds` of a voice as a note buffer, ending in a short fade. */
export function render(sr: number, seconds: number, voice: (t: number, i: number) => number): Float64Array {
  const out = new Float64Array(Math.max(1, Math.round(seconds * sr)));
  for (let i = 0; i < out.length; i++) out[i] = voice(i / sr, i);
  return fadeTail(out, sr, Math.min(0.02, seconds / 4));
}

export function softClip(x: number, drive = 1): number {
  return Math.tanh(x * drive) / Math.tanh(drive);
}

// ── Effects ──────────────────────────────────────────────────────────────────

/**
 * A feedback delay network reverb: eight lines mixed through a Hadamard
 * matrix, each with a damping filter so the highs die first, as they do in a
 * real room. Returns the wet signal only; the caller sets the send level.
 */
export function reverb(
  input: Float64Array,
  sr: number,
  options: { seconds: number; size?: number; damping?: number; preDelayMs?: number; lowCutHz?: number; highCutHz?: number },
): Float64Array {
  const size = options.size ?? 1;
  const base = [29.7, 37.1, 41.1, 43.7, 53.3, 59.9, 67.1, 73.3];
  const lines = base.map((ms) => {
    const length = Math.max(2, Math.round((ms * size * sr) / 1000));
    return {
      buffer: new Float64Array(length),
      index: 0,
      gain: 10 ** ((-3 * length) / (options.seconds * sr)),
      damp: 0,
    };
  });
  const damping = clamp(options.damping ?? 0.35, 0, 0.95);
  const pre = Math.round(((options.preDelayMs ?? 12) * sr) / 1000);
  const preBuffer = new Float64Array(Math.max(1, pre));
  let preIndex = 0;
  // Input diffusion: two short allpasses smear each transient into a cloud.
  const diffusers = [5.3, 7.9, 11.3].map((ms) => ({ buffer: new Float64Array(Math.max(1, Math.round((ms * sr) / 1000))), index: 0 }));
  const lowCut = new Biquad(sr, 'highpass', options.lowCutHz ?? 120, 0.6);
  const highCut = new Biquad(sr, 'lowpass', options.highCutHz ?? 6000, 0.6);

  const out = new Float64Array(input.length);
  const reads = new Float64Array(8);
  const mixed = new Float64Array(8);
  const norm = 1 / Math.sqrt(8);

  for (let n = 0; n < input.length; n++) {
    let x = input[n] ?? 0;
    if (pre > 0) {
      const delayed = preBuffer[preIndex] ?? 0;
      preBuffer[preIndex] = x;
      preIndex = (preIndex + 1) % pre;
      x = delayed;
    }
    for (const d of diffusers) {
      const delayed = d.buffer[d.index] ?? 0;
      const v = x + delayed * 0.6;
      d.buffer[d.index] = v;
      d.index = (d.index + 1) % d.buffer.length;
      x = delayed - v * 0.6;
    }

    let wet = 0;
    for (let k = 0; k < 8; k++) {
      const line = lines[k];
      if (!line) continue;
      const read = line.buffer[line.index] ?? 0;
      line.damp = read * (1 - damping) + line.damp * damping;
      reads[k] = line.damp * line.gain;
      wet += k % 2 === 0 ? read : -read;
    }
    // Fast Walsh–Hadamard transform: every line feeds every other, energy kept.
    mixed.set(reads);
    for (let h = 1; h < 8; h *= 2) {
      for (let i = 0; i < 8; i += h * 2) {
        for (let j = i; j < i + h; j++) {
          const a = mixed[j] ?? 0;
          const b = mixed[j + h] ?? 0;
          mixed[j] = a + b;
          mixed[j + h] = a - b;
        }
      }
    }
    for (let k = 0; k < 8; k++) {
      const line = lines[k];
      if (!line) continue;
      line.buffer[line.index] = (mixed[k] ?? 0) * norm + x;
      line.index = (line.index + 1) % line.buffer.length;
    }
    out[n] = highCut.run(lowCut.run(wet * 0.35));
  }
  return out;
}

/** A feedback echo with a darkening filter in the loop. Wet only. */
export function echo(input: Float64Array, sr: number, options: { seconds: number; feedback: number; highCutHz?: number }): Float64Array {
  const length = Math.max(1, Math.round(options.seconds * sr));
  const buffer = new Float64Array(length);
  const tone = new Biquad(sr, 'lowpass', options.highCutHz ?? 3500, 0.6);
  const lowCut = new Biquad(sr, 'highpass', 200, 0.6);
  let index = 0;
  const out = new Float64Array(input.length);
  for (let n = 0; n < input.length; n++) {
    const delayed = buffer[index] ?? 0;
    buffer[index] = (input[n] ?? 0) + tone.run(lowCut.run(delayed)) * options.feedback;
    index = (index + 1) % length;
    out[n] = delayed;
  }
  return out;
}

/**
 * A gentle compressor for a bus: RMS detector, soft knee, smooth attack and
 * release. Glues drums and music together without pumping.
 */
export function compress(
  input: Float64Array,
  sr: number,
  options: { thresholdDb: number; ratio: number; attackMs?: number; releaseMs?: number; makeupDb?: number },
): Float64Array {
  const attack = Math.exp(-1 / (((options.attackMs ?? 10) / 1000) * sr));
  const release = Math.exp(-1 / (((options.releaseMs ?? 150) / 1000) * sr));
  const detector = Math.exp(-1 / (0.01 * sr));
  const makeup = dbToGain(options.makeupDb ?? 0);
  const knee = 6;
  let power = 0;
  let reduction = 0;
  const out = new Float64Array(input.length);
  for (let n = 0; n < input.length; n++) {
    const x = input[n] ?? 0;
    power = detector * power + (1 - detector) * x * x;
    const level = gainToDb(Math.sqrt(power));
    const over = level - options.thresholdDb;
    let wanted = 0;
    if (over > knee / 2) wanted = over * (1 - 1 / options.ratio);
    else if (over > -knee / 2) wanted = ((over + knee / 2) ** 2 / (2 * knee)) * (1 - 1 / options.ratio);
    const coeff = wanted > reduction ? attack : release;
    reduction = coeff * reduction + (1 - coeff) * wanted;
    out[n] = x * dbToGain(-reduction) * makeup;
  }
  return out;
}

/**
 * A look-ahead peak limiter.
 *
 * The gain each sample needs is found first; a centred running minimum over
 * twice the look-ahead, then a running mean over the look-ahead, brings the
 * gain down smoothly *before* each peak rather than clipping it. Recovery is
 * exponential. No sample leaves above `ceiling`.
 */
export function limit(input: Float64Array, sr: number, options: { ceilingDb: number; releaseMs?: number; lookaheadMs?: number }): Float64Array {
  const ceiling = dbToGain(options.ceilingDb);
  const look = Math.max(1, Math.round(((options.lookaheadMs ?? 3) / 1000) * sr));
  const n = input.length;
  const need = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.abs(input[i] ?? 0);
    need[i] = a > ceiling ? ceiling / a : 1;
  }
  const minimum = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let m = 1;
    const from = Math.max(0, i - look);
    const to = Math.min(n - 1, i + look);
    for (let j = from; j <= to; j++) m = Math.min(m, need[j] ?? 1);
    minimum[i] = m;
  }
  const recover = 1 - Math.exp(-1 / (((options.releaseMs ?? 80) / 1000) * sr));
  const held = new Float64Array(n);
  let g = 1;
  for (let i = 0; i < n; i++) {
    g = Math.min(minimum[i] ?? 1, g + (1 - g) * recover);
    held[i] = g;
  }
  const out = new Float64Array(n);
  const half = Math.floor(look / 2);
  let sum = 0;
  let count = 0;
  for (let j = 0; j <= Math.min(n - 1, half); j++) { sum += held[j] ?? 1; count++; }
  for (let i = 0; i < n; i++) {
    const enter = i + half + 1;
    const leave = i - half;
    const gain = sum / count;
    const x = (input[i] ?? 0) * gain;
    out[i] = clamp(x, -ceiling, ceiling);
    if (enter < n) { sum += held[enter] ?? 1; count++; }
    if (leave >= 0) { sum -= held[leave] ?? 1; count--; }
  }
  return out;
}

/** A modulated delay: the slow pitch drift of tape. Periodic when `cycles` per loop is whole. */
export function wow(input: Float64Array, sr: number, options: { depthMs: number; periodSeconds: number }): Float64Array {
  const n = input.length;
  const out = new Float64Array(n);
  const base = options.depthMs * 2;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const delay = ((base + options.depthMs * Math.sin((TAU * t) / options.periodSeconds)) / 1000) * sr;
    const at = i - delay;
    const j = Math.floor(at);
    const frac = at - j;
    const a = j >= 0 ? (input[j] ?? 0) : 0;
    const b = j + 1 >= 0 ? (input[j + 1] ?? 0) : 0;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

// ── Measurement ──────────────────────────────────────────────────────────────

export function peak(data: ArrayLike<number>): number {
  let p = 0;
  for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i] ?? 0));
  return p;
}

export function rms(data: ArrayLike<number>, from = 0, to = data.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) { const v = data[i] ?? 0; sum += v * v; }
  return Math.sqrt(sum / Math.max(1, to - from));
}

export function mean(data: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] ?? 0;
  return sum / Math.max(1, data.length);
}

/** ITU-R BS.1770's K-weighting: a head-shaped treble lift and a low cut. */
function kWeighted(data: ArrayLike<number>, sr: number): Float64Array {
  const shelf = new Biquad(sr, 'highshelf', 1681.97, 0.7072, 3.9998);
  const lowCut = new Biquad(sr, 'highpass', 38.13, 0.5003);
  const out = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = lowCut.run(shelf.run(data[i] ?? 0));
  return out;
}

/**
 * Loudness in LUFS, ungated, over the whole buffer. For a loop (`loop: true`)
 * it is measured on a second turn, with the filters already settled by the
 * first — its loudness as it plays round and round.
 */
export function loudness(data: Float64Array, sr: number, options: { loop?: boolean } = {}): number {
  let source = data;
  if (options.loop === true) {
    source = new Float64Array(data.length * 2);
    source.set(data, 0);
    source.set(data, data.length);
  }
  const weighted = kWeighted(source, sr);
  const power = rms(weighted, options.loop === true ? data.length : 0) ** 2;
  return -0.691 + 10 * Math.log10(Math.max(1e-12, power));
}

/** The loudest 400ms window, in LUFS: how loud a one-shot sounds at its height. */
export function momentaryMax(data: ArrayLike<number>, sr: number): number {
  const weighted = kWeighted(data, sr);
  const window = Math.round(0.4 * sr);
  const step = Math.round(0.05 * sr);
  let best = 0;
  if (weighted.length <= window) best = rms(weighted) ** 2 * (weighted.length / window);
  for (let from = 0; from + window <= weighted.length; from += step) best = Math.max(best, rms(weighted, from, from + window) ** 2);
  return -0.691 + 10 * Math.log10(Math.max(1e-12, best));
}

/** In-place radix-2 FFT of `re`/`im`, length a power of two. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] ?? 0; re[i] = re[j] ?? 0; re[j] = tr;
      const ti = im[i] ?? 0; im[i] = im[j] ?? 0; im[j] = ti;
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const angle = -TAU / size;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = start + k;
        const b = a + size / 2;
        const xr = (re[b] ?? 0) * cr - (im[b] ?? 0) * ci;
        const xi = (re[b] ?? 0) * ci + (im[b] ?? 0) * cr;
        re[b] = (re[a] ?? 0) - xr; im[b] = (im[a] ?? 0) - xi;
        re[a] = (re[a] ?? 0) + xr; im[a] = (im[a] ?? 0) + xi;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

export type Bands = { readonly sub: number; readonly low: number; readonly mid: number; readonly presence: number; readonly air: number };

/**
 * Where the energy sits, in dB relative to the whole: sub (<60Hz), low
 * (60–250), mid (250–2k), presence (2–6k) and air (above 6k). Welch-averaged
 * Hann frames of 4096.
 */
export function bands(data: ArrayLike<number>, sr: number): Bands {
  const size = 4096;
  const hann = new Float64Array(size).map((_, i) => 0.5 - 0.5 * Math.cos((TAU * i) / size));
  const power = new Float64Array(size / 2);
  const hop = size / 2;
  for (let from = 0; from + size <= data.length || from === 0; from += hop) {
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i++) re[i] = (data[from + i] ?? 0) * (hann[i] ?? 0);
    fft(re, im);
    for (let k = 0; k < size / 2; k++) power[k] = (power[k] ?? 0) + (re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2;
    if (from + size > data.length) break;
  }
  const sums = { sub: 0, low: 0, mid: 0, presence: 0, air: 0 };
  let total = 0;
  for (let k = 1; k < size / 2; k++) {
    const f = (k * sr) / size;
    const p = power[k] ?? 0;
    total += p;
    if (f < 60) sums.sub += p;
    else if (f < 250) sums.low += p;
    else if (f < 2000) sums.mid += p;
    else if (f < 6000) sums.presence += p;
    else sums.air += p;
  }
  const db = (p: number): number => Math.round(10 * Math.log10(Math.max(1e-12, p / Math.max(1e-12, total))) * 10) / 10;
  return { sub: db(sums.sub), low: db(sums.low), mid: db(sums.mid), presence: db(sums.presence), air: db(sums.air) };
}

// ── Files ────────────────────────────────────────────────────────────────────

/**
 * Float samples to 16-bit PCM with triangular dither.
 *
 * For a loop the dither repeats with the loop (`period`, `offset`), so the
 * file's pre-roll and post-roll are exact copies of the loop's end and start —
 * the seam is continuous in the file itself, not only before quantising.
 */
export function quantise(data: Float64Array, seed: number, loop?: { offset: number; period: number }): Int16Array {
  const noise = new Float64Array(loop ? loop.period : data.length);
  const r = rng(seed);
  for (let i = 0; i < noise.length; i++) noise[i] = (r() - r()) / 32768;
  const out = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const k = loop ? (((i - loop.offset) % loop.period) + loop.period) % loop.period : i;
    out[i] = clamp(Math.round(((data[i] ?? 0) + (noise[k] ?? 0)) * 32767), -32768, 32767);
  }
  return out;
}

/** A mono 16-bit PCM WAV: the format every browser's decoder reads. */
export function wavFile(samples: Int16Array, sr: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string): void => {
    for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i] ?? 0, true);
  return bytes;
}
