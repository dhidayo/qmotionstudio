import { colorFill, roleFill, type ImageProps, type Layer, type Tracks } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate, TextSlotDef } from '../schema';
import { backgroundLayer, contentFloor } from '../_shared/chrome';
import { fillSlots, photoProps, untagged, type FilledSlot } from '../_shared/photo';
import { cardCount, clamp01, defineScene, depthGroup, easeInOut, easeOutBack, emphasise, focusCurve, glow, headlineAndStage, headlineSlot, kf, labelSlot, lerp, linger, placeText, rect, roomFor, sampled, serpentine, wrapSteps, type Pose } from './kit';
import { focusIn, heldTurns, roomyPoint, settleInto, smoother, turnsAlong } from './emphasis';

/**
 * Business (D-119): the scenes an organisation reaches for — its app on
 * phones, its product in browser windows, its pricing, its clients' logos,
 * what customers say, the team, how the work flows, the webinar, the feed,
 * the organisation itself.
 *
 * The device frames and cards are drawn shapes in the palette's colours, so
 * they suit any look; the photographs inside are the person's own screens,
 * logos and portraits.
 *
 * One thing is in focus at every moment (D-157): the phone or window at the
 * front, the quote in the middle, the portrait, logo, step or person whose
 * turn it is, the ticket that has just moved. It grows a little and comes
 * forward while the rest step back and darken; words dim rather than darken.
 */

/**
 * A pose's tracks moved by an offset that scales with the pose: a part of a
 * card (its dots, its name) that stays where it belongs as the card grows.
 */
function partOf(pose: (ms: number) => Pose, durationMs: number, dx: number, dy: number, extra: (ms: number, p: Pose) => Partial<Pose> = () => ({}), jump?: number): Tracks {
  return sampled(0, durationMs, 70, (ms) => {
    const p = pose(ms);
    const sx = p.scaleX ?? p.scale ?? 1;
    const sy = p.scaleY ?? p.scale ?? 1;
    const facing = Math.cos(((p.turnY ?? 0) * Math.PI) / 180);
    return { ...p, x: p.x + dx * sx * facing, y: p.y + dy * sy, ...extra(ms, p) };
  }, jump);
}

type Kind =
  | 'apps' | 'browser' | 'dashboard' | 'pricing' | 'logos' | 'testimonials'
  | 'team' | 'workflow' | 'kanban' | 'webinar' | 'social' | 'org';

const KINDS: readonly Kind[] = ['apps', 'browser', 'dashboard', 'pricing', 'logos', 'testimonials', 'team', 'workflow', 'kanban', 'webinar', 'social', 'org'];

