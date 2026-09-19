import type { Palette, PaletteRole, PropValues } from '@/core/types';
import { DEFAULT_LOGO, newId } from '../defaults';
import type {
  AnimPreset,
  BackgroundTreatment,
  LogoPlacement,
  Overlay,
  OverlayContent,
  PhotoCropMode,
  PhotoFrame,
  PhotoInput,
  PhotoSizeMode,
  Project,
  ProjectMode,
  Scene,
  SceneInputs,
  TextStyle,
  Transition,
  TransitionKind,
} from '../types';

/**
 * Document actions (§8).
 *
 * "All inspector edits go through the same undoable document action pipeline.
 * No inspector control may mutate the document directly."
 *
 * An action is a pure `Project -> Project` plus the metadata the history needs.
 * Keeping them out here rather than inside the store means they are testable in
 * Node, and means the store's only job is to apply one and record it.
 *
 * `coalesceKey` marks actions that fire continuously — slider drags, colour
 * pickers. Consecutive commits sharing a key collapse into one undo step, so
 * ⌘Z steps back over a whole drag rather than one pointer-move at a time.
 */

/**
 * Which scene an inspector edit lands on.
 *
 * Showcase has exactly one scene, so M0–M4 could hard-code index 0. A Motion Ad
 * has many, and the four inspector tabs edit whichever one is selected — but
 * *which* one is editor state, not document state, so it cannot live in the
 * action and it cannot live in the project. It arrives as a scope at dispatch
 * time instead, which is the one place that knows both (D-045).
 */
export type ActionScope = { readonly sceneIndex: number };

export const FIRST_SCENE: ActionScope = { sceneIndex: 0 };

export type Action = {
  readonly label: string;
  readonly coalesceKey?: string;
  apply(project: Project, scope: ActionScope): Project;
};

// ── Plumbing ────────────────────────────────────────────────────────────────

function editSceneAt(project: Project, index: number, edit: (scene: Scene) => Scene): Project {
  const scene = project.scenes[index];
  if (!scene) return project;

  const next = edit(scene);
  if (next === scene) return project;

  const scenes = [...project.scenes];
  scenes[index] = next;
  return { ...project, scenes, updatedAt: Date.now() };
}

function editScene(project: Project, scope: ActionScope, edit: (scene: Scene) => Scene): Project {
  return editSceneAt(project, scope.sceneIndex, edit);
}

function editInputs(
  project: Project,
  scope: ActionScope,
  edit: (inputs: SceneInputs) => SceneInputs,
): Project {
  return editScene(project, scope, (scene) => {
    const inputs = edit(scene.inputs);
    return inputs === scene.inputs ? scene : { ...scene, inputs };
  });
}

function editPhotos(
  project: Project,
  scope: ActionScope,
  edit: (photos: readonly PhotoInput[]) => readonly PhotoInput[],
): Project {
  return editInputs(project, scope, (inputs) => {
    const photos = edit(inputs.photos);
    return photos === inputs.photos ? inputs : { ...inputs, photos };
  });
}

function editPhotoAt(
  project: Project,
  scope: ActionScope,
  index: number,
  edit: (photo: PhotoInput) => PhotoInput,
): Project {
  return editPhotos(project, scope, (photos) => {
    const photo = photos[index];
    if (!photo) return photos;
    const next = edit(photo);
    if (next === photo) return photos;
    const copy = [...photos];
    copy[index] = next;
    return copy;
  });
}

function editOverlay(project: Project, id: string, edit: (overlay: Overlay) => Overlay): Project {
  const index = project.overlays.findIndex((o) => o.id === id);
  const current = project.overlays[index];
  if (!current) return project;

  const next = edit(current);
  if (next === current) return project;

  const overlays = [...project.overlays];
  overlays[index] = next;
  return { ...project, overlays, updatedAt: Date.now() };
}

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

// ── Photos (§8.1) ───────────────────────────────────────────────────────────

export function addPhotos(mediaIds: readonly string[]): Action {
  return {
    label: mediaIds.length === 1 ? 'Add photo' : `Add ${mediaIds.length} photos`,
    apply: (project, scope) =>
      editPhotos(project, scope, (photos) => [
        ...photos,
        ...mediaIds.map((mediaId): PhotoInput => ({
          mediaId,
          frame: '3:4',
          sizeMode: 'template',
          sizePct: 100,
          cropMode: 'template',
        })),
      ]),
  };
}

export function removePhoto(index: number): Action {
  return {
    label: 'Remove photo',
    apply: (project, scope) =>
      editPhotos(project, scope, (photos) =>
        index < 0 || index >= photos.length ? photos : photos.filter((_, i) => i !== index),
      ),
  };
}

