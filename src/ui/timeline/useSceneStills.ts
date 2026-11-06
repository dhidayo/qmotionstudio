import { useEffect, useSyncExternalStore } from 'react';
import type { Project } from '@/document/types';
import type { MediaStore } from '@/media/store';
import { createRenderRig, disposeRenderRig } from '@/core/render/rig';
import { drawStill } from '@/export/stills';
import { useMediaRevision, useMediaStore } from '@/ui/media/MediaProvider';
import { sceneStillKey, sceneStillProject, stillMomentMs, stillSize } from './sceneStills';

/**
 * Each scene's own small picture, drawn off the frame loop and kept (D-166).
 *
 * Shared by the phone's scene strip and the computer's scene clips, so a
 * scene is drawn once whichever shows it. The rules that keep it cheap:
 *
 *   - Nothing happens per frame. A change to the document is waited out
 *     (`SETTLE_MS`, so a drag of a colour slider is one redraw, not fifty),
 *     then each scene's key is compared with the one its still was drawn
 *     from, and only the scenes that changed are queued.
 *   - One still is drawn at a time, in the browser's idle time, so playback
 *     and typing always come first.
 *   - One entry per scene in the project: a scene that is gone takes its
 *     still with it, and every replaced picture's object URL is revoked.
 *
 * Until a scene's first still is ready, the caller shows the design's
 * catalogue poster.
 */

/** How long the document has to stay still before scenes are redrawn. */
const SETTLE_MS = 400;

type Entry = { key: string; url: string | null };

const entries = new Map<string, Entry>();
/** The newest key wanted for each scene, and the project it comes from. */
const wanted = new Map<string, { key: string; project: Project; sceneIndex: number }>();
const listeners = new Set<() => void>();
let version = 0;
let drawing = false;
let media: MediaStore | null = null;
/** The scenes of the project last shown, so a still finished after its scene was deleted is let go. */
let shownScenes = new Set<string>();
/** The still being drawn now, so asking again for the same one does not queue it twice. */
let inFlight: { readonly sceneId: string; readonly key: string } | null = null;

function changed(): void {
  version++;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getVersion = (): number => version;

const decodedIn = (store: MediaStore) => (id: string): boolean => store.getBitmap(id) !== null;

/** Queues the scenes whose still is missing or out of date, and lets go of scenes no longer in the project. */
function request(project: Project, store: MediaStore): void {
  media = store;
  const present = new Set(project.scenes.map((scene) => scene.id));
  let dropped = false;
  for (const [id, entry] of entries) {
    if (present.has(id)) continue;
    if (entry.url !== null) URL.revokeObjectURL(entry.url);
    entries.delete(id);
    dropped = true;
  }
  wanted.clear();
  const decoded = decodedIn(store);
  project.scenes.forEach((scene, sceneIndex) => {
    const key = sceneStillKey(project, scene, decoded);
    const drawn = entries.get(scene.id)?.key === key || (inFlight?.sceneId === scene.id && inFlight.key === key);
    if (!drawn) wanted.set(scene.id, { key, project, sceneIndex });
  });
  if (dropped) changed();
  pump();
}

/** In the browser's idle time where it has one; otherwise soon. */
function whenIdle(run: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1_000 });
  else setTimeout(run, 50);
}

function pump(): void {
  if (drawing || wanted.size === 0) return;
  drawing = true;
  whenIdle(() => { void drawNext().finally(() => { drawing = false; pump(); }); });
}

async function drawNext(): Promise<void> {
  const store = media;
  const next = wanted.entries().next();
  if (next.done === true || !store) return;
  const [sceneId, job] = next.value;
  wanted.delete(sceneId);
  const scene = job.project.scenes[job.sceneIndex];
  if (!scene) return;
  inFlight = { sceneId, key: job.key };
  const alone = sceneStillProject(job.project, scene);
  const size = stillSize(alone);
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const rig = createRenderRig(store, () => false);
  let url: string | null = null;
  try {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    // The design's own fonts, so its words are not drawn in a stand-in.
    await document.fonts.ready;
    await drawStill(ctx, alone, store, stillMomentMs(alone), rig);
    const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, 'image/jpeg', 0.82); });
    if (blob) url = URL.createObjectURL(blob);
  } catch (error: unknown) {
    // A still is a convenience: the poster stays, and the key is kept so it is not tried again until the scene changes.
    console.warn(`Scene picture: scene ${job.sceneIndex + 1} could not be drawn.`, error);
  } finally {
    inFlight = null;
    disposeRenderRig(rig);
    canvas.width = 0;
    canvas.height = 0;
  }
  // The scene may have been deleted while it was drawn.
  if (!shownScenes.has(sceneId)) {
    if (url !== null) URL.revokeObjectURL(url);
    return;
  }
  const previous = entries.get(sceneId)?.url ?? null;
  if (url !== null && previous !== null) URL.revokeObjectURL(previous);
  entries.set(sceneId, { key: job.key, url: url ?? previous });
  changed();
}

/**
 * Each scene's picture by scene id, once drawn. Absent means not drawn yet:
 * show the poster.
 */
export function useSceneStills(project: Project): ReadonlyMap<string, string> {
  const store = useMediaStore();
  const revision = useMediaRevision();
  useSyncExternalStore(subscribe, getVersion, getVersion);

  useEffect(() => {
    shownScenes = new Set(project.scenes.map((scene) => scene.id));
    const id = setTimeout(() => { request(project, store); }, SETTLE_MS);
    return () => { clearTimeout(id); };
    // The parts of the project a still depends on; a layer or a sound changes none of them.
  }, [project.scenes, project.aspect, project.brand, revision, store]); // eslint-disable-line react-hooks/exhaustive-deps

  const urls = new Map<string, string>();
  for (const scene of project.scenes) {
    const url = entries.get(scene.id)?.url ?? null;
    if (url !== null) urls.set(scene.id, url);
  }
  return urls;
}
