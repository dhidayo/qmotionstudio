import { DEFAULT_SAFE_INSET, renderSizeFor } from '@/core/math/aspect';
import { layoutText, type TextMeasureContext } from '@/core/text/layout';
import { fontString } from '@/fonts/registry';
import type { Aspect, Layer, Rect, Size } from '@/core/types';
import type { Overlay, SceneInputs } from '@/document/types';
import { createProps, resolveProps } from '@/core/anim/interpolate';
import { NO_SLOT_TRANSFORM, type SlotKey, type SlotTransform } from '@/document/types';
import { poseAt } from '@/document/select/overlay';
import type { DrawnScene } from './rig';
import { overlayLayer } from './overlays';
import { lockupSpec, logoGeometry } from './logo';
import { nudgeAt, slotKey, slotOf } from './slots';
import { depthOrdered, turnOf } from './depth';

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
 * A box, plus how to get back from it to the thing that positions it.
 *
 * `anchorOffset` is the gap between the layer's own (x, y) and the centre of
 * what it draws, in the layer's unrotated frame and already scaled. Editing
 * needs it in both directions: the box is drawn at the centre, but a drag has
 * to write back a *position*, and for an anchored layer those are not the same
 * point. Getting this wrong makes every drag overshoot by a constant — which
 * is invisible for a centre-anchored photo and exactly half a line of text for
 * a caption.
 */
export type PlacedBox = OrientedBox & {
  readonly anchorOffset: { readonly x: number; readonly y: number };
};

/**
 * The box round an overlay, at rest.
 *
 * Built from the overlay's *placement*, not from the tracks the renderer ends
 * up drawing. An entrance preset moves and scales the content for its first
 * half-second, and handles that slid around during it would be unusable — you
 * would be chasing the thing you are trying to grab.
 *
 * Where the overlay has a motion path, the placement is itself a function of
 * time, so `atMs` picks the pose. That is still the placement rather than the
 * preset: the handles sit where the overlay has been told to be at this
 * moment, which is exactly what a drag is about to change.
 *
 * Returns null for an overlay with nothing to draw.
 */
export function overlayBox(
  overlay: Overlay,
  aspect: Aspect,
  measure: TextMeasureContext,
  /** The overlay's own local time. Irrelevant unless it is animated. */
  atMs = 0,
): PlacedBox | null {
  const design = projectDesign(aspect);
  const built = overlayLayer(overlay, { design, id: idFactory() });
  if (!built) return null;

  const extent = layerExtent(content(built), measure);
  if (extent === null) return null;

  const t = poseAt(overlay, atMs);
  const scaleX = t.scaleX ?? 1;
  const scaleY = t.scaleY ?? t.scaleX ?? 1;
  const rotation = t.rotation ?? 0;

  const anchorOffset = { x: extent.offset.x * scaleX, y: extent.offset.y * scaleY };
  const centre = shiftBy(
    { x: design.w * (t.x ?? 0.5), y: design.h * (t.y ?? 0.5) },
    anchorOffset,
    rotation,
  );

  return {
    cx: centre.x,
    cy: centre.y,
    w: extent.size.w * scaleX,
    h: extent.size.h * scaleY,
    rotation,
    anchorOffset,
  };
}

/**
 * The box round §8.3's logo — and its lockup, which moves with it (D-101).
 *
 * Computed by the same `logoGeometry` the renderer draws with, so the box is
 * wherever the logo is by construction rather than by two pieces of arithmetic
 * agreeing. `anchorOffset` runs from the logo image's centre — which is what
 * `logo.x`/`logo.y` place — to the centre of the box, so a drag of the box can
 * be written back as a position.
 */
