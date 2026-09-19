import { describe, expect, it } from 'vitest';
import type { PhotoInput, SceneInputs } from '@/document/types';
import { DEFAULT_LOOK, DEFAULT_PALETTE, emptySceneInputs } from '@/document/defaults';
import { structureKey, validateTemplate, type SceneTemplate, type Template } from './schema';

const DESIGN = { w: 1080, h: 1920 };

const photo = (over: Partial<PhotoInput> = {}): PhotoInput => ({
  mediaId: 'm1',
  frame: '3:4',
  sizeMode: 'template',
  sizePct: 100,
  cropMode: 'template',
  ...over,
});

const inputs = (over: Partial<SceneInputs> = {}): SceneInputs => ({
  ...emptySceneInputs(),
  photos: [photo()],
  texts: { headline: 'Hello' },
  ...over,
});

const keyOf = (i: SceneInputs): string => structureKey('t', i, '9:16', DESIGN, 10_000);

describe('structureKey — what must NOT invalidate the build (D-006)', () => {
  const base = keyOf(inputs());

  it('ignores palette changes — colours resolve at draw time', () => {
    // The whole point of D-006: dragging a colour picker must repaint, not
    // rebuild, or §3B costs the 16ms build budget sixty times a second.
    const recoloured = inputs({
      look: { ...DEFAULT_LOOK, palette: { ...DEFAULT_PALETTE, accent: '#ff0000' } },
    });
    expect(keyOf(recoloured)).toBe(base);
  });

  it('ignores grain and vignette', () => {
    expect(keyOf(inputs({ look: { ...DEFAULT_LOOK, grain: 0.8, vignette: 0.9 } }))).toBe(base);
  });

  it('ignores the global speed multiplier — it is a time remap, not geometry', () => {
    expect(keyOf(inputs({ look: { ...DEFAULT_LOOK, speed: 2 } }))).toBe(base);
  });

  it('ignores a text colour override', () => {
    const recoloured = inputs({
      styleOverrides: { texts: { headline: { color: '#00ff00', shadow: true, outline: true } } },
    });
    expect(keyOf(recoloured)).toBe(base);
  });

  it('ignores sizePct while the size mode is "template", where it means nothing', () => {
    expect(keyOf(inputs({ photos: [photo({ sizePct: 250 })] }))).toBe(base);
  });
});

describe('structureKey — what MUST invalidate the build', () => {
  const base = keyOf(inputs());

  it('reacts to photo count', () => {
    expect(keyOf(inputs({ photos: [photo(), photo({ mediaId: 'm2' })] }))).not.toBe(base);
  });

  it('reacts to photo order', () => {
    const forward = keyOf(inputs({ photos: [photo(), photo({ mediaId: 'm2' })] }));
    const reversed = keyOf(inputs({ photos: [photo({ mediaId: 'm2' }), photo()] }));
    expect(forward).not.toBe(reversed);
  });

  it('reacts to frame ratio, crop mode and crop rect', () => {
    expect(keyOf(inputs({ photos: [photo({ frame: '16:9' })] }))).not.toBe(base);
    expect(keyOf(inputs({ photos: [photo({ cropMode: 'original' })] }))).not.toBe(base);
    expect(
      keyOf(inputs({ photos: [photo({ cropRect: { x: 0, y: 0, w: 0.5, h: 0.5 } })] })),
    ).not.toBe(base);
  });

  it('reacts to sizePct once the size mode actually uses it', () => {
    const at100 = keyOf(inputs({ photos: [photo({ sizeMode: 'larger', sizePct: 100 })] }));
    const at250 = keyOf(inputs({ photos: [photo({ sizeMode: 'larger', sizePct: 250 })] }));
    expect(at100).not.toBe(at250);
  });

  it('reacts to text content — length changes wrapping', () => {
    expect(keyOf(inputs({ texts: { headline: 'Hello there' } }))).not.toBe(base);
  });

  it('reacts to every text style field that changes measurement', () => {
    const fields = [
      { fontId: 'body' },
      { weight: 700 as const },
      { sizePct: 120 },
      { letterSpacingPct: 4 },
      { wrapWidthPct: 60 },
      { align: 'right' as const },
      { wrap: false },
      { pill: true },
    ];
    for (const field of fields) {
      const changed = inputs({ styleOverrides: { texts: { headline: field } } });
      expect(keyOf(changed), JSON.stringify(field)).not.toBe(base);
    }
  });

  it('reacts to aspect, design size and duration', () => {
    expect(structureKey('t', inputs(), '16:9', DESIGN, 10_000)).not.toBe(base);
    expect(structureKey('t', inputs(), '9:16', { w: 1080, h: 1080 }, 10_000)).not.toBe(base);
    expect(structureKey('t', inputs(), '9:16', DESIGN, 8_000)).not.toBe(base);
  });

  it('reacts to the template id', () => {
    expect(structureKey('other', inputs(), '9:16', DESIGN, 10_000)).not.toBe(base);
  });

  it('reacts to a logo appearing or disappearing', () => {
    expect(keyOf(inputs({ logo: { mediaId: 'logo1' } }))).not.toBe(base);
  });

  it('reacts to background treatment and corner radius', () => {
    expect(keyOf(inputs({ look: { ...DEFAULT_LOOK, background: 'blurredPhoto' } }))).not.toBe(base);
    expect(keyOf(inputs({ look: { ...DEFAULT_LOOK, cornerRadius: 64 } }))).not.toBe(base);
  });

  it('is stable for identical inputs and independent of text slot ordering', () => {
    expect(keyOf(inputs())).toBe(base);
    const a = keyOf(inputs({ texts: { a: '1', b: '2' } }));
    const b = keyOf(inputs({ texts: { b: '2', a: '1' } }));
    expect(a).toBe(b);
  });
});

