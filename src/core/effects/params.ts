import type { ParamOption, ParamSpec } from './types';

/**
 * The settings most effects share, so "Amount" means the same thing on snow as
 * on confetti and the panel reads the same from one effect to the next.
 */

export const amount = (fallback = 60): ParamSpec => ({
  kind: 'number', key: 'amount', label: 'Amount', min: 5, max: 100, default: fallback, suffix: '%',
});

export const size = (fallback = 100): ParamSpec => ({
  kind: 'number', key: 'size', label: 'Size', min: 30, max: 250, default: fallback, suffix: '%',
});

export const speed = (fallback = 100): ParamSpec => ({
  kind: 'number', key: 'speed', label: 'Speed', min: 20, max: 300, default: fallback, suffix: '%',
});

export const strength = (fallback = 60): ParamSpec => ({
  kind: 'number', key: 'strength', label: 'Strength', min: 5, max: 100, default: fallback, suffix: '%',
});

export const color = (fallback: string, label = 'Colour'): ParamSpec => ({
  kind: 'color', key: 'color', label, default: fallback,
});

export const choice = (key: string, label: string, options: readonly ParamOption[], fallback?: string): ParamSpec => ({
  kind: 'choice', key, label, options, default: fallback ?? options[0]?.value ?? '',
});

export const DIRECTIONS: readonly ParamOption[] = [
  { value: 'left', label: 'From left' },
  { value: 'right', label: 'From right' },
  { value: 'up', label: 'From top' },
  { value: 'down', label: 'From bottom' },
];

/** Unit vector pointing *from* the named side towards the centre. */
export function fromSide(side: string): { x: number; y: number } {
  switch (side) {
    case 'right': return { x: 1, y: 0 };
    case 'up': return { x: 0, y: -1 };
    case 'down': return { x: 0, y: 1 };
    default: return { x: -1, y: 0 };
  }
}
