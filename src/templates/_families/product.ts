import { colorFill, roleFill, type Keyframe, type Layer, type Reveal, type Tracks } from '@/core/types';
import type { SceneInputs } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate, TextSlotDef } from '../schema';
import { backgroundLayer, contentFloor } from '../_shared/chrome';
import { fillSlots, photoProps, untagged } from '../_shared/photo';
import { cardProps, defineScene, glow, headlineSlot, kf, labelSlot, measureSlot, placeText, rect, sampled, sublineSlot } from './kit';

/**
 * Product Display (D-119): one product, or a few, shown the way a launch
 * page shows them — in a spotlight, with callouts pointing at what matters,
 * in every colour it comes in, on a shelf, before and after, turning on a
 * plinth, beside its specs, with its price.
 */

type Kind =
  | 'spotlight' | 'callouts' | 'finishes' | 'lineup' | 'compare' | 'turntable'
  | 'spec' | 'price' | 'detail' | 'arrival' | 'range' | 'unbox';

const KINDS: readonly Kind[] = ['spotlight', 'callouts', 'finishes', 'lineup', 'compare', 'turntable', 'spec', 'price', 'detail', 'arrival', 'range', 'unbox'];

const RISE = (startMs: number): Reveal => ({ kind: 'kinetic', unit: 'word', motion: 'rise', startMs, durationMs: 600, staggerMs: 80 });
const LINE = (startMs: number): Reveal => ({ kind: 'kinetic', unit: 'line', motion: 'rise', startMs, durationMs: 600, staggerMs: 100 });

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const kind = pick<Kind>(p, 'kind', KINDS, 'spotlight');
  const headline = headlineSlot(text(p, 'headline', 'Meet the new one'), {}, 60);
  const subline = sublineSlot(text(p, 'subline', 'Designed for everyday life'));
  const label = (id: string, name: string, fallback: string): TextSlotDef => labelSlot(id, name, text(p, id, fallback));
  const slots: TextSlotDef[] = [headline];
  const extra: Record<Kind, TextSlotDef[]> = {
    spotlight: [subline],
    callouts: [label('point1', 'First point', 'All-day battery'), label('point2', 'Second point', 'Water resistant'), label('point3', 'Third point', 'Recycled materials')],
    finishes: [subline],
    lineup: [subline],
    compare: [label('before', 'Before', 'Before'), label('after', 'After', 'After')],
    turntable: [subline],
    spec: [label('spec1', 'First spec', '12-hour battery'), label('spec2', 'Second spec', 'Weighs 240 g'), label('spec3', 'Third spec', 'Two-year warranty')],
    price: [label('price', 'Price', '$129'), label('was', 'Was', '$159')],
    detail: [subline],
    arrival: [label('badge', 'Badge', 'NEW'), subline],
    range: [label('name1', 'First name', 'Classic'), label('name2', 'Second name', 'Sport'), label('name3', 'Third name', 'Pro')],
    unbox: [subline],
  };
  slots.push(...extra[kind]);
  const counts: Record<Kind, number> = { spotlight: 1, callouts: 1, finishes: 4, lineup: 5, compare: 2, turntable: 1, spec: 1, price: 1, detail: 1, arrival: 1, range: 3, unbox: 1 };

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { design, safe, durationMs } = ctx;
    const u = Math.min(design.w, design.h);
    const cx = design.w / 2;
    const tall = design.h > design.w * 1.15;
    const wide = design.w > design.h * 1.15;
    const n = Math.max(1, Math.min(inputs.photos.length || counts[kind], counts[kind]));
    const photos = fillSlots(inputs.photos, counts[kind] === 1 ? 1 : n);
    const layers: Layer[] = [backgroundLayer(inputs, ctx)];
    const slot = (id: string): TextSlotDef => slots.find((s) => s.id === id) ?? headline;
    const floor = contentFloor(design, safe);

    // A headline at the top and the room below it, which most kinds use.
    const headSize = u * 0.07;
    const head = measureSlot(ctx, headline, inputs, headSize, safe.w * 0.9);
    const stageTop = safe.y + head.height + u * 0.05;
    const stageH = floor - stageTop - (slots.includes(subline) ? u * 0.09 : 0);
    const stageCy = stageTop + stageH / 2;
    const topHeadline = (startMs = 250): void => {
      layers.push(placeText(ctx, headline, inputs, { sizePx: headSize, maxWidthPx: safe.w * 0.9, x: cx, y: safe.y, reveal: RISE(startMs) }).layer);
    };
    const bottomSubline = (startMs: number): void => {
      layers.push(placeText(ctx, subline, inputs, { sizePx: u * 0.036, maxWidthPx: safe.w * 0.85, x: cx, y: floor - u * 0.06, fill: roleFill('inkMuted'), reveal: LINE(startMs) }).layer);
    };
    const hero = (size: number, at: { x: number; y: number }, tracks: Tracks, index = 0, shadow = true): Layer => {
      const photo = photos[index] ?? photos[0];
      if (!photo) throw new Error('product: no photo slot');
      return { id: ctx.id('product'), type: 'image', startMs: 0, endMs: durationMs, tracks: { x: [kf(0, at.x)], y: [kf(0, at.y)], ...tracks }, props: cardProps(photo, size, inputs, u, shadow) };
    };

    switch (kind) {
      case 'spotlight':
      case 'arrival':
      case 'unbox': {
        topHeadline();
        const size = Math.min(stageH * 0.82, u * 0.62);
        layers.push(glow(ctx, { x: cx, y: stageCy }, size * 2.2, 0.32));
        if (kind === 'unbox') {
          // The box: a lid that lifts and two flaps that fall open, then the product rises out.
          const boxW = size * 1.05;
          const boxTop = stageCy + size * 0.18;
          layers.push(hero(size, { x: cx, y: stageCy }, { y: [kf(600, boxTop + size * 0.6), kf(1700, stageCy, 'outBack')], opacity: [kf(600, 0), kf(900, 1)] }));
          layers.push(rect(ctx, 'box', { w: boxW, h: size * 0.5, x: cx, y: boxTop, anchorY: 0, radius: u * 0.012, fill: roleFill('surface'), stroke: { paint: roleFill('ink', 0.14), width: Math.max(1, u * 0.002) } }));
          // Two lid flaps, hinged at the box's outer edges, swing open outwards.
          for (const side of [-1, 1]) {
            layers.push(rect(ctx, 'flap', {
              w: boxW / 2, h: size * 0.05, x: cx + (side * boxW) / 2, y: boxTop, anchorX: side < 0 ? 0 : 1, anchorY: 1,
              fill: roleFill('accent'), radius: u * 0.006,
              tracks: { rotation: [kf(250, 0), kf(800, side * -120, 'outBack')] },
            }));
          }
        } else {
          layers.push(hero(size, { x: cx, y: stageCy }, {
            scaleX: [kf(0, 0.86), kf(900, 1, 'outCubic'), kf(durationMs, 1.05, 'linear')],
            scaleY: [kf(0, 0.86), kf(900, 1, 'outCubic'), kf(durationMs, 1.05, 'linear')],
            opacity: [kf(0, 0), kf(600, 1)],
          }));
        }
        if (kind === 'arrival') {
          const r = u * 0.11;
          const bx = cx + size * 0.42;
          const by = stageCy - size * 0.48;
          layers.push(rect(ctx, 'badge', { w: r * 2, h: r * 2, x: bx, y: by, ellipse: true, fill: roleFill('accent'), tracks: { scaleX: [kf(1100, 2), kf(1450, 1, 'outBack')], scaleY: [kf(1100, 2), kf(1450, 1, 'outBack')], opacity: [kf(1100, 0), kf(1250, 1)], rotation: [kf(1100, -25), kf(1450, -12, 'outBack')] } }));
          layers.push(placeText(ctx, slot('badge'), inputs, { sizePx: u * 0.05, maxWidthPx: r * 1.8, x: bx, y: by - u * 0.033, fill: roleFill('onAccent'), reveal: { kind: 'fade', startMs: 1300, durationMs: 200 }, tracks: { rotation: [kf(0, -12)] } }).layer);
        }
        bottomSubline(1200);
        break;
      }

      case 'callouts': {
        topHeadline();
        const size = Math.min(stageH * 0.7, u * (wide ? 0.5 : 0.56));
        layers.push(glow(ctx, { x: cx, y: stageCy }, size * 2, 0.22));
        layers.push(hero(size, { x: cx, y: stageCy }, { opacity: [kf(0, 0), kf(600, 1)], scaleX: [kf(0, 0.9), kf(800, 1)], scaleY: [kf(0, 0.9), kf(800, 1)] }));
        // Three callouts: a dot on the product, a leader line out, the words at its end.
        const spots = [
          { dx: -0.28, dy: -0.22, side: -1 },
          { dx: 0.3, dy: 0.02, side: 1 },
          { dx: -0.22, dy: 0.3, side: -1 },
        ];
        spots.forEach((spot, i) => {
          const at = 900 + i * Math.min(700, durationMs * 0.12);
          const dotX = cx + spot.dx * size;
          const dotY = stageCy + spot.dy * size;
          // The words sit against the safe edge on their side, so they never run
          // off the frame however narrow it is; the leader spans the gap.
          const edgeX = spot.side < 0 ? safe.x : safe.x + safe.w;
          const textW = Math.max(u * 0.16, Math.abs(edgeX - dotX) - size * 0.08);
          const reach = Math.max(u * 0.03, Math.abs(edgeX - dotX) - Math.min(textW, u * 0.3) - u * 0.02);
          const endX = dotX + spot.side * reach;
          layers.push(rect(ctx, 'dot', { w: u * 0.025, h: u * 0.025, x: dotX, y: dotY, ellipse: true, fill: roleFill('accent'), stroke: { paint: roleFill('bg'), width: Math.max(2, u * 0.004) }, tracks: { scaleX: [kf(at, 0), kf(at + 250, 1, 'outBack')], scaleY: [kf(at, 0), kf(at + 250, 1, 'outBack')] } }));
          layers.push(rect(ctx, 'leader', { w: reach, h: Math.max(2, u * 0.003), x: dotX, y: dotY, anchorX: spot.side < 0 ? 1 : 0, fill: roleFill('accent'), tracks: { scaleX: [kf(at + 150, 0), kf(at + 500, 1, 'outCubic')] } }));
          layers.push(placeText(ctx, slot(`point${i + 1}`), inputs, {
            sizePx: u * 0.036, maxWidthPx: Math.min(textW, u * 0.3), x: endX + spot.side * u * 0.012, y: dotY - u * 0.024, anchorX: spot.side < 0 ? 1 : 0,
            reveal: { kind: 'kinetic', unit: 'line', motion: spot.side < 0 ? 'slideRight' : 'slideLeft', startMs: at + 400, durationMs: 450, staggerMs: 0 },
          }).layer);
        });
        break;
      }

      case 'finishes':
      case 'range': {
        topHeadline();
        const count = photos.length;
        const cols = tall && count > 2 ? 2 : count;
        const rows = Math.ceil(count / cols);
        const cellW = safe.w / cols;
        const cellH = stageH / rows;
        const size = Math.min(cellW * 0.82, cellH * (kind === 'range' ? 0.7 : 0.72));
        const swatches = [roleFill('accent'), roleFill('ink'), roleFill('inkMuted'), colorFill('#c9a227'), roleFill('surface')];
        photos.forEach((_, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          // A short last row is centred, not left hanging.
          const inRow = Math.min(cols, count - row * cols);
          const x = cx + cellW * (col - (inRow - 1) / 2);
          const y = stageTop + cellH * (row + 0.45);
          const at = 400 + i * 180;
          if (kind === 'finishes') {
            // The spotlight moves from one finish to the next.
            const turn = durationMs / count;
            layers.push(hero(size, { x, y }, {
              ...sampled(0, durationMs, 100, (ms) => {
                const active = Math.floor(ms / turn) % count === i;
                const arrive = Math.min(1, Math.max(0, (ms - at) / 500));
                return { x, y: y + (1 - arrive) * u * 0.06, scale: active ? 1.06 : 0.94, opacity: arrive * (active ? 1 : 0.7) };
              }),
            }, i));
            layers.push(rect(ctx, 'swatch', { w: u * 0.035, h: u * 0.035, x, y: y + size * 0.62, ellipse: true, fill: swatches[i % swatches.length] ?? roleFill('accent'), stroke: { paint: roleFill('ink', 0.4), width: Math.max(2, u * 0.003) }, tracks: { scaleX: [kf(at + 300, 0), kf(at + 600, 1, 'outBack')], scaleY: [kf(at + 300, 0), kf(at + 600, 1, 'outBack')] } }));
          } else {
            layers.push(hero(size, { x, y }, { y: [kf(at, y + u * 0.08), kf(at + 700, y, 'outExpo')], opacity: [kf(at, 0), kf(at + 400, 1)] }, i));
            layers.push(placeText(ctx, slot(`name${i + 1}`), inputs, { sizePx: u * 0.04, maxWidthPx: cellW * 0.9, x, y: y + size * 0.62, reveal: LINE(at + 500) }).layer);
          }
        });
        if (kind === 'finishes') bottomSubline(1500);
        break;
      }

      case 'lineup': {
        topHeadline();
        const count = photos.length;
        // A tall frame gets two shelves, so the products are not specks on one.
        const shelves = tall && count > 2 ? 2 : 1;
        const perShelf = Math.ceil(count / shelves);
        const shelfGap = stageH / shelves;
        const size = Math.min((safe.w / perShelf) * 0.9, shelfGap * 0.62);
        for (let sh = 0; sh < shelves; sh++) {
          layers.push(rect(ctx, 'shelf', { w: safe.w, h: Math.max(4, u * 0.008), x: cx, y: stageTop + shelfGap * (sh + 0.8), fill: roleFill('ink', 0.25), tracks: { scaleX: [kf(100 + sh * 200, 0), kf(700 + sh * 200, 1, 'outExpo')] } }));
        }
        photos.forEach((_, i) => {
          const sh = Math.floor(i / perShelf);
          const onShelf = Math.min(perShelf, count - sh * perShelf);
          const shelfY = stageTop + shelfGap * (sh + 0.8);
          const x = cx + (safe.w / perShelf) * ((i % perShelf) - (onShelf - 1) / 2);
          const y = shelfY - size * 0.62;
          const at = 500 + i * 220;
          layers.push(hero(size, { x, y }, sampled(0, durationMs, 100, (ms) => {
            const arrive = Math.min(1, Math.max(0, (ms - at) / 700));
            const e = 1 - (1 - arrive) ** 3;
            return { x: x + (1 - e) * design.w * 0.6, y: y + Math.sin(ms / 900 + i) * u * 0.006 * e, opacity: Math.min(1, arrive * 2) };
          }), i));
        });
        bottomSubline(1600);
        break;
      }

      case 'compare': {
        // Two photos the size of the frame; the second is uncovered by a sweeping divider.
        const [before, after] = photos;
        if (!before || !after) break;
        const size = Math.max(design.w, design.h);
        layers.push({ id: ctx.id('before'), type: 'image', startMs: 0, endMs: durationMs, tracks: { x: [kf(0, cx)], y: [kf(0, design.h / 2)] }, props: photoProps(before, size) });
        // The divider sweeps across and back once over the scene, easing at each end.
        const progressKeys: Keyframe[] = [];
        for (let ms = 0; ms <= durationMs; ms += 80) {
          progressKeys.push(kf(ms, 0.5 - 0.4 * Math.cos((ms / durationMs) * Math.PI * 2), 'linear'));
        }
        layers.push({
          id: ctx.id('afterMask'), type: 'mask', startMs: 0, endMs: durationMs, anchorX: 0, anchorY: 0,
          tracks: { x: [kf(0, 0)], y: [kf(0, 0)], clipProgress: progressKeys },
          props: { shape: 'rect', w: design.w, h: design.h, clipFrom: 'left' },
          children: [{ id: ctx.id('after'), type: 'image', startMs: 0, endMs: durationMs, tracks: { x: [kf(0, cx)], y: [kf(0, design.h / 2)] }, props: untagged(photoProps(after, size)) }],
        });
        layers.push(rect(ctx, 'divider', { w: Math.max(4, u * 0.006), h: design.h, x: 0, y: design.h / 2, fill: roleFill('ink'), tracks: { x: progressKeys.map((key) => ({ ...key, v: key.v * design.w })) } }));
        layers.push(rect(ctx, 'knob', { w: u * 0.07, h: u * 0.07, x: 0, y: design.h / 2, ellipse: true, fill: roleFill('ink'), tracks: { x: progressKeys.map((key) => ({ ...key, v: key.v * design.w })) } }));
        layers.push(placeText(ctx, slot('after'), inputs, { sizePx: u * 0.045, maxWidthPx: u * 0.4, x: safe.x, y: safe.y, anchorX: 0, reveal: LINE(300), pill: { x: u * 0.025, y: u * 0.012, radius: u * 0.02 }, fill: roleFill('onAccent') }).layer);
        layers.push(placeText(ctx, slot('before'), inputs, { sizePx: u * 0.045, maxWidthPx: u * 0.4, x: safe.x + safe.w, y: safe.y, anchorX: 1, reveal: LINE(400), pill: { x: u * 0.025, y: u * 0.012, radius: u * 0.02 }, fill: roleFill('onAccent') }).layer);
        break;
      }

      case 'turntable': {
        topHeadline();
        const size = Math.min(stageH * 0.75, u * 0.58);
        const y = stageCy - size * 0.05;
        layers.push(rect(ctx, 'plinth', { w: size * 1.1, h: size * 0.2, x: cx, y: y + size * 0.62, ellipse: true, fill: roleFill('ink', 0.12) }));
        layers.push(glow(ctx, { x: cx, y }, size * 2, 0.25));
        layers.push(hero(size, { x: cx, y }, sampled(0, durationMs, 60, (ms) => ({
          x: cx,
          y: y + Math.sin(ms / 800) * u * 0.008,
          turnY: Math.sin((ms / durationMs) * Math.PI * 4) * 38,
          opacity: Math.min(1, ms / 500),
        }))));
        bottomSubline(1000);
        break;
      }

      case 'spec':
      case 'price': {
        const side = !tall;
        const size = side ? Math.min(safe.h * 0.7, safe.w * 0.48) : Math.min(u * 0.6, (floor - safe.y) * 0.45);
        const photoX = side ? safe.x + safe.w * 0.28 : cx;
        const photoY = side ? design.h / 2 : safe.y + size * 0.62;
        layers.push(glow(ctx, { x: photoX, y: photoY }, size * 2, 0.22));
        layers.push(hero(size, { x: photoX, y: photoY }, { x: [kf(0, photoX - u * 0.06), kf(800, photoX, 'outExpo')], opacity: [kf(0, 0), kf(500, 1)] }));
        const colX = side ? safe.x + safe.w * 0.6 : safe.x + safe.w * 0.1;
        let y = side ? design.h / 2 - u * 0.22 : photoY + size * 0.68;
        const headPlaced = placeText(ctx, headline, inputs, { sizePx: u * 0.06, maxWidthPx: side ? safe.w * 0.4 : safe.w * 0.85, x: side ? colX : cx, y, anchorX: side ? 0 : 0.5, reveal: RISE(500) });
        layers.push(headPlaced.layer);
        y += headPlaced.height + u * 0.05;
        if (kind === 'spec') {
          for (let i = 0; i < 3; i++) {
            const at = 1000 + i * 350;
            layers.push(rect(ctx, 'bullet', { w: u * 0.018, h: u * 0.018, x: (side ? colX : cx - u * 0.25) + u * 0.009, y: y + u * 0.022, ellipse: true, fill: roleFill('accent'), tracks: { scaleX: [kf(at, 0), kf(at + 250, 1, 'outBack')], scaleY: [kf(at, 0), kf(at + 250, 1, 'outBack')] } }));
            layers.push(placeText(ctx, slot(`spec${i + 1}`), inputs, { sizePx: u * 0.038, maxWidthPx: side ? safe.w * 0.36 : u * 0.5, x: (side ? colX : cx - u * 0.25) + u * 0.04, y, anchorX: 0, reveal: { kind: 'kinetic', unit: 'line', motion: 'slideRight', startMs: at, durationMs: 450, staggerMs: 0 } }).layer);
            y += u * 0.075;
          }
        } else {
          const priceX = side ? colX : cx;
          const price = placeText(ctx, slot('price'), inputs, { sizePx: u * 0.13, maxWidthPx: side ? safe.w * 0.4 : safe.w * 0.8, x: priceX, y, anchorX: side ? 0 : 0.5, fill: roleFill('accent'), reveal: { kind: 'kinetic', unit: 'line', motion: 'pop', startMs: 1100, durationMs: 500, staggerMs: 0 } });
          layers.push(price.layer);
          const was = placeText(ctx, slot('was'), inputs, { sizePx: u * 0.05, maxWidthPx: u * 0.4, x: priceX, y: y + price.height + u * 0.01, anchorX: side ? 0 : 0.5, fill: roleFill('inkMuted'), reveal: LINE(1500) });
          layers.push(was.layer);
          layers.push(rect(ctx, 'strike', { w: was.width + u * 0.02, h: Math.max(3, u * 0.006), x: side ? priceX - u * 0.01 : priceX, y: y + price.height + u * 0.01 + was.height * 0.5, anchorX: side ? 0 : 0.5, fill: roleFill('inkMuted'), tracks: { scaleX: [kf(1800, 0), kf(2100, 1)] } }));
        }
        break;
      }

      case 'detail': {
        // The whole product, then a round lens that drifts over it, magnifying.
        topHeadline();
        const size = Math.min(stageH * 0.85, u * 0.7);
        const photo = photos[0];
        if (!photo) break;
        layers.push(hero(size, { x: cx, y: stageCy }, { opacity: [kf(0, 0), kf(600, 1)] }));
        const lens = u * 0.3;
        const zoom = 2.2;
        const path = (ms: number): { x: number; y: number } => {
          const t = Math.max(0, ms - 900) / Math.max(1, durationMs - 900);
          return { x: cx + Math.sin(t * Math.PI * 2) * size * 0.2, y: stageCy + Math.sin(t * Math.PI * 4) * size * 0.14 };
        };
        const lensTracks = sampled(0, durationMs, 80, (ms) => ({ ...path(ms), opacity: Math.min(1, Math.max(0, (ms - 900) / 400)) }));
        const big = photoProps(photo, size * zoom);
        layers.push({
          id: ctx.id('lens'), type: 'mask', startMs: 0, endMs: durationMs,
          tracks: lensTracks,
          props: { shape: 'ellipse', w: lens, h: lens },
          children: [{
            id: ctx.id('magnified'), type: 'image', startMs: 0, endMs: durationMs,
            // In the lens's own space, centred on it: the photo is offset the
            // other way, so the lens shows, enlarged, the part it is over.
            tracks: sampled(0, durationMs, 80, (ms) => {
              const at = path(ms);
              return { x: -(at.x - cx) * zoom, y: -(at.y - stageCy) * zoom };
            }),
            props: untagged(big),
          }],
        });
        layers.push(rect(ctx, 'lensRing', { w: lens, h: lens, x: cx, y: stageCy, ellipse: true, fill: roleFill('accent', 0), stroke: { paint: roleFill('ink', 0.9), width: Math.max(3, u * 0.006) }, tracks: lensTracks }));
        bottomSubline(1300);
        break;
      }
    }

    return layers;
  };

  return defineScene(variant, { textSlots: slots, build });
}
