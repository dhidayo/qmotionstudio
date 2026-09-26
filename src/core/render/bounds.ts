import { DEFAULT_SAFE_INSET, renderSizeFor } from '@/core/math/aspect';
import { layoutText, type TextMeasureContext } from '@/core/text/layout';
import { fontString } from '@/fonts/registry';
import type { Aspect, Layer, Rect, Size } from '@/core/types';
import type { Overlay, SceneInputs } from '@/document/types';
import { overlayLayer } from './overlays';

/**
 * Where things are on the frame, for direct manipulation.
 *
 * The renderer knows where every layer ends up, but only while it is drawing
 * one — `drawLayer` composes a transform into the context and forgets it. To
 * put a selection box round something, or to decide what the pointer just
 * landed on, the geometry has to exist as a *value*. That is this file.
 *
 * It computes, never draws. Nothing here touches a canvas except to measure
 * text, and nothing here runs in the render loop.
 *
 * ── One coordinate space ─────────────────────────────────────────────────
 * Every box is returned in the project's design units: a box whose short edge
 * is 1080 and whose aspect is the frame's, which `makeViewport` maps onto the
 * canvas with one uniform scale (§6.5).
 *
 * That single space is enough for scene content too, which is not obvious. A
 * scene template gets its *own* design box, sized from its `designSize` — but
 * `makeViewport` always fits the short edge, so every design box in play has
 * the frame's aspect and differs from this one only by a scalar. Anything
 * expressed as a fraction of the short edge — which is how templates are
 * written, and how §8.3's logo size and the safe inset are both defined —
 * therefore lands in the same place in this space as in its own. So the logo
 * needs no special coordinate pathway, and neither will a scene photo.
 */

/**
 * The project's design box short edge, matching `renderFrame`'s PROJECT_DESIGN.
 * Overlay placement is normalised (D-044), so this number never reaches the
 * document — it exists so boxes have units to be measured in.
 */
export const DESIGN_SHORT_EDGE = 1080;

export function projectDesign(aspect: Aspect): Size {
  return renderSizeFor(aspect, DESIGN_SHORT_EDGE);
}

/** §6.5's content-safe box, in the same design units. */
export function safeBox(design: Size): Rect {
  const inset = Math.min(design.w, design.h) * DEFAULT_SAFE_INSET;
  return {
    x: inset,
    y: inset,
    w: Math.max(0, design.w - inset * 2),
    h: Math.max(0, design.h - inset * 2),
  };
}

/**
 * A rectangle about its own centre, possibly turned.
 *
 * Centre-origin rather than top-left because that is what the renderer uses
 * (`drawLayer` translates to the layer's anchor first), and converting between
 * the two at every step is how sign errors get in.
 */
export type OrientedBox = {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
  /** Degrees, clockwise, matching `tracks.rotation`. */
  readonly rotation: number;
};

/**
 * The box round an overlay, at rest.
 *
 * Deliberately built from the overlay's *static* transform rather than from
 * its animated tracks. An entrance preset moves and scales the content for its
 * first half-second, and handles that slid around during it would be
 * unusable — you would be chasing the thing you are trying to grab. What the
 * user drags is the placement; the animation is a property of the placement,
 * not a competitor to it.
 *
 * Returns null for an overlay with nothing to draw.
 */
export function overlayBox(
  overlay: Overlay,
  aspect: Aspect,
  measure: TextMeasureContext,
): OrientedBox | null {
  const design = projectDesign(aspect);
  const built = overlayLayer(overlay, { design, id: idFactory() });
  if (!built) return null;

  const size = layerSize(content(built), measure);
  if (size === null) return null;

  const t = overlay.transform;
  const scaleX = t.scaleX ?? 1;
  const scaleY = t.scaleY ?? t.scaleX ?? 1;

  return {
    cx: design.w * (t.x ?? 0.5),
    cy: design.h * (t.y ?? 0.5),
    w: size.w * scaleX,
    h: size.h * scaleY,
    rotation: t.rotation ?? 0,
  };
}

/**
 * The box round §8.3's logo.
 *
 * `logo.x`/`logo.y` are normalised against the *safe* box, not the frame —
 * that is what `placementOf` in the template chrome does with them, and the
 * two have to agree or the selection box lands somewhere the logo is not.
 */
