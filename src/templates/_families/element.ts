import { roleFill, type Keyframe, type Layer, type Reveal, type Tracks } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate, TextSlotDef } from '../schema';
import { backgroundLayer, contentFloor } from '../_shared/chrome';
import { defineScene, headlineSlot, kf, labelSlot, measureSlot, placeText, rect, sublineSlot, sampled } from './kit';

/**
 * Elements (D-119): words with a graphic job to do.
 *
 * A typed search capsule, a call-to-action button that pulses, a stamp, a
 * ticker band, metric cards that count up, a checklist that ticks itself, a
 * countdown, a price tag. Each is a complete scene on its own and a beat in a
 * text-led ad. The graphics are plain shapes in the palette's colours, so they
 * follow any look the person chooses.
 */

type Kind =
  | 'capsule' | 'cta' | 'stamp' | 'marquee' | 'highlight' | 'eq' | 'ribbon' | 'orbit' | 'halo'
  | 'metrics' | 'chips' | 'eyebrow' | 'claim' | 'end' | 'split' | 'countdown' | 'checklist'
  | 'review' | 'progress' | 'date' | 'price';

const KINDS: readonly Kind[] = [
  'capsule', 'cta', 'stamp', 'marquee', 'highlight', 'eq', 'ribbon', 'orbit', 'halo',
  'metrics', 'chips', 'eyebrow', 'claim', 'end', 'split', 'countdown', 'checklist',
  'review', 'progress', 'date', 'price',
];

const RISE = (startMs: number, staggerMs = 90): Reveal => ({ kind: 'kinetic', unit: 'word', motion: 'rise', startMs, durationMs: 600, staggerMs });
const POP = (startMs: number): Reveal => ({ kind: 'kinetic', unit: 'word', motion: 'pop', startMs, durationMs: 520, staggerMs: 70 });
const FADE = (startMs: number): Reveal => ({ kind: 'kinetic', unit: 'line', motion: 'rise', startMs, durationMs: 650, staggerMs: 100 });

