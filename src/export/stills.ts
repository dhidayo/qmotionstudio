import type { Project } from '@/document/types';
import type { Size } from '@/core/types';
import { sceneSpans, type SceneSpan } from '@/document/select/timeline';
import { videoDemands } from '@/document/select/media';
import { createRenderRig } from '@/core/render/rig';
import { renderFrame } from '@/core/render/renderFrame';
import { loadTemplate } from '@/templates/registry';
import type { MediaStore } from '@/media/store';

/**
 * A video's scenes as still pictures (D-135): an Instagram carousel, a
 * LinkedIn document, a set of posts — one slide per scene, from the same
 * renderer as the preview and the video, so a slide is exactly the scene.
 *
 * The roadmap's Carousel Studio, started from what already exists: every
 * scene is already a designed slide.
 */
export type Still = { readonly name: string; readonly blob: Blob; readonly width: number; readonly height: number };

/**
 * When a scene is at its fullest: late enough that everything has arrived,
 * clear of the transition that brings it in, and before the next one begins
 * to cover it.
 */
export function settledMoment(span: SceneSpan, next: SceneSpan | undefined): number {
  const enterEnd = span.transitionIn === null ? span.startMs : Math.max(span.startMs, span.transitionEndMs);
  const leaveStart = next && next.transitionIn !== null && next.transitionIn.kind !== 'cut' ? next.transitionStartMs : span.endMs;
  const latest = Math.max(enterEnd, leaveStart - 80);
  const preferred = span.startMs + (span.endMs - span.startMs) * 0.72;
  return Math.max(enterEnd + 80, Math.min(preferred, latest));
}

export async function renderStills(options: {
  readonly project: Project;
  readonly media: MediaStore;
  readonly size: Size;
  readonly watermark: boolean;
  readonly type: 'image/png' | 'image/jpeg';
  readonly stem: string;
  readonly onProgress?: (done: number, total: number) => void;
}): Promise<Still[]> {
  const { project, media, size, watermark, type, stem, onProgress } = options;
  // Every scene's design, before any is drawn: a design still loading draws a blank.
  await Promise.all([...new Set(project.scenes.map((scene) => scene.templateId))]
    .filter((id) => !id.startsWith('__'))
    .map((id) => loadTemplate(id)));

  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Images: could not acquire a 2D context.');
  const rig = createRenderRig(media, () => watermark);

  const spans = sceneSpans(project.scenes);
  const extension = type === 'image/png' ? 'png' : 'jpg';
  const stills: Still[] = [];
  for (const [i, span] of spans.entries()) {
    const at = settledMoment(span, spans[i + 1]);
    // A video layer at that moment is decoded first, as the video export does (D-051).
    for (const demand of videoDemands(project, at)) await media.prefetchVideo(demand.mediaId, demand.timeMs);
    renderFrame(ctx, project, at, rig);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((made) => { if (made) resolve(made); else reject(new Error(`Images: slide ${i + 1} could not be encoded.`)); }, type, 0.92);
    });
    const number = spans.length > 1 ? `-${String(i + 1).padStart(2, '0')}` : '';
    stills.push({ name: `${stem}${number}.${extension}`, blob, width: size.w, height: size.h });
    onProgress?.(i + 1, spans.length);
  }
  return stills;
}
