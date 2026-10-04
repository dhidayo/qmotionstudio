import type { Keyframe, Layer, Size } from '@/core/types';
import type { PhotoInput } from '@/document/types';
import { slotOf } from '@/core/render/slots';
import type { SceneTemplate } from '../schema';

/**
 * "Fill frame": a photo that fills the whole canvas (D-115).
 *
 * It used to mean "ignore any inset the template applies" — and no template
 * applied one, so choosing it changed nothing: "Image Fill frame did not
 * really fill frame. I expected it to fill the canvas intelligently." It now
 * does what it says. The photo becomes a full-bleed picture behind the rest of
 * the design — its other photos and its words stay on top and readable — and
 * moves with a slow push-in rather than standing still.
 *
 * Applied to every scene template's output here, after `build`, so every
 * design gets it without knowing it exists, and the preview and the export
 * (which build through the same registry) agree.
 */

/** How far the slow push-in travels over the photo's time on screen. */
const PUSH_IN = 1.06;

export function withPhotoFill(template: SceneTemplate): SceneTemplate {
  return {
    ...template,
    build: (inputs, ctx) => applyPhotoFill(template.build(inputs, ctx), inputs.photos, ctx.design),
  };
}

export function applyPhotoFill(layers: Layer[], photos: readonly PhotoInput[], design: Size): Layer[] {
  if (!photos.some((photo) => photo.sizeMode === 'fillFrame')) return layers;

  let result = layers;
  photos.forEach((photo, index) => {
    if (photo.sizeMode !== 'fillFrame') return;
    const taken = take(result, index);
    if (!taken) return;
    const at = firstContentIndex(taken.layers);
    result = [...taken.layers.slice(0, at), fillLayer(taken.from, photo, index, design), ...taken.layers.slice(at)];
  });
  return result;
}

/** The layer a slot's photo is drawn by, removed from wherever the template put it. */
function take(layers: readonly Layer[], index: number): { layers: Layer[]; from: Layer } | null {
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (!layer) continue;
    const slot = slotOf(layer);
    if (slot?.kind === 'photo' && slot.index === index) {
      return { layers: [...layers.slice(0, i), ...layers.slice(i + 1)], from: layer };
    }
    if (layer.type === 'group' || layer.type === 'mask') {
      const inner = take(layer.children, index);
      if (inner) {
        // Timed by the outermost layer: a child's times are its container's.
        const container: Layer = { ...layer, children: inner.layers };
        return { layers: [...layers.slice(0, i), container, ...layers.slice(i + 1)], from: layer };
      }
    }
  }
  return null;
}

/**
 * Where a backdrop goes: in front of the background, behind the first thing
 * that is the design's content — a photo or a line of text.
 */
function firstContentIndex(layers: readonly Layer[]): number {
  const index = layers.findIndex(holdsContent);
  if (index >= 0) return index;
  return Math.min(1, layers.length);
}

function holdsContent(layer: Layer): boolean {
  if (slotOf(layer)) return true;
  return (layer.type === 'group' || layer.type === 'mask') && layer.children.some(holdsContent);
}

function fillLayer(from: Layer, photo: PhotoInput, index: number, design: Size): Layer {
  const span = Math.max(1, from.endMs - from.startMs);
  const still = (v: number): readonly Keyframe[] => [{ t: 0, v, ease: 'linear' }];
  const push: readonly Keyframe[] = [{ t: 0, v: 1, ease: 'linear' }, { t: span, v: PUSH_IN, ease: 'linear' }];
  const crop = photo.cropMode === 'original' ? photo.cropRect : undefined;
  // It still arrives the way the design brings its photo in, when that is a fade.
  const opacity = from.tracks.opacity;

  return {
    id: `photo-fill-${index}`,
    type: 'image',
    startMs: from.startMs,
    endMs: from.endMs,
    tracks: {
      x: still(design.w / 2),
      y: still(design.h / 2),
      scaleX: push,
      scaleY: push,
      ...(opacity ? { opacity } : {}),
    },
    props: {
      slot: { kind: 'photo', index },
      mediaId: photo.mediaId,
      w: design.w,
      h: design.h,
      fit: 'cover',
      ...(crop ? { crop } : {}),
    },
  };
}
