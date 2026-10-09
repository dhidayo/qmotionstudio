import { sampleTrack } from '@/core/anim/interpolate';
import type { Layer } from '@/core/types';

/**
 * Depth order and turning (D-117).
 *
 * `depthOrdered` is how a `depthSort` group draws: its children by their
 * animated `z` at this moment, nearest last, ties in the order the template
 * gave. Shared by the renderer and by hit-testing, so what is clicked is what
 * is in front.
 */
export function depthOrdered(children: readonly Layer[], localMs: number): readonly Layer[] {
  if (children.length < 2) return children;
  const keyed = children.map((layer, index) => ({
    layer,
    index,
    z: sampleTrack(layer.tracks.z ?? [], localMs - layer.startMs) ?? 0,
  }));
  keyed.sort((a, b) => a.z - b.z || a.index - b.index);
  return keyed.map((entry) => entry.layer);
}

/**
 * How far a turned layer leans, as a shear per unit of its turn's sine.
 *
 * A 2D canvas cannot draw a true perspective trapezoid, but foreshortening
 * alone reads as a card getting thinner rather than turning. A small shear in
 * the direction of the turn, with the shading below, is what sells it.
 */
const LEAN = 0.12;

/** The narrowest a card gets edge-on: an edge, not nothing. */
const EDGE = 0.02;

export type Turn = { readonly a: number; readonly b: number; readonly c: number; readonly d: number; readonly shade: number };

/** The transform and shading for a layer turned `turnY`° about its vertical axis and `turnX`° about its horizontal. */
export function turnOf(turnY: number, turnX: number): Turn | null {
  if (turnY === 0 && turnX === 0) return null;
  const ry = (turnY * Math.PI) / 180;
  const rx = (turnX * Math.PI) / 180;
  const cy = Math.cos(ry);
  const cx = Math.cos(rx);
  const a = (cy < 0 ? -1 : 1) * Math.max(EDGE, Math.abs(cy));
  const d = (cx < 0 ? -1 : 1) * Math.max(EDGE, Math.abs(cx));
  // Facing away is darker than facing the light, and the back is darkest.
  const shade = Math.min(0.75, (1 - Math.abs(cy)) * 0.45 + (1 - Math.abs(cx)) * 0.45 + (cy < 0 || cx < 0 ? 0.35 : 0));
  return { a, b: Math.sin(ry) * LEAN, c: Math.sin(rx) * LEAN, d, shade };
}