export function removeAllPhotos(): Action {
  return {
    label: 'Remove all photos',
    apply: (project, scope) => editPhotos(project, scope, (photos) => (photos.length === 0 ? photos : [])),
  };
}

export function reorderPhoto(from: number, to: number): Action {
  return {
    label: 'Reorder photos',
    apply: (project, scope) =>
      editPhotos(project, scope, (photos) => {
        if (from === to || from < 0 || from >= photos.length || to < 0 || to >= photos.length) {
          return photos;
        }
        const copy = [...photos];
        const [moved] = copy.splice(from, 1);
        if (!moved) return photos;
        copy.splice(to, 0, moved);
        return copy;
      }),
  };
}

/**
 * §8.1: "increasing beyond the supplied photos reuses earlier ones".
 *
 * The stepper changes how many slots the template fills, which is a document
 * edit rather than a view setting — two projects with the same photos but
 * different counts render differently.
 */
export function setPhotoCount(count: number, bounds: { min: number; max: number }): Action {
  return {
    label: 'Change photo count',
    coalesceKey: 'photoCount',
    apply: (project, scope) =>
      editPhotos(project, scope, (photos) => {
        const target = Math.round(clamp(count, bounds.min, bounds.max));
        if (target === photos.length) return photos;
        if (target < photos.length) return photos.slice(0, target);
        if (photos.length === 0) return photos;

        const grown = [...photos];
        while (grown.length < target) {
          const source = photos[grown.length % photos.length];
          if (!source) break;
          grown.push(source);
        }
        return grown;
      }),
  };
}

export function setPhotoFrame(index: number, frame: PhotoFrame): Action {
  return {
    label: 'Change frame ratio',
    apply: (project, scope) => editPhotoAt(project, scope, index, (photo) => ({ ...photo, frame })),
  };
}

export function setPhotoSizeMode(index: number, sizeMode: PhotoSizeMode): Action {
  return {
    label: 'Change size mode',
    apply: (project, scope) => editPhotoAt(project, scope, index, (photo) => ({ ...photo, sizeMode })),
  };
}

export function setPhotoSizePct(index: number, sizePct: number): Action {
  return {
    label: 'Change photo size',
    coalesceKey: `photoSize:${index}`,
    apply: (project, scope) =>
      editPhotoAt(project, scope, index, (photo) => ({ ...photo, sizePct: clamp(sizePct, 100, 400) })),
  };
}

export function setPhotoCropMode(index: number, cropMode: PhotoCropMode): Action {
  return {
    label: 'Change crop mode',
    apply: (project, scope) => editPhotoAt(project, scope, index, (photo) => ({ ...photo, cropMode })),
  };
}

// ── Text (§8.2) ─────────────────────────────────────────────────────────────

export function setText(slotId: string, text: string): Action {
  return {
    label: 'Edit text',
    // Typing is one undo step per field, not one per keystroke.
    coalesceKey: `text:${slotId}`,
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) =>
        inputs.texts[slotId] === text
          ? inputs
          : { ...inputs, texts: { ...inputs.texts, [slotId]: text } },
      ),
  };
}

export function setTextStyle(
  slotId: string,
  patch: Partial<TextStyle>,
  options?: { label?: string; coalesceKey?: string },
): Action {
  return {
    label: options?.label ?? 'Change text style',
    ...(options?.coalesceKey === undefined ? {} : { coalesceKey: options.coalesceKey }),
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({
        ...inputs,
        styleOverrides: {
          ...inputs.styleOverrides,
          texts: {
            ...inputs.styleOverrides.texts,
            [slotId]: { ...inputs.styleOverrides.texts[slotId], ...patch },
          },
        },
      })),
  };
}

// ── Logo (§8.3) ─────────────────────────────────────────────────────────────

export function setLogoMedia(mediaId: string | null): Action {
  return {
    label: mediaId === null ? 'Remove logo' : 'Add logo',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({ ...inputs, logo: { ...inputs.logo, mediaId } })),
  };
}

export function setLogoSize(sizePct: number): Action {
  return {
    label: 'Resize logo',
    coalesceKey: 'logoSize',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({
        ...inputs,
        logo: { ...inputs.logo, sizePct: clamp(sizePct, 2, 40) },
      })),
  };
}

export function setLogoPlacement(placement: LogoPlacement): Action {
  return {
    label: 'Move logo',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({ ...inputs, logo: { ...inputs.logo, placement } })),
  };
}

