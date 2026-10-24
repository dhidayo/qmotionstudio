import {
  Biquad, Osc, TAU, adsr, fadeTail, render, rng, softClip,
} from './dsp';

/**
 * The instruments the generated library plays (D-156).
 *
 * Each returns one note as a buffer, for a recipe to place on a track. They
 * are modelled on the real thing where that is cheap — a plucked string is a
 * Karplus–Strong string, a piano note is a stack of slightly stretched
 * partials that die from the top down, a bell has a bar's inharmonic modes —
 * because that is what makes a synthesised part sound played rather than
 * beeped. Noise is always seeded, so a note sounds the same every run.
 */

// ── Drums ────────────────────────────────────────────────────────────────────

/** A kick: a sine that drops from a punch to a low tone, with a short click on top. */
export function kick(sr: number, options: { seed: number; punchHz?: number; toneHz?: number; decay?: number; click?: number; drive?: number }): Float64Array {
  const r = rng(options.seed);
  const punch = options.punchHz ?? 150;
  const tone = options.toneHz ?? 50;
  const decay = options.decay ?? 0.3;
  const clickFilter = new Biquad(sr, 'highpass', 2200, 0.7);
  const clickGain = options.click ?? 0.3;
  const drive = options.drive ?? 1.6;
  let phase = 0;
  return render(sr, decay * 2.4, (t) => {
    const f = tone + (punch - tone) * Math.exp(-t / 0.035);
    phase += f / sr;
    const body = Math.sin(TAU * phase) * Math.exp(-t / decay) * Math.min(1, t / 0.0015);
    const click = clickFilter.run(r() * 2 - 1) * Math.exp(-t / 0.002) * clickGain;
    return softClip(body + click, drive) * 0.9;
  });
}

/** A snare: a tuned body under a band of noise. */
export function snare(sr: number, options: { seed: number; toneHz?: number; decay?: number; brightHz?: number; body?: number }): Float64Array {
  const r = rng(options.seed);
  const tone = options.toneHz ?? 185;
  const decay = options.decay ?? 0.15;
  const high = new Biquad(sr, 'highpass', 900, 0.7);
  const band = new Biquad(sr, 'peak', options.brightHz ?? 4200, 0.8, 4);
  const top = new Biquad(sr, 'lowpass', Math.min(9000, sr * 0.42), 0.7);
  const bodyGain = options.body ?? 0.55;
  return render(sr, decay * 3, (t) => {
    const body = (Math.sin(TAU * tone * t) * 0.7 + Math.sin(TAU * tone * 1.68 * t) * 0.3) * Math.exp(-t / 0.055) * bodyGain;
    const noise = top.run(band.run(high.run(r() * 2 - 1))) * Math.exp(-t / decay) * 0.55;
    return (body + noise) * Math.min(1, t / 0.0008);
  });
}

/** A hand clap: three quick slaps a few milliseconds apart, then the room. */
export function clap(sr: number, options: { seed: number; decay?: number; centreHz?: number }): Float64Array {
  const r = rng(options.seed);
  const band = new Biquad(sr, 'bandpass', options.centreHz ?? 1250, 0.9);
  const low = new Biquad(sr, 'highpass', 450, 0.7);
  const decay = options.decay ?? 0.1;
  const slaps = [0, 0.0095, 0.0195];
  return render(sr, 0.03 + decay * 4, (t) => {
    let env = 0;
    for (const at of slaps) if (t >= at) env = Math.max(env, Math.exp(-(t - at) / 0.0035));
    if (t >= 0.028) env = Math.max(env, 0.75 * Math.exp(-(t - 0.028) / decay));
    return low.run(band.run(r() * 2 - 1)) * env * 2.4;
  });
}

/** A hi-hat: high noise with a short (closed) or longer (open) decay. */
export function hat(sr: number, options: { seed: number; decay?: number; lowHz?: number }): Float64Array {
  const r = rng(options.seed);
  const low = new Biquad(sr, 'highpass', Math.min(options.lowHz ?? 7000, sr * 0.3), 0.7);
  const sheen = new Biquad(sr, 'peak', Math.min(9500, sr * 0.4), 1.2, 3);
  const decay = options.decay ?? 0.035;
  return render(sr, decay * 5, (t) => sheen.run(low.run(r() * 2 - 1)) * Math.exp(-t / decay) * Math.min(1, t / 0.0006));
}

