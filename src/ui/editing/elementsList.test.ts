import { describe, expect, it } from 'vitest';
import { roleFill, type Keyframe, type Layer, type SlotRef } from '@/core/types';
import { createProject, createScene } from '@/document/defaults';
import type { Overlay, OverlayContent, Project } from '@/document/types';
import type { TextSlotDef } from '@/templates/schema';
import { elementGroups, isSelectedRow, momentToShow, slotWindow, type ElementsInput } from './elementsList';
import { overlayKindName, slotTitle } from './names';

/**
 * Elements (D-167): what the list holds, what each row is called, the order,
 * deleted parts and texts, and in a video which layers belong to a scene.
 */

const k = (t: number, v: number): Keyframe => ({ t, v, ease: 'linear' });

const shape = (id: string, slot: SlotRef, patch: Partial<Layer> = {}): Layer => ({
  id, type: 'shape', startMs: 0, endMs: 5000,
  tracks: { x: [k(0, 100)], y: [k(0, 100)] },
  props: { shape: 'rect', w: 40, h: 40, fill: roleFill('accent'), slot },
  ...patch,
} as Layer);

const text = (id: string, slot: SlotRef, patch: Partial<Layer> = {}): Layer => ({
  id, type: 'text', startMs: 0, endMs: 5000,
  tracks: { x: [k(0, 100)], y: [k(0, 100)] },
  props: {
    slot, text: '', fontId: 'body', fontSizePx: 20, weight: 700, letterSpacingPct: 0, lineHeight: 1,
    align: 'left', fill: roleFill('ink'), maxWidthPx: null, reveal: { kind: 'none' },
  },
  ...patch,
} as Layer);

const image = (id: string, index: number): Layer => ({
  id, type: 'image', startMs: 0, endMs: 5000, tracks: {},
  props: { slot: { kind: 'photo', index } },
} as unknown as Layer);

const slot = (id: string, label: string, placeholder: string, patch: Partial<TextSlotDef> = {}): TextSlotDef => ({
  id, label, placeholder, maxChars: 80, defaultStyle: {}, ...patch,
});

const TEMPLATE: NonNullable<ElementsInput['template']> = {
  photoSlots: { min: 1, max: 4, default: 2 },
  supportsLogo: true,
  textSlots: [
    slot('headline', 'Headline', 'Show the work'),
    slot('pillars', 'Pillars', 'Brand, Content, Social', { list: 'words' }),
    slot('letter', 'Brand mark letter', 'Q'),
  ],
};

/** A design that draws two photos, a headline, three pillars, a brand mark carrying its letter, and confetti. */
const LAYERS: readonly Layer[] = [
  shape('confetti', { kind: 'shape', key: 'confetti', label: 'Confetti', pick: false }),
  image('p1', 0),
  image('p2', 1),
  text('h', { kind: 'text', key: 'headline' }),
  { id: 'g', type: 'group', startMs: 1000, endMs: 5000, tracks: {}, props: {},
    children: [0, 1, 2].map((item) => text(`pl${item}`, { kind: 'text', key: 'pillars', item, label: `Pillar ${item + 1}` })) } as unknown as Layer,
  shape('mark', { kind: 'shape', key: 'mark', label: 'Brand mark', text: { slot: 'letter' } }),
];

function overlay(id: string, content: OverlayContent, startMs = 0, endMs = 3000): Overlay {
  return {
    id, track: 0, startMs, endMs, kind: content.kind, content,
    transform: {}, enterAnim: 'none', exitAnim: 'none',
  };
}

function image1(patch: (p: Project) => Project = (p) => p): Project {
  const project = createProject({ templateId: 'x', photoCount: 2 });
  const scene = project.scenes[0];
  if (!scene) throw new Error('no scene');
  // The first spot holds a photo of the person's own; the second is still a sample.
  const photos = scene.inputs.photos.map((photo, i) => (i === 0 ? { ...photo, mediaId: 'media:mine' } : photo));
  const withMine = { ...scene, inputs: { ...scene.inputs, photos } };
  return patch({ ...project, scenes: [withMine] });
}

const names = (input: ElementsInput): string[][] =>
  elementGroups(input).map((g) => [g.heading, ...g.rows.map((r) => r.detail === null ? r.name : `${r.name} — ${r.detail}`)]);