/** Repeats a pulse every `everyMs`: a value that grows from `from` to `to` and back to the start. */
function pulse(durationMs: number, everyMs: number, offsetMs: number, from: number, to: number, ease: Keyframe['ease'] = 'outCubic'): Keyframe[] {
  const keys: Keyframe[] = [];
  for (let t = offsetMs; t < durationMs; t += everyMs) {
    keys.push(kf(t, from, 'linear'), kf(t + everyMs * 0.98, to, ease));
  }
  return keys.length > 0 ? keys : [kf(0, from)];
}

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const kind = pick<Kind>(p, 'kind', KINDS, 'cta');
  const headline = headlineSlot(text(p, 'headline', 'Your headline here'), {}, 80);
  const subline = sublineSlot(text(p, 'subline', 'A line that explains it'));
  const label = (id: string, labelName: string, fallback: string, maxChars = 40): TextSlotDef => labelSlot(id, labelName, text(p, id, fallback), {}, maxChars);

  const slots: TextSlotDef[] = [headline];
  const extra: Record<Kind, TextSlotDef[]> = {
    capsule: [label('button', 'Button', 'Start now')],
    cta: [subline, label('button', 'Button', 'Get started')],
    stamp: [label('ring', 'Around the seal', 'CERTIFIED')],
    marquee: [],
    highlight: [subline],
    eq: [subline],
    ribbon: [subline],
    orbit: [subline],
    halo: [subline],
    metrics: [label('stat1', 'First number', '98%'), label('label1', 'First label', 'satisfaction'), label('stat2', 'Second number', '2,400+'), label('label2', 'Second label', 'clients'), label('stat3', 'Third number', '24/7'), label('label3', 'Third label', 'support')],
    chips: [label('chips', 'Chips, separated by commas', 'Design, Strategy, Video, Social, Web, Brand', 120)],
    eyebrow: [label('eyebrow', 'Small line above', 'INTRODUCING'), subline],
    claim: [label('promise', 'Promise', 'Guaranteed')],
    end: [label('brand', 'Brand name', 'Your Brand'), label('button', 'Button', 'Learn more'), label('site', 'Website', 'yourbrand.com')],
    split: [subline],
    countdown: [subline],
    checklist: [label('item1', 'First item', 'Free consultation'), label('item2', 'Second item', 'Fast delivery'), label('item3', 'Third item', 'Lifetime support')],
    review: [label('name', 'Name', 'Daniel Mensah, Founder'), label('stars', 'Stars', '★★★★★')],
    progress: [label('value', 'Percentage', '87%'), subline],
    date: [label('day', 'Day', '24'), label('month', 'Month', 'OCT'), subline],
    price: [label('price', 'Price', '$49'), label('was', 'Was', '$79')],
  };
  slots.push(...extra[kind]);

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { design, safe, durationMs } = ctx;
    const u = Math.min(design.w, design.h);
    const cx = design.w / 2;
    const cy = design.h / 2;
    const layers: Layer[] = [backgroundLayer(inputs, ctx)];
    const slot = (id: string): TextSlotDef => slots.find((s) => s.id === id) ?? headline;
    const words = (id: string): string => inputs.texts[id] ?? slot(id).placeholder;

    switch (kind) {
      case 'capsule': {
        // A frosted search capsule types the headline; a button lands inside it.
        const size = u * 0.04;
        const capW = Math.min(safe.w, u * 0.92);
        const capH = u * 0.13;
        layers.push(rect(ctx, 'capsule', {
          w: capW, h: capH, x: cx, y: cy, radius: capH / 2, fill: roleFill('surface', 0.9),
          stroke: { paint: roleFill('ink', 0.15), width: Math.max(2, u * 0.003) },
          tracks: { scaleX: [kf(150, 0.18), kf(800, 1, 'outExpo')], opacity: [kf(100, 0), kf(400, 1)] },
        }));
        const btnW = capW * 0.27;
        // The question gets the room beside the button, centred in the capsule.
        const roomW = capW - btnW - capH * 0.75;
        const asked = measureSlot(ctx, headline, inputs, size, roomW, 1.05);
        const typed = placeText(ctx, headline, inputs, {
          sizePx: size, maxWidthPx: roomW, x: cx - capW / 2 + capH * 0.45, y: cy - asked.height / 2, anchorX: 0, lineHeight: 1.05,
          reveal: { kind: 'kinetic', unit: 'char', motion: 'typewriter', startMs: 850, durationMs: 1, staggerMs: 48, caret: true },
        });
        layers.push(typed.layer);
        const btnH = capH * 0.7;
        const btnX = cx + capW / 2 - capH * 0.15 - btnW / 2;
        const landAt = Math.round(durationMs * 0.5);
        layers.push(rect(ctx, 'button', {
          w: btnW, h: btnH, x: btnX, y: cy, radius: btnH / 2, fill: roleFill('accent'),
          tracks: { scaleX: [kf(landAt, 0), kf(landAt + 450, 1, 'outBack')], scaleY: [kf(landAt, 0), kf(landAt + 450, 1, 'outBack')] },
        }));
        layers.push(placeText(ctx, slot('button'), inputs, {
          sizePx: u * 0.032, maxWidthPx: btnW * 0.9, x: btnX, y: cy - u * 0.02, fill: roleFill('bg'), reveal: FADE(landAt + 250),
        }).layer);
        for (let i = 0; i < 2; i++) {
          layers.push(rect(ctx, 'ring', {
            w: btnW, h: btnH, x: btnX, y: cy, radius: btnH / 2, fill: roleFill('accent', 0),
            stroke: { paint: roleFill('accent', 0.7), width: Math.max(2, u * 0.003) }, startMs: landAt + 400 + i * 350,
            tracks: { scaleX: [kf(0, 1), kf(900, 1.5)], scaleY: [kf(0, 1), kf(900, 1.9)], opacity: [kf(0, 0.9), kf(900, 0)] },
            endMs: landAt + 1300 + i * 350,
          }));
        }
        break;
      }

      case 'cta': {
        const headTop = cy - u * 0.2;
        layers.push(placeText(ctx, headline, inputs, { sizePx: u * 0.085, maxWidthPx: safe.w * 0.9, x: cx, y: headTop, reveal: RISE(250) }).layer);
        const sub = measureSlot(ctx, headline, inputs, u * 0.085, safe.w * 0.9);
        layers.push(placeText(ctx, subline, inputs, { sizePx: u * 0.035, maxWidthPx: safe.w * 0.85, x: cx, y: headTop + sub.height + u * 0.03, fill: roleFill('inkMuted'), reveal: FADE(900) }).layer);
        const btnW = u * 0.42;
        const btnH = u * 0.11;
        const btnY = cy + u * 0.17;
        const at = Math.round(Math.min(1600, durationMs * 0.35));
        // Pulse rings behind the button, once it is there.
        for (let i = 0; i < 3; i++) {
          layers.push(rect(ctx, 'pulse', {
            w: btnW, h: btnH, x: cx, y: btnY, radius: btnH / 2, fill: roleFill('accent', 0), stroke: { paint: roleFill('accent', 0.55), width: Math.max(2, u * 0.003) },
            tracks: { scaleX: pulse(durationMs, 1500, at + 500 + i * 500, 1, 1.35), scaleY: pulse(durationMs, 1500, at + 500 + i * 500, 1, 1.9), opacity: pulse(durationMs, 1500, at + 500 + i * 500, 0.8, 0) },
          }));
        }
        layers.push(rect(ctx, 'button', {
          w: btnW, h: btnH, x: cx, y: btnY, radius: btnH / 2, fill: roleFill('accent', 0.18), stroke: { paint: roleFill('accent'), width: Math.max(2, u * 0.004) },
          tracks: { scaleX: [kf(at, 0), kf(at + 500, 1, 'outBack')], scaleY: [kf(at, 0), kf(at + 500, 1, 'outBack')] },
        }));
        // The fill wipes left to right, as if pressed.
        layers.push(rect(ctx, 'fill', {
          w: btnW, h: btnH, x: cx - btnW / 2, y: btnY, anchorX: 0, radius: btnH / 2, fill: roleFill('accent'),
          tracks: { scaleX: [kf(at + 500, 0.001), kf(at + 1100, 1, 'inOutCubic')] },
        }));
        layers.push(placeText(ctx, slot('button'), inputs, { sizePx: u * 0.04, maxWidthPx: btnW * 0.9, x: cx, y: btnY - u * 0.026, fill: roleFill('bg'), reveal: FADE(at + 700) }).layer);
        break;
      }

      case 'stamp': {
        const r = u * 0.24;
        const at = 400;
        layers.push(rect(ctx, 'seal', {
          w: r * 2, h: r * 2, x: cx, y: cy, ellipse: true, fill: roleFill('accent'),
          tracks: { scaleX: [kf(at, 1.8), kf(at + 380, 1, 'outBack')], scaleY: [kf(at, 1.8), kf(at + 380, 1, 'outBack')], opacity: [kf(at, 0), kf(at + 200, 1)], rotation: [kf(at, -18), kf(at + 380, 0, 'outBack')] },
        }));
        layers.push(rect(ctx, 'sealEdge', {
          w: r * 1.78, h: r * 1.78, x: cx, y: cy, ellipse: true, fill: roleFill('accent', 0), stroke: { paint: roleFill('bg', 0.5), width: Math.max(2, u * 0.004) },
          tracks: { opacity: [kf(at + 300, 0), kf(at + 600, 1)] },
        }));
        // Ticks round the seal, turning slowly.
        const ticks = 28;
        for (let i = 0; i < ticks; i++) {
          const a0 = (i / ticks) * Math.PI * 2;
          layers.push(rect(ctx, 'tick', {
            w: u * 0.012, h: u * 0.03, x: cx, y: cy, fill: roleFill('accent'),
            tracks: {
              ...sampled(0, durationMs, 120, (ms) => {
                const a = a0 + (ms / durationMs) * Math.PI * 0.6;
                return { x: cx + Math.cos(a) * r * 1.22, y: cy + Math.sin(a) * r * 1.22, rotation: (a * 180) / Math.PI + 90, opacity: Math.min(1, Math.max(0, (ms - at - 200 - i * 12) / 300)) };
              }),
            },
          }));
        }
        layers.push(placeText(ctx, slot('ring'), inputs, { sizePx: u * 0.028, maxWidthPx: r * 1.5, x: cx, y: cy - r * 0.62, fill: roleFill('bg'), reveal: FADE(at + 500) }).layer);
        layers.push(placeText(ctx, headline, inputs, { sizePx: u * 0.06, maxWidthPx: r * 1.5, x: cx, y: cy - u * 0.045, fill: roleFill('bg'), reveal: POP(at + 450) }).layer);
        break;
      }

      case 'marquee': {
        // A band across the frame with the line running along it, end to end.
        const angle = -7;
        const bandH = u * 0.17;
        const rad = (angle * Math.PI) / 180;
        layers.push(rect(ctx, 'band', {
          w: Math.hypot(design.w, design.h) * 1.2, h: bandH, x: cx, y: cy, fill: roleFill('accent'),
          tracks: { rotation: [kf(0, angle)], scaleY: [kf(100, 0), kf(600, 1, 'outExpo')] },
        }));
        const size = u * 0.08;
        const run = measureSlot(ctx, headline, inputs, size, 100_000);
        const sepW = size * 1.2;
        const step = run.width + sepW;
        const span = Math.hypot(design.w, design.h) * 1.3;
        const copies = Math.ceil(span / step) + 2;
        const speed = step / 2400; // one phrase every 2.4s
        for (let i = 0; i < copies; i++) {
          const isFirst = i === 0;
          const tracks = sampled(0, durationMs, 100, (ms) => {
            let along = -span / 2 + i * step - ((ms * speed) % step);
            if (along < -span / 2 - step) along += copies * step;
            return { x: cx + Math.cos(rad) * along, y: cy + Math.sin(rad) * along - size * 0.62, rotation: angle };
          });
          const placed = placeText(ctx, headline, inputs, {
            sizePx: size, maxWidthPx: run.width + 4, x: 0, y: 0, anchorX: 0, fill: roleFill('bg'), reveal: { kind: 'fade', startMs: 300, durationMs: 400 }, tracks,
          });
          // Only the first copy is the editable original; the rest repeat its words.
          layers.push(isFirst ? placed.layer : unslotted(placed.layer, words('headline')));
        }
        break;
      }

      case 'highlight': {
        const size = u * 0.1;
        const head = measureSlot(ctx, headline, inputs, size, safe.w * 0.9);
        const top = cy - head.height / 2 - u * 0.04;
        layers.push(rect(ctx, 'marker', {
          w: Math.min(safe.w * 0.94, head.width + u * 0.06), h: head.height + u * 0.02, x: cx - Math.min(safe.w * 0.94, head.width + u * 0.06) / 2, y: top - u * 0.01, anchorX: 0, anchorY: 0,
          fill: roleFill('accent'), radius: u * 0.01,
          tracks: { scaleX: [kf(250, 0.001), kf(900, 1, 'inOutCubic')] },
        }));
        layers.push(placeText(ctx, headline, inputs, { sizePx: size, maxWidthPx: safe.w * 0.9, x: cx, y: top, fill: roleFill('bg'), reveal: { kind: 'maskWipe', dir: 'right', startMs: 450, durationMs: 650 } }).layer);
        layers.push(placeText(ctx, subline, inputs, { sizePx: u * 0.036, maxWidthPx: safe.w * 0.85, x: cx, y: top + head.height + u * 0.06, fill: roleFill('inkMuted'), reveal: FADE(1200) }).layer);
        break;
      }

      case 'eq': {
        const bars = 18;
        const barW = (safe.w / bars) * 0.6;
        const floor = contentFloor(design, safe);
        for (let i = 0; i < bars; i++) {
          const x = safe.x + (i + 0.5) * (safe.w / bars);
          const phase = i * 0.7;
          layers.push(rect(ctx, 'bar', {
            w: barW, h: u * 0.5, x, y: floor, anchorY: 1, radius: barW / 2, fill: roleFill('accent', 0.5 + (i % 3) * 0.15),
            tracks: sampled(0, durationMs, 80, (ms) => ({ x, y: floor, scaleY: 0.15 + 0.85 * Math.abs(Math.sin(ms / 260 + phase) * Math.sin(ms / 610 + phase * 0.5)) * Math.min(1, ms / 500) })),
          }));
        }
        const size = u * 0.09;
        const head = measureSlot(ctx, headline, inputs, size, safe.w * 0.88);
        const top = safe.y + (floor - u * 0.5 - safe.y) / 2 - head.height / 2;
        layers.push(placeText(ctx, headline, inputs, { sizePx: size, maxWidthPx: safe.w * 0.88, x: cx, y: top, reveal: RISE(300) }).layer);
        layers.push(placeText(ctx, subline, inputs, { sizePx: u * 0.036, maxWidthPx: safe.w * 0.85, x: cx, y: top + head.height + u * 0.03, fill: roleFill('inkMuted'), reveal: FADE(1000) }).layer);
        break;
      }

      case 'ribbon': {
        const angle = -10;
        const bandH = u * 0.22;
        const w = Math.hypot(design.w, design.h) * 1.1;
        layers.push(rect(ctx, 'ribbon', {
          w, h: bandH, x: cx, y: cy, fill: roleFill('accent'),
          tracks: { rotation: [kf(0, angle)], x: [kf(150, cx - w), kf(900, cx, 'outExpo')] },
        }));
        const size = u * 0.085;
        layers.push(placeText(ctx, headline, inputs, {
          sizePx: size, maxWidthPx: safe.w * 0.9, x: cx, y: cy - size * 0.6, fill: roleFill('bg'), reveal: POP(800),
          tracks: { rotation: [kf(0, angle)] },
        }).layer);
        layers.push(placeText(ctx, subline, inputs, { sizePx: u * 0.036, maxWidthPx: safe.w * 0.85, x: cx, y: cy + bandH * 0.9, fill: roleFill('inkMuted'), reveal: FADE(1300) }).layer);
        break;
      }

      case 'orbit':
      case 'halo': {
        const r = u * 0.3;
        if (kind === 'orbit') {
          for (const [i, scale] of [0.85, 1.15].entries()) {
            layers.push(rect(ctx, 'ring', {
              w: r * 2 * scale, h: r * 2 * scale * 0.42, x: cx, y: cy, ellipse: true, fill: roleFill('accent', 0), stroke: { paint: roleFill('accent', 0.55), width: Math.max(2, u * 0.003) },
              tracks: { rotation: [kf(0, i === 0 ? -14 : 12)], scaleX: [kf(200 + i * 150, 0.4), kf(900 + i * 150, 1, 'outExpo')], opacity: [kf(200 + i * 150, 0), kf(700 + i * 150, 1)] },
            }));
            for (let d = 0; d < 2; d++) {
              const tilt = ((i === 0 ? -14 : 12) * Math.PI) / 180;
              layers.push(rect(ctx, 'moon', {
                w: u * 0.03, h: u * 0.03, x: cx, y: cy, ellipse: true, fill: roleFill('accent'),
                tracks: sampled(0, durationMs, 60, (ms) => {
                  const a = (ms / 2600) * Math.PI * 2 * (i === 0 ? 1 : -0.7) + d * Math.PI;
                  const ex = Math.cos(a) * r * scale;
                  const ey = Math.sin(a) * r * scale * 0.42;
                  return { x: cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), y: cy + ex * Math.sin(tilt) + ey * Math.cos(tilt), opacity: Math.min(1, Math.max(0, (ms - 800) / 400)), z: Math.sin(a) };
                }),
              }));
            }
          }
        } else {
          for (let i = 0; i < 5; i++) {
            layers.push(rect(ctx, 'halo', {
              w: r * 2, h: r * 2, x: cx, y: cy, ellipse: true, fill: roleFill('accent', 0), stroke: { paint: roleFill('accent', 0.7), width: Math.max(2, u * 0.004) },
              tracks: { scaleX: pulse(durationMs, 2500, i * 500, 0.25, 1.8, 'outQuad'), scaleY: pulse(durationMs, 2500, i * 500, 0.25, 1.8, 'outQuad'), opacity: pulse(durationMs, 2500, i * 500, 0.9, 0, 'inQuad') },
            }));
          }
        }
        const size = u * 0.075;
        const head = measureSlot(ctx, headline, inputs, size, r * 1.6);
        layers.push(placeText(ctx, headline, inputs, { sizePx: size, maxWidthPx: r * 1.6, x: cx, y: cy - head.height / 2, reveal: { kind: 'kinetic', unit: 'line', motion: 'focus', startMs: 400, durationMs: 900, staggerMs: 120 } }).layer);
        layers.push(placeText(ctx, subline, inputs, { sizePx: u * 0.034, maxWidthPx: safe.w * 0.85, x: cx, y: cy + r * 1.05, fill: roleFill('inkMuted'), reveal: FADE(1200) }).layer);
        break;
      }

      case 'metrics': {
        const tall = design.h > design.w * 1.15;
        const head = placeText(ctx, headline, inputs, { sizePx: u * 0.065, maxWidthPx: safe.w * 0.9, x: cx, y: safe.y + u * 0.02, reveal: RISE(200) });
        layers.push(head.layer);
        const top = safe.y + u * 0.02 + head.height + u * 0.06;
        const bottom = contentFloor(design, safe);
        const n = 3;
        const gap = u * 0.03;
        const cardW = tall ? safe.w * 0.86 : (safe.w - gap * (n - 1)) / n;
        const cardH = tall ? Math.min(u * 0.3, (bottom - top - gap * (n - 1)) / n) : Math.min(u * 0.42, bottom - top);
        for (let i = 0; i < n; i++) {
          const x = tall ? cx : safe.x + cardW / 2 + i * (cardW + gap);
          const y = tall ? top + cardH / 2 + i * (cardH + gap) : top + cardH / 2;
          const at = 700 + i * 260;
          const rise: Tracks = { y: [kf(at, y + u * 0.06), kf(at + 600, y, 'outExpo')], opacity: [kf(at, 0), kf(at + 400, 1)] };
          layers.push(rect(ctx, 'card', { w: cardW, h: cardH, x, y, radius: u * 0.025, fill: roleFill('surface', 0.85), stroke: { paint: roleFill('ink', 0.12), width: Math.max(1, u * 0.002) }, tracks: rise }));
          layers.push(placeText(ctx, slot(`stat${i + 1}`), inputs, {
            sizePx: u * (tall ? 0.085 : 0.075), maxWidthPx: cardW * 0.9, x, y: y - cardH * 0.28, fill: roleFill('accent'),
            reveal: { kind: 'count', startMs: at + 200, durationMs: 1500 }, tracks: { opacity: [kf(at, 0), kf(at + 400, 1)] },
          }).layer);
          layers.push(placeText(ctx, slot(`label${i + 1}`), inputs, {
            sizePx: u * 0.032, maxWidthPx: cardW * 0.85, x, y: y + cardH * 0.14, fill: roleFill('inkMuted'), reveal: FADE(at + 500),
          }).layer);
        }
        break;
      }

      case 'chips': {
        const head = placeText(ctx, headline, inputs, { sizePx: u * 0.07, maxWidthPx: safe.w * 0.9, x: cx, y: safe.y + (design.h - safe.y * 2) * 0.22, reveal: RISE(200) });
        layers.push(head.layer);
        const items = words('chips').split(',').map((w) => w.trim()).filter((w) => w.length > 0).slice(0, 9);
        const size = u * 0.044;
        const chipH = size * 2.2;
        // Wrapped into rows that fit the safe width.
        const widths = items.map((w) => w.length * size * 0.56 + size * 1.6);
        const rows: { item: string; w: number }[][] = [[]];
        let rowW = 0;
        items.forEach((item, i) => {
          const w = widths[i] ?? 0;
          const row = rows[rows.length - 1];
          if (row && rowW + w > safe.w * 0.92 && row.length > 0) { rows.push([]); rowW = 0; }
          rows[rows.length - 1]?.push({ item, w });
          rowW += w + size * 0.6;
        });
        let y = safe.y + (design.h - safe.y * 2) * 0.22 + head.height + u * 0.08;
        let k = 0;
        for (const row of rows) {
          const total = row.reduce((sum, c) => sum + c.w, 0) + size * 0.6 * (row.length - 1);
          let x = cx - total / 2;
          for (const chip of row) {
            const at = 700 + k * 140;
            const centre = x + chip.w / 2;
            const bob = sampled(0, durationMs, 100, (ms) => ({ x: centre, y: y + Math.sin(ms / 700 + k) * u * 0.006 * Math.min(1, Math.max(0, (ms - at - 500) / 400)), scale: ms < at ? 0 : ms < at + 450 ? Math.min(1.08, ((ms - at) / 450) * 1.12) : 1 }));
            layers.push(rect(ctx, 'chip', { w: chip.w, h: chipH, x: centre, y, radius: chipH / 2, fill: k % 3 === 0 ? roleFill('accent') : roleFill('surface'), stroke: { paint: roleFill('ink', 0.14), width: Math.max(1, u * 0.002) }, tracks: bob }));
            const label = placeText(ctx, slot('chips'), inputs, { sizePx: size, maxWidthPx: chip.w, x: centre, y: y - size * 0.62, fill: k % 3 === 0 ? roleFill('bg') : roleFill('ink'), reveal: { kind: 'fade', startMs: at + 150, durationMs: 300 }, tracks: { ...bob, y: (bob.y ?? []).map((key) => ({ ...key, v: key.v - size * 0.62 })) } });
            layers.push(unslotted(label.layer, chip.item));
            x += chip.w + size * 0.6;
            k += 1;
          }
          y += chipH + size * 0.7;
        }
        break;
      }

      case 'eyebrow':
      case 'claim':
      case 'split':
      case 'countdown': {
        const size = u * 0.095;
        const head = measureSlot(ctx, headline, inputs, size, safe.w * 0.9);
        const top = cy - head.height / 2;
        if (kind === 'split') {
          const half = design.w / 2;
          for (const side of [-1, 1]) {
            layers.push(rect(ctx, 'door', {
              w: half, h: design.h, x: side < 0 ? 0 : design.w, y: 0, anchorX: side < 0 ? 0 : 1, anchorY: 0, fill: roleFill('surface'),
              tracks: { x: [kf(500, side < 0 ? 0 : design.w), kf(1300, side < 0 ? -half : design.w + half, 'inOutCubic')] },
            }));
          }
          // The seam the doors open along.
          layers.push(rect(ctx, 'seam', { w: Math.max(3, u * 0.006), h: design.h, x: cx, y: cy, fill: roleFill('accent'), tracks: { scaleY: [kf(0, 0), kf(450, 1, 'outExpo')], opacity: [kf(500, 1), kf(800, 0)] } }));
        }
        if (kind === 'eyebrow') {
          layers.push(placeText(ctx, slot('eyebrow'), inputs, { sizePx: u * 0.032, maxWidthPx: safe.w * 0.8, x: cx, y: top - u * 0.08, fill: roleFill('accent'), reveal: { kind: 'kinetic', unit: 'char', motion: 'rise', startMs: 200, durationMs: 400, staggerMs: 25 } }).layer);
        }
        if (kind === 'countdown') {
          const numbers = ['3', '2', '1'];
          const each = Math.min(700, durationMs * 0.14);
          numbers.forEach((n, i) => {
            const at = 200 + i * each;
            layers.push({
              id: ctx.id('count'), type: 'text', startMs: at, endMs: at + each, anchorX: 0.5, anchorY: 0,
              tracks: { x: [kf(0, cx)], y: [kf(0, cy - u * 0.16)], scaleX: [kf(0, 1.6), kf(each * 0.5, 1, 'outBack')], scaleY: [kf(0, 1.6), kf(each * 0.5, 1, 'outBack')], opacity: [kf(0, 0), kf(120, 1), kf(each - 120, 1), kf(each, 0)] },
              props: { text: n, fontId: 'headline', fontSizePx: u * 0.28, weight: 800, letterSpacingPct: 0, lineHeight: 1, align: 'center', fill: roleFill('accent'), maxWidthPx: u * 0.5, reveal: { kind: 'none' } },
            });
          });
          const after = 200 + numbers.length * each;
          layers.push(placeText(ctx, headline, inputs, { sizePx: size, maxWidthPx: safe.w * 0.9, x: cx, y: top, startMs: after, reveal: { kind: 'kinetic', unit: 'word', motion: 'zoom', startMs: 0, durationMs: 600, staggerMs: 80 } }).layer);
          layers.push(placeText(ctx, subline, inputs, { sizePx: u * 0.036, maxWidthPx: safe.w * 0.85, x: cx, y: top + head.height + u * 0.035, fill: roleFill('inkMuted'), reveal: FADE(after + 500) }).layer);
          break;
        }
        layers.push(placeText(ctx, headline, inputs, { sizePx: size, maxWidthPx: safe.w * 0.9, x: cx, y: top, reveal: kind === 'split' ? { kind: 'kinetic', unit: 'line', motion: 'zoom', startMs: 700, durationMs: 800, staggerMs: 150 } : RISE(450) }).layer);
        if (kind === 'eyebrow') {
          layers.push(rect(ctx, 'rule', { w: u * 0.16, h: Math.max(4, u * 0.008), x: cx, y: top + head.height + u * 0.04, fill: roleFill('accent'), tracks: { scaleX: [kf(1000, 0), kf(1600, 1, 'outExpo')] } }));
        }
        if (kind === 'claim') {
          const at = Math.round(durationMs * 0.45);
          const pillW = u * 0.4;
          const pillH = u * 0.1;
          const py = top + head.height + u * 0.1;
          layers.push(rect(ctx, 'pill', { w: pillW, h: pillH, x: cx, y: py, radius: pillH / 2, fill: roleFill('accent'), tracks: { scaleX: [kf(at, 2.2), kf(at + 320, 1, 'outBack')], scaleY: [kf(at, 2.2), kf(at + 320, 1, 'outBack')], opacity: [kf(at, 0), kf(at + 150, 1)], rotation: [kf(at, -8), kf(at + 320, -3, 'outBack')] } }));
          layers.push(placeText(ctx, slot('promise'), inputs, { sizePx: u * 0.042, maxWidthPx: pillW * 0.9, x: cx, y: py - u * 0.028, fill: roleFill('bg'), reveal: FADE(at + 200), tracks: { rotation: [kf(0, -3)] } }).layer);
        }
        if (kind === 'eyebrow' || kind === 'split') {
          layers.push(placeText(ctx, subline, inputs, { sizePx: u * 0.036, maxWidthPx: safe.w * 0.85, x: cx, y: top + head.height + u * (kind === 'eyebrow' ? 0.09 : 0.04), fill: roleFill('inkMuted'), reveal: FADE(1500) }).layer);
        }
        break;
      }

      case 'end': {
        const at = 300;
        const brand = placeText(ctx, slot('brand'), inputs, { sizePx: u * 0.05, maxWidthPx: safe.w * 0.8, x: cx, y: cy - u * 0.2, fill: roleFill('accent'), reveal: { kind: 'kinetic', unit: 'char', motion: 'rise', startMs: at, durationMs: 400, staggerMs: 30 } });
        layers.push(brand.layer);
        const head = placeText(ctx, headline, inputs, { sizePx: u * 0.08, maxWidthPx: safe.w * 0.9, x: cx, y: cy - u * 0.11, reveal: RISE(at + 400) });
        layers.push(head.layer);
        const btnW = u * 0.36;
        const btnH = u * 0.095;
        const by = cy - u * 0.11 + head.height + u * 0.1;
        layers.push(rect(ctx, 'button', { w: btnW, h: btnH, x: cx, y: by, radius: btnH / 2, fill: roleFill('accent'), tracks: { scaleX: [kf(at + 1000, 0), kf(at + 1450, 1, 'outBack')], scaleY: [kf(at + 1000, 0), kf(at + 1450, 1, 'outBack')] } }));
        layers.push(placeText(ctx, slot('button'), inputs, { sizePx: u * 0.036, maxWidthPx: btnW * 0.9, x: cx, y: by - u * 0.023, fill: roleFill('bg'), reveal: FADE(at + 1300) }).layer);
        layers.push(placeText(ctx, slot('site'), inputs, { sizePx: u * 0.03, maxWidthPx: safe.w * 0.8, x: cx, y: by + btnH, fill: roleFill('inkMuted'), reveal: FADE(at + 1700) }).layer);
        break;
      }

      case 'checklist': {
        const head = placeText(ctx, headline, inputs, { sizePx: u * 0.07, maxWidthPx: safe.w * 0.9, x: cx, y: cy - u * 0.3, reveal: RISE(200) });
        layers.push(head.layer);
        const rowH = u * 0.12;
        const left = cx - u * 0.33;
        for (let i = 0; i < 3; i++) {
          const y = cy - u * 0.3 + head.height + u * 0.09 + i * rowH;
          const at = 900 + i * Math.min(700, durationMs * 0.14);
          const box = u * 0.06;
          layers.push(rect(ctx, 'box', { w: box, h: box, x: left, y, radius: u * 0.012, fill: roleFill('accent', 0.12), stroke: { paint: roleFill('accent'), width: Math.max(2, u * 0.004) }, tracks: { opacity: [kf(at - 300, 0), kf(at, 1)] } }));
          // The tick: a short stroke then a long one, drawn in turn.
          layers.push(rect(ctx, 'tickShort', { w: box * 0.32, h: Math.max(3, u * 0.008), x: left - box * 0.22, y: y + box * 0.05, anchorX: 0, radius: u * 0.004, fill: roleFill('accent'), tracks: { rotation: [kf(0, 45)], scaleX: [kf(at, 0), kf(at + 160, 1)] } }));
          layers.push(rect(ctx, 'tickLong', { w: box * 0.56, h: Math.max(3, u * 0.008), x: left - box * 0.02, y: y + box * 0.2, anchorX: 0, radius: u * 0.004, fill: roleFill('accent'), tracks: { rotation: [kf(0, -50)], scaleX: [kf(at + 160, 0), kf(at + 360, 1)] } }));
          layers.push(placeText(ctx, slot(`item${i + 1}`), inputs, { sizePx: u * 0.045, maxWidthPx: u * 0.6, x: left + box, y: y - u * 0.028, anchorX: 0, reveal: { kind: 'kinetic', unit: 'line', motion: 'slideRight', startMs: at - 200, durationMs: 500, staggerMs: 0 } }).layer);
        }
        break;
      }

      case 'review': {
        const cardW = Math.min(safe.w, u * 0.86);
        const size = u * 0.05;
        const head = measureSlot(ctx, headline, inputs, size, cardW * 0.82, 1.25);
        const cardH = head.height + u * 0.32;
        layers.push(rect(ctx, 'card', { w: cardW, h: cardH, x: cx, y: cy, radius: u * 0.03, fill: roleFill('surface', 0.92), stroke: { paint: roleFill('ink', 0.1), width: Math.max(1, u * 0.002) }, tracks: { y: [kf(100, cy + u * 0.08), kf(800, cy, 'outExpo')], opacity: [kf(100, 0), kf(500, 1)] } }));
        layers.push(placeText(ctx, slot('stars'), inputs, { sizePx: u * 0.045, maxWidthPx: cardW * 0.8, x: cx, y: cy - cardH / 2 + u * 0.05, fill: roleFill('accent'), reveal: { kind: 'kinetic', unit: 'char', motion: 'pop', startMs: 700, durationMs: 350, staggerMs: 110 } }).layer);
        layers.push(placeText(ctx, headline, inputs, { sizePx: size, maxWidthPx: cardW * 0.82, x: cx, y: cy - cardH / 2 + u * 0.13, lineHeight: 1.25, reveal: { kind: 'kinetic', unit: 'word', motion: 'focus', startMs: 1100, durationMs: 600, staggerMs: 60 } }).layer);
        layers.push(placeText(ctx, slot('name'), inputs, { sizePx: u * 0.03, maxWidthPx: cardW * 0.8, x: cx, y: cy + cardH / 2 - u * 0.09, fill: roleFill('inkMuted'), reveal: FADE(1900) }).layer);
        break;
      }

      case 'progress': {
        const head = placeText(ctx, headline, inputs, { sizePx: u * 0.07, maxWidthPx: safe.w * 0.9, x: cx, y: cy - u * 0.24, reveal: RISE(200) });
        layers.push(head.layer);
        const trackW = Math.min(safe.w * 0.9, u * 0.8);
        const trackH = u * 0.035;
        const ty = cy + u * 0.06;
        const pct = Math.max(0, Math.min(100, Number((words('value').match(/\d+(\.\d+)?/) ?? ['0'])[0]))) / 100;
        layers.push(rect(ctx, 'track', { w: trackW, h: trackH, x: cx, y: ty, radius: trackH / 2, fill: roleFill('ink', 0.12) }));
        layers.push(rect(ctx, 'fill', { w: trackW, h: trackH, x: cx - trackW / 2, y: ty, anchorX: 0, radius: trackH / 2, fill: roleFill('accent'), tracks: { scaleX: [kf(800, 0.001), kf(2600, Math.max(0.001, pct), 'outCubic')] } }));
        layers.push(placeText(ctx, slot('value'), inputs, { sizePx: u * 0.11, maxWidthPx: safe.w * 0.6, x: cx, y: ty + trackH + u * 0.04, fill: roleFill('accent'), reveal: { kind: 'count', startMs: 800, durationMs: 1800 } }).layer);
        layers.push(placeText(ctx, subline, inputs, { sizePx: u * 0.034, maxWidthPx: safe.w * 0.85, x: cx, y: ty + trackH + u * 0.2, fill: roleFill('inkMuted'), reveal: FADE(2200) }).layer);
        break;
      }

      case 'date': {
        const cardW = u * 0.34;
        const cardH = u * 0.38;
        const cardY = cy - u * 0.14;
        const slide: Tracks = { y: [kf(100, cardY - u * 0.1), kf(800, cardY, 'outBack')], opacity: [kf(100, 0), kf(400, 1)] };
        layers.push(rect(ctx, 'card', { w: cardW, h: cardH, x: cx, y: cardY, radius: u * 0.03, fill: roleFill('surface'), stroke: { paint: roleFill('ink', 0.12), width: Math.max(1, u * 0.002) }, tracks: slide }));
        layers.push(rect(ctx, 'cardTop', { w: cardW, h: cardH * 0.26, x: cx, y: cardY - cardH / 2, anchorY: 0, radius: u * 0.03, fill: roleFill('accent'), tracks: { y: (slide.y ?? []).map((key) => ({ ...key, v: key.v - cardH / 2 })), opacity: slide.opacity ?? [] } }));
        layers.push(placeText(ctx, slot('month'), inputs, { sizePx: u * 0.045, maxWidthPx: cardW, x: cx, y: cardY - cardH / 2 + cardH * 0.04, fill: roleFill('bg'), reveal: FADE(700) }).layer);
        layers.push(placeText(ctx, slot('day'), inputs, { sizePx: u * 0.17, maxWidthPx: cardW, x: cx, y: cardY - cardH * 0.16, reveal: { kind: 'count', startMs: 700, durationMs: 900 } }).layer);
        const head = placeText(ctx, headline, inputs, { sizePx: u * 0.065, maxWidthPx: safe.w * 0.9, x: cx, y: cardY + cardH / 2 + u * 0.06, reveal: RISE(1100) });
        layers.push(head.layer);
        layers.push(placeText(ctx, subline, inputs, { sizePx: u * 0.034, maxWidthPx: safe.w * 0.85, x: cx, y: cardY + cardH / 2 + u * 0.08 + head.height, fill: roleFill('inkMuted'), reveal: FADE(1600) }).layer);
        break;
      }

      case 'price': {
        const r = u * 0.22;
        const by = cy + u * 0.05;
        for (let i = 0; i < 3; i++) {
          layers.push(rect(ctx, 'burst', {
            w: r * 1.6, h: r * 1.6, x: cx, y: by, fill: roleFill('accent'),
            tracks: { rotation: [kf(0, i * 30), kf(durationMs, i * 30 + 45, 'linear')], scaleX: [kf(500, 0), kf(900, 1, 'outBack')], scaleY: [kf(500, 0), kf(900, 1, 'outBack')] },
          }));
        }
        layers.push(placeText(ctx, headline, inputs, { sizePx: u * 0.07, maxWidthPx: safe.w * 0.9, x: cx, y: by - r * 1.55, reveal: RISE(150) }).layer);
        layers.push(placeText(ctx, slot('price'), inputs, { sizePx: u * 0.14, maxWidthPx: r * 1.8, x: cx, y: by - u * 0.09, fill: roleFill('bg'), reveal: POP(950) }).layer);
        const was = placeText(ctx, slot('was'), inputs, { sizePx: u * 0.05, maxWidthPx: r * 1.6, x: cx, y: by + r * 1.05, fill: roleFill('inkMuted'), reveal: FADE(1300) });
        layers.push(was.layer);
        layers.push(rect(ctx, 'strike', { w: was.width + u * 0.02, h: Math.max(3, u * 0.006), x: cx, y: by + r * 1.05 + was.height * 0.5, fill: roleFill('inkMuted'), tracks: { scaleX: [kf(1600, 0), kf(1900, 1, 'outCubic')] } }));
        break;
      }
    }
    return layers;
  };

  return defineScene(variant, { textSlots: slots, build });
}

/** A copy of a text layer that shows `words` but is not the editable original. */
function unslotted(layer: Layer, words: string): Layer {
  if (layer.type !== 'text') return layer;
  const { slot: _slot, ...props } = layer.props;
  return { ...layer, props: { ...props, text: words } };
}