export function setLogoOpacity(opacity: number): Action {
  return {
    label: 'Change logo opacity',
    coalesceKey: 'logoOpacity',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({
        ...inputs,
        logo: { ...inputs.logo, opacity: clamp(opacity, 0, 1) },
      })),
  };
}

export function setLogoLockup(lockup: boolean, lockupText?: string): Action {
  return {
    label: lockup ? 'Enable lockup' : 'Disable lockup',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({
        ...inputs,
        logo: {
          ...inputs.logo,
          lockup,
          ...(lockupText === undefined ? {} : { lockupText }),
        },
      })),
  };
}

export function setLockupText(lockupText: string): Action {
  return {
    label: 'Edit lockup text',
    coalesceKey: 'lockupText',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({ ...inputs, logo: { ...inputs.logo, lockupText } })),
  };
}

export function resetLogo(): Action {
  return {
    label: 'Reset logo',
    apply: (project, scope) => editInputs(project, scope, (inputs) => ({ ...inputs, logo: DEFAULT_LOGO })),
  };
}

// ── Look (§8.4) ─────────────────────────────────────────────────────────────

export function setPaletteRole(role: PaletteRole, color: string): Action {
  return {
    label: 'Change colour',
    coalesceKey: `palette:${role}`,
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({
        ...inputs,
        look: { ...inputs.look, palette: { ...inputs.look.palette, [role]: color } },
      })),
  };
}

export function applyPalette(palette: Palette): Action {
  return {
    label: 'Apply palette',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({ ...inputs, look: { ...inputs.look, palette } })),
  };
}

export function setBackground(background: BackgroundTreatment): Action {
  return {
    label: 'Change background',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({ ...inputs, look: { ...inputs.look, background } })),
  };
}

export function setGrain(grain: number): Action {
  return {
    label: 'Change grain',
    coalesceKey: 'grain',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({ ...inputs, look: { ...inputs.look, grain: clamp(grain, 0, 1) } })),
  };
}

export function setVignette(vignette: number): Action {
  return {
    label: 'Change vignette',
    coalesceKey: 'vignette',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({
        ...inputs,
        look: { ...inputs.look, vignette: clamp(vignette, 0, 1) },
      })),
  };
}

export function setSpeed(speed: number): Action {
  return {
    label: 'Change speed',
    coalesceKey: 'speed',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({ ...inputs, look: { ...inputs.look, speed: clamp(speed, 0.25, 3) } })),
  };
}

export function setCornerRadius(cornerRadius: number): Action {
  return {
    label: 'Change corner radius',
    coalesceKey: 'cornerRadius',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({
        ...inputs,
        look: { ...inputs.look, cornerRadius: clamp(cornerRadius, 0, 160) },
      })),
  };
}

// ── Scene and project ───────────────────────────────────────────────────────

export function setTemplate(templateId: string, durationMs?: number): Action {
  return {
    label: 'Change template',
    apply: (project, scope) =>
      editScene(project, scope, (scene) =>
        scene.templateId === templateId
          ? scene
          : { ...scene, templateId, ...(durationMs === undefined ? {} : { durationMs }) },
      ),
  };
}

export function setDuration(durationMs: number, bounds: { min: number; max: number }): Action {
  return {
    label: 'Change duration',
    coalesceKey: 'duration',
    apply: (project, scope) =>
      editScene(project, scope, (scene) => {
        const next = Math.round(clamp(durationMs, bounds.min, bounds.max));
        return scene.durationMs === next ? scene : { ...scene, durationMs: next };
      }),
  };
}

export function setAspect(aspect: Project['aspect']): Action {
  return {
    label: 'Change aspect',
    apply: (project) =>
      project.aspect === aspect ? project : { ...project, aspect, updatedAt: Date.now() },
  };
}

export function renameProject(name: string): Action {
  return {
    label: 'Rename project',
    coalesceKey: 'projectName',
    apply: (project) => (project.name === name ? project : { ...project, name, updatedAt: Date.now() }),
  };
}

// ── Scene sequencing (§1.2, M5) ─────────────────────────────────────────────

/**
 * A scene's duration is clamped against its own template's bounds by the
 * caller; these actions only guard the invariants the *document* owns — the
 * first scene never carries a transitionIn (D-004), and a project always has
 * at least one scene.
 */
function withFirstTransitionCleared(scenes: readonly Scene[]): Scene[] {
  return scenes.map((scene, i) =>
    i === 0 && scene.transitionIn !== null ? { ...scene, transitionIn: null } : scene,
  );
}

function withScenes(project: Project, scenes: readonly Scene[]): Project {
  if (scenes.length === 0) return project;
  return { ...project, scenes: withFirstTransitionCleared(scenes), updatedAt: Date.now() };
}

