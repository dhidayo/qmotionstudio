import { describe, expect, it } from 'vitest';
import { projectDesign, safeBox } from '@/core/render/bounds';
import type { TextMeasureContext } from '@/core/text/layout';
import type { Palette } from '@/core/types';
import type { PhotoFrame, PhotoSizeMode } from '@/document/types';
import { createBuildContext } from './buildContext';
import { loadAllTemplates } from './registry';
import { isSceneTemplate, type SceneTemplate } from './schema';
import { sampleInputs } from './_test/partChecks';

/**
 * Frame ratio is offered only where it does something (D-172).
 *
 * A design declares `photoFrameRatio: false` when its photos keep a shape of
 * their own, and the Photos tab then hides the control. Declared rather than
 * guessed, so held here to what the build does: every design is built at
 * three frame ratios, in every shape it supports and at each size mode the
 * ratio could matter in. A design that declares it must build the same
 * layers each time — the same layers are the same pixels — and one that does
 * not must change with the ratio, or its control would do nothing.
 */

const measure: TextMeasureContext = { font: '', letterSpacing: '', textBaseline: 'alphabetic', measureText: (t: string) => ({ width: t.length * 10 }) };
const palette: Palette = { bg: '#0e1b3d', surface: '#1a2b57', ink: '#f4f6fb', inkMuted: '#9aa7c7', accent: '#f3b23f' };
const FRAMES: readonly PhotoFrame[] = ['1:1', '16:9', '9:16'];
const SIZE_MODES: readonly PhotoSizeMode[] = ['template', 'larger', 'overflow'];

/** Whether any frame ratio builds different layers from another, in any shape or size mode. */
function frameChangesBuild(template: SceneTemplate): boolean {
  for (const aspect of template.supportedAspects) {
    const design = projectDesign(aspect);
    for (const sizeMode of SIZE_MODES) {
      const builds = FRAMES.map((frame) => {
        const ctx = createBuildContext({ design, safe: safeBox(design), palette, durationMs: template.defaultDurationMs, measureContext: measure });
        const inputs = sampleInputs(template);
        const photos = inputs.photos.map((photo) => ({ ...photo, frame, sizeMode, sizePct: 150 }));
        return JSON.stringify(template.build({ ...inputs, photos }, ctx));
      });
      if (builds.some((build) => build !== builds[0])) return true;
    }
  }
  return false;
}

describe('the Photos tab’s Frame ratio', () => {
  it('is declared away exactly where it would change nothing', async () => {
    const templates = (await loadAllTemplates()).filter(isSceneTemplate).filter((t) => t.photoSlots.max > 0);
    const wrong = templates
      .filter((template) => (template.photoFrameRatio !== false) !== frameChangesBuild(template))
      .map((template) => `${template.id} (${template.photoFrameRatio === false ? 'declares no effect, but the ratio changes it' : 'the ratio changes nothing; declare photoFrameRatio: false'})`);
    expect(wrong).toEqual([]);
    // Scene Cuts' photos fill the frame (D-168): the case that asked for this.
    expect(templates.find((t) => t.id === 'cut-iris')?.photoFrameRatio).toBe(false);
  }, 120_000);
});
