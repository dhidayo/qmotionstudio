import { describe, expect, it } from 'vitest';
import { FIRST_SCENE } from '@/document/actions';
import { DEFAULT_LOGO, dealPhotos, restyleLook } from '@/document/defaults';
import type { Project } from '@/document/types';
import { designLookPreset } from '@/templates/looks';
import { TEMPLATE_MANIFEST } from '@/templates/manifest';
import { prepareTemplateChange } from './templateChange';
import { starterProject } from './starter';

/**
 * Picking a design, worked out before it is applied (D-160): the library's
 * live preview plays exactly what this gives, and the store dispatches it.
 */

const starter = (): Project => starterProject('social');

describe('prepareTemplateChange (D-160)', () => {
  it('a scene design: its id, its length, photos inside its slots and its own look', async () => {
    const project = starter();
    const before = project.scenes[0];
    const target = TEMPLATE_MANIFEST.find((t) =>
      t.kind === 'scene' && t.listed !== false && t.id !== before?.templateId && designLookPreset(t.id) !== undefined);
    if (!before || !target) throw new Error('fixture: a listed scene design with a look of its own');

    const { template, action } = await prepareTemplateChange(project, target.id);
    if (template.kind !== 'scene') throw new Error('expected a scene design');
    const scene = action.apply(project, FIRST_SCENE).scenes[0];

    expect(scene?.templateId).toBe(target.id);
    expect(scene?.durationMs).toBe(template.defaultDurationMs);
    const count = scene?.inputs.photos.length ?? -1;
    expect(count).toBeGreaterThanOrEqual(template.photoSlots.min);
    expect(count).toBeLessThanOrEqual(template.photoSlots.max);
    const preset = designLookPreset(target.id);
    if (!preset) throw new Error('fixture: the design has a look');
    expect(scene?.inputs.look).toEqual(restyleLook(before.inputs.look, preset));
  });

  it('reads the project after the design has loaded, so an edit made meanwhile is kept', async () => {
    const order: string[] = [];
    const project = starter();
    const target = TEMPLATE_MANIFEST.find((t) => t.kind === 'scene' && t.id !== project.scenes[0]?.templateId);
    if (!target) throw new Error('fixture');
    await prepareTemplateChange(() => { order.push('read'); return project; }, target.id);
    expect(order).toEqual(['read']);
  });

  it('a video template: every scene replaced, the person’s photos dealt first and their logo on every beat', async () => {
    const base = starter();
    const first = base.scenes[0];
    if (!first) throw new Error('fixture');
    const logo = { ...DEFAULT_LOGO, mediaId: 'logo-1' };
    const project: Project = {
      ...base,
      scenes: [{ ...first, inputs: { ...first.inputs, logo, photos: dealPhotos(['mine-1'], 1) } }],
    };
    const ad = TEMPLATE_MANIFEST.find((t) => t.kind === 'ad' && t.photoSlots.max > 0);
    if (!ad) throw new Error('fixture: a video template with photos');

    const { template, action } = await prepareTemplateChange(project, ad.id);
    if (template.kind !== 'ad') throw new Error('expected a video template');
    const next = action.apply(project, FIRST_SCENE);

    expect(next.mode).toBe('motionAd');
    expect(next.sourceAdTemplateId).toBe(ad.id);
    expect(next.scenes).toHaveLength(template.scenes.length);
    expect(next.scenes.every((scene) => scene.inputs.logo.mediaId === 'logo-1')).toBe(true);
    const firstWithPhotos = next.scenes.find((scene) => scene.inputs.photos.length > 0);
    expect(firstWithPhotos?.inputs.photos[0]?.mediaId).toBe('mine-1');
  });
});
