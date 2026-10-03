import { describe, expect, it } from 'vitest';
import { createProps, resolveProps } from '@/core/anim/interpolate';
import { safeBox, projectDesign } from '@/core/render/bounds';
import { slotOf } from '@/core/render/slots';
import type { TextMeasureContext } from '@/core/text/layout';
import type { Aspect, Layer, Palette } from '@/core/types';
import type { PhotoInput, SceneInputs } from '@/document/types';
import { createBuildContext } from './buildContext';
import { loadAllTemplates } from './registry';
import { TEMPLATE_MANIFEST } from './manifest';
import { isSceneTemplate, type SceneTemplate } from './schema';

/**
 * Invariants every template in the library has to hold.
 *
 * Written across the whole library rather than per template on purpose. These
 * are the promises the *editor* makes about templates — that a photograph can
 * be dragged, that a build is a pure function of its inputs — and a promise
 * kept by eleven templates and broken by the twelfth is not kept.
 *
 * The one that matters most is the nesting rule (D-085), because breaking it is
 * silent: the template renders perfectly and only direct manipulation is wrong,
 * which is not something a thumbnail or a visual baseline can catch.
 */

const measure: TextMeasureContext = {
  font: '',
  letterSpacing: '',
  textBaseline: 'alphabetic',
  measureText: (text: string) => ({ width: text.length * 10 }),
};

const palette: Palette = {
  bg: '#0c0c11', surface: '#1b1b27', ink: '#f5f5f7', inkMuted: '#9a9aab', accent: '#7c6cf5',
};

function photo(index: number): PhotoInput {
  return {
    mediaId: `m${index}`,
    frame: '3:4',
    sizeMode: 'template',
    sizePct: 100,
    cropMode: 'template',
  };
}

function inputsFor(template: SceneTemplate): SceneInputs {
  return {
    photos: Array.from({ length: template.photoSlots.default }, (_, i) => photo(i)),
    texts: {},
    logo: {
      mediaId: 'logo', sizePct: 12, placement: 'topLeft', x: 0.5, y: 0.5,
      opacity: 1, lockup: false, lockupText: '',
    },
    look: { palette, background: 'gradient', grain: 0, vignette: 0, speed: 1, cornerRadius: 24 },
    styleOverrides: { texts: {} },
    slotTransforms: {},
  };
}

function buildAt(template: SceneTemplate, aspect: Aspect): Layer[] {
  const design = projectDesign(aspect);
  const ctx = createBuildContext({
    design,
    safe: safeBox(design),
    palette,
    durationMs: template.defaultDurationMs,
    measureContext: measure,
  });
  return template.build(inputsFor(template), ctx);
}

const templates = await loadAllTemplates();
const scenes = templates.filter(isSceneTemplate);

describe('the library', () => {
  it('has at least twenty-five templates across at least five categories (§15, M8)', () => {
    expect(templates.length).toBeGreaterThanOrEqual(25);
    expect(new Set(templates.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
  });

  it('leaves no category thin', () => {
    const counts = new Map<string, number>();
    // Only what the library shows: Basics holds Blank, which is offered from
    // "+ Scene" and "New blank canvas" rather than as a card (D-097).
    const listed = new Set(TEMPLATE_MANIFEST.filter((t) => t.listed !== false).map((t) => t.id));
    for (const t of templates) {
      if (listed.has(t.id)) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    }
    // Categories are the top-level navigation; a tab with two things in it
    // teaches the user that the tabs are not worth opening (D-086).
    expect(Math.min(...counts.values())).toBeGreaterThanOrEqual(5);
  });
});

describe.each(scenes.map((t) => [t.id, t] as const))('%s', (_id, template) => {
  const aspects = template.supportedAspects;

  it('draws something at every aspect it claims', () => {
    for (const aspect of aspects) {
      expect(buildAt(template, aspect).length).toBeGreaterThan(0);
    }
  });

  it('builds identically from identical inputs (§3B)', () => {
    const first = buildAt(template, aspects[0] ?? '1:1');
    const second = buildAt(template, aspects[0] ?? '1:1');
    // Ids included: they come from a counter so that this holds, and the memo
    // in front of build() is worthless if it does not.
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('gives every layer its own id', () => {
    for (const aspect of aspects) {
      const ids = [...flatten(buildAt(template, aspect))].map((layer) => layer.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  /**
   * D-085. A nudge is composed into the drawable's *own* tracks, so every
   * ancestor's scale and rotation is applied to it before it reaches the
   * screen. Drag a photograph rightwards inside a container turned 30° and it
   * leaves at 30°.
   *
   * Translation is fine — it composes exactly — and `clipProgress` moves the
   * window rather than the child. Scale and rotation are the two that lie.
   */
  it('never tags a photo inside a container that already carries its slot (D-090)', () => {
    for (const aspect of aspects) {
      for (const offence of doubleTags(buildAt(template, aspect))) {
        expect.soft(offence, `${template.id} at ${aspect}`).toBe('');
      }
    }
  });

  it('puts no draggable element inside a scaled or rotated container', () => {
    for (const aspect of aspects) {
      for (const offence of nestingOffences(buildAt(template, aspect))) {
        expect.soft(offence, `${template.id} at ${aspect}`).toBe('');
      }
    }
  });
});

/**
 * D-090. A container that carries a slot takes the user's nudge itself, so
 * anything tagged inside it would be nudged a second time on top.
 */
function doubleTags(layers: readonly Layer[]): string[] {
  const offences: string[] = [];
  for (const layer of layers) {
    if (layer.type !== 'group' && layer.type !== 'mask') continue;
    if (slotOf(layer)) {
      for (const child of flatten(layer.children)) {
        if (slotOf(child)) {
          offences.push(`"${child.id}" is tagged inside tagged ${layer.type} "${layer.id}" and would move twice`);
        }
      }
    }
    offences.push(...doubleTags(layer.children));
  }
  return offences;
}

function* flatten(layers: readonly Layer[]): Generator<Layer> {
  for (const layer of layers) {
    yield layer;
    if (layer.type === 'group' || layer.type === 'mask') yield* flatten(layer.children);
  }
}

/** Samples a container's scale and rotation across its life. */
function transformsOf(layer: Layer): { scaleX: number; scaleY: number; rotation: number }[] {
  const span = Math.max(1, layer.endMs - layer.startMs);
  return Array.from({ length: 9 }, (_, i) => {
    const props = resolveProps(layer.tracks, (span * i) / 8, createProps());
    return { scaleX: props.scaleX, scaleY: props.scaleY, rotation: props.rotation };
  });
}

function nestingOffences(layers: readonly Layer[], within = ''): string[] {
  const offences: string[] = [];

  for (const layer of layers) {
    if (layer.type !== 'group' && layer.type !== 'mask') continue;

    const moved = transformsOf(layer).some(
      (t) => Math.abs(t.scaleX - 1) > 1e-6 || Math.abs(t.scaleY - 1) > 1e-6 || Math.abs(t.rotation) > 1e-6,
    );
    const chain = moved ? `${within}${layer.type} "${layer.id}" (scaled or rotated)` : within;

    if (moved) {
      for (const child of flatten(layer.children)) {
        const slot = slotOf(child);
        if (slot) {
          offences.push(
            `"${child.id}" is a draggable ${slot.kind} inside ${chain} — `
            + 'move the animation onto the child, or off the container (D-085)',
          );
        }
      }
    }
    offences.push(...nestingOffences(layer.children, chain));
  }

  return offences;
}
