import { describe, expect, it } from 'vitest';
import type { Layer, Palette, ShapeLayer, StickerLayer, TextLayer } from '@/core/types';
import type { Overlay, OverlayContent } from '@/document/types';
import type { TextMeasureContext } from '@/core/text/layout';
import { makeCounterContent, makeShapeContent, makeStickerContent } from '@/document/elements';
import { recorder, only, type Call } from '@/core/test/recorder';
import { TextMeasurer } from '@/core/text/measure';
import { STICKERS } from '@/core/stickers/catalog';
import { overlayBox } from './bounds';
import { drawLayer } from './drawLayer';
import { elementPaint, shapeProps, stickerProps, stickerSize } from './elements';
import { overlayKey, overlayLayer } from './overlays';
import type { DrawContext } from './drawContext';

/**
 * Shapes, stickers and numbers as overlays (D-158): built into the layers
 * that draw them, boxed where they are drawn, and drawn the same way at the
 * same moment every time.
 */

const DESIGN = { w: 1080, h: 1080 };
const palette: Palette = { bg: '#000000', surface: '#111111', ink: '#ffffff', inkMuted: '#aaaaaa', accent: '#ff0000' };

function overlay(content: OverlayContent, patch: Partial<Overlay> = {}): Overlay {
  return {
    id: 'ovl_e',
    track: 0,
    startMs: 0,
    endMs: 4_000,
    kind: content.kind,
    content,
    transform: { x: 0.5, y: 0.5 },
    enterAnim: 'none',
    exitAnim: 'none',
    ...patch,
  };
}

function build(o: Overlay): Layer {
  let n = 0;
  const layer = overlayLayer(o, { design: DESIGN, id: (prefix) => `${prefix}-${n++}` });
  if (!layer) throw new Error('no layer');
  return layer;
}

/** Ten pixels a character, as in the bounds tests. */
const measure: TextMeasureContext = {
  font: '',
  letterSpacing: '',
  textBaseline: 'alphabetic',
  measureText: (text: string) => ({ width: Array.from(text).length * 10 }),
};

function dcFor(log: Call[]): DrawContext {
  const ctx = recorder(log);
  return { ctx, palette, media: { getBitmap: () => null, getVideoFrame: () => null }, measurer: new TextMeasurer(ctx, new Map()), depth: 0 };
}

describe('shapes', () => {
  it('build a shape layer the size of their own box', () => {
    const layer = build(overlay(makeShapeContent('star'))) as ShapeLayer;
    expect(layer.type).toBe('shape');
    expect(layer.props.shape).toBe('star');
    expect(layer.props.w).toBeCloseTo(0.3 * 1080);
    expect(layer.props.h).toBeCloseTo(0.285 * 1080);
  });

  it('take their colours from the look, a colour of their own, or none', () => {
    expect(elementPaint({ role: 'accent' })).toEqual({ kind: 'role', role: 'accent' });
    expect(elementPaint({ hex: '#123456' })).toEqual({ kind: 'color', value: '#123456' });
    expect(elementPaint(null)).toBeNull();
    const hollow = shapeProps(makeShapeContent('circle', { fill: null, stroke: { role: 'ink' } }), 1080);
    expect(hollow.hollow).toBe(true);
    expect(hollow.stroke?.paint).toEqual({ kind: 'role', role: 'ink' });
  });

  it('round their corners against the shorter side; a pill always fully', () => {
    expect(shapeProps(makeShapeContent('rect', { w: 0.4, h: 0.2, corner: 0.5 }), 1000).cornerRadius).toBeCloseTo(50);
    expect(shapeProps(makeShapeContent('pill', { w: 0.4, h: 0.2, corner: 0 }), 1000).cornerRadius).toBeCloseTo(100);
    expect(shapeProps(makeShapeContent('rect'), 1000).cornerRadius).toBeUndefined();
  });

  it('give a line a band to grab of at least three times its thickness', () => {
    const props = shapeProps(makeShapeContent('line', { h: 0.001, strokeWidth: 0.02 }), 1000);
    expect(props.h).toBeCloseTo(60);
    expect(props.hollow).toBe(true);
  });

  it('box exactly where they are drawn, at their scale', () => {
    const box = overlayBox(overlay(makeShapeContent('rect', { w: 0.4, h: 0.25 }), { transform: { x: 0.5, y: 0.5, scaleX: 2 } }), '1:1', measure);
    expect(box?.w).toBeCloseTo(0.4 * 1080 * 2);
    expect(box?.h).toBeCloseTo(0.25 * 1080 * 2);
    expect(box?.cx).toBeCloseTo(540);
  });
});