const LINE = (startMs: number) => ({ kind: 'kinetic' as const, unit: 'line' as const, motion: 'rise' as const, startMs, durationMs: 550, staggerMs: 90 });

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const kind = pick<Kind>(p, 'kind', KINDS, 'apps');
  const headline = headlineSlot(text(p, 'headline', 'Work smarter'), {}, 60);
  const label = (id: string, name: string, fallback: string, max = 120): TextSlotDef => labelSlot(id, name, text(p, id, fallback), {}, max);
  const extra: Record<Kind, TextSlotDef[]> = {
    apps: [], browser: [], dashboard: [],
    pricing: [label('plans', 'Plan names, separated by commas', 'Starter, Pro, Business'), label('prices', 'Prices, separated by commas', '$9, $29, $79'), label('features', 'What each includes, separated by |', '1 user · 5 projects | 5 users · Unlimited projects | Unlimited users · Priority support', 160), label('badge', 'Featured badge', 'MOST POPULAR', 24)],
    logos: [],
    testimonials: [label('quotes', 'Quotes, separated by |', 'Fast, friendly and professional. | They doubled our sales in a quarter. | The best partner we have worked with.', 200), label('names', 'Names, separated by |', 'Amaka O., Retail | James P., SaaS | Laura K., Agency', 120)],
    team: [label('names', 'Names, separated by commas', 'Ada, Tunde, Grace, Musa, Zainab, Emeka')],
    workflow: [label('steps', 'Steps, separated by commas', 'Brief, Design, Build, Test, Launch')],
    kanban: [label('columns', 'Columns, separated by commas', 'To do, In progress, Done')],
    webinar: [label('when', 'Date and time', 'Thursday · 2pm GMT', 40), label('live', 'Badge', 'LIVE', 12)],
    social: [label('handle', 'Handle', '@yourbrand', 30)],
    org: [label('names', 'Roles, top first, separated by commas', 'CEO, Product, Sales, Design, Engineering, Support')],
  };
  const slots: TextSlotDef[] = [headline, ...extra[kind]];

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { durationMs, design, safe } = ctx;
    const n = cardCount(inputs, variant, 1);
    const photos = fillSlots(inputs.photos, n);
    const u = Math.min(design.w, design.h);
    const { headline: head, stage } = headlineAndStage(ctx, inputs, headline);
    const tall = stage.h > stage.w * 1.3;
    const words = (id: string, sep = ','): string[] => (inputs.texts[id] ?? slots.find((s) => s.id === id)?.placeholder ?? '').split(sep).map((w) => w.trim());
    const layers: Layer[] = [backgroundLayer(inputs, ctx), glow(ctx, { x: stage.cx, y: stage.cy }, Math.min(stage.w, stage.h) * 1.4, 0.18)];
    const photo = (k: number): FilledSlot | undefined => photos[((k % n) + n) % n];
    /** A photograph sized to an exact box, cropped to fill it. */
    const fitted = (ph: FilledSlot, w: number, h: number, radius: number, tag: boolean): ImageProps => {
      const base = photoProps(ph, Math.max(w, h));
      const props: ImageProps = { ...base, w, h, cornerRadius: radius, fit: 'cover' };
      return tag ? props : untagged(props);
    };
    const labelLayer = (slotId: string, words2: string, opts: Parameters<typeof placeText>[3]): Layer => {
      const slot = slots.find((s) => s.id === slotId) ?? headline;
      // Measured as the words it shows, not as the whole list it comes from.
      const placed = placeText(ctx, slot, { ...inputs, texts: { ...inputs.texts, [slot.id]: words2 } }, opts);
      if (placed.layer.type !== 'text') return placed.layer;
      const { slot: _slot, ...props } = placed.layer.props;
      // A label pinned by its left or right edge reads from that edge.
      const align = opts.anchorX === 0 ? 'left' : opts.anchorX === 1 ? 'right' : props.align;
      return { ...placed.layer, props: { ...props, text: words2, align } };
    };

    switch (kind) {
      case 'apps': {
        // Phones in a row, the middle one forward, the set gliding along.
        const count = Math.min(5, Math.max(3, n));
        const phoneH = Math.min(stage.h * 0.82, stage.w / (tall ? 1.6 : 2.4) * 2);
        const phoneW = phoneH * 0.49;
        const items: Layer[] = [];
        for (let k = 0; k < count; k++) {
          const ph = photo(k);
          if (!ph) continue;
          // The set glides on, lingering as each phone reaches the front.
          // Kept inside the stage as it grows, so the phone in focus never leaves the frame.
          const pose = (ms: number): Pose => {
            const off = wrapSteps(k - linger((ms / durationMs) * count), count);
            const a = Math.abs(off);
            const base: Pose = { x: stage.cx + off * phoneW * 1.02, y: stage.cy + a * phoneH * 0.04, scale: lerp(1, 0.78, Math.min(1, a)), turnY: -Math.max(-1, Math.min(1, off)) * 30, z: -a, opacity: clamp01((count / 2 - a) * 2) };
            return focusIn(base, focusCurve(off), stage, { w: phoneW, h: phoneH }, 1.2);
          };
          const tracks = sampled(0, durationMs, 70, pose, stage.w * 0.5);
          items.push({ id: ctx.id('bezel'), type: 'shape', startMs: 0, endMs: durationMs, tracks: { ...tracks, z: (tracks.z ?? []).map((key) => ({ ...key, v: key.v - 0.001 })) }, props: { shape: 'rect', w: phoneW, h: phoneH, cornerRadius: phoneW * 0.16, fill: roleFill('ink'), shadow: { blur: u * 0.04, offsetX: 0, offsetY: u * 0.015, paint: colorFill('rgba(0,0,0,0.45)') } } });
          items.push({ id: ctx.id('screen'), type: 'image', startMs: 0, endMs: durationMs, tracks, props: fitted(ph, phoneW * 0.9, phoneH * 0.94, phoneW * 0.12, k < n) });
        }
        layers.push(depthGroup(ctx, 'phones', items));
        break;
      }

      case 'browser':
      case 'dashboard': {
        // Browser windows: a title bar with three dots over each screenshot.
        const wide = kind === 'dashboard';
        const winW = Math.min(stage.w * (wide ? 0.82 : 0.78), stage.h * (wide ? 1.3 : 1.05));
        const winH = winW * (wide ? 0.62 : 0.68);
        const bar = winH * 0.08;
        const count = Math.min(5, Math.max(3, n));
        const items: Layer[] = [];
        for (let k = 0; k < count; k++) {
          const ph = photo(k);
          if (!ph) continue;
          const pose = (ms: number): Pose => {
            if (wide) {
              // A coverflow that lingers on the window at the front.
              const off = wrapSteps(k - linger((ms / durationMs) * count), count);
              const a = Math.abs(off);
              const base: Pose = { x: stage.cx + off * winW * 0.66, y: stage.cy, scale: lerp(1, 0.72, Math.min(1, a)), turnY: -Math.max(-1, Math.min(1, off)) * 45, z: -a, opacity: clamp01((count / 2 - a) * 2) };
              return focusIn(base, focusCurve(off), stage, { w: winW, h: winH }, 1.18);
            }
            // Case study: each window steps forward over the last.
            const turn = durationMs / count;
            const b = Math.floor(ms / turn);
            const rank = (b - k + count * 4) % count;
            const local = (ms % turn) / turn;
            const enter = rank === 0 ? easeOutBack(local / 0.3) : 1;
            const depth = rank === 0 ? 0 : rank;
            // The windows behind step back into the dark.
            return { x: stage.cx + depth * winW * 0.05, y: stage.cy - depth * winH * 0.06 + (1 - enter) * stage.h * 0.4, scale: 1 - depth * 0.06, opacity: rank === 0 ? clamp01(enter * 2) : clamp01(3 - depth), z: -depth, shade: Math.min(0.45, depth * 0.18) };
          };
          const tracks = sampled(0, durationMs, 70, pose, stage.w * 0.5);
          const shadowed: Tracks = { ...tracks, z: (tracks.z ?? [kf(0, 0)]).map((key) => ({ ...key, v: key.v - 0.002 })) };
          const shotTracks = partOf(pose, durationMs, 0, bar / 2, (_, p) => ({ z: (p.z ?? 0) - 0.001 }), stage.w * 0.5);
          items.push({ id: ctx.id('window'), type: 'shape', startMs: 0, endMs: durationMs, tracks: shadowed, props: { shape: 'rect', w: winW, h: winH, cornerRadius: u * 0.014, fill: roleFill('surface'), stroke: { paint: roleFill('ink', 0.14), width: Math.max(1, u * 0.002) }, shadow: { blur: u * 0.05, offsetX: 0, offsetY: u * 0.02, paint: colorFill('rgba(0,0,0,0.4)') } } });
          items.push({ id: ctx.id('shot'), type: 'image', startMs: 0, endMs: durationMs, anchorY: 0.5, tracks: shotTracks, props: fitted(ph, winW * 0.97, winH - bar * 1.3, u * 0.008, k < n) });
          for (let d = 0; d < 3; d++) {
            const dotOffsetX = -winW / 2 + bar * (0.7 + d * 0.65);
            items.push({ id: ctx.id('dot'), type: 'shape', startMs: 0, endMs: durationMs, tracks: partOf(pose, durationMs, dotOffsetX, -winH / 2 + bar * 0.55, undefined, stage.w * 0.5), props: { shape: 'ellipse', w: bar * 0.38, h: bar * 0.38, fill: d === 0 ? colorFill('#ff5f57') : d === 1 ? colorFill('#febc2e') : colorFill('#28c840') } });
          }
        }
        layers.push(depthGroup(ctx, 'windows', items));
        break;
      }

      case 'pricing': {
        const plans = words('plans');
        const prices = words('prices');
        const features = words('features', '|');
        const count = 3;
        const gap = u * 0.025;
        const cardW = tall ? stage.w * 0.86 : (stage.w - gap * 2) / count;
        const cardH = tall ? (stage.h - gap * 2) / count : Math.min(stage.h * 0.8, cardW * 1.45);
        for (let k = 0; k < count; k++) {
          const featured = k === 1;
          const x = tall ? stage.cx : stage.cx + (k - 1) * (cardW + gap);
          const y = tall ? stage.cy + (k - 1) * (cardH + gap) : stage.cy;
          const at = 300 + k * 220;
          const lift = featured ? (tall ? 0 : -u * 0.03) : 0;
          const rise: Tracks = { y: [kf(at, y + u * 0.08), kf(at + 600, y + lift, 'outExpo')], opacity: [kf(at, 0), kf(at + 350, 1)], ...(featured ? { scaleX: [kf(at + 600, 1), kf(at + 1100, 1.04, 'outBack')], scaleY: [kf(at + 600, 1), kf(at + 1100, 1.04, 'outBack')] } : {}) };
          layers.push(rect(ctx, 'plan', { w: cardW, h: cardH, x, y, radius: u * 0.025, fill: featured ? roleFill('accent', 0.16) : roleFill('surface', 0.9), stroke: { paint: featured ? roleFill('accent') : roleFill('ink', 0.12), width: Math.max(2, u * (featured ? 0.004 : 0.002)) }, tracks: rise }));
          const top = y + lift - cardH / 2;
          const nameY = tall ? top + cardH * 0.12 : top + cardH * 0.1;
          layers.push(labelLayer('plans', plans[k] ?? '', { sizePx: u * 0.04, maxWidthPx: cardW * 0.9, x: tall ? x - cardW * 0.4 : x, y: nameY, anchorX: tall ? 0 : 0.5, reveal: LINE(at + 300) }));
          layers.push(labelLayer('prices', prices[k] ?? '', { sizePx: u * (tall ? 0.07 : 0.075), maxWidthPx: cardW * 0.9, x: tall ? x + cardW * 0.4 : x, y: tall ? top + cardH * 0.18 : top + cardH * 0.24, anchorX: tall ? 1 : 0.5, fill: roleFill('accent'), reveal: { kind: 'count', startMs: at + 400, durationMs: 1100 } }));
          layers.push(labelLayer('features', features[k] ?? '', { sizePx: u * 0.028, maxWidthPx: cardW * 0.82, x: tall ? x - cardW * 0.4 : x, y: tall ? top + cardH * 0.52 : top + cardH * 0.52, anchorX: tall ? 0 : 0.5, fill: roleFill('inkMuted'), lineHeight: 1.4, reveal: LINE(at + 600) }));
          if (featured) {
            const pillW = Math.min(cardW * 0.7, u * 0.3);
            layers.push(rect(ctx, 'badge', { w: pillW, h: u * 0.05, x: tall ? x + cardW * 0.25 : x, y: top - (tall ? -u * 0.03 : 0), radius: u * 0.025, fill: roleFill('accent'), tracks: { scaleX: [kf(at + 900, 0), kf(at + 1250, 1, 'outBack')], scaleY: [kf(at + 900, 0), kf(at + 1250, 1, 'outBack')] } }));
            layers.push(labelLayer('badge', words('badge')[0] ?? '', { sizePx: u * 0.022, maxWidthPx: pillW, x: tall ? x + cardW * 0.25 : x, y: top - (tall ? -u * 0.03 : 0) - u * 0.015, fill: roleFill('onAccent'), reveal: LINE(at + 1150) }));
          }
        }
        break;
      }

      case 'logos': {
        // White tiles holding client logos; a highlight travels across them.
        const count = Math.max(6, n);
        const cols = tall ? 2 : 4;
        const rows = Math.ceil(count / cols);
        const tileW = (stage.w / cols) * 0.86;
        const tileH = Math.min(tileW * 0.62, (stage.h / rows) * 0.86);
        for (let k = 0; k < count; k++) {
          const ph = photo(k);
          if (!ph) continue;
          const col = k % cols;
          const row = Math.floor(k / cols);
          const x = stage.cx + (col - (cols - 1) / 2) * (stage.w / cols);
          const y = stage.cy + (row - (rows - 1) / 2) * (tileH / 0.86);
          const at = 200 + (col + row) * 100;
          // Once the wall is up, the light snakes across it, one logo at a time.
          const settled = 200 + (cols - 1 + rows - 1) * 100 + 500;
          const order = serpentine(col, row, cols);
          const tracks = sampled(0, durationMs, 80, (ms) => {
            const shown = settleInto(emphasise({ x, y }, turnsAlong(ms, order, count, settled, durationMs), 1.18), ms, settled);
            const pop = Math.max(0.001, easeOutBack((ms - at) / 500));
            return { ...shown, scaleX: (shown.scaleX ?? 1) * pop, scaleY: (shown.scaleY ?? 1) * pop, opacity: clamp01((ms - at) / 300) };
          });
          layers.push({ id: ctx.id('tile'), type: 'shape', startMs: 0, endMs: durationMs, tracks, props: { shape: 'rect', w: tileW, h: tileH, cornerRadius: u * 0.016, fill: colorFill('#ffffff'), stroke: { paint: roleFill('accent'), width: Math.max(2, u * 0.003) } } });
          layers.push({ id: ctx.id('logo'), type: 'image', startMs: 0, endMs: durationMs, tracks, props: { ...fitted(ph, tileW * 0.7, tileH * 0.6, 0, k < n), fit: 'contain' } });
        }
        break;
      }

      case 'testimonials': {
        const quotes = words('quotes', '|');
        const names = words('names', '|');
        const count = Math.max(3, quotes.length);
        const cardW = tall ? stage.w * 0.9 : Math.min(stage.w * 0.78, u * 0.8);
        const cardH = cardW * (tall ? 0.56 : 0.62);
        for (let k = 0; k < count; k++) {
          const ph = photo(k);
          // The rail lingers on the quote in the middle, a touch larger and lit;
          // kept small, as each card is its own group and must not overlap.
          const focusOf = (ms: number): { off: number; f: number } => {
            const off = wrapSteps(k - linger((ms / durationMs) * count), count);
            return { off, f: focusCurve(off) };
          };
          const pose = (ms: number): Pose => {
            const { off, f } = focusOf(ms);
            const a = Math.abs(off);
            return emphasise({ x: stage.cx + off * (tall ? 0 : cardW * 0.92), y: stage.cy + off * (tall ? cardH * 1.1 : 0), scale: lerp(1, 0.9, Math.min(1, a)), opacity: clamp01((count / 2 - a) * 1.6), z: -a }, f, 1.06);
          };
          const tracks = sampled(0, durationMs, 70, pose, stage.w * 0.5);
          // Words are not darkened by shade, so they dim instead.
          const wordTracks = (dx: number, dy: number): Tracks => partOf(pose, durationMs, dx, dy, (ms, p) => ({ opacity: (p.opacity ?? 1) * lerp(0.5, 1, focusOf(ms).f), shade: 0 }), stage.w * 0.5);
          const items: Layer[] = [{ id: ctx.id('quoteCard'), type: 'shape', startMs: 0, endMs: durationMs, tracks, props: { shape: 'rect', w: cardW, h: cardH, cornerRadius: u * 0.025, fill: roleFill('surface'), stroke: { paint: roleFill('ink', 0.1), width: Math.max(1, u * 0.002) } } }];
          if (ph) {
            const av = cardH * 0.2;
            items.push({ id: ctx.id('avatar'), type: 'image', startMs: 0, endMs: durationMs, tracks: partOf(pose, durationMs, -cardW * 0.36, cardH * 0.3, undefined, stage.w * 0.5), props: fitted(ph, av, av, av / 2, k < n) });
          }
          const quote = labelLayer('quotes', `“${quotes[k] ?? ''}”`, { sizePx: u * (tall ? 0.046 : 0.038), maxWidthPx: cardW * 0.84, x: 0, y: 0, lineHeight: 1.3, reveal: { kind: 'none' } });
          const name = labelLayer('names', names[k] ?? '', { sizePx: u * 0.026, maxWidthPx: cardW * 0.6, x: 0, y: 0, anchorX: 0, fill: roleFill('inkMuted'), reveal: { kind: 'none' } });
          items.push({ ...quote, tracks: wordTracks(0, -cardH * 0.3) });
          items.push({ ...name, tracks: wordTracks(-cardW * 0.24, cardH * 0.26) });
          layers.push(depthGroup(ctx, 'testimonial', items));
        }
        break;
      }

      case 'team': {
        // Round portraits popping into a grid, a name under each.
        const names = words('names');
        const count = Math.max(3, Math.min(9, n));
        // As many across as makes each portrait biggest in this frame.
        let cols = 1;
        for (let c = 1; c <= Math.min(5, count); c++) {
          const size = (k: number): number => Math.min(stage.w / k, stage.h / Math.ceil(count / k));
          if (size(c) > size(cols) + 1) cols = c;
        }
        const rows = Math.ceil(count / cols);
        const cell = Math.min(stage.w / cols, stage.h / rows);
        const av = cell * 0.62;
        for (let k = 0; k < count; k++) {
          const ph = photo(k);
          if (!ph) continue;
          const col = k % cols;
          const row = Math.floor(k / cols);
          const inRow = Math.min(cols, count - row * cols);
          const x = stage.cx + (col - (inRow - 1) / 2) * (stage.w / cols);
          const y = stage.cy + (row - (rows - 1) / 2) * cell - cell * 0.08;
          const at = 300 + k * 160;
          // After everyone has popped in, each person has a turn, in reading
          // order along the rows. The portrait grows upward from its name, so
          // the name stays put, clear of the row below.
          const settled = 300 + (count - 1) * 160 + 600;
          const turnOf = (ms: number): number => turnsAlong(ms, serpentine(col, row, cols), count, settled, durationMs);
          const ringBox = { w: av * 1.1, h: av * 1.1 };
          const pose = (ms: number): Pose => {
            const p = settleInto(focusIn({ x, y }, turnOf(ms), stage, ringBox, 1.2), ms, settled);
            const s = p.scaleY ?? 1;
            const up = roomyPoint(stage, { x: p.x, y: p.y - (Math.max(1, s) - 1) * ringBox.h * 0.5 }, ringBox, s);
            return { ...p, x: up.x, y: up.y };
          };
          const popped = (from: number, ms: number): number => Math.max(0.001, easeOutBack((ms - from) / 450));
          /** 1 in focus, 0 at rest: the words and the ring dim rather than darken (a darkened line would fill). */
          const lit = (p: Pose): number => lerp(0.5, 1, clamp01(1 - (p.shade ?? 0) / 0.4));
          layers.push(rect(ctx, 'ring', { w: av * 1.1, h: av * 1.1, x, y, ellipse: true, fill: roleFill('accent', 0), stroke: { paint: roleFill('accent'), width: Math.max(2, u * 0.004) }, tracks: sampled(0, durationMs, 80, (ms) => {
            const p = pose(ms);
            return { x: p.x, y: p.y, scale: (p.scaleX ?? 1) * popped(at + 200, ms), opacity: lit(p) };
          }) }));
          layers.push({ id: ctx.id('portrait'), type: 'image', startMs: 0, endMs: durationMs, tracks: sampled(0, durationMs, 80, (ms) => {
            const p = pose(ms);
            return { ...p, scaleX: (p.scaleX ?? 1) * popped(at, ms), scaleY: (p.scaleY ?? 1) * popped(at, ms) };
          }), props: fitted(ph, av, av, av / 2, k < n) });
          const name = labelLayer('names', names[k] ?? '', { sizePx: u * 0.032, maxWidthPx: cell * 0.9, x, y: y + av * 0.62, reveal: LINE(at + 400) });
          layers.push({ ...name, tracks: { ...name.tracks, ...sampled(0, durationMs, 80, (ms) => {
            const p = pose(ms);
            // Just under the ring, however large it is (never above where it began).
            return { x: p.x, y: Math.max(y + av * 0.62, p.y + ringBox.h * 0.5 * Math.max(1, p.scaleY ?? 1) + av * 0.07), opacity: lit(p) };
          }) } });
        }
        break;
      }

      case 'workflow': {
        const steps = words('steps');
        const count = Math.max(3, Math.min(6, steps.length));
        const vertical = tall;
        const pitch = (vertical ? stage.h : stage.w) / count;
        const box = Math.min(pitch * (vertical ? 0.62 : 0.74), (vertical ? stage.w : stage.h) * 0.42);
        const turn = durationMs / count;
        for (let k = 0; k < count; k++) {
          const x = vertical ? stage.cx - stage.w * 0.2 : stage.cx + (k - (count - 1) / 2) * pitch;
          const y = vertical ? stage.cy + (k - (count - 1) / 2) * pitch : stage.cy - box * 0.2;
          if (k < count - 1) {
            layers.push(rect(ctx, 'link', { w: vertical ? Math.max(3, u * 0.005) : pitch - box * 0.6, h: vertical ? pitch - box * 0.6 : Math.max(3, u * 0.005), x: vertical ? x : x + pitch / 2, y: vertical ? y + pitch / 2 : y, fill: roleFill('accent', 0.5), tracks: { [vertical ? 'scaleY' : 'scaleX']: [kf(turn * k + turn * 0.5, 0), kf(turn * (k + 1), 1, 'inOutCubic')] } }));
          }
          // The step the line has reached is in focus; steps still to come are
          // fainter than the ones already done.
          const focus = sampled(0, durationMs, 80, (ms) => {
            const reached = clamp01((ms - turn * k) / 300);
            const shown = focusIn({ x, y }, heldTurns(ms, k, count, 0, durationMs), stage, { w: box, h: box }, 1.14);
            return { ...shown, opacity: clamp01((ms - k * 200) / 300) * lerp(0.55, 1, reached) };
          });
          layers.push({ id: ctx.id('step'), type: 'shape', startMs: 0, endMs: durationMs, tracks: focus, props: { shape: 'rect', w: box, h: box, cornerRadius: box * 0.24, fill: roleFill('surface'), stroke: { paint: roleFill('accent'), width: Math.max(2, u * 0.004) } } });
          // A photo per step when there are some; the step's number when not.
          const ph = photo(k);
          if (ph && inputs.photos.length > 0) layers.push({ id: ctx.id('stepPhoto'), type: 'image', startMs: 0, endMs: durationMs, tracks: focus, props: fitted(ph, box * 0.8, box * 0.8, box * 0.18, k < n) });
          else {
            const number = labelLayer('steps', String(k + 1), { sizePx: box * 0.42, maxWidthPx: box, x: 0, y: 0, fill: roleFill('accent'), reveal: { kind: 'none' } });
            const sy = focus.scaleY ?? [kf(0, 1)];
            // The number keeps its place in the box as the box grows; words do not darken, so no shade.
            const { shade: _shade, ...plain } = focus;
            layers.push({ ...number, tracks: { ...plain, y: (focus.y ?? []).map((key, j) => ({ ...key, v: key.v - box * 0.24 * (sy[j]?.v ?? 1) })) } });
          }
          layers.push(labelLayer('steps', steps[k] ?? '', { sizePx: u * 0.034, maxWidthPx: vertical ? stage.w * 0.5 : pitch * 0.92, x: vertical ? x + box * 0.75 : x, y: vertical ? y - u * 0.02 : y + box * 0.62, anchorX: vertical ? 0 : 0.5, reveal: LINE(turn * k + 200) }));
        }
        break;
      }

      case 'kanban': {
        const columns = words('columns');
        const cols = 3;
        const colW = (stage.w / cols) * 0.92;
        const colH = stage.h * 0.88;
        // Four rows, and room for the moving one to grow, inside the column.
        const cardH = Math.min(colW * 0.62, (colH - u * 0.08) / 4.6);
        const cardW = colW * 0.86;
        for (let c = 0; c < cols; c++) {
          const x = stage.cx + (c - 1) * (stage.w / cols);
          layers.push(rect(ctx, 'column', { w: colW, h: colH, x, y: stage.cy, radius: u * 0.02, fill: roleFill('surface', 0.6), tracks: { opacity: [kf(c * 150, 0), kf(c * 150 + 400, 1)] } }));
          layers.push(labelLayer('columns', columns[c] ?? '', { sizePx: u * 0.03, maxWidthPx: colW * 0.9, x, y: stage.cy - colH / 2 + u * 0.02, fill: roleFill('inkMuted'), reveal: LINE(200 + c * 150) }));
        }
        // Cards move from column to column, one at a time.
        const count = Math.min(6, Math.max(4, n));
        const turn = durationMs / (count + 2);
        const stepAt = (k: number, column: number): number => (k + column * 2) * turn * 0.6;
        // The ticket that has just moved is in focus until the next one moves
        // (a move to Done wins a tie); the first is in focus from the start.
        const moves = [{ at: 0, k: 0, to: 0 }, ...Array.from({ length: count }, (_, k) => [1, 2].map((to) => ({ at: stepAt(k, to), k, to }))).flat()]
          .sort((a, b) => a.at - b.at || a.to - b.to);
        const moved = (k: number, ms: number): number => {
          let j = 0;
          while (j + 1 < moves.length && (moves[j + 1]?.at ?? Number.POSITIVE_INFINITY) <= ms) j++;
          const now = moves[j];
          const before = moves[j - 1];
          if (!now) return 0;
          const g = smoother((ms - now.at) / 350);
          if (now.k === k) return before?.k === k ? 1 : g;
          return before?.k === k ? 1 - g : 0;
        };
        const items: Layer[] = [];
        for (let k = 0; k < count; k++) {
          const ph = photo(k);
          if (!ph) continue;
          const slotY = (row: number): number => stage.cy - colH / 2 + u * 0.08 + cardH * 0.6 + row * (cardH * 1.12);
          const pose = (ms: number): Pose => {
            const toDoing = easeInOut((ms - stepAt(k, 1)) / 500);
            const toDone = easeInOut((ms - stepAt(k, 2)) / 500);
            const column = toDoing + toDone;
            const row = column >= 1.99 ? k : column >= 0.99 ? 0 : k;
            const x = stage.cx + (column - 1) * (stage.w / cols);
            const base: Pose = { x, y: slotY(Math.min(3, row)), scale: 1 + Math.sin(Math.min(1, (toDoing % 1) + (toDone % 1)) * Math.PI) * 0.06, z: column * 10 + k };
            return emphasise(base, moved(k, ms), 1.12);
          };
          items.push({ id: ctx.id('ticket'), type: 'image', startMs: 0, endMs: durationMs, tracks: sampled(0, durationMs, 70, pose), props: fitted(ph, cardW, cardH, u * 0.012, k < n) });
        }
        layers.push(depthGroup(ctx, 'tickets', items));
        break;
      }

      case 'webinar': {
        const ph0 = photo(0);
        const ph1 = photo(1);
        const av = Math.min(stage.w, stage.h) * (tall ? 0.42 : 0.36);
        const slideW = tall ? stage.w * 0.86 : stage.w * 0.52;
        const slideH = slideW * 0.58;
        const speaker = tall ? { x: stage.cx, y: stage.cy - stage.h * 0.22 } : { x: stage.cx - stage.w * 0.3, y: stage.cy };
        const slide = tall ? { x: stage.cx, y: stage.cy + stage.h * 0.2 } : { x: stage.cx + stage.w * 0.18, y: stage.cy };
        if (ph0) layers.push({ id: ctx.id('speaker'), type: 'image', startMs: 0, endMs: durationMs, tracks: { x: [kf(0, speaker.x)], y: [kf(0, speaker.y)], scaleX: [kf(200, 0.6), kf(800, 1, 'outBack')], scaleY: [kf(200, 0.6), kf(800, 1, 'outBack')], opacity: [kf(200, 0), kf(500, 1)] }, props: fitted(ph0, av, av, av / 2, true) });
        layers.push(rect(ctx, 'speakerRing', { w: av * 1.08, h: av * 1.08, x: speaker.x, y: speaker.y, ellipse: true, fill: roleFill('accent', 0), stroke: { paint: roleFill('accent'), width: Math.max(3, u * 0.005) }, tracks: { scaleX: [kf(0, 1), kf(durationMs, 1, 'linear')], opacity: [kf(600, 0), kf(900, 1)] } }));
        if (ph1) layers.push({ id: ctx.id('slide'), type: 'image', startMs: 0, endMs: durationMs, tracks: { x: [kf(500, slide.x + u * 0.1), kf(1200, slide.x, 'outExpo')], y: [kf(0, slide.y)], opacity: [kf(500, 0), kf(900, 1)] }, props: fitted(ph1, slideW, slideH, u * 0.016, n > 1) });
        // The LIVE badge, pulsing.
        const badge = { x: speaker.x + av * 0.38, y: speaker.y - av * 0.42 };
        const pulseKeys = [];
        for (let t = 1000; t < durationMs; t += 1200) pulseKeys.push(kf(t, 1, 'linear'), kf(t + 600, 1.12, 'inOutSine'), kf(t + 1200, 1, 'inOutSine'));
        layers.push(rect(ctx, 'live', { w: u * 0.12, h: u * 0.05, x: badge.x, y: badge.y, radius: u * 0.012, fill: colorFill('#e5322d'), tracks: { scaleX: pulseKeys.length > 0 ? pulseKeys : [kf(0, 1)], scaleY: pulseKeys.length > 0 ? pulseKeys : [kf(0, 1)], opacity: [kf(900, 0), kf(1100, 1)] } }));
        layers.push(labelLayer('live', words('live')[0] ?? 'LIVE', { sizePx: u * 0.026, maxWidthPx: u * 0.12, x: badge.x, y: badge.y - u * 0.016, fill: colorFill('#ffffff'), reveal: LINE(1000) }));
        layers.push(labelLayer('when', words('when', '|')[0] ?? '', { sizePx: u * 0.032, maxWidthPx: safe.w * 0.8, x: stage.cx, y: contentFloor(design, safe) - u * 0.05, fill: roleFill('accent'), reveal: LINE(1400) }));
        break;
      }

      case 'social': {
        // A feed of square posts sliding up, each with a like bar under it —
        // sliding along, on a frame too short for a column of them.
        const across = !tall && stage.w > stage.h * 1.2;
        const post = across ? Math.min(stage.h * 0.66, stage.w * 0.3) : Math.min(stage.w * 0.72, stage.h * 0.5);
        const count = Math.max(3, Math.min(6, n));
        const items: Layer[] = [];
        for (let k = 0; k < count; k++) {
          const ph = photo(k);
          if (!ph) continue;
          // The post that has scrolled into place is in focus; the feed rests on it.
          const pose = (ms: number): Pose => {
            const turn = durationMs / count;
            const b = Math.floor(ms / turn) + easeInOut(((ms % turn) / turn - 0.7) / 0.3);
            const off = wrapSteps(k - b, count);
            const f = focusCurve(off);
            if (across) return emphasise({ x: stage.cx + off * post * 1.3, y: stage.cy - post * 0.08, opacity: clamp01(2.4 - Math.abs(off)), z: -Math.abs(off) }, f, roomFor(stage, { x: stage.cx, y: stage.cy }, { w: post * 1.06, h: post * 1.22 }, 1.15));
            // Gone before it reaches the headline above; in view longer below.
            return emphasise({ x: stage.cx, y: stage.cy + off * post * 1.3, opacity: off < 0 ? clamp01(1.5 + off * 1.6) : clamp01(1.6 - off), z: -Math.abs(off) }, f, 1.06);
          };
          const tracks = sampled(0, durationMs, 70, pose, across ? stage.w * 0.5 : stage.h * 0.5);
          items.push({ id: ctx.id('postCard'), type: 'shape', startMs: 0, endMs: durationMs, tracks: partOf(pose, durationMs, 0, post * 0.08, (_, p) => ({ z: (p.z ?? 0) - 0.001 }), across ? stage.w * 0.5 : stage.h * 0.5), props: { shape: 'rect', w: post * 1.06, h: post * 1.22, cornerRadius: u * 0.02, fill: roleFill('surface') } });
          items.push({ id: ctx.id('post'), type: 'image', startMs: 0, endMs: durationMs, tracks, props: fitted(ph, post, post, u * 0.01, k < n) });
          items.push(labelLayer('handle', `♥ ${120 + k * 37}   ${words('handle')[0] ?? ''}`, { sizePx: u * 0.03, maxWidthPx: post, x: 0, y: 0, anchorX: 0, reveal: { kind: 'none' } }));
          const last = items[items.length - 1];
          if (last) items[items.length - 1] = { ...last, tracks: partOf(pose, durationMs, -post * 0.5, post * 0.53, (_, p) => ({ shade: 0, z: (p.z ?? 0) + 0.001 }), across ? stage.w * 0.5 : stage.h * 0.5) };
        }
        layers.push(depthGroup(ctx, 'feed', items));
        break;
      }

      case 'org': {
        // A tree: one at the top, two below, the rest below them; each person takes a turn.
        const names = words('names');
        const levels = [[0], [1, 2], [3, 4, 5]];
        const av = Math.min(stage.w / 4, stage.h / 4.2);
        const levelY = (l: number): number => stage.cy + (l - 1) * (stage.h / 3.2);
        const posOf = (k: number): { x: number; y: number } => {
          const l = levels.findIndex((lv) => lv.includes(k));
          const row = levels[l] ?? [k];
          const idx = row.indexOf(k);
          return { x: stage.cx + (idx - (row.length - 1) / 2) * (stage.w / (row.length + 0.6)), y: levelY(l) };
        };
        // Connectors first, under the nodes.
        for (const [from, to] of [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5]] as const) {
          const a = posOf(from);
          const b = posOf(to);
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          layers.push(rect(ctx, 'edge', { w: len, h: Math.max(3, u * 0.005), x: a.x, y: a.y, anchorX: 0, fill: roleFill('accent', 0.55), tracks: { rotation: [kf(0, (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI)], scaleX: [kf(400 + to * 120, 0), kf(800 + to * 120, 1, 'outCubic')] } }));
        }
        for (let k = 0; k < 6; k++) {
          const ph = photo(k);
          if (!ph) continue;
          const at = posOf(k);
          // Once the tree is drawn, each person has a turn, top to bottom.
          const settled = 200 + 5 * 120 + 500;
          const turnOf = (ms: number): number => turnsAlong(ms, k, 6, settled, durationMs);
          const tracks = sampled(0, durationMs, 80, (ms) => {
            const shown = settleInto(emphasise({ x: at.x, y: at.y }, turnOf(ms), 1.2), ms, settled);
            const pop = Math.max(0.001, easeOutBack((ms - 200 - k * 120) / 500));
            return { ...shown, scaleX: (shown.scaleX ?? 1) * pop, scaleY: (shown.scaleY ?? 1) * pop };
          });
          layers.push({ id: ctx.id('member'), type: 'image', startMs: 0, endMs: durationMs, tracks, props: fitted(ph, av * 0.7, av * 0.7, av * 0.35, k < n) });
          // The names dim with their people, after the tree is drawn.
          const name = labelLayer('names', names[k] ?? '', { sizePx: u * 0.028, maxWidthPx: av * 1.3, x: at.x, y: at.y + av * 0.46, reveal: LINE(500 + k * 120) });
          const quiet = sampled(settled - 400, durationMs, 100, (ms) => ({ x: at.x, y: at.y, opacity: lerp(1, lerp(0.55, 1, turnOf(ms)), clamp01((ms - settled + 400) / 400)) })).opacity;
          layers.push(quiet ? { ...name, tracks: { ...name.tracks, opacity: quiet.map((key) => ({ ...key, t: key.t + settled - 400 })) } } : name);
        }
        break;
      }
    }

    layers.push(head);
    return layers;
  };

  return defineScene(variant, { textSlots: slots, build });
}
