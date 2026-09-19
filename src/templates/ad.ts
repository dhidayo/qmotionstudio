import type { Scene } from '@/document/types';
import {
  DEFAULT_LOOK,
  emptySceneInputs,
  newId,
  STARTER_PHOTO_IDS,
} from '@/document/defaults';
import { paletteById } from './_shared/look';
import { loadSceneTemplate } from './registry';
import type { AdTemplate } from './schema';

/**
 * Expanding an ad template into scenes (D-013).
 *
 * §7 gives a Motion Ad template a `scenes: SceneTemplateRef[]` array rather
 * than a `build()`. It is not a second kind of drawable: it is a recipe that
 * produces ordinary `Scene` documents, which the renderer then treats exactly
 * like the one scene Showcase mode edits. The ad template is not consulted
 * again after this — the user is free to retime a beat, swap a template or
 * delete a scene, and nothing snaps back.
 *
 * This runs once, when the template is picked, and never in the render loop.
 */

export type ExpandOptions = {
  /** Photos to deal out across the beats. Defaults to the sample set. */
  readonly photoIds?: readonly string[];
};

export async function expandAdTemplate(
  template: AdTemplate,
  options: ExpandOptions = {},
): Promise<Scene[]> {
  const photoIds = options.photoIds?.length ? options.photoIds : STARTER_PHOTO_IDS;

  // Sub-templates are loaded here rather than during the render: the expansion
  // needs each one's photo slot defaults, and the renderer is about to need
  // their build() anyway, so paying for both fetches at once avoids a beat of
  // blank frames when the playhead first reaches scene four.
  const subTemplates = await Promise.all(
    template.scenes.map((ref) => loadSceneTemplate(ref.templateId)),
  );

  const palette = template.paletteId === undefined
    ? DEFAULT_LOOK.palette
    : paletteById(template.paletteId);

  // A cursor across the photo pool rather than a reset per scene: consecutive
  // beats showing the same photograph is the single thing that makes an
  // auto-filled ad look broken.
  let cursor = 0;

  return template.scenes.map((ref, index) => {
    const sub = subTemplates[index];
    if (!sub) throw new Error(`expandAdTemplate: "${ref.templateId}" did not resolve.`);

    const count = Math.max(
      sub.photoSlots.min,
      Math.min(ref.photoCount ?? sub.photoSlots.default, sub.photoSlots.max),
    );

    const photos = Array.from({ length: count }, () => {
      const mediaId = photoIds[cursor % photoIds.length] ?? photoIds[0] ?? '';
      cursor += 1;
      return {
        mediaId,
        frame: '3:4' as const,
        sizeMode: 'template' as const,
        sizePct: 100,
        cropMode: 'template' as const,
      };
    });

    const scene: Scene = {
      id: newId('scn'),
      templateId: ref.templateId,
      durationMs: ref.durationMs,
      // D-004 again: the first beat has nothing to transition from.
      transitionIn: index === 0 ? null : ref.transitionIn,
      inputs: {
        ...emptySceneInputs(),
        photos,
        texts: { ...ref.texts },
        look: { ...DEFAULT_LOOK, palette },
      },
    };
    return scene;
  });
}

/** Total run time of an ad template, with D-004's overlaps taken out. */
export function adDurationMs(template: AdTemplate): number {
  return template.scenes.reduce((total, ref, i) => {
    const overlap = i === 0 || ref.transitionIn === null || ref.transitionIn.kind === 'cut'
      ? 0
      : ref.transitionIn.durationMs;
    return total + ref.durationMs - overlap;
  }, 0);
}
