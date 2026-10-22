import type { Project } from '@/document/types';
import * as actions from '@/document/actions';
import { userPhotoIds } from '@/document/select/media';
import { expandAdTemplate } from '@/templates/ad';
import { designLookPreset } from '@/templates/looks';
import { loadTemplate } from '@/templates/registry';
import type { Template } from '@/templates/schema';

/**
 * What picking a design does to a project, worked out but not yet applied.
 *
 * Shared by the store's `setTemplate` and the library's large preview (D-160),
 * so the preview — the design live in the project's own frame shape, with the
 * person's photos, words, look and logo — is exactly what "Use this design"
 * then gives. Two copies of this would drift, and the preview would promise
 * something the pick did not deliver.
 */
export type TemplateChange = { readonly template: Template; readonly action: actions.Action };

/**
 * Loads the design and builds the undoable action that applies it.
 *
 * `project` may be a function so the store reads the document after the
 * load, as it always has: an edit made while the design's code was arriving
 * is kept, not overwritten by a stale copy.
 */
export async function prepareTemplateChange(project: Project | (() => Project), templateId: string): Promise<TemplateChange> {
  const template = await loadTemplate(templateId);
  const current = typeof project === 'function' ? project() : project;
  if (template.kind === 'ad') {
    /*
     * Continuity (D-098): the ad is filled with the person's own photos
     * and logo when they have any, rather than starting over on the
     * samples. Undo still restores the scenes it replaces.
     */
    const logo = current.scenes.find((scene) => scene.inputs.logo.mediaId !== null)?.inputs.logo;
    const scenes = await expandAdTemplate(template, {
      photoIds: userPhotoIds(current),
      ...(logo ? { logo } : {}),
    });
    return { template, action: actions.applyAdTemplate(scenes, template.id) };
  }
  // What the card showed is what picking it gives (D-121): the design
  // arrives in its own look. Undo puts the old one back.
  const look = designLookPreset(templateId);
  return {
    template,
    action: actions.setTemplate(templateId, {
      durationMs: template.defaultDurationMs,
      photoSlots: template.photoSlots,
      ...(look ? { look } : {}),
    }),
  };
}
