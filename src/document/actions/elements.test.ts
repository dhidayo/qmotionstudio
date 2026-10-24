import { describe, expect, it } from 'vitest';
import type { Overlay, OverlayContent, Project } from '@/document/types';
import { createProject, DEFAULT_OVERLAY_TEXT_STYLE } from '@/document/defaults';
import { makeCounterContent, makeShapeContent, makeStickerContent, switchShape } from '@/document/elements';
import { referencedMedia, usedUserFonts } from '@/document/select/media';
import { overlayFontId, overlayMediaId, stretchAxes } from '@/document/select/overlay';
import * as actions from './index';

/**
 * Shapes, stickers and numbers as document edits (D-158): ordinary undoable
 * actions on ordinary overlays, that never mistake an element for a photo.
 */

const scope: actions.ActionScope = { sceneIndex: 0 };

function layer(id: string, content: OverlayContent, patch: Partial<Overlay> = {}): Overlay {
  return {
    id, track: 0, startMs: 0, endMs: 3_000, kind: content.kind, content,
    transform: { x: 0.5, y: 0.5 }, enterAnim: 'fade', exitAnim: 'fade', ...patch,
  };
}

function project(...overlays: Overlay[]): Project {
  return { ...createProject({ templateId: 'kinetic-statement' }), overlays };
}

const contentOf = (p: Project, id: string): OverlayContent | undefined => p.overlays.find((o) => o.id === id)?.content;

describe('patchOverlayContent', () => {
  it('changes an element’s settings', () => {
    const p = actions.patchOverlayContent('s', 'shape', { fill: { hex: '#00ff00' }, corner: 0.5 })
      .apply(project(layer('s', makeShapeContent('rect'))), scope);
    expect(contentOf(p, 's')).toMatchObject({ kind: 'shape', fill: { hex: '#00ff00' }, corner: 0.5 });
  });

  it('leaves an overlay of another kind alone', () => {
    const before = project(layer('p', { kind: 'photo', mediaId: 'm1' }), layer('s', makeStickerContent('check')));
    expect(actions.patchOverlayContent('p', 'shape', { corner: 1 }).apply(before, scope)).toBe(before);
    expect(actions.patchOverlayContent('s', 'counter', { to: 5 }).apply(before, scope)).toBe(before);
  });

  it('carries a coalesce key, so a slider drag is one undo step', () => {
    expect(actions.patchOverlayContent('s', 'shape', { w: 0.5 }, { coalesceKey: 'shape:s:w' }).coalesceKey).toBe('shape:s:w');
  });
});

describe('setOverlayContent', () => {
  it('swaps what an overlay is, keeping where it is, when, and how it moves', () => {
    const before = layer('x', makeStickerContent('check'), {
      startMs: 500, endMs: 2_500, transform: { x: 0.2, y: 0.7, rotation: 15 },
      effects: [{ id: 'e1', effectId: 'pulse', phase: 'during', durationMs: 1_000, intensity: 1, params: {} }],
    });
    const p = actions.setOverlayContent('x', makeCounterContent()).apply(project(before), scope);
    const after = p.overlays[0];
    expect(after?.kind).toBe('counter');
    expect(after?.content.kind).toBe('counter');
    expect(after?.startMs).toBe(500);
    expect(after?.transform).toEqual(before.transform);
    expect(after?.effects).toEqual(before.effects);
    expect(after?.id).toBe('x');
  });
});

describe('setShapeBox', () => {
  it('resizes the shape’s own box, not its scale, and moves it in the same step', () => {
    const p = actions.setShapeBox('s', { w: 0.8, h: 0.1 }, { x: 0.3, y: 0.4 }, null)
      .apply(project(layer('s', makeShapeContent('rect'), { transform: { x: 0.5, y: 0.5, scaleX: 1.5 } })), scope);
    expect(contentOf(p, 's')).toMatchObject({ w: 0.8, h: 0.1 });
    expect(p.overlays[0]?.transform).toEqual({ x: 0.3, y: 0.4, scaleX: 1.5 });
  });

  it('shares the move’s coalesce key, so a drag that moves and resizes is one undo', () => {
    expect(actions.setShapeBox('s', { w: 1, h: 1 }, { x: 0, y: 0 }, null).coalesceKey)
      .toBe(actions.setOverlayTransform('s', {}).coalesceKey);
    expect(actions.setShapeBox('s', { w: 1, h: 1 }, { x: 0, y: 0 }, 1_200).coalesceKey)
      .toBe(actions.setOverlayPose('s', 1_200, {}).coalesceKey);
  });

  it('writes the place as a keyframe on an animated shape', () => {
    const animated = layer('s', makeShapeContent('star'), {
      poses: [{ atMs: 0, transform: { x: 0.2, y: 0.2 } }, { atMs: 2_000, transform: { x: 0.8, y: 0.8 } }],
    });
    const p = actions.setShapeBox('s', { w: 0.5, h: 0.5 }, { x: 0.6, y: 0.1 }, 2_000).apply(project(animated), scope);
    expect(p.overlays[0]?.poses?.[1]?.transform).toMatchObject({ x: 0.6, y: 0.1 });
    expect(contentOf(p, 's')).toMatchObject({ w: 0.5, h: 0.5 });
  });

  it('never makes a shape too small to grab, and leaves other kinds alone', () => {
    const p = actions.setShapeBox('s', { w: 0, h: -1 }, { x: 0.5, y: 0.5 }, null).apply(project(layer('s', makeShapeContent('rect'))), scope);
    expect(contentOf(p, 's')).toMatchObject({ w: 0.01, h: 0.01 });
    const sticker = project(layer('k', makeStickerContent('check')));
    expect(actions.setShapeBox('k', { w: 1, h: 1 }, { x: 0, y: 0 }, null).apply(sticker, scope)).toBe(sticker);
  });
});

