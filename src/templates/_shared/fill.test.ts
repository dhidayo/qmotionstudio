import { describe, expect, it } from 'vitest';
import type { Layer } from '@/core/types';
import type { PhotoInput } from '@/document/types';
import { applyPhotoFill } from './fill';

const photo = (sizeMode: PhotoInput['sizeMode'], mediaId = 'upload:a'): PhotoInput => ({
  mediaId, frame: '3:4', sizeMode, sizePct: 100, cropMode: 'template',
});

const DESIGN = { w: 1080, h: 1920 };

function scene(): Layer[] {
  return [
    { id: 'bg', type: 'shape', startMs: 0, endMs: 5000, tracks: {}, props: { shape: 'rect', w: 1080, h: 1920, fill: { kind: 'solid', color: '#000' } } } as unknown as Layer,
    {
      id: 'p0', type: 'image', startMs: 200, endMs: 4800,
      tracks: { x: [{ t: 0, v: 300, ease: 'linear' }], y: [{ t: 0, v: 500, ease: 'linear' }], rotation: [{ t: 0, v: 8, ease: 'linear' }], opacity: [{ t: 0, v: 0, ease: 'linear' }, { t: 400, v: 1, ease: 'linear' }] },
      props: { slot: { kind: 'photo', index: 0 }, mediaId: 'upload:a', w: 400, h: 520, fit: 'cover', cornerRadius: 20 },
    },
    {
      id: 'g1', type: 'group', startMs: 0, endMs: 5000, tracks: {},
      props: {} as never,
      children: [{ id: 'p1', type: 'image', startMs: 0, endMs: 5000, tracks: {}, props: { slot: { kind: 'photo', index: 1 }, mediaId: 'upload:b', w: 400, h: 520, fit: 'cover' } }],
    } as unknown as Layer,
    { id: 'headline', type: 'text', startMs: 0, endMs: 5000, tracks: {}, props: { slot: { kind: 'text', key: 'headline' } } } as unknown as Layer,
  ];
}

describe('Fill frame fills the canvas (D-115)', () => {
  it('leaves a design alone when no photo asks to fill', () => {
    const layers = scene();
    expect(applyPhotoFill(layers, [photo('template'), photo('larger', 'upload:b')], DESIGN)).toBe(layers);
  });

  it('replaces the photo with a full-canvas one, centred, behind the design\'s content', () => {
    const out = applyPhotoFill(scene(), [photo('fillFrame'), photo('template', 'upload:b')], DESIGN);
    expect(out.map((l) => l.id)).toEqual(['bg', 'photo-fill-0', 'g1', 'headline']);
    const fill = out[1];
    if (fill?.type !== 'image') throw new Error('expected an image');
    expect(fill.props).toMatchObject({ w: 1080, h: 1920, fit: 'cover', mediaId: 'upload:a', slot: { kind: 'photo', index: 0 } });
    expect(fill.props.cornerRadius).toBeUndefined();
    expect(fill.tracks.x?.[0]?.v).toBe(540);
    expect(fill.tracks.y?.[0]?.v).toBe(960);
    expect(fill.tracks.rotation).toBeUndefined();
    // Keeps the design's own timing and fade, and moves: a slow push-in.
    expect([fill.startMs, fill.endMs]).toEqual([200, 4800]);
    expect(fill.tracks.opacity?.[1]?.v).toBe(1);
    expect(fill.tracks.scaleX?.at(-1)?.v).toBeGreaterThan(1);
  });

  it('finds a photo the design wrapped in a group', () => {
    const out = applyPhotoFill(scene(), [photo('template'), photo('fillFrame', 'upload:b')], DESIGN);
    const group = out.find((l) => l.id === 'g1');
    expect(group?.type === 'group' ? group.children : null).toEqual([]);
    expect(out.some((l) => l.id === 'photo-fill-1' && l.type === 'image' && l.props.w === 1080)).toBe(true);
  });
});
