import { colorFill, roleFill, type Paint, type Reveal, type TextProps } from '@/core/types';
import type { SceneInputs, TextStyle } from '@/document/types';
import type { TextSlotDef } from '../schema';

/**
 * Resolves a text slot into TextProps.
 *
 * Three layers, in order: the template's own defaults, the slot's declared
 * defaultStyle, then the user's overrides from §8.2. Templates should never
 * read `inputs.styleOverrides` directly — doing it here is what keeps the
 * inspector's controls behaving identically across every template.
 */

export type TextSlotOptions = {
  /** Font size at 100%, in design units; the user's sizePct scales it. */
  readonly baseSizePx: number;
  /** Wrap width at 100%, in design units; the user's wrapWidthPct scales it. */
  readonly maxWidthPx: number;
  readonly reveal: Reveal;
  readonly fallbackFill?: Paint;
  readonly lineHeight?: number;
  readonly pillPadding?: { readonly x: number; readonly y: number; readonly radius: number };
};

const DEFAULTS: TextStyle = {
  fontId: 'body',
  weight: 500,
  align: 'center',
  sizePct: 100,
  color: '',
  wrap: true,
  shadow: false,
  outline: false,
  pill: false,
  wrapWidthPct: 100,
  letterSpacingPct: 0,
};

export function resolveStyle(slot: TextSlotDef, inputs: SceneInputs): TextStyle {
  return { ...DEFAULTS, ...slot.defaultStyle, ...inputs.styleOverrides.texts[slot.id] };
}

export function textFor(
  slot: TextSlotDef,
  inputs: SceneInputs,
  options: TextSlotOptions,
): TextProps {
  const style = resolveStyle(slot, inputs);
  const raw = inputs.texts[slot.id] ?? slot.placeholder;
  const text = raw.slice(0, slot.maxChars);

  const fontSizePx = options.baseSizePx * (style.sizePct / 100);
  // An explicit colour beats the palette role; an empty string means "use the
  // role", which is what keeps a palette switch repainting rather than
  // rebuilding (D-006).
  // On a pill the words sit on the accent, so with no colour of their own they take what reads there (D-126).
  const fill: Paint =
    style.color.length > 0 ? colorFill(style.color) : style.pill ? roleFill('onAccent') : (options.fallbackFill ?? roleFill('ink'));

  const shadow = style.shadow
    ? { blur: fontSizePx * 0.28, offsetX: 0, offsetY: fontSizePx * 0.06, paint: colorFill('rgba(0,0,0,0.55)') }
    : undefined;

  const outline = style.outline
    ? { paint: roleFill('bg'), width: Math.max(1, fontSizePx * 0.055) }
    : undefined;

  const padding = options.pillPadding ?? {
    x: fontSizePx * 0.55,
    y: fontSizePx * 0.3,
    radius: fontSizePx * 0.6,
  };
  const pill = style.pill
    ? { paint: roleFill('accent'), paddingX: padding.x, paddingY: padding.y, radius: padding.radius }
    : undefined;

  return {
    text,
    // Same reasoning as photoProps: this is the funnel every template's text
    // passes through, and it is handed the slot's identity already.
    slot: { kind: 'text', key: slot.id },
    fontId: style.fontId,
    fontSizePx,
    weight: style.weight,
    letterSpacingPct: style.letterSpacingPct,
    lineHeight: options.lineHeight ?? 1.2,
    align: style.align,
    fill,
    // Wrap off means one line, however long — §8.2 makes this a user toggle.
    maxWidthPx: style.wrap ? options.maxWidthPx * (style.wrapWidthPct / 100) : null,
    reveal: options.reveal,
    ...(shadow ? { shadow } : {}),
    ...(outline ? { outline } : {}),
    ...(pill ? { pill } : {}),
  };
}

/** The measurement spec matching a resolved TextProps, for build-time layout. */
export function specFor(props: TextProps, fontString: string): {
  text: string;
  font: string;
  fontSizePx: number;
  letterSpacingPx: number;
  lineHeight: number;
  align: TextProps['align'];
  maxWidthPx: number | null;
} {
  return {
    text: props.text,
    font: fontString,
    fontSizePx: props.fontSizePx,
    letterSpacingPx: (props.letterSpacingPct / 100) * props.fontSizePx,
    lineHeight: props.lineHeight,
    align: props.align,
    maxWidthPx: props.maxWidthPx,
  };
}
