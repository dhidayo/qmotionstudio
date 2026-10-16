import { createProps, resolveProps } from '@/core/anim/interpolate';
import { projectDesign, safeBox } from '@/core/render/bounds';
import type { TextMeasureContext } from '@/core/text/layout';
import type { Aspect, Layer, Palette, Size } from '@/core/types';
import type { PhotoInput, SceneInputs } from '@/document/types';
import { createBuildContext } from '@/templates/buildContext';
import type { SceneTemplate } from '@/templates/schema';
import { contentFloor } from '@/templates/_shared/chrome';

/**
 * How clearly a design keeps one photo in focus (D-157) — for tests only.
 *
 * Builds a design with its default sample photos and, every `stepMs`, weighs
 * each visible photo by how much of the frame it takes: on-screen area ×
 * opacity × how squarely it faces the viewer × how bright it is (`shade`
 * darkens). A moment has a clear focus when the heaviest photo outweighs the
 * next by `clear` (1.5 by default).
 *
 * It ignores overlap, so a stack whose top card covers the rest scores lower
 * than it looks; designs like that are allow-listed by the tests that use it.
 */

const MEASURE: TextMeasureContext = {
  font: '',
  letterSpacing: '',
  textBaseline: 'alphabetic',
  measureText: (text: string) => ({ width: text.length * 10 }),
};
const PALETTE: Palette = { bg: '#0c0c11', surface: '#1b1b27', ink: '#f5f5f7', inkMuted: '#9a9aab', accent: '#7c6cf5' };

const photo = (i: number): PhotoInput => ({ mediaId: `m${i}`, frame: '3:4', sizeMode: 'template', sizePct: 100, cropMode: 'template' });

export function sampleInputs(template: SceneTemplate, count = template.photoSlots.default): SceneInputs {
  return {
    photos: Array.from({ length: count }, (_, i) => photo(i)),
    texts: {},
    logo: { mediaId: null, sizePct: 12, placement: 'topLeft', x: 0.5, y: 0.5, opacity: 1, lockup: false, lockupText: '' },
    look: { palette: PALETTE, background: 'gradient', grain: 0, vignette: 0, speed: 1, cornerRadius: 24 },
    styleOverrides: { texts: {} },
    slotTransforms: {},
  };
}

/** A photo's footprint at one moment, centre-anchored, in design units. */
export type Footprint = { readonly id: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly weight: number };

function collect(layers: readonly Layer[], ms: number, ox: number, oy: number, alpha: number, out: Footprint[]): void {
  for (const layer of layers) {
    if (ms < layer.startMs || ms >= layer.endMs) continue;
    const local = ms - layer.startMs;
    const p = resolveProps(layer.tracks, local, createProps());
    const a = alpha * Math.max(0, Math.min(1, p.opacity));
    const light = 1 - Math.max(0, Math.min(1, p.shade));
    if (layer.type === 'group') {
      collect(layer.children, local, ox + p.x, oy + p.y, a, out);
      continue;
    }
    if (layer.type === 'mask') {
      const holdsPhoto = layer.children.some((c) => c.type === 'image');
      if (!holdsPhoto || a <= 0.02) continue;
      const w = layer.props.w * Math.abs(p.scaleX);
      const h = layer.props.h * Math.abs(p.scaleY);
      const open = layer.props.clipFrom ? Math.max(0, Math.min(1, p.clipProgress)) : 1;
      // A photo inside a window is as bright as the photo, not the window.
      const inner = layer.children.find((c) => c.type === 'image');
      const innerShade = inner ? resolveProps(inner.tracks, local - inner.startMs, createProps()).shade : 0;
      out.push({ id: layer.id, x: ox + p.x, y: oy + p.y, w, h, weight: w * h * a * open * (1 - Math.max(0, Math.min(1, innerShade))) });
      continue;
    }
    if (layer.type !== 'image' || a <= 0.02) continue;
    const r = (p.rotation * Math.PI) / 180;
    const facingY = Math.max(0.05, Math.abs(Math.cos((p.turnY * Math.PI) / 180)));
    const facingX = Math.max(0.05, Math.abs(Math.cos((p.turnX * Math.PI) / 180)));
    const w0 = layer.props.w * Math.abs(p.scaleX) * facingY;
    const h0 = layer.props.h * Math.abs(p.scaleY) * facingX;
    const w = Math.abs(w0 * Math.cos(r)) + Math.abs(h0 * Math.sin(r));
    const h = Math.abs(w0 * Math.sin(r)) + Math.abs(h0 * Math.cos(r));
    const ax = (layer.anchorX ?? 0.5) - 0.5;
    const ay = (layer.anchorY ?? 0.5) - 0.5;
    out.push({ id: layer.id, x: ox + p.x - ax * w, y: oy + p.y - ay * h, w, h, weight: w0 * h0 * a * light });
  }
}

/** One measured moment: the heaviest photo, and how many times heavier than the next it is (99 when alone). */
export type FocusMoment = { readonly ms: number; readonly ratio: number; readonly top: Footprint };

export type FocusMeasurement = {
  readonly design: Size;
  /** The safe area's bottom edge for content (above captions and controls). */
  readonly floor: number;
  readonly moments: readonly FocusMoment[];
  /** Share of moments with a clear focus. */
  readonly clearShare: number;
  readonly medianRatio: number;
};

/** Builds `template` at `aspect` and measures its focus from `fromMs` to the end. */
export function measureFocus(
  template: SceneTemplate,
  aspect: Aspect,
  options: { readonly fromMs?: number; readonly stepMs?: number; readonly clear?: number; readonly photos?: number } = {},
): FocusMeasurement {
  const design = projectDesign(aspect);
  const safe = safeBox(design);
  const ctx = createBuildContext({ design, safe, palette: PALETTE, durationMs: template.defaultDurationMs, measureContext: MEASURE });
  const layers = template.build(sampleInputs(template, options.photos), ctx);
  const unit = Math.min(design.w, design.h);
  const clear = options.clear ?? 1.5;
  const moments: FocusMoment[] = [];
  for (let ms = options.fromMs ?? 1200; ms < template.defaultDurationMs; ms += options.stepMs ?? 100) {
    const items: Footprint[] = [];
    collect(layers, ms, 0, 0, 1, items);
    const visible = items
      .map((it) => {
        const l = Math.max(0, it.x - it.w / 2);
        const r = Math.min(design.w, it.x + it.w / 2);
        const t = Math.max(0, it.y - it.h / 2);
        const b = Math.min(design.h, it.y + it.h / 2);
        const share = it.w * it.h > 0 ? (Math.max(0, r - l) * Math.max(0, b - t)) / (it.w * it.h) : 0;
        return { ...it, weight: it.weight * share };
      })
      .filter((it) => it.weight > unit * unit * 0.002)
      .sort((a, b) => b.weight - a.weight);
    const top = visible[0];
    if (!top) continue;
    const second = visible[1];
    moments.push({ ms, ratio: second ? top.weight / second.weight : 99, top });
  }
  const ratios = moments.map((m) => m.ratio).sort((a, b) => a - b);
  return {
    design,
    floor: contentFloor(design, safe),
    moments,
    clearShare: moments.length === 0 ? 0 : moments.filter((m) => m.ratio >= clear).length / moments.length,
    medianRatio: ratios[Math.floor(ratios.length / 2)] ?? 0,
  };
}