describe('the Elements list (D-167)', () => {
  it('lists photos, words, parts and added layers in reading order, under headings', () => {
    const project = image1((p) => ({
      ...p,
      overlays: [
        overlay('t', { kind: 'text', text: 'Big sale', style: {} as never }),
        overlay('s', { kind: 'sticker', sticker: 'subscribe' } as OverlayContent),
        overlay('ph', { kind: 'photo', mediaId: 'media:extra' }),
      ],
    }));
    expect(names({ project, sceneIndex: 0, template: TEMPLATE, layers: LAYERS })).toEqual([
      ['Photos', 'Photo 1', 'Photo 2'],
      // The letter is the brand mark's, so it is reached through the part.
      ['Words', 'Headline — Show the work', 'Pillar 1 — Brand', 'Pillar 2 — Content', 'Pillar 3 — Social'],
      // Scattered decoration too: the list is how it is reached (D-159).
      ['Shapes and parts', 'Confetti', 'Brand mark — Q'],
      ['Added on top', 'Text — Big sale', 'Sticker — Subscribe button', 'Extra photo 1'],
    ]);
  });

  it('says which photo is a sample, and names every row with its kind and state', () => {
    const project = image1();
    const rows = elementGroups({ project, sceneIndex: 0, template: TEMPLATE, layers: LAYERS }).flatMap((g) => g.rows);
    expect(rows.find((r) => r.id === 'photo:0')?.label).toBe('Photo 1');
    expect(rows.find((r) => r.id === 'photo:1')?.label).toBe('Photo 2, sample');
    expect(rows.find((r) => r.id === 'text:headline')?.label).toBe('Headline: Show the work, text');
    expect(rows.find((r) => r.id === 'shape:mark')?.label).toBe('Brand mark: Q, shape');
    // Each row picks what a tap on the picture picks, opening the same tab.
    expect(rows.find((r) => r.id === 'photo:1')?.target).toEqual({ kind: 'slot', key: 'photo:1', tab: 'photos', photoIndex: 1 });
    expect(rows.find((r) => r.id === 'text:pillars#2')?.target).toEqual({ kind: 'slot', key: 'text:pillars#2', tab: 'text' });
    expect(rows.find((r) => r.id === 'shape:confetti')?.target).toEqual({ kind: 'slot', key: 'shape:confetti', tab: 'look' });
  });

  it('keeps a deleted part and a removed text in the list, to put back', () => {
    const project = image1((p) => ({
      ...p,
      scenes: p.scenes.map((s) => ({ ...s, inputs: { ...s.inputs, texts: { headline: '' }, shapeOverrides: { 'shape:mark': { hidden: true } } } })),
    }));
    const rows = elementGroups({ project, sceneIndex: 0, template: TEMPLATE, layers: LAYERS }).flatMap((g) => g.rows);
    const mark = rows.find((r) => r.id === 'shape:mark');
    expect(mark?.state).toBe('deleted');
    expect(mark?.restore).toEqual({ kind: 'shape', key: 'shape:mark' });
    expect(mark?.label).toBe('Brand mark: Q, shape, deleted — put back');
    const headline = rows.find((r) => r.id === 'text:headline');
    expect(headline?.state).toBe('deleted');
    expect(headline?.detail).toBeNull();
    expect(headline?.restore).toEqual({ kind: 'text', slot: 'headline' });
  });

  it('lists the logo when the scene shows one, and nothing before the design has loaded', () => {
    const project = image1((p) => ({
      ...p,
      scenes: p.scenes.map((s) => ({ ...s, inputs: { ...s.inputs, logo: { ...s.inputs.logo, mediaId: 'media:logo' } } })),
    }));
    const groups = elementGroups({ project, sceneIndex: 0, template: TEMPLATE, layers: LAYERS });
    expect(groups.map((g) => g.id)).toEqual(['photos', 'words', 'parts', 'logo']);
    expect(elementGroups({ project, sceneIndex: 0, template: { ...TEMPLATE, supportsLogo: false }, layers: LAYERS }).map((g) => g.id)).not.toContain('logo');
    // Before the scene is drawn: its photos and each text whole, and no parts yet.
    expect(names({ project, sceneIndex: 0, template: TEMPLATE, layers: null })).toEqual([
      ['Photos', 'Photo 1', 'Photo 2'],
      ['Words', 'Headline — Show the work', 'Pillars — Brand, Content, Social', 'Brand mark letter — Q'],
      ['Logo', 'Logo'],
    ]);
  });

  it('in a video, lists only the layers seen during the selected scene, by when they arrive, with their time', () => {
    const base = createProject({ templateId: 'x', mode: 'motionAd' });
    const second = createScene('y', 4000, 0);
    const project: Project = {
      ...base,
      mode: 'motionAd',
      scenes: [...base.scenes.map((scene) => ({ ...scene, durationMs: 4000 })), second],
      overlays: [
        overlay('late', { kind: 'text', text: 'Later', style: {} as never }, 6000, 7000),
        overlay('first', { kind: 'text', text: 'First only', style: {} as never }, 0, 3000),
        overlay('across', { kind: 'customMedia', mediaId: 'media:v' }, 2000, 5000),
      ],
    };
    const added = (index: number): string[] => elementGroups({ project, sceneIndex: index, template: TEMPLATE, layers: null })
      .find((g) => g.id === 'added')?.rows.map((r) => r.label) ?? [];
    expect(added(0)).toEqual([
      'Text: First only, added on top, 0.0s to 3.0s',
      'Video clip 1, added on top, 2.0s to 5.0s',
    ]);
    expect(added(1)).toEqual([
      'Video clip 1, added on top, 2.0s to 5.0s',
      'Text: Later, added on top, 6.0s to 7.0s',
    ]);
  });

  it('marks the row of whatever is selected', () => {
    const rows = elementGroups({ project: image1(), sceneIndex: 0, template: TEMPLATE, layers: LAYERS }).flatMap((g) => g.rows);
    const none = { slot: null, overlay: null, logo: false };
    expect(rows.filter((r) => isSelectedRow(r, { ...none, slot: 'shape:mark' })).map((r) => r.id)).toEqual(['shape:mark']);
    expect(rows.filter((r) => isSelectedRow(r, none))).toEqual([]);
  });
});