export function logoBox(
  inputs: SceneInputs,
  aspect: Aspect,
  measure: TextMeasureContext,
  /** The logo image's width over its height, once it has decoded. */
  imageAspect = 1,
): PlacedBox | null {
  const { logo } = inputs;
  if (logo.mediaId === null) return null;

  const design = projectDesign(aspect);
  const geometry = logoGeometry(logo, design, safeBox(design), imageAspect, (text, fontSizePx) => {
    const run = layoutText(measure, lockupSpec(text, fontSizePx));
    return { w: run.width, h: run.height };
  });
  const { unit, image } = geometry;
  const cx = unit.x + unit.w / 2;
  const cy = unit.y + unit.h / 2;
  return { cx, cy, w: unit.w, h: unit.h, rotation: 0, anchorOffset: { x: cx - image.cx, y: cy - image.cy } };
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

/** `point` plus a local offset turned by `degrees`. */
export function shiftBy(
  point: { x: number; y: number },
  local: { x: number; y: number },
  degrees: number,
): { x: number; y: number } {
  if (local.x === 0 && local.y === 0) return point;
  const radians = (degrees * Math.PI) / 180;
  return {
    x: point.x + local.x * Math.cos(radians) - local.y * Math.sin(radians),
    y: point.y + local.x * Math.sin(radians) + local.y * Math.cos(radians),
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
type Extent = {
  readonly size: Size;
  /**
   * Where the drawn rectangle's centre sits relative to the layer's own
   * (x, y), before scale and rotation.
   *
   * Not always zero, which was the assumption that put every selection box in
   * the wrong place for text. `drawLayer` positions a layer by its *anchor*,
   * which defaults to the centre but which templates set to the top-left
   * forty times over — and for text the anchor box is the declared wrap width
   * by zero height, so the glyphs always run downwards from y whatever
   * `anchorY` says.
   */
  readonly offset: { readonly x: number; readonly y: number };
};

function layerExtent(layer: Layer, measure: TextMeasureContext): Extent | null {
  const anchorX = layer.anchorX ?? 0.5;
  const anchorY = layer.anchorY ?? 0.5;

  switch (layer.type) {
    case 'image':
    case 'video':
    case 'shape':
    case 'mask': {
      const size = { w: layer.props.w, h: layer.props.h };
      return {
        size,
        offset: { x: size.w * (0.5 - anchorX), y: size.h * (0.5 - anchorY) },
      };
    }

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
      // Symmetric, so it grows the box without moving its centre.
      const padX = props.pill ? props.pill.paddingX : 0;
      const padY = props.pill ? props.pill.paddingY : 0;

      /*
       * `drawLayer` uses (maxWidthPx ?? 0) × 0 as the anchor box for text and
       * `drawText` lays the lines out rightwards and downwards from there,
       * aligned within the same declared width. The handles go round the
       * glyphs, not round the block, so the alignment offset has to be walked
       * back in — otherwise a centred caption gets a box the width of its
       * whole wrap column.
       */
      const blockWidth = props.maxWidthPx ?? run.width;
      const alignOffset =
        props.align === 'left' ? 0
        : props.align === 'right' ? blockWidth - run.width
        : (blockWidth - run.width) / 2;

      return {
        size: { w: run.width + padX * 2, h: run.height + padY * 2 },
        offset: {
          x: alignOffset + run.width / 2 - (props.maxWidthPx ?? 0) * anchorX,
          y: run.height / 2,
        },
      };
    }

    case 'group': {
      /*
       * A group has no box of its own — its children are positioned in its
       * space, about its origin. When a group stands for an element (D-090),
       * the handles go round its first child that has a size, at that child's
       * resting place: for a photo that breaks apart as it leaves, that is the
       * photo before it breaks.
       */
      for (const child of layer.children) {
        const inner = layerExtent(child, measure);
        if (!inner) continue;
        const rest = resolveProps(child.tracks, 0, createProps());
        return {
          size: inner.size,
          offset: {
            x: rest.x + inner.offset.x * rest.scaleX,
            y: rest.y + inner.offset.y * rest.scaleY,
          },
        };
      }
      return null;
    }

    case 'gradient':
      return null;
  }
}

/**
 * A box round one of the template's own elements (B).
 *
 * `slot` identifies it in the document, so the same value can be handed
 * straight to `nudgeSlot`.
 */
export type SlotBox = {
  readonly key: SlotKey;
  readonly box: OrientedBox;
  readonly label: string;
};

/**
 * Boxes for every element the template tagged, in the frame's design units.
 *
 * Two things are combined here, and keeping them apart is the point. The base
 * position comes from the layers *as the template built them*, evaluated at
 * the scene's current time — so a photo that drifts across the scene has its
 * box where the photo actually is. The nudge comes from the document and is
 * added on top, so during a drag the box follows the pointer immediately
 * rather than waiting for the next frame to be rendered and read back.
 *
 * Scene design units are converted to the frame's. Both boxes share the
 * frame's aspect and differ only by a scalar, so this is one multiply — the
 * same fact that let the logo skip having a coordinate space of its own.
 */
export function slotBoxes(
  drawn: DrawnScene,
  /** Scene-local time, after §8.4's speed remap. */
  sceneTimeMs: number,
  transforms: Readonly<Record<SlotKey, SlotTransform>>,
  aspect: Aspect,
  measure: TextMeasureContext,
): readonly SlotBox[] {
  const frame = projectDesign(aspect);
  const toFrameUnits = frame.w / drawn.design.w;
  const seen = new Set<SlotKey>();
  const boxes: SlotBox[] = [];

  for (const { layer, parent } of flatten(drawn.layers, sceneRoot(sceneTimeMs))) {
    const slot = slotOf(layer);
    if (!slot) continue;

    const key = slotKey(slot);
    // A template may build several drawables from one slot — a photo and its
    // reflection, say. They all move together, but only the first gets the
    // handles, and it is the one the template drew first.
    if (seen.has(key)) continue;

    /*
     * Only what is on screen now.
     *
     * A layer outside its own time window draws nothing, so it must not be
     * clickable either. Templates that show photographs one after another put
     * them all in the same place — Card Stack, Flip Cards, every Soft Pop reel
     * — and without this a click on the photograph you can see selected one
     * you could not. Skipped *before* `seen`, so the same slot's visible layer
     * still gets the handles.
     */
    if (parent.timeMs < layer.startMs || parent.timeMs >= layer.endMs) continue;

    const extent = layerExtent(layer, measure);
    if (extent === null) continue;

    // The layer's own clock, which is its parent's minus its own start — not
    // the scene's. For anything a template put inside a group or a mask the two
    // differ, and so did the box and the photograph it was supposed to be on.
    const localMs = Math.max(0, parent.timeMs - layer.startMs);
    const props = resolveProps(layer.tracks, localMs, createProps());

    /*
     * Sampled at this moment, not read as a constant: a keyframed nudge moves,
     * and handles that stayed at its resting place would be pointing at where
     * the element used to be.
     *
     * On the *layer's* clock, because that is the clock the renderer reads it
     * on: a nudge becomes keyframes inside this layer's own tracks, so its pose
     * times are local times by the time anything is drawn. Sampling it against
     * the scene put the handles somewhere else entirely on every template whose
     * elements start partway through — which is most of the cycling ones.
     */
    const nudge = nudgeAt(transforms[key] ?? NO_SLOT_TRANSFORM, localMs);

    // The nudge is already composed into the tracks the renderer draws, but
    // these are the *base* layers, so it has to be added here as well.
    // A turned card is drawn narrower (D-117), and so is its box.
    const turn = turnOf(props.turnY, props.turnX);
    const ownScaleX = props.scaleX * nudge.scale * (turn ? Math.abs(turn.a) : 1);
    const ownScaleY = props.scaleY * nudge.scale * (turn ? Math.abs(turn.d) : 1);
    const ownRotation = props.rotation + nudge.rotation;

    // Two steps, because the two offsets live in different spaces: the anchor
    // offset is in the layer's own, and the layer's position is in its parent's.
    const inParent = shiftBy(
      { x: props.x, y: props.y },
      { x: extent.offset.x * ownScaleX, y: extent.offset.y * ownScaleY },
      ownRotation,
    );
    const centre = shiftBy(
      { x: parent.x, y: parent.y },
      { x: inParent.x * parent.scaleX, y: inParent.y * parent.scaleY },
      parent.rotation,
    );

    const scaleX = ownScaleX * parent.scaleX;
    const scaleY = ownScaleY * parent.scaleY;
    const rotation = ownRotation + parent.rotation;

    seen.add(key);
    boxes.push({
      key,
      label: slot.kind === 'photo' ? `Photo ${slot.index + 1}` : labelFor(slot.key),
      box: {
        cx: centre.x * toFrameUnits + nudge.offsetX * frame.w,
        cy: centre.y * toFrameUnits + nudge.offsetY * frame.h,
        w: extent.size.w * scaleX * toFrameUnits,
        h: extent.size.h * scaleY * toFrameUnits,
        rotation,
      },
    });
  }

  return boxes;
}

/**
 * Where a layer's parent sits in the scene, and what time it is showing.
 *
 * A group or a mask is a coordinate space and a clock, not just a container:
 * `drawLayer` draws its children inside its own transform and hands them its
 * own local time. A child's `x` of 0 therefore means "at my parent's centre",
 * not "at the left edge of the frame".
 *
 * Nothing carried this down, so every tagged drawable inside a mask was
 * measured as though it were a top-level layer. Phrase Swap puts its
 * photographs inside a mask at the centre of the frame, scaling from 0.6 to
 * 1.12, and its selection box sat in the top-left corner at the wrong size for
 * the whole scene.
 */
type Ancestry = {
  readonly timeMs: number;
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotation: number;
};

function sceneRoot(timeMs: number): Ancestry {
  return { timeMs, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
}

/** Groups and masks hold children; a tagged drawable may be inside either. */
function* flatten(
  layers: readonly Layer[],
  parent: Ancestry,
): Generator<{ layer: Layer; parent: Ancestry }> {
  for (const layer of layers) {
    yield { layer, parent };
    if (layer.type !== 'group' && layer.type !== 'mask') continue;
    // A container that is not drawn now draws none of its children either.
    if (parent.timeMs < layer.startMs || parent.timeMs >= layer.endMs) continue;

    const localMs = Math.max(0, parent.timeMs - layer.startMs);
    const own = resolveProps(layer.tracks, localMs, createProps());
    const origin = shiftBy(
      { x: parent.x, y: parent.y },
      { x: own.x * parent.scaleX, y: own.y * parent.scaleY },
      parent.rotation,
    );

    // In the order they are drawn now, so the one in front is the one picked (D-117).
    const children = layer.type === 'group' && layer.props.depthSort === true
      ? depthOrdered(layer.children, localMs)
      : layer.children;
    yield* flatten(children, {
      timeMs: localMs,
      x: origin.x,
      y: origin.y,
      scaleX: parent.scaleX * own.scaleX,
      scaleY: parent.scaleY * own.scaleY,
      rotation: parent.rotation + own.rotation,
    });
  }
}

/** "headline" reads better as "Headline" in a selection label. */
function labelFor(key: string): string {
  const spaced = key.replace(/[-_]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