describe('stickers', () => {
  const id = STICKERS[0]?.id ?? 'check';

  it('build a sticker layer that follows the sticker’s shape', () => {
    const layer = build(overlay(makeStickerContent(id))) as StickerLayer;
    expect(layer.type).toBe('sticker');
    const size = stickerSize(id, 1080);
    expect(layer.props.w).toBeCloseTo(size.w);
    expect(layer.props.h).toBeCloseTo(size.h);
    const box = overlayBox(overlay(makeStickerContent(id)), '1:1', measure);
    expect(box?.w).toBeCloseTo(size.w);
  });

  it('keep the sticker’s own colours unless given others', () => {
    const def = STICKERS[0];
    const own = stickerProps(makeStickerContent(id), 1000, 1);
    expect(own.primary).toEqual(def?.primary);
    const mine = stickerProps({ ...makeStickerContent(id), primary: { hex: '#00ff00' } }, 1000, 1);
    expect(mine.primary).toEqual({ kind: 'color', value: '#00ff00' });
  });

  it('draw the same frame at the same moment, and move as time passes', () => {
    const layer = build(overlay(makeStickerContent(id)));
    const at = (ms: number): Call[] => { const log: Call[] = []; drawLayer(dcFor(log), layer, ms); return log; };
    expect(at(400)).toEqual(at(400));
    expect(at(100)).not.toEqual(at(900));
    // Balanced: every save is restored.
    const log = at(700);
    expect(only(log, 'save').length).toBe(only(log, 'restore').length);
  });

  it('hold still when set to Still', () => {
    const layer = build(overlay({ ...makeStickerContent(id), play: 'still' }));
    const at = (ms: number): Call[] => { const log: Call[] = []; drawLayer(dcFor(log), layer, ms); return log; };
    expect(at(100)).toEqual(at(1900));
  });

  it('draw nothing for a sticker this build does not know', () => {
    const log: Call[] = [];
    drawLayer(dcFor(log), build(overlay(makeStickerContent('from-a-newer-version'))), 500);
    expect(only(log, 'fill')).toHaveLength(0);
    expect(only(log, 'stroke')).toHaveLength(0);
  });

  it('draw every sticker in the library without throwing, at any moment', () => {
    for (const def of STICKERS) {
      const layer = build(overlay(makeStickerContent(def.id)));
      for (const ms of [0, def.posterMs, def.loopMs - 1, def.loopMs * 2.5]) {
        const log: Call[] = [];
        expect(() => { drawLayer(dcFor(log), layer, ms); }).not.toThrow();
        expect(only(log, 'save').length).toBe(only(log, 'restore').length);
      }
    }
  });
});

describe('numbers', () => {
  const followers = makeCounterContent({ to: 10_000, format: { compact: true, suffix: '+' } });

  it('build a text layer that counts, measured on its longest figure', () => {
    const layer = build(overlay(followers)) as TextLayer;
    expect(layer.type).toBe('text');
    expect(layer.props.reveal.kind).toBe('counter');
    expect(layer.props.text).toBe('999+');
    // Anchored on a block, so it sits in the middle of where it is put.
    expect(layer.props.maxWidthPx).not.toBeNull();
  });

  it('write the figure of the moment', () => {
    const layer = build(overlay(makeCounterContent({ from: 0, to: 1000, delayMs: 0, countMs: 1000, ease: 'steady' })));
    const written = (ms: number): string => {
      const log: Call[] = [];
      drawLayer(dcFor(log), layer, ms);
      return only(log, 'fillText').map((call) => String(call[1])).join('');
    };
    expect(written(0)).toBe('0');
    expect(written(500)).toBe('500');
    expect(written(1500)).toBe('1,000');
  });

  it('keep the same box for the whole count', () => {
    const o = overlay(followers);
    const early = overlayBox(o, '1:1', measure, 0);
    const late = overlayBox(o, '1:1', measure, 3000);
    expect(early?.w).toBeGreaterThan(0);
    expect(early?.w).toBe(late?.w);
    // Centred on where it was put.
    expect(early?.cx).toBeCloseTo(540);
  });

  it('put a single digit in a circle when it has a pill', () => {
    const step = makeCounterContent({ from: 1, to: 1, countMs: 0, style: { pill: true } });
    const box = overlayBox(overlay(step), '1:1', measure);
    expect(box?.w).toBeCloseTo(box?.h ?? 0);
  });
});

describe('overlayKey', () => {
  const base = overlay(makeShapeContent('star'));
  const key = overlayKey(base, DESIGN);

  it('changes with anything that changes what is drawn', () => {
    expect(overlayKey(overlay(makeShapeContent('star', { fill: { hex: '#00ff00' } })), DESIGN)).not.toBe(key);
    expect(overlayKey(overlay({ ...makeStickerContent('check'), labels: { label: 'HI' } }), DESIGN))
      .not.toBe(overlayKey(overlay(makeStickerContent('check')), DESIGN));
    expect(overlayKey(overlay(makeCounterContent({ to: 5 })), DESIGN)).not.toBe(overlayKey(overlay(makeCounterContent({ to: 6 })), DESIGN));
    expect(overlayKey(overlay({ ...makeStickerContent('check'), play: 'still' }), DESIGN))
      .not.toBe(overlayKey(overlay(makeStickerContent('check')), DESIGN));
  });

  it('stays the same for the same element', () => {
    expect(overlayKey(overlay(makeShapeContent('star')), DESIGN)).toBe(key);
  });
});

describe('entrances on elements', () => {
  it('pop a sticker in like any other layer', () => {
    const layer = build(overlay(makeStickerContent('check'), { enterAnim: 'popIn' }));
    expect(layer.tracks.scaleX?.[0]?.v).toBeLessThan(1);
  });
});