/** A shaker: a soft swell of mid-high noise rather than a strike. */
export function shaker(sr: number, options: { seed: number; decay?: number }): Float64Array {
  const r = rng(options.seed);
  const band = new Biquad(sr, 'bandpass', Math.min(6500, sr * 0.3), 0.8);
  const decay = options.decay ?? 0.045;
  return render(sr, 0.012 + decay * 4, (t) => {
    const env = t < 0.012 ? Math.sin((Math.PI / 2) * (t / 0.012)) : Math.exp(-(t - 0.012) / decay);
    return band.run(r() * 2 - 1) * env * 1.6;
  });
}

/** A soft crash: a long wash of high noise, mostly felt as air. */
export function crash(sr: number, options: { seed: number; decay?: number }): Float64Array {
  const r = rng(options.seed);
  const low = new Biquad(sr, 'highpass', 3500, 0.7);
  const top = new Biquad(sr, 'lowpass', Math.min(10_000, sr * 0.42), 0.7);
  const decay = options.decay ?? 1.1;
  return render(sr, decay * 4, (t) => top.run(low.run(r() * 2 - 1)) * Math.exp(-t / decay) * Math.min(1, t / 0.003) * 0.6);
}

/** A deep, slow orchestral pulse: a drum felt more than heard. */
export function boom(sr: number, options: { seed: number; fromHz?: number; toHz?: number; decay?: number }): Float64Array {
  const r = rng(options.seed);
  const from = options.fromHz ?? 75;
  const to = options.toHz ?? 44;
  const decay = options.decay ?? 0.9;
  const skin = new Biquad(sr, 'lowpass', 600, 0.7);
  let phase = 0;
  return render(sr, decay * 4, (t) => {
    phase += (to + (from - to) * Math.exp(-t / 0.12)) / sr;
    const body = Math.sin(TAU * phase) * Math.exp(-t / decay) * Math.min(1, t / 0.008);
    const hit = skin.run(r() * 2 - 1) * Math.exp(-t / 0.03) * 0.25;
    return softClip(body + hit, 1.2);
  });
}

// ── Pitched ──────────────────────────────────────────────────────────────────

/** A bass: a sine for weight and a filtered saw an octave up for definition on small speakers. */
export function bass(sr: number, freq: number, gate: number, options: { cutoffHz?: number; envelope?: number; saw?: number; sub?: number; release?: number; decay?: number; sustain?: number } = {}): Float64Array {
  const sub = new Osc(sr, freq, 'sine');
  const saw = new Osc(sr, freq, 'saw');
  const filter = new Biquad(sr, 'lowpass', options.cutoffHz ?? 500, 0.85);
  const cutoff = options.cutoffHz ?? 500;
  const envelope = options.envelope ?? 2;
  const sawGain = options.saw ?? 0.45;
  const subGain = options.sub ?? 0.85;
  const release = options.release ?? 0.05;
  return render(sr, gate + release * 6, (t, i) => {
    if (i % 8 === 0) filter.set('lowpass', cutoff * (1 + envelope * Math.exp(-t / 0.09)), 0.85);
    const tone = sub.next() * subGain + filter.run(saw.next()) * sawGain;
    return softClip(tone, 1.3) * adsr(t, gate, 0.004, options.decay ?? 0.35, options.sustain ?? 0.75, release);
  });
}

/** A synth pluck: two detuned saws through a filter that snaps shut. */
export function synthPluck(sr: number, freq: number, gate: number, options: { cutoffHz?: number; envelope?: number; decay?: number; detune?: number; release?: number; sustain?: number } = {}): Float64Array {
  const detune = options.detune ?? 0.006;
  const a = new Osc(sr, freq * (1 - detune), 'saw', 0.13);
  const b = new Osc(sr, freq * (1 + detune), 'saw', 0.61);
  const c = new Osc(sr, freq / 2, 'square', 0.37, 12);
  const filter = new Biquad(sr, 'lowpass', 1000, 0.9);
  const cutoff = options.cutoffHz ?? 1400;
  const envelope = options.envelope ?? 3;
  const decay = options.decay ?? 0.22;
  const release = options.release ?? 0.08;
  return render(sr, gate + release * 6, (t, i) => {
    if (i % 8 === 0) filter.set('lowpass', cutoff * (1 + envelope * Math.exp(-t / (decay * 0.6))), 0.9);
    const tone = filter.run(a.next() + b.next() + c.next() * 0.35) * 0.4;
    return tone * adsr(t, gate, 0.003, decay, options.sustain ?? 0.15, release);
  });
}