export function logoBox(inputs: SceneInputs, aspect: Aspect): OrientedBox | null {
  const { logo } = inputs;
  if (logo.mediaId === null) return null;

  const design = projectDesign(aspect);
  const safe = safeBox(design);
  const size = Math.min(design.w, design.h) * (logo.sizePct / 100);
  const half = size / 2;

  const [cx, cy] = ((): [number, number] => {
    switch (logo.placement) {
      case 'topLeft': return [safe.x + half, safe.y + half];
      case 'topRight': return [safe.x + safe.w - half, safe.y + half];
      case 'bottomLeft': return [safe.x + half, safe.y + safe.h - half];
      case 'bottomRight': return [safe.x + safe.w - half, safe.y + safe.h - half];
      case 'center': return [safe.x + safe.w / 2, safe.y + safe.h / 2];
      case 'free': return [safe.x + safe.w * logo.x, safe.y + safe.h * logo.y];
    }
  })();

  return { cx, cy, w: size, h: size, rotation: 0 };
}

/** The inverse of `logoBox`: a point on the frame back to normalised safe-box coords. */
export function logoFreeFrom(point: { x: number; y: number }, aspect: Aspect): { x: number; y: number } {
  const safe = safeBox(projectDesign(aspect));
  return {
    x: safe.w > 0 ? (point.x - safe.x) / safe.w : 0.5,
    y: safe.h > 0 ? (point.y - safe.y) / safe.h : 0.5,
  };
}

/** Is `point` inside the box? Rotation-aware, so a turned box is not a loose fit. */
export function hits(box: OrientedBox, point: { x: number; y: number }): boolean {
  const local = toLocal(box, point);
  return Math.abs(local.x) <= box.w / 2 && Math.abs(local.y) <= box.h / 2;
}

/** A point expressed in the box's own unrotated frame, origin at its centre. */
export function toLocal(box: OrientedBox, point: { x: number; y: number }): { x: number; y: number } {
  const radians = (-box.rotation * Math.PI) / 180;
  const dx = point.x - box.cx;
  const dy = point.y - box.cy;
  return {
    x: dx * Math.cos(radians) - dy * Math.sin(radians),
    y: dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

/** The reverse of `toLocal`. */
export function toFrame(box: OrientedBox, local: { x: number; y: number }): { x: number; y: number } {
  const radians = (box.rotation * Math.PI) / 180;
  return {
    x: box.cx + local.x * Math.cos(radians) - local.y * Math.sin(radians),
    y: box.cy + local.x * Math.sin(radians) + local.y * Math.cos(radians),
  };
}

/** Deterministic ids, as `OverlayBuildContext` requires. Never rendered. */
function idFactory(): (prefix: string) => string {
  let counter = 0;
  return (prefix) => `${prefix}-bounds-${counter++}`;
}

/** Unwraps the mask that `wipeIn` puts round its content. */
function content(layer: Layer): Layer {
  if (layer.type === 'mask') {
    const child = layer.children[0];
    if (child) return child;
  }
  return layer;
}

/**
 * How big the drawable actually is.
 *
 * Read off the built layer's own props rather than recomputed from the
 * overlay, so this cannot drift from what the renderer draws — the two would
 * disagree silently, and a selection box that is subtly wrong is worse than
 * none at all.
 */
function layerSize(layer: Layer, measure: TextMeasureContext): Size | null {
  switch (layer.type) {
    case 'image':
    case 'video':
      return { w: layer.props.w, h: layer.props.h };

    case 'shape':
    case 'mask':
      return { w: layer.props.w, h: layer.props.h };

    case 'text': {
      const props = layer.props;
      const run = layoutText(measure, {
        text: props.text,
        font: fontString(props.fontId, props.fontSizePx, props.weight),
        fontSizePx: props.fontSizePx,
        letterSpacingPx: (props.letterSpacingPct / 100) * props.fontSizePx,
        lineHeight: props.lineHeight,
        align: props.align,
        maxWidthPx: props.maxWidthPx,
      });
      // A pill draws outside the glyphs, and it is the part the eye reads as
      // the edge of the object, so it is the part the handles have to sit on.
      const padX = props.pill ? props.pill.paddingX : 0;
      const padY = props.pill ? props.pill.paddingY : 0;
      return { w: run.width + padX * 2, h: run.height + padY * 2 };
    }

    case 'gradient':
    case 'group':
      return null;
  }
}