describe('names (D-167)', () => {
  it('titles a design element as the menus speak of it', () => {
    expect(slotTitle('photo:1', LAYERS, TEMPLATE)).toBe('Photo 2');
    expect(slotTitle('shape:mark', LAYERS, TEMPLATE)).toBe('Brand mark');
    expect(slotTitle('text:pillars#1', LAYERS, TEMPLATE)).toBe('Pillar 2');
    expect(slotTitle('text:pillars#1', null, TEMPLATE)).toBe('Pillars 2');
    expect(slotTitle('text:headline', null, TEMPLATE)).toBe('Headline');
    expect(slotTitle('text:nope', null, TEMPLATE)).toBeNull();
    expect(overlayKindName({ kind: 'customMedia', mediaId: 'm' })).toBe('Video clip');
  });
});

describe('showing what was chosen (D-167)', () => {
  it('reads when a nested element is on screen, on the project clock', () => {
    const fading = text('w', { kind: 'text', key: 'late' }, {
      startMs: 500, endMs: 3000, tracks: { opacity: [k(0, 0), k(499, 0), k(500, 1)] },
    });
    const layers: Layer[] = [{ id: 'g', type: 'group', startMs: 1000, endMs: 5000, tracks: {}, props: {}, children: [fading] } as unknown as Layer];
    const seen = slotWindow(layers, 'text:late', { startMs: 4000, endMs: 9000 }, 1);
    expect(seen?.startMs).toBeGreaterThanOrEqual(5990);
    expect(seen?.startMs).toBeLessThanOrEqual(6020); // read in steps of 16ms
    expect(seen?.endMs).toBeCloseTo(8000, -1);
    // At double speed the scene's clock runs twice as fast.
    expect(slotWindow(layers, 'text:late', { startMs: 0, endMs: 9000 }, 2)?.startMs).toBeCloseTo(1000, -2);
    expect(slotWindow(layers, 'text:missing', { startMs: 0, endMs: 9000 }, 1)).toBeNull();
  });

  it('stays when it is on screen, else goes to the picture moment, else a little after it arrives', () => {
    const seen = { startMs: 2000, endMs: 4000 };
    expect(momentToShow(2500, seen, 3000)).toBeNull();
    expect(momentToShow(500, seen, 3000)).toBe(3000);
    expect(momentToShow(500, seen, 1000)).toBe(2500);
    expect(momentToShow(500, { startMs: 2000, endMs: 2300 }, null)).toBe(2100);
  });
});