export const DEFAULT_TRANSITION: Transition = { kind: 'crossFade', durationMs: 600 };

export function addScene(scene: Scene, atIndex?: number): Action {
  return {
    label: 'Add scene',
    apply: (project) => {
      const scenes = [...project.scenes];
      const at = atIndex === undefined ? scenes.length : Math.max(0, Math.min(atIndex, scenes.length));
      // Anything but the first scene arrives with a transition, because a hard
      // cut between two unrelated templates is the one thing an ad never wants
      // by default.
      scenes.splice(at, 0, at === 0 ? { ...scene, transitionIn: null } : { ...scene, transitionIn: DEFAULT_TRANSITION });
      return withScenes(project, scenes);
    },
  };
}

export function duplicateScene(index: number): Action {
  return {
    label: 'Duplicate scene',
    apply: (project) => {
      const source = project.scenes[index];
      if (!source) return project;
      const scenes = [...project.scenes];
      scenes.splice(index + 1, 0, { ...source, id: newId('scn'), transitionIn: source.transitionIn ?? DEFAULT_TRANSITION });
      return withScenes(project, scenes);
    },
  };
}

export function removeScene(index: number): Action {
  return {
    label: 'Remove scene',
    apply: (project) => {
      // §5: a project always has a scene. Removing the last one would leave the
      // renderer with nothing to resolve and the inspector with nothing to edit.
      if (project.scenes.length <= 1) return project;
      const scenes = project.scenes.filter((_, i) => i !== index);
      return scenes.length === project.scenes.length ? project : withScenes(project, scenes);
    },
  };
}

export function moveScene(from: number, to: number): Action {
  return {
    label: 'Reorder scenes',
    apply: (project) => {
      const scenes = [...project.scenes];
      if (from === to || from < 0 || from >= scenes.length || to < 0 || to >= scenes.length) return project;
      const [moved] = scenes.splice(from, 1);
      if (!moved) return project;
      scenes.splice(to, 0, moved);
      return withScenes(project, scenes);
    },
  };
}

export function setSceneTransition(index: number, patch: Partial<Transition>): Action {
  return {
    label: 'Change transition',
    coalesceKey: `transition:${index}`,
    apply: (project) =>
      editSceneAt(project, index, (scene) => {
        // The first scene has nothing to transition from (D-004), so the
        // control is hidden there and the action is a no-op if it is reached.
        if (index === 0) return scene;
        const base = scene.transitionIn ?? DEFAULT_TRANSITION;
        const kind: TransitionKind = patch.kind ?? base.kind;
        const durationMs = Math.round(clamp(patch.durationMs ?? base.durationMs, 80, 2_000));
        const direction = patch.direction ?? base.direction;
        return {
          ...scene,
          transitionIn: { kind, durationMs, ...(direction === undefined ? {} : { direction }) },
        };
      }),
  };
}

export function setSceneDurationAt(index: number, durationMs: number, bounds: { min: number; max: number }): Action {
  return {
    label: 'Change scene length',
    coalesceKey: `sceneDuration:${index}`,
    apply: (project) =>
      editSceneAt(project, index, (scene) => {
        const next = Math.round(clamp(durationMs, bounds.min, bounds.max));
        return scene.durationMs === next ? scene : { ...scene, durationMs: next };
      }),
  };
}

/**
 * Replaces the whole scene list from an expanded ad template (D-013).
 *
 * One action rather than N addScene calls so it is one undo step: a user who
 * picks the wrong ad template wants ⌘Z to put back what they had, not to peel
 * scenes off one at a time.
 */
export function applyAdTemplate(scenes: readonly Scene[], sourceAdTemplateId: string): Action {
  return {
    label: 'Apply ad template',
    apply: (project) =>
      scenes.length === 0
        ? project
        : {
            ...project,
            mode: 'motionAd',
            scenes: withFirstTransitionCleared(scenes),
            sourceAdTemplateId,
            updatedAt: Date.now(),
          },
  };
}

export function setMode(mode: ProjectMode): Action {
  return {
    label: mode === 'motionAd' ? 'Switch to Motion Ads' : 'Switch to Showcase',
    apply: (project, scope) => {
      if (project.mode === mode) return project;

      if (mode === 'motionAd') {
        return { ...project, mode, updatedAt: Date.now() };
      }

      // §5: showcase has exactly one scene and no overlays or audio. Keeping
      // the *selected* scene rather than the first is what makes this feel like
      // "extract this beat" instead of "throw away my work" — and it is
      // undoable either way.
      const kept = project.scenes[scope.sceneIndex] ?? project.scenes[0];
      if (!kept) return project;

      const { sourceAdTemplateId: _dropped, ...rest } = project;
      return {
        ...rest,
        mode,
        scenes: [{ ...kept, transitionIn: null }],
        overlays: [],
        audio: [],
        updatedAt: Date.now(),
      };
    },
  };
}

