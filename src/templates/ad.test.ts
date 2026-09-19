import { describe, expect, it } from 'vitest';
import { sceneSpans } from '@/document/select/timeline';
import { adDurationMs, expandAdTemplate } from './ad';
import { loadTemplate } from './registry';
import type { AdTemplate } from './schema';

/**
 * Ad templates expand into ordinary scenes (D-013).
 *
 * The property that matters most is the last one: the length the library card
 * advertises has to be the length the timeline and the export actually produce,
 * which means `adDurationMs` and `sceneSpans` must agree about D-004's overlaps
 * from two completely different directions.
 */

const AD_IDS = ['launch-story', 'product-drop', 'quick-pitch'] as const;

async function ad(id: string): Promise<AdTemplate> {
  const template = await loadTemplate(id);
  if (template.kind !== 'ad') throw new Error(`${id} is not an ad template`);
  return template;
}

describe.each(AD_IDS)('%s', (id) => {
  it('expands into one scene per beat, in order', async () => {
    const template = await ad(id);
    const scenes = await expandAdTemplate(template);

    expect(scenes).toHaveLength(template.scenes.length);
    expect(scenes.map((s) => s.templateId)).toEqual(template.scenes.map((r) => r.templateId));
  });

  it('gives every scene a distinct id, so editing one does not edit the rest', async () => {
    const scenes = await expandAdTemplate(await ad(id));
    expect(new Set(scenes.map((s) => s.id)).size).toBe(scenes.length);
  });

  it('never puts a transition on the first scene (D-004)', async () => {
    const scenes = await expandAdTemplate(await ad(id));
    expect(scenes[0]?.transitionIn).toBeNull();
    expect(scenes.slice(1).every((s) => s.transitionIn !== null)).toBe(true);
  });

  it('runs for exactly the length the manifest advertises', async () => {
    const template = await ad(id);
    const scenes = await expandAdTemplate(template);
    const rendered = sceneSpans(scenes).at(-1)?.endMs ?? 0;

    expect(adDurationMs(template)).toBe(template.defaultDurationMs);
    expect(rendered).toBe(template.defaultDurationMs);
  });

  it('fills every beat with photos within its own template slot range', async () => {
    const template = await ad(id);
    const scenes = await expandAdTemplate(template);

    for (const [i, scene] of scenes.entries()) {
      const sub = await loadTemplate(scene.templateId);
      if (sub.kind !== 'scene') throw new Error('a beat referenced an ad template');
      expect(scene.inputs.photos.length, `beat ${i}`).toBeGreaterThanOrEqual(sub.photoSlots.min);
      expect(scene.inputs.photos.length, `beat ${i}`).toBeLessThanOrEqual(sub.photoSlots.max);
    }
  });

  it('seeds copy into slots the sub-template actually declares', async () => {
    const template = await ad(id);
    const scenes = await expandAdTemplate(template);

    for (const [i, scene] of scenes.entries()) {
      const sub = await loadTemplate(scene.templateId);
      if (sub.kind !== 'scene') throw new Error('a beat referenced an ad template');
      const declared = new Set(sub.textSlots.map((slot) => slot.id));
      for (const slotId of Object.keys(scene.inputs.texts)) {
        expect(declared.has(slotId), `beat ${i} slot "${slotId}"`).toBe(true);
      }
    }
  });

  it('shares one palette across every beat, so the ad reads as one piece', async () => {
    const scenes = await expandAdTemplate(await ad(id));
    const palettes = new Set(scenes.map((s) => JSON.stringify(s.inputs.look.palette)));
    expect(palettes.size).toBe(1);
  });
});

describe('photo distribution', () => {
  it('deals photos onward rather than restarting each beat', async () => {
    const scenes = await expandAdTemplate(await ad('quick-pitch'), {
      photoIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    });

    const first = scenes[0]?.inputs.photos[0]?.mediaId;
    const second = scenes[1]?.inputs.photos[0]?.mediaId;
    expect(first).toBe('a');
    expect(second).not.toBe('a');
  });

  it('wraps rather than running out when there are fewer photos than slots', async () => {
    const scenes = await expandAdTemplate(await ad('launch-story'), { photoIds: ['only'] });
    expect(scenes.every((s) => s.inputs.photos.every((p) => p.mediaId === 'only'))).toBe(true);
  });
});