// ── validateTemplate ────────────────────────────────────────────────────────

const template = (over: Partial<SceneTemplate> = {}): SceneTemplate => ({
  kind: 'scene',
  id: 'demo-one',
  name: 'Demo',
  category: 'Depth Stage',
  mode: 'showcase',
  tier: 'free',
  supportedAspects: ['1:1'],
  defaultDurationMs: 10_000,
  minDurationMs: 3_000,
  maxDurationMs: 30_000,
  designSize: { w: 1080, h: 1080 },
  photoSlots: { min: 1, max: 4, default: 3 },
  textSlots: [{ id: 'headline', label: 'Headline', placeholder: 'Hi', maxChars: 40, defaultStyle: {} }],
  supportsLogo: true,
  look: {
    palettes: [{ id: 'default', label: 'Default', palette: DEFAULT_PALETTE }],
    backgrounds: ['solid'],
    supportsCornerRadius: true,
    supportsGrain: true,
    supportsVignette: true,
  },
  build: () => [],
  ...over,
});

const messages = (t: Template): string[] => validateTemplate(t).map((i) => i.message);

describe('validateTemplate', () => {
  it('passes a well-formed template', () => {
    expect(validateTemplate(template())).toEqual([]);
  });

  it('rejects an id that is not kebab-case', () => {
    expect(messages(template({ id: 'Depth Stage 1' })).join()).toContain('kebab-case');
  });

  it('rejects duplicate aspects', () => {
    expect(messages(template({ supportedAspects: ['1:1', '1:1'] })).join()).toContain('duplicates');
  });

  it('rejects a default duration outside its own bounds', () => {
    expect(messages(template({ defaultDurationMs: 60_000 })).join()).toContain('outside its own');
  });

  it('rejects inverted duration bounds', () => {
    expect(messages(template({ minDurationMs: 20_000, maxDurationMs: 5_000 })).join()).toContain('exceeds');
  });

  it('rejects a default photo count outside its own slots', () => {
    expect(messages(template({ photoSlots: { min: 2, max: 4, default: 9 } })).join()).toContain('outside its own');
  });

  it('rejects more photo slots than §14 budgets for', () => {
    expect(messages(template({ photoSlots: { min: 1, max: 20, default: 3 } })).join()).toContain('above 12');
  });

  it('rejects duplicate text slot ids', () => {
    const slot = { id: 'a', label: 'A', placeholder: '', maxChars: 10, defaultStyle: {} };
    expect(messages(template({ textSlots: [slot, slot] })).join()).toContain('duplicate text slot');
  });

  it('rejects a placeholder longer than the slot allows', () => {
    const slot = { id: 'a', label: 'A', placeholder: 'far too long', maxChars: 4, defaultStyle: {} };
    expect(messages(template({ textSlots: [slot] })).join()).toContain('longer than its own maxChars');
  });

  it('rejects a template with no palettes', () => {
    const look = { ...template().look, palettes: [] };
    expect(messages(template({ look })).join()).toContain('no palettes');
  });

  it('rejects an ad template whose first scene declares a transition (D-004)', () => {
    const ad: Template = {
      kind: 'ad',
      id: 'ad-one',
      name: 'Ad',
      category: 'Depth Stage',
      mode: 'motionAd',
      tier: 'free',
      supportedAspects: ['9:16'],
      defaultDurationMs: 15_000,
      minDurationMs: 5_000,
      maxDurationMs: 35_000,
      scenes: [{ templateId: 'demo-one', durationMs: 5_000, transitionIn: { kind: 'crossFade', durationMs: 400 } }],
    };
    expect(messages(ad).join()).toContain('must not declare a transitionIn');
  });
});
