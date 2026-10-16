import { colorFill } from '@/core/types';
import type { StickerDef } from './types';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutBack = (u: number): number => {
  const x = clamp01(u);
  return 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
};

/**
 * A green tick in a circle: the circle pops in, the tick draws itself on,
 * holds, then the whole thing fades so the loop can start again unseen.
 */
export const check: StickerDef = {
  id: 'check',
  name: 'Check tick',
  category: 'Badges',
  keywords: ['tick', 'done', 'yes', 'correct', 'approved'],
  aspect: 1,
  loopMs: 2200,
  posterMs: 1200,
  primary: colorFill('#2E7D32'),
  secondary: colorFill('#FFFFFF'),
  draw(ctx, s) {
    const r = Math.min(s.w, s.h) / 2;
    const cx = s.w / 2;
    const cy = s.h / 2;
    // 0–0.25 pop, 0.25–0.5 tick strokes on, hold, 0.85–1 fade out.
    const pop = easeOutBack(s.p / 0.25);
    const draw = clamp01((s.p - 0.25) / 0.25);
    const fade = 1 - clamp01((s.p - 0.85) / 0.15);
    if (pop <= 0 || fade <= 0) return;
    ctx.save();
    ctx.globalAlpha *= fade;
    ctx.translate(cx, cy);
    ctx.scale(pop, pop);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.94, 0, Math.PI * 2);
    ctx.fillStyle = s.primary;
    ctx.fill();
    if (draw > 0) {
      // The tick as two strokes, drawn on by length.
      const a = { x: -r * 0.42, y: r * 0.02 };
      const b = { x: -r * 0.12, y: r * 0.32 };
      const c = { x: r * 0.46, y: -r * 0.3 };
      const first = Math.hypot(b.x - a.x, b.y - a.y);
      const second = Math.hypot(c.x - b.x, c.y - b.y);
      const along = draw * (first + second);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      if (along <= first) {
        const u = along / first;
        ctx.lineTo(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
      } else {
        const u = (along - first) / second;
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(b.x + (c.x - b.x) * u, b.y + (c.y - b.y) * u);
      }
      ctx.lineWidth = r * 0.16;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = s.secondary;
      ctx.stroke();
    }
    ctx.restore();
  },
};

export const BADGES: readonly StickerDef[] = [check];