// ── Overlays (§3C, §1.2) ────────────────────────────────────────────────────

export function addOverlay(overlay: Overlay): Action {
  return {
    label: `Add ${overlay.kind === 'customMedia' ? 'media' : overlay.kind} overlay`,
    apply: (project) => ({
      ...project,
      overlays: [...project.overlays, overlay],
      updatedAt: Date.now(),
    }),
  };
}

export function removeOverlay(id: string): Action {
  return {
    label: 'Remove overlay',
    apply: (project) => {
      const overlays = project.overlays.filter((o) => o.id !== id);
      return overlays.length === project.overlays.length
        ? project
        : { ...project, overlays, updatedAt: Date.now() };
    },
  };
}

export function setOverlayTime(id: string, startMs: number, endMs: number): Action {
  return {
    label: 'Move overlay',
    coalesceKey: `overlayTime:${id}`,
    apply: (project) =>
      editOverlay(project, id, (overlay) => {
        const start = Math.max(0, Math.round(startMs));
        // A minimum length, or a clip can be dragged to nothing and then never
        // grabbed again because it has no width to grab.
        const end = Math.max(start + 200, Math.round(endMs));
        return overlay.startMs === start && overlay.endMs === end
          ? overlay
          : { ...overlay, startMs: start, endMs: end };
      }),
  };
}

export function setOverlayTrack(id: string, track: number): Action {
  return {
    label: 'Change overlay track',
    apply: (project) =>
      editOverlay(project, id, (overlay) => {
        const next = Math.max(0, Math.round(track));
        return overlay.track === next ? overlay : { ...overlay, track: next };
      }),
  };
}

export function setOverlayTransform(id: string, patch: PropValues): Action {
  return {
    label: 'Move overlay',
    coalesceKey: `overlayTransform:${id}`,
    apply: (project) =>
      editOverlay(project, id, (overlay) => ({
        ...overlay,
        transform: { ...overlay.transform, ...patch },
      })),
  };
}

export function setOverlayAnim(id: string, which: 'enter' | 'exit', preset: AnimPreset): Action {
  return {
    label: which === 'enter' ? 'Change entrance' : 'Change exit',
    apply: (project) =>
      editOverlay(project, id, (overlay) =>
        which === 'enter' ? { ...overlay, enterAnim: preset } : { ...overlay, exitAnim: preset },
      ),
  };
}

export function setOverlayText(id: string, text: string): Action {
  return {
    label: 'Edit overlay text',
    coalesceKey: `overlayText:${id}`,
    apply: (project) =>
      editOverlay(project, id, (overlay) =>
        overlay.content.kind === 'text'
          ? { ...overlay, content: { ...overlay.content, text } }
          : overlay,
      ),
  };
}

export function setOverlayMedia(id: string, mediaId: string): Action {
  return {
    label: 'Change overlay media',
    apply: (project) =>
      editOverlay(project, id, (overlay) =>
        overlay.content.kind === 'text'
          ? overlay
          : { ...overlay, content: { kind: overlay.content.kind, mediaId } },
      ),
  };
}

export function setOverlayTextStyle(
  id: string,
  patch: Partial<TextStyle>,
  options?: { label?: string; coalesceKey?: string },
): Action {
  return {
    label: options?.label ?? 'Change overlay style',
    ...(options?.coalesceKey === undefined ? {} : { coalesceKey: options.coalesceKey }),
    apply: (project) =>
      editOverlay(project, id, (overlay) =>
        overlay.content.kind === 'text'
          ? { ...overlay, content: { ...overlay.content, style: { ...overlay.content.style, ...patch } } }
          : overlay,
      ),
  };
}

/** Factories, so the timeline's three "Add …" buttons agree on the defaults. */
export function makeOverlay(
  content: OverlayContent,
  options: { startMs: number; endMs: number; track: number },
): Overlay {
  return {
    id: newId('ovl'),
    track: options.track,
    startMs: options.startMs,
    endMs: options.endMs,
    kind: content.kind,
    content,
    // Centred, at the overlay's own nominal size (D-044).
    transform: { x: 0.5, y: 0.5 },
    enterAnim: 'fade',
    exitAnim: 'fade',
  };
}
