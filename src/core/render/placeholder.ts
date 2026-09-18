import type { Ctx2D, Palette } from '@/core/types';
import type { Viewport } from '@/core/math/aspect';

/**
 * The M0 diagnostic frame.
 *
 * This exists to prove §6.5's layout contract before any template exists, and
 * it is deliberately built out of shapes that fail *visibly* if the maths is
 * wrong:
 *
 *  - the circle becomes an ellipse if the scale is not uniform;
 *  - the corner brackets drift off the safe area if the inset is miscomputed;
 *  - the crosshair leaves the centre if the design box is wrong;
 *  - the sweep hand stops if globalTimeMs is not reaching the renderer.
 *
 * It is replaced by real template output at M2.
 */
export function drawPlaceholderFrame(
  ctx: Ctx2D,
  vp: Viewport,
  palette: Palette,
  timeMs: number,
): void {
  const { design, safe } = vp;
  const cx = design.w / 2;
  const cy = design.h / 2;
  const unit = Math.min(design.w, design.h);

  // ── Background ────────────────────────────────────────────────────────────
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, design.w, design.h);

  const grad = ctx.createLinearGradient(0, 0, design.w, design.h);
  grad.addColorStop(0, palette.surface);
  grad.addColorStop(1, palette.bg);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, design.w, design.h);
  ctx.globalAlpha = 1;

  // ── Safe area ─────────────────────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = palette.inkMuted;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = unit * 0.002;
  ctx.setLineDash([unit * 0.014, unit * 0.014]);
  ctx.strokeRect(safe.x, safe.y, safe.w, safe.h);
  ctx.restore();

  // ── Corner brackets, pinned to the safe area ──────────────────────────────
  const arm = unit * 0.055;
  ctx.save();
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = unit * 0.006;
  ctx.lineCap = 'square';
  const corners: readonly (readonly [number, number, number, number])[] = [
    [safe.x, safe.y, 1, 1],
    [safe.x + safe.w, safe.y, -1, 1],
    [safe.x, safe.y + safe.h, 1, -1],
    [safe.x + safe.w, safe.y + safe.h, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + arm * dx, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + arm * dy);
    ctx.stroke();
  }
  ctx.restore();

  // ── The uniform-scale proof: a true circle ────────────────────────────────
  const r = unit * 0.2;
  ctx.save();
  ctx.strokeStyle = palette.ink;
  ctx.globalAlpha = 0.14;
  ctx.lineWidth = unit * 0.0035;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Sweep hand — proves globalTimeMs reaches the renderer and the loop is live.
  const sweep = (timeMs / 4000) * Math.PI * 2;
  ctx.save();
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = unit * 0.008;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + sweep);
  ctx.stroke();
  ctx.restore();

  // ── Centre crosshair ──────────────────────────────────────────────────────
  const tick = unit * 0.028;
  ctx.save();
  ctx.strokeStyle = palette.ink;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = unit * 0.002;
  ctx.beginPath();
  ctx.moveTo(cx - tick, cy);
  ctx.lineTo(cx + tick, cy);
  ctx.moveTo(cx, cy - tick);
  ctx.lineTo(cx, cy + tick);
  ctx.stroke();
  ctx.restore();

  // ── Type ──────────────────────────────────────────────────────────────────
  // System font here on purpose: M0 has no font pipeline yet, and §3E forbids
  // drawing real content in a fallback face. This frame is a test card, not
  // content, so it is the one place that is allowed to use whatever is present.
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = palette.ink;
  ctx.font = `600 ${unit * 0.062}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText('MOTION STUDIO', cx, cy - unit * 0.3);

  ctx.fillStyle = palette.accent;
  ctx.font = `700 ${unit * 0.05}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(vp.aspect, cx, cy + unit * 0.3);

  ctx.fillStyle = palette.inkMuted;
  ctx.font = `400 ${unit * 0.024}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(
    `${Math.round(vp.px.w)}×${Math.round(vp.px.h)} px  ·  ${Math.round(design.w)}×${Math.round(design.h)} du  ·  ${vp.scale.toFixed(3)}×`,
    cx,
    cy + unit * 0.365,
  );
  ctx.restore();
}
