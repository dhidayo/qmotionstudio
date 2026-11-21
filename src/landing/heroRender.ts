import type { Aspect } from '@/core/types';
import type { Project } from '@/document/types';
import { createProject } from '@/document/defaults';
import { totalDurationMs } from '@/document/select/timeline';
import { createRenderRig, type MediaResolver, type RenderRig } from '@/core/render/rig';
import { renderFrame } from '@/core/render/renderFrame';
import { loadFonts } from '@/fonts/registry';
import { loadTemplate } from '@/templates/registry';
import { designLook } from '@/templates/looks';
import { summaryFor } from '@/templates/manifest';
import { restMomentMs } from '@/templates/restMoment';
import { sampleMediaId, sampleUrl, type SampleName } from '@/media/samples';

/**
 * The landing page's product picture, drawn by the app's own renderer (D-175).
 *
 * Real designs, playing: the same `renderFrame` the studio's preview and the
 * export call, on the same sample photographs a new project starts with, so
 * what the page shows is what the studio makes — not a recording of it.
 *
 * A chunk of its own, loaded once the page has drawn: the designs' stills
 * are on screen first (Hero in Landing.tsx), and this takes their place when
 * it is ready. Kept light for phones: the lightest of the sample photographs,
 * decoded no larger than the picture shows them, a backing store no sharper
 * than twice the screen, and nothing drawn while the picture is off screen,
 * the tab is hidden, or the person has asked for less motion — then it holds
 * the design's own picture moment (D-155) and draws nothing more.
 */

export type HeroDesign = {
  readonly templateId: string;
  readonly aspect: Aspect;
};

/** The lightest samples, about 180KB together; the designs take them in turn. */
const PHOTOS: readonly SampleName[] = ['bloom', 'dusk', 'ember', 'tide'];

/** The longest edge a photograph is decoded at: these pictures are never larger. */
const PHOTO_EDGE = 900;

/** A moment's pause on the last frame before the design starts again. */
const HOLD_MS = 1_200;

export type HeroPlayer = {
  /** Draws, or holds still, as the page asks. */
  setPlaying(playing: boolean): void;
  dispose(): void;
};

async function decodePhotos(): Promise<Map<string, ImageBitmap>> {
  const bitmaps = new Map<string, ImageBitmap>();
  await Promise.all(PHOTOS.map(async (name) => {
    const response = await fetch(sampleUrl(name));
    if (!response.ok) throw new Error(`Sample ${name}: ${response.status}`);
    const blob = await response.blob();
    const probe = await createImageBitmap(blob);
    const scale = Math.min(1, PHOTO_EDGE / Math.max(probe.width, probe.height));
    if (scale === 1) {
      bitmaps.set(sampleMediaId(name), probe);
      return;
    }
    const sized = await createImageBitmap(probe, {
      resizeWidth: Math.round(probe.width * scale),
      resizeHeight: Math.round(probe.height * scale),
      resizeQuality: 'high',
    });
    probe.close();
    bitmaps.set(sampleMediaId(name), sized);
  }));
  return bitmaps;
}

function projectFor(design: HeroDesign): Project {
  const slots = summaryFor(design.templateId)?.photoSlots;
  const photoCount = slots ? Math.max(slots.min, Math.min(PHOTOS.length, slots.max)) : 1;
  const project = createProject({
    templateId: design.templateId,
    aspect: design.aspect,
    look: designLook(design.templateId),
    photoCount,
  });
  // The light photographs, in place of the starter set's first few.
  return {
    ...project,
    scenes: project.scenes.map((scene) => ({
      ...scene,
      inputs: {
        ...scene.inputs,
        photos: scene.inputs.photos.map((photo, i) => ({ ...photo, mediaId: sampleMediaId(PHOTOS[i % PHOTOS.length] ?? 'bloom') })),
      },
    })),
  };
}

type Stage = {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly project: Project;
  readonly rig: RenderRig;
  readonly durationMs: number;
  readonly stillMs: number;
};

/** Sizes the backing store to the canvas as laid out, at most twice the screen. */
function fit(canvas: HTMLCanvasElement): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

/**
 * Draws `designs` into `canvases`, one each, and returns the controls. Each
 * canvas has drawn its first frame by the time this resolves, so the page
 * can show it in place of the still at once.
 */
export async function startHero(
  canvases: readonly HTMLCanvasElement[],
  designs: readonly HeroDesign[],
): Promise<HeroPlayer> {
  const [bitmaps] = await Promise.all([
    decodePhotos(),
    loadFonts(document.fonts),
    ...designs.map((design) => loadTemplate(design.templateId)),
  ]);
  const media: MediaResolver = {
    getBitmap: (id) => bitmaps.get(id) ?? null,
    getVideoFrame: () => null,
  };

  const stages: Stage[] = [];
  designs.forEach((design, i) => {
    const canvas = canvases[i];
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !ctx) return;
    const project = projectFor(design);
    const durationMs = totalDurationMs(project);
    stages.push({
      canvas,
      ctx,
      project,
      rig: createRenderRig(media, () => false),
      durationMs,
      stillMs: restMomentMs(project) ?? durationMs * 0.6,
    });
  });

  const draw = (stage: Stage, timeMs: number): void => {
    fit(stage.canvas);
    renderFrame(stage.ctx, stage.project, timeMs, stage.rig);
  };

  let playing = false;
  let frame = 0;
  let started = 0;
  /** Where each design was when it last stopped, so playing again carries on. */
  let elapsed = 0;

  const tick = (now: number): void => {
    const t = elapsed + (now - started);
    for (const stage of stages) {
      // From the picture it was showing, so nothing jumps when it starts.
      const loop = stage.durationMs + HOLD_MS;
      draw(stage, Math.min(stage.durationMs, (stage.stillMs + t) % loop));
    }
    frame = requestAnimationFrame(tick);
  };

  // The first frame of each, at its picture moment: what is shown until it plays.
  for (const stage of stages) draw(stage, stage.stillMs);

  return {
    setPlaying(next) {
      if (next === playing) return;
      playing = next;
      if (next) {
        started = performance.now();
        frame = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(frame);
        elapsed += performance.now() - started;
      }
    },
    dispose() {
      cancelAnimationFrame(frame);
      playing = false;
      for (const bitmap of bitmaps.values()) bitmap.close();
      bitmaps.clear();
    },
  };
}