describe('elements are not media', () => {
  const elements = [
    layer('a', makeShapeContent('star')),
    layer('b', makeStickerContent('check')),
    layer('c', makeCounterContent({ style: { fontId: 'user:abc' } })),
  ];

  it('are kept when a photo is deleted from the project', () => {
    const p = actions.removeFromLibrary('m1').apply(project(...elements, layer('p', { kind: 'photo', mediaId: 'm1' })), scope);
    expect(p.overlays.map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('are not given a picture by setOverlayMedia', () => {
    const before = project(...elements);
    for (const id of ['a', 'b', 'c']) expect(actions.setOverlayMedia(id, 'm9').apply(before, scope)).toBe(before);
  });

  it('add no media ids, and a number’s own font travels', () => {
    const p = project(...elements);
    expect([...referencedMedia(p)].every((id) => typeof id === 'string')).toBe(true);
    expect(usedUserFonts(p).has('user:abc')).toBe(true);
    expect(overlayMediaId(makeShapeContent('rect'))).toBeNull();
    expect(overlayFontId(makeCounterContent())).toBe('headline');
    expect(overlayFontId(makeStickerContent('check'))).toBeNull();
  });
});

describe('setOverlayTextStyle', () => {
  it('styles a number’s figure as it styles words', () => {
    const p = actions.setOverlayTextStyle('c', { sizePct: 300, pill: true }).apply(project(layer('c', makeCounterContent())), scope);
    const content = contentOf(p, 'c');
    expect(content?.kind === 'counter' ? content.style : null).toMatchObject({ sizePct: 300, pill: true });
  });

  it('still styles text', () => {
    const p = actions.setOverlayTextStyle('t', { weight: 400 }).apply(project(layer('t', { kind: 'text', text: 'Hi', style: DEFAULT_OVERLAY_TEXT_STYLE })), scope);
    const content = contentOf(p, 't');
    expect(content?.kind === 'text' ? content.style.weight : null).toBe(400);
  });
});

describe('addOverlay', () => {
  it('names the undo step for what was added', () => {
    expect(actions.addOverlay(layer('a', makeShapeContent('star'))).label).toBe('Add shape');
    expect(actions.addOverlay(layer('b', makeStickerContent('check'))).label).toBe('Add sticker');
    expect(actions.addOverlay(layer('c', makeCounterContent())).label).toBe('Add number');
  });
});

describe('stretchAxes', () => {
  it('lets shapes stretch, a line only along itself, and stickers and numbers not at all', () => {
    expect(stretchAxes(layer('a', makeShapeContent('rect')))).toBe('both');
    expect(stretchAxes(layer('a', makeShapeContent('line')))).toBe('x');
    expect(stretchAxes(layer('a', makeStickerContent('check')))).toBe('none');
    expect(stretchAxes(layer('a', makeCounterContent()))).toBe('none');
    expect(stretchAxes(layer('a', { kind: 'photo', mediaId: 'm' }))).toBe('both');
  });
});

describe('switchShape', () => {
  it('keeps size and colours, and starts what is new from the kind’s defaults', () => {
    const star = switchShape(makeShapeContent('rect', { w: 0.6, h: 0.4, fill: { hex: '#abcdef' } }), 'star');
    expect(star).toMatchObject({ shape: 'star', w: 0.6, h: 0.4, fill: { hex: '#abcdef' }, points: 5, inner: 0.45 });
    const back = switchShape(star, 'circle');
    expect(back.points).toBeUndefined();
  });

  it('turns a fill into a line’s colour and back', () => {
    const line = switchShape(makeShapeContent('rect', { fill: { role: 'accent' } }), 'line');
    expect(line).toMatchObject({ fill: null, stroke: { role: 'accent' }, heads: 'none' });
    const box = switchShape(line, 'rect');
    expect(box).toMatchObject({ fill: { role: 'accent' }, stroke: null });
  });
});
