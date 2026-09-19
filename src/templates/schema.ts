import type { Aspect, Layer, Palette, Size } from '@/core/types';
import type { BackgroundTreatment, SceneInputs, TextStyle, Transition } from '@/document/types';
import type { BuildContext } from './buildContext';

/**
 * The template schema (§7).
 *
 * D-013: §7 gives `Template` both a `build()` and, for Motion Ads, a `scenes`
 * array. A multi-scene ad template has no build() of its own, so the type is
 * two incompatible things. It is a discriminated union here: `SceneTemplate`
 * builds layers, `AdTemplate` sequences scene templates.
 */

export type Tier = 'free' | 'pro';
export type TemplateMode = 'showcase' | 'motionAd' | 'both';

export type TextSlotDef = {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly maxChars: number;
  readonly defaultStyle: Partial<TextStyle>;
  /** Templates that support §6.3's `swap` reveal offer a second phrase (§8.2). */
  readonly supportsAlt?: boolean;
};

export type NamedPalette = { readonly id: string; readonly label: string; readonly palette: Palette };

export type LookDef = {
  readonly palettes: readonly NamedPalette[];
  readonly backgrounds: readonly BackgroundTreatment[];
  readonly supportsCornerRadius: boolean;
  readonly supportsGrain: boolean;
  readonly supportsVignette: boolean;
};

export type PhotoSlots = { readonly min: number; readonly max: number; readonly default: number };

type TemplateBase = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly mode: TemplateMode;
  readonly tier: Tier;
  readonly isNew?: boolean;
  readonly supportedAspects: readonly Aspect[];
  readonly defaultDurationMs: number;
  readonly minDurationMs: number;
  readonly maxDurationMs: number;
};

export type SceneTemplate = TemplateBase & {
  readonly kind: 'scene';
  readonly designSize: Size;
  readonly photoSlots: PhotoSlots;
  readonly textSlots: readonly TextSlotDef[];
  readonly supportsLogo: boolean;
  readonly look: LookDef;
  /**
   * §3B: called once per (template, structural inputs, aspect) change and
   * memoised. Never per frame. Must be pure and deterministic — identical
   * inputs must produce identical layers, including ids (which is why
   * BuildContext hands them out from a counter).
   */
  build(inputs: SceneInputs, ctx: BuildContext): Layer[];
};

/**
 * One beat of a Motion Ad.
 *
 * §7 gives this three fields. Two more are needed for an ad to expand into
 * something worth looking at rather than into seven copies of the same
 * placeholder copy (D-046):
 *
 *   texts       seed copy per beat, keyed by the sub-template's own slot ids.
 *               Without it every scene shows the sub-template's placeholder and
 *               the ad reads as a bug.
 *   photoCount  how many photo slots this beat fills. A "hero shot" beat and a
 *               "grid of six" beat are the same template at different counts.
 */
export type SceneTemplateRef = {
  readonly templateId: string;
  readonly durationMs: number;
  /** Applied on entry to this scene; ignored on the first (D-004). */
  readonly transitionIn: Transition | null;
  readonly texts?: Readonly<Record<string, string>>;
  readonly photoCount?: number;
};

export type AdTemplate = TemplateBase & {
  readonly kind: 'ad';
  readonly mode: 'motionAd';
  readonly scenes: readonly SceneTemplateRef[];
  /** Seeds every scene's look, so an ad arrives colour-coordinated (§8.4). */
  readonly paletteId?: string;
  /** One line for the library card and the template's accessible description. */
  readonly blurb?: string;
};

export type Template = SceneTemplate | AdTemplate;

export function isSceneTemplate(template: Template): template is SceneTemplate {
  return template.kind === 'scene';
}

// ── Structural vs cosmetic inputs (resolves D-006) ──────────────────────────

/**
 * §3B memoises build() on its inputs, but `SceneInputs` carries the whole look.
 * Taken literally that means dragging a colour picker rebuilds every frame —
 * which §16 forbids, reached by obeying §3B.
 *
 * So inputs are split. **Structural** fields change the layers themselves and
 * invalidate the build. **Cosmetic** fields are resolved at draw time and never
 * do — colours through Paint roles (D-006), speed as a time remap.
 *
 * The rule of thumb: if it can change how many layers exist, where they are, or
 * how text wraps, it is structural. If it only changes what a pixel ends up
 * being, it is cosmetic.
 *
 *   structural │ photo count and order, per-photo frame/sizeMode/sizePct/crop,
 *              │ text content, font, weight, size, tracking, line height,
 *              │ wrap width, alignment, logo present, background treatment,
 *              │ aspect, design size, duration
 *   cosmetic   │ every palette colour, text colour, shadow/outline/pill
 *              │ colours, grain, vignette, global speed
 */