/** A pad: a chorus of detuned saws, filtered warm, swelling in and out. */
export function pad(sr: number, freq: number, gate: number, options: { seed: number; voices?: number; cents?: number; cutoffHz?: number; attack?: number; release?: number; vibrato?: number }): Float64Array {
  const r = rng(options.seed);
  const voices = options.voices ?? 5;
  const cents = options.cents ?? 11;
  const oscs: { osc: Osc; rate: number; phase: number }[] = [];
  for (let k = 0; k < voices; k++) {
    const spread = voices === 1 ? 0 : (k / (voices - 1)) * 2 - 1;
    oscs.push({ osc: new Osc(sr, freq * 2 ** ((spread * cents) / 1200), 'saw', r()), rate: 4.6 + r() * 1.2, phase: r() * TAU });
  }
  const low = new Biquad(sr, 'lowpass', options.cutoffHz ?? 1500, 0.6);
  const low2 = new Biquad(sr, 'lowpass', options.cutoffHz ?? 1500, 0.6);
  const high = new Biquad(sr, 'highpass', 140, 0.6);
  const attack = options.attack ?? 0.5;
  const release = options.release ?? 1.0;
  const vibrato = options.vibrato ?? 0;
  return render(sr, gate + release * 5, (t) => {
    let sum = 0;
    const depth = vibrato * Math.min(1, t / 1.2);
    for (const voice of oscs) sum += voice.osc.next(1 + depth * Math.sin(voice.rate * TAU * t + voice.phase));
    return high.run(low2.run(low.run(sum / Math.sqrt(voices)))) * adsr(t, gate, attack, 1, 1, release) * 0.5;
  });
}

/**
 * A plucked string (Karplus–Strong, extended): a burst of noise circulating in
 * a delay line one period long, losing its highs a little on every pass. The
 * pick position notches the burst, which is what makes it a guitar or a harp
 * rather than a generic pluck.
 */
export function pluckedString(sr: number, freq: number, options: { seed: number; decay?: number; brightness?: number; pick?: number; mute?: number }): Float64Array {
  const r = rng(options.seed);
  const period = sr / freq;
  const length = Math.max(2, Math.floor(period - 0.5));
  const fraction = period - 0.5 - length;
  const allpass = (1 - fraction) / (1 + fraction);
  const decay = options.decay ?? 2.5;
  const loss = 10 ** (-3 / (decay * freq));
  const brightness = options.brightness ?? 0.55;
  const line = new Float64Array(length);
  let smooth = 0;
  for (let i = 0; i < length; i++) {
    smooth += brightness * (r() * 2 - 1 - smooth);
    line[i] = smooth;
  }
  const pickAt = Math.max(1, Math.round(length * (options.pick ?? 0.14)));
  const excited = line.map((v, i) => v - (i >= pickAt ? (line[i - pickAt] ?? 0) : 0));
  line.set(excited);
  let mean = 0;
  for (const v of line) mean += v;
  mean /= length;
  for (let i = 0; i < length; i++) line[i] = (line[i] ?? 0) - mean;

  const seconds = Math.min(decay * 1.2, 6);
  const out = new Float64Array(Math.round(seconds * sr));
  let index = 0;
  let previous = 0;
  let apIn = 0;
  let apOut = 0;
  const mute = options.mute ?? 0;
  const body = new Biquad(sr, 'lowpass', 5200, 0.6);
  const attack = Math.max(1, Math.round(0.003 * sr));
  for (let n = 0; n < out.length; n++) {
    const x = line[index] ?? 0;
    const averaged = (0.5 + mute * 0.1) * x + (0.5 - mute * 0.1) * previous;
    previous = x;
    const tuned = allpass * averaged + apIn - allpass * apOut;
    apIn = averaged;
    apOut = tuned;
    line[index] = tuned * loss;
    index = (index + 1) % length;
    // A few milliseconds of softening, so the raw burst of the first pass is a pluck rather than a spike.
    out[n] = body.run(x) * Math.sin((Math.PI / 2) * Math.min(1, n / attack));
  }
  return fadeTail(out, sr, 0.05);
}

/** An electric piano: two-operator FM with a bright, quickly fading tine. */
export function electricPiano(sr: number, freq: number, gate: number, velocity: number): Float64Array {
  const index0 = 0.9 + 1.7 * velocity;
  const tineHz = freq * 4;
  const tine = tineHz < sr * 0.4 ? 0.1 + 0.12 * velocity : 0;
  // The metallic strike of the tine itself, a few milliseconds long.
  const strikeHz = freq * 7;
  const strike = strikeHz < sr * 0.4 ? 0.05 + 0.08 * velocity : 0;
  const decay = 2.4 * (330 / freq) ** 0.25;
  return render(sr, gate + 0.9, (t) => {
    const index = index0 * Math.exp(-t / 0.3) + 0.3;
    const tone = Math.sin(TAU * freq * t + index * Math.sin(TAU * freq * t));
    const bell = Math.sin(TAU * tineHz * t) * Math.exp(-t / 0.06) * tine
      + Math.sin(TAU * strikeHz * t) * Math.exp(-t / 0.018) * strike;
    const env = Math.min(1, t / 0.002) * Math.exp(-t / decay) * (t > gate ? Math.exp(-(t - gate) / 0.16) : 1);
    return (tone + bell) * env * (0.35 + 0.4 * velocity);
  });
}

