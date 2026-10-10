import type { AnimPreset, ElementPhase, TextStyle } from '@/document/types';
import { DEFAULT_OVERLAY_TEXT_STYLE } from '@/document/defaults';

/**
 * Ready-made text (D-145): "the Add texts will show lots of templates with
 * preformatted effects and styles that I can add." Each is a style — a font
 * from the app, the device or your own, a weight, a size, a treatment — and,
 * where it suits, an effect: a neon glow, a shine, a sparkle, a spin in.
 * Everything about it stays editable once it is on the canvas.
 */
export type TextPreset = {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly style: TextStyle;
  readonly effects?: readonly { readonly effectId: string; readonly phase: ElementPhase; readonly durationMs: number; readonly intensity: number }[];
  readonly enter?: AnimPreset;
};

const style = (patch: Partial<TextStyle>): TextStyle => ({ ...DEFAULT_OVERLAY_TEXT_STYLE, shadow: false, ...patch });
const during = (effectId: string, intensity = 0.7) => ({ effectId, phase: 'during' as const, durationMs: 0, intensity });
const enter = (effectId: string, durationMs = 700) => ({ effectId, phase: 'enter' as const, durationMs, intensity: 0.8 });

export const TEXT_PRESETS: readonly TextPreset[] = [
  { id: 'plain', name: 'Plain text', text: 'Your text', style: style({ fontId: 'headline', weight: 700 }) },
  { id: 'headline', name: 'Big headline', text: 'Big headline', style: style({ fontId: 'headline', weight: 800, sizePct: 150, letterSpacingPct: -2 }) },
  { id: 'subheading', name: 'Subheading', text: 'A line that explains it', style: style({ fontId: 'body', weight: 600, sizePct: 90 }) },
  { id: 'caption', name: 'Small caption', text: 'Small caption', style: style({ fontId: 'body', weight: 500, sizePct: 65, letterSpacingPct: 4 }) },
  { id: 'serif', name: 'Elegant serif', text: 'Timeless & elegant', style: style({ fontId: 'sys:georgia', weight: 400, sizePct: 125 }) },
  { id: 'print', name: 'Classic print', text: 'Breaking news', style: style({ fontId: 'sys:times', weight: 700, sizePct: 120 }) },
  { id: 'outline', name: 'Sticker', text: 'STICKER', style: style({ fontId: 'headline', weight: 800, sizePct: 150, outline: true }) },
  { id: 'pill', name: 'Label pill', text: 'NEW ARRIVAL', style: style({ fontId: 'body', weight: 700, sizePct: 70, pill: true, letterSpacingPct: 10 }) },
  { id: 'shadow', name: 'Drop shadow', text: 'Stand out', style: style({ fontId: 'headline', weight: 800, sizePct: 140, shadow: true }) },
  { id: 'neon', name: 'Neon glow', text: 'Open late', style: style({ fontId: 'sys:rounded', weight: 700, sizePct: 130, color: '#ff4fd8' }), effects: [during('glow-el', 0.9)] },
  { id: 'shine', name: 'Shiny', text: 'Premium', style: style({ fontId: 'headline', weight: 800, sizePct: 140 }), effects: [during('shine')] },
  { id: 'sparkle', name: 'Sparkle', text: 'Congratulations', style: style({ fontId: 'sys:cursive', weight: 400, sizePct: 130 }), effects: [during('sparkle-burst')] },
  { id: 'loud', name: 'Loud', text: 'SALE', style: style({ fontId: 'sys:impact', weight: 400, sizePct: 170, letterSpacingPct: 2 }), effects: [during('pulse', 0.5)] },
  { id: 'typewriter', name: 'Typewriter', text: 'Typed out…', style: style({ fontId: 'sys:courier', weight: 600, sizePct: 95 }), enter: 'wipeIn' },
  { id: 'spaced', name: 'Wide & calm', text: 'WIDE AND CALM', style: style({ fontId: 'body', weight: 600, sizePct: 75, letterSpacingPct: 30 }) },
  { id: 'friendly', name: 'Friendly', text: 'Hello there!', style: style({ fontId: 'sys:rounded', weight: 700, sizePct: 130 }), effects: [enter('pop-in')] },
  { id: 'script', name: 'Handwritten', text: 'with love', style: style({ fontId: 'sys:cursive', weight: 400, sizePct: 140 }), enter: 'fade' },
  { id: 'spin', name: 'Spin in', text: 'Ta-da!', style: style({ fontId: 'headline', weight: 800, sizePct: 140 }), effects: [enter('spin-in', 900)] },
  { id: 'glitch', name: 'Glitch in', text: 'SYSTEM ONLINE', style: style({ fontId: 'sys:courier', weight: 700, sizePct: 100 }), effects: [enter('glitch-in', 800)] },
];
