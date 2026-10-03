import { choice, speed, strength } from '../params';
import { fbm, noise } from '../random';
import type { FrameEffectDef } from '../types';

/**
 * Camera: the whole picture moves (D-100).
 *
 * These never draw. Each returns an offset, the offsets of everything active
 * are added up, and the scene is drawn through the result — so a shake is the
 * template's own frames, shaken, not a blurry copy of them. The renderer adds
 * just enough zoom to keep the edges of the frame covered while it moves.
 */

const shake: FrameEffectDef = {
  id: 'shake',
  name: 'Shake',
  category: 'Camera',
  blurb: 'The whole frame trembles — energy, impact, excitement.',
  defaultMs: 900,
  defaultIntensity: 0.7,
  params: [strength(55),
    { kind: 'number', key: 'rate', label: 'Speed', min: 2, max: 30, step: 1, default: 13, suffix: 'Hz' }],
  camera(s) {
    const amp = s.env * s.intensity * (s.params.num('strength') / 100);
    const x = (s.t / 1000) * s.params.num('rate');
    return {
      x: fbm(s.seed, x) * s.unit * 0.035 * amp,
      y: fbm(s.seed + 7, x) * s.unit * 0.035 * amp,
      scale: 1,
      rotation: fbm(s.seed + 13, x * 0.8) * 2.2 * amp,
    };
  },
};

const impact: FrameEffectDef = {
  id: 'impact',
  name: 'Impact',
  category: 'Camera',
  blurb: 'A punch-in and a jolt that settles — land a beat or a big reveal.',
  defaultMs: 700,
  defaultIntensity: 0.8,
  params: [strength(65),
    { kind: 'number', key: 'every', label: 'Repeat every', min: 0, max: 3_000, step: 50, default: 0, suffix: 'ms' }],
  camera(s) {
    const every = s.params.num('every');
    const local = every > 0 ? s.t % every : s.t;
    const amp = s.intensity * (s.params.num('strength') / 100);
    const attack = Math.min(1, local / 40);
    const settle = Math.exp(-local / 220);
    const x = (s.t / 1000) * 22;
    return {
      x: noise(s.seed, x) * s.unit * 0.03 * amp * settle,
      y: noise(s.seed + 3, x) * s.unit * 0.03 * amp * settle,
      scale: 1 + 0.1 * amp * attack * Math.exp(-local / 160),
      rotation: noise(s.seed + 5, x) * 1.5 * amp * settle,
    };
  },
};

const handheld: FrameEffectDef = {
  id: 'handheld',
  name: 'Handheld',
  category: 'Camera',
  blurb: 'A slow, human drift, as if filmed by hand. Brings stills to life.',
  defaultMs: null,
  defaultIntensity: 0.6,
  params: [strength(50)],
  camera(s) {
    const amp = s.env * s.intensity * (s.params.num('strength') / 100);
    const secs = s.t / 1000;
    return {
      x: fbm(s.seed, secs * 0.35) * s.unit * 0.016 * amp,
      y: fbm(s.seed + 3, secs * 0.3) * s.unit * 0.013 * amp,
      scale: 1,
      rotation: fbm(s.seed + 5, secs * 0.25) * 0.8 * amp,
    };
  },
};

const beat: FrameEffectDef = {
  id: 'beat-bounce',
  name: 'Beat bounce',
  category: 'Camera',
  blurb: 'The frame pumps on every beat. Set the tempo to your music.',
  defaultMs: null,
  defaultIntensity: 0.7,
  params: [
    { kind: 'number', key: 'bpm', label: 'Tempo', min: 50, max: 200, step: 1, default: 120, suffix: 'bpm' },
    strength(50),
  ],
  camera(s) {
    const period = 60_000 / s.params.num('bpm');
    const phase = (s.t % period) / period;
    const pulse = Math.exp(-phase * 7);
    return { x: 0, y: 0, scale: 1 + 0.07 * s.env * s.intensity * (s.params.num('strength') / 100) * pulse, rotation: 0 };
  },
};

const push: FrameEffectDef = {
  id: 'slow-push',
  name: 'Slow push',
  category: 'Camera',
  blurb: 'A steady move in (or out) over the whole stretch — cinematic focus.',
  defaultMs: null,
  defaultIntensity: 0.7,
  params: [
    choice('direction', 'Direction', [{ value: 'in', label: 'Push in' }, { value: 'out', label: 'Pull out' }]),
    { kind: 'number', key: 'amount', label: 'Zoom', min: 2, max: 40, default: 14, suffix: '%' },
  ],
  camera(s) {
    const eased = (1 - Math.cos(Math.PI * s.p)) / 2;
    const k = s.params.str('direction') === 'out' ? 1 - eased : eased;
    return { x: 0, y: 0, scale: 1 + (s.params.num('amount') / 100) * s.intensity * k, rotation: 0 };
  },
};

const sway: FrameEffectDef = {
  id: 'sway',
  name: 'Sway',
  category: 'Camera',
  blurb: 'A gentle rocking tilt, like a boat or a dream.',
  defaultMs: null,
  defaultIntensity: 0.6,
  params: [
    { kind: 'number', key: 'angle', label: 'Tilt', min: 0.5, max: 8, step: 0.5, default: 2.5, suffix: '°' },
    speed(100),
  ],
  camera(s) {
    const period = 4_000 / (s.params.num('speed') / 100);
    const phase = (s.t / period) * Math.PI * 2;
    const amp = s.env * s.intensity;
    return {
      x: Math.sin(phase + 0.6) * s.unit * 0.012 * amp,
      y: 0,
      scale: 1,
      rotation: Math.sin(phase) * s.params.num('angle') * amp,
    };
  },
};

export const CAMERA: readonly FrameEffectDef[] = [shake, impact, handheld, beat, push, sway];