/**
 * A soft piano: slightly stretched partials, each with two decay rates, the
 * higher ones dying first, a pair of strings per note beating gently, and a
 * felt hammer.
 */
export function piano(sr: number, freq: number, gate: number, velocity: number, options: { seed: number; felt?: number }): Float64Array {
  const r = rng(options.seed);
  const felt = options.felt ?? 1500;
  const stretch = 0.00035;
  const partials: { f: number; amp: number; tau: number }[] = [];
  for (let k = 1; k <= 14; k++) {
    const f = k * freq * Math.sqrt(1 + stretch * k * k);
    if (f > sr * 0.42) break;
    const tone = 1 / (1 + (f / (felt * (0.6 + 0.8 * velocity))) ** 2);
    partials.push({ f, amp: (1 / k ** 1.1) * tone, tau: (3.2 * (262 / freq) ** 0.4) / (1 + 0.7 * (k - 1)) });
  }
  const hammer = new Biquad(sr, 'lowpass', 1800, 0.7);
  const phases = partials.map(() => r() * TAU);
  const beat = 0.35 + r() * 0.3;
  return render(sr, gate + 0.6, (t) => {
    let sum = 0;
    for (let k = 0; k < partials.length; k++) {
      const p = partials[k];
      if (!p) continue;
      const env = 0.68 * Math.exp(-t / (p.tau * 0.25)) + 0.32 * Math.exp(-t / p.tau);
      const phase = phases[k] ?? 0;
      sum += p.amp * env * (Math.sin(TAU * p.f * t + phase) + Math.sin(TAU * (p.f + beat) * t + phase)) * 0.5;
    }
    const thump = hammer.run(r() * 2 - 1) * Math.exp(-t / 0.004) * 0.12 * velocity;
    const release = t > gate ? Math.exp(-(t - gate) / 0.18) : 1;
    return (sum * (0.3 + 0.5 * velocity) + thump) * Math.min(1, t / 0.0015) * release;
  });
}

/** A glockenspiel or celesta bar: the modes of a metal bar, the high ones brief. */
export function bell(sr: number, freq: number, options: { decay?: number; level?: number } = {}): Float64Array {
  const ratios = [1, 2.756, 5.404, 8.933];
  const amps = [1, 0.25, 0.09, 0.035];
  const decay = options.decay ?? 1.3;
  const taus = [decay, decay * 0.32, decay * 0.13, decay * 0.06];
  return render(sr, decay * 3, (t) => {
    let sum = 0;
    for (let k = 0; k < ratios.length; k++) {
      const f = freq * (ratios[k] ?? 1);
      if (f > sr * 0.45) continue;
      sum += Math.sin(TAU * f * t) * (amps[k] ?? 0) * Math.exp(-t / (taus[k] ?? 1));
    }
    return sum * Math.min(1, t / 0.0012) * (options.level ?? 0.5);
  });
}

/** A marimba: a wooden bar's tuned modes and the knock of the mallet. */
export function marimba(sr: number, freq: number, velocity: number, options: { seed: number }): Float64Array {
  const r = rng(options.seed);
  const mallet = new Biquad(sr, 'lowpass', 2400, 0.7);
  const scale = (440 / freq) ** 0.3;
  const modes = [
    { ratio: 1, amp: 1, tau: 0.5 * scale },
    { ratio: 3.932, amp: 0.28 * velocity, tau: 0.11 * scale },
    { ratio: 9.538, amp: 0.07 * velocity, tau: 0.035 * scale },
  ];
  return render(sr, 0.5 * scale * 4, (t) => {
    let sum = 0;
    for (const m of modes) {
      const f = freq * m.ratio;
      if (f > sr * 0.45) continue;
      sum += Math.sin(TAU * f * t) * m.amp * Math.exp(-t / m.tau);
    }
    const knock = mallet.run(r() * 2 - 1) * Math.exp(-t / 0.003) * 0.25;
    return (sum + knock) * Math.min(1, t / 0.001) * (0.4 + 0.5 * velocity);
  });
}