export function structureKey(
  templateId: string,
  inputs: SceneInputs,
  aspect: Aspect,
  design: Size,
  durationMs: number,
): string {
  const photos = inputs.photos.map((p) => [
    p.mediaId,
    p.frame,
    p.sizeMode,
    // sizePct is meaningless under the 'template' size mode (spec review 1.15),
    // so it must not be in the key there or it would invalidate for nothing.
    p.sizeMode === 'template' ? 0 : p.sizePct,
    p.cropMode,
    p.cropRect ? [p.cropRect.x, p.cropRect.y, p.cropRect.w, p.cropRect.h] : null,
  ]);

  const texts = Object.keys(inputs.texts)
    .sort()
    .map((id) => {
      const style = inputs.styleOverrides.texts[id];
      return [
        id,
        inputs.texts[id] ?? '',
        // Only the style fields that can change layout or measurement.
        style?.fontId ?? null,
        style?.weight ?? null,
        style?.sizePct ?? null,
        style?.letterSpacingPct ?? null,
        style?.wrapWidthPct ?? null,
        style?.align ?? null,
        style?.wrap ?? null,
        style?.pill ?? null,
      ];
    });

  return JSON.stringify([
    templateId,
    aspect,
    Math.round(design.w),
    Math.round(design.h),
    durationMs,
    photos,
    texts,
    inputs.logo.mediaId,
    inputs.logo.placement,
    inputs.logo.sizePct,
    inputs.logo.lockup,
    inputs.logo.lockupText,
    inputs.look.background,
    inputs.look.cornerRadius,
  ]);
}

// ── Validation, used by `npm run lint:templates` and at registration ─────────

export type TemplateIssue = { readonly templateId: string; readonly message: string };

export const DURATION_FLOOR_MS = 1_000;
export const DURATION_CEILING_MS = 60_000;

export function validateTemplate(template: Template): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const fail = (message: string): void => { issues.push({ templateId: template.id, message }); };

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(template.id)) {
    fail(`id "${template.id}" must be lower-case kebab-case`);
  }
  if (template.name.trim().length === 0) fail('name is empty');
  if (template.category.trim().length === 0) fail('category is empty');
  if (template.supportedAspects.length === 0) fail('supports no aspects');
  if (new Set(template.supportedAspects).size !== template.supportedAspects.length) {
    fail('supportedAspects contains duplicates');
  }

  if (template.minDurationMs < DURATION_FLOOR_MS) fail(`minDurationMs is below ${DURATION_FLOOR_MS}`);
  if (template.maxDurationMs > DURATION_CEILING_MS) fail(`maxDurationMs is above ${DURATION_CEILING_MS}`);
  if (template.minDurationMs > template.maxDurationMs) fail('minDurationMs exceeds maxDurationMs');
  if (
    template.defaultDurationMs < template.minDurationMs ||
    template.defaultDurationMs > template.maxDurationMs
  ) {
    fail('defaultDurationMs is outside its own min/max');
  }

  if (template.kind === 'ad') {
    if (template.scenes.length === 0) fail('ad template has no scenes');
    if (template.scenes[0]?.transitionIn !== null) {
      fail('the first scene must not declare a transitionIn (D-004)');
    }

    let total = 0;
    for (const [i, ref] of template.scenes.entries()) {
      if (ref.durationMs <= 0) fail(`scene ${i} ("${ref.templateId}") has a non-positive duration`);
      if (ref.photoCount !== undefined && ref.photoCount < 0) {
        fail(`scene ${i} ("${ref.templateId}") declares a negative photoCount`);
      }
      const overlap = i === 0 || ref.transitionIn === null || ref.transitionIn.kind === 'cut'
        ? 0
        : ref.transitionIn.durationMs;
      total += ref.durationMs - overlap;
    }

    // D-004: the ad's own duration is the sum of its scenes minus the overlaps,
    // so declaring a defaultDurationMs that disagrees would put the scrub bar
    // and the export at different lengths.
    if (Math.abs(total - template.defaultDurationMs) > 1) {
      fail(`scenes sum to ${total}ms but defaultDurationMs is ${template.defaultDurationMs}ms`);
    }
    return issues;
  }

  const { photoSlots: slots } = template;
  if (slots.min < 0) fail('photoSlots.min is negative');
  if (slots.max < slots.min) fail('photoSlots.max is below photoSlots.min');
  if (slots.default < slots.min || slots.default > slots.max) {
    fail('photoSlots.default is outside its own min/max');
  }
  if (slots.max > 12) fail('photoSlots.max above 12 — §14 budgets eight photos');

  const slotIds = new Set<string>();
  for (const slot of template.textSlots) {
    if (slotIds.has(slot.id)) fail(`duplicate text slot id "${slot.id}"`);
    slotIds.add(slot.id);
    if (slot.maxChars <= 0) fail(`text slot "${slot.id}" has a non-positive maxChars`);
    if (slot.placeholder.length > slot.maxChars) {
      fail(`text slot "${slot.id}" has a placeholder longer than its own maxChars`);
    }
  }

  if (template.look.palettes.length === 0) fail('look declares no palettes');
  if (template.designSize.w <= 0 || template.designSize.h <= 0) fail('designSize is not positive');

  return issues;
}
