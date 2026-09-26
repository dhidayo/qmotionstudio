import type { Palette, PaletteRole, PropValues } from '@/core/types';
import { DEFAULT_LOGO, newId } from '../defaults';
import { NO_SLOT_TRANSFORM } from '../types';
import { isAnimated, poseAt, poseIndexAt } from '../select/overlay';
import { nudgeAt, nudgePoses } from '@/core/render/slots';
import { MIN_MOTION_MS, movedSpan, newSpan, resizedSpan, spanOf } from '../select/motion';
import type {
  AnimPreset,
  AudioClip,
  BackgroundTreatment,
  LogoPlacement,
  Overlay,
  OverlayContent,
  OverlayEasing,
  OverlayPose,
  PhotoCropMode,
  PhotoFrame,
  PhotoInput,
  PhotoSizeMode,
  Project,
  ProjectMode,
  Scene,
  SceneInputs,
  SlotKey,
  SlotPose,
  SlotTransform,
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

/**
 * §8.3's free placement, normalised against the safe box.
 *
 * Switches `placement` to 'free' as a side effect: dragging a logo that is
 * pinned to a corner obviously means "stop pinning it", and making the user
 * change a dropdown before the drag does anything is exactly the sort of modal
 * detail nobody should have to learn.
 */
export function setLogoPosition(x: number, y: number): Action {
  return {
    label: 'Move logo',
    coalesceKey: 'logoPlacementDrag',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({
        ...inputs,
        logo: { ...inputs.logo, placement: 'free', x: clamp(x, 0, 1), y: clamp(y, 0, 1) },
      })),
  };
}

/**
 * Size and position together, for a resize drag.
 *
 * One action rather than `setLogoSize` followed by `setLogoPosition`, because
 * `commit` only merges an entry with the one immediately before it: two
 * dispatches per pointermove carry two different coalesce keys, so neither
 * ever merges and a single drag pushes a hundred entries and evicts the real
 * history. That bug has already been paid for once, on the music track.
 */
export function setLogoBox(sizePct: number, x: number, y: number): Action {
  return {
    label: 'Resize logo',
    coalesceKey: 'logoPlacementDrag',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => ({
        ...inputs,
        logo: {
          ...inputs.logo,
          placement: 'free',
          sizePct: clamp(sizePct, 2, 40),
          x: clamp(x, 0, 1),
          y: clamp(y, 0, 1),
        },
      })),
  };
}

/**
 * Nudging one of the template's own elements (B).
 *
 * The values are offsets, so this composes: dragging twice adds up, and the
 * template still owns the layout underneath. One coalesce key per slot, so a
 * whole drag is one undo step and dragging a different slot starts a new one.
 */
export function nudgeSlot(key: SlotKey, patch: Partial<SlotTransform>): Action {
  return {
    label: 'Move element',
    coalesceKey: `slotTransform:${key}`,
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => {
        const current = inputs.slotTransforms[key] ?? NO_SLOT_TRANSFORM;
        const next: SlotTransform = {
          offsetX: patch.offsetX ?? current.offsetX,
          offsetY: patch.offsetY ?? current.offsetY,
          scale: clamp(patch.scale ?? current.scale, 0.1, 8),
          rotation: patch.rotation ?? current.rotation,
          z: patch.z ?? current.z,
        };
        return { ...inputs, slotTransforms: { ...inputs.slotTransforms, [key]: next } };
      }),
  };
}

/**
 * Keyframes for one of the template's own elements (B, animated).
 *
 * The same shape as an overlay's: a whole pose per moment rather than a track
 * per property, seeded from whatever the nudge already is at that time so
 * keying a move does not reset a resize made earlier.
 */
export function setSlotPose(key: SlotKey, atMs: number, patch: Partial<SlotPose>): Action {
  return {
    label: 'Move element',
    coalesceKey: `slotPose:${key}:${Math.round(atMs / POSE_TOLERANCE_MS)}`,
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => {
        const current = inputs.slotTransforms[key] ?? NO_SLOT_TRANSFORM;
        const at = Math.max(0, Math.round(atMs));
        const base = nudgeAt(current, at);
        const seeded: SlotPose = { ...base, ...patch, atMs: at };

        const poses = nudgePoses(current);
        const index = poses.findIndex((pose) => Math.abs(pose.atMs - at) <= POSE_TOLERANCE_MS);
        const next =
          index >= 0
            ? poses.map((pose, i) => (i === index ? { ...seeded, atMs: pose.atMs } : pose))
            : [...poses, seeded].sort((a, b) => a.atMs - b.atMs);

        return {
          ...inputs,
          slotTransforms: { ...inputs.slotTransforms, [key]: { ...current, poses: next } },
        };
      }),
  };
}

/** Turns a slot's keyframes on (seeded from where it is) or off (frozen there). */
export function setSlotAnimated(key: SlotKey, animated: boolean, atMs: number): Action {
  return {
    label: animated ? 'Animate element' : 'Stop animating element',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => {
        const current = inputs.slotTransforms[key] ?? NO_SLOT_TRANSFORM;

        if (animated) {
          if ((current.poses?.length ?? 0) > 0) return inputs;
          const seed: SlotPose = { atMs: 0, ...strip(current) };
          return {
            ...inputs,
            slotTransforms: { ...inputs.slotTransforms, [key]: { ...current, poses: [seed] } },
          };
        }

        const frozen = nudgeAt(current, atMs);
        const { poses: _poses, ...rest } = current;
        return {
          ...inputs,
          slotTransforms: {
            ...inputs.slotTransforms,
            [key]: { ...rest, ...strip(frozen) },
          },
        };
      }),
  };
}

export function removeSlotPose(key: SlotKey, atMs: number): Action {
  return {
    label: 'Remove keyframe',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => {
        const current = inputs.slotTransforms[key];
        if (!current?.poses) return inputs;

        const remaining = current.poses.filter(
          (pose) => Math.abs(pose.atMs - atMs) > POSE_TOLERANCE_MS,
        );
        if (remaining.length === current.poses.length) return inputs;

        // The last one going means the nudge stops moving, frozen where it was.
        if (remaining.length === 0) {
          const frozen = nudgeAt(current, atMs);
          const { poses: _poses, ...rest } = current;
          return {
            ...inputs,
            slotTransforms: { ...inputs.slotTransforms, [key]: { ...rest, ...strip(frozen) } },
          };
        }

        return {
          ...inputs,
          slotTransforms: { ...inputs.slotTransforms, [key]: { ...current, poses: remaining } },
        };
      }),
  };
}

/** A pose without its time, which is what the resting values are. */
function strip(pose: Omit<SlotPose, 'atMs'>): Omit<SlotPose, 'atMs'> {
  return {
    offsetX: pose.offsetX,
    offsetY: pose.offsetY,
    scale: pose.scale,
    rotation: pose.rotation,
  };
}

/**
 * Stacking, for one of the template's own elements.
 *
 * Expressed as a z *nudge* like the rest of D-061, so it survives a template
 * change and is undone by the same "Reset to template". Front and back rather
 * than forward and backward by one: a step needs to know what the neighbours
 * are, and the document holds nudges rather than the built layer list, so it
 * cannot see them. Front and back is also what the question usually is.
 */
export function arrangeSlot(key: SlotKey, to: 'front' | 'back'): Action {
  return {
    label: to === 'front' ? 'Bring to front' : 'Send to back',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => {
        const all = Object.values(inputs.slotTransforms).map((t) => t.z);
        const z = to === 'front' ? Math.max(0, ...all) + 1 : Math.min(0, ...all) - 1;
        const current = inputs.slotTransforms[key] ?? NO_SLOT_TRANSFORM;
        if (current.z === z) return inputs;
        return {
          ...inputs,
          slotTransforms: { ...inputs.slotTransforms, [key]: { ...current, z } },
        };
      }),
  };
}

/**
 * Puts one element back where the template had it.
 *
 * This is what makes B safe to offer at all. Letting people move anything is
 * only reasonable if getting back to the designed layout is one click, and
 * because a nudge is stored as an offset, "reset" really is just forgetting
 * it — there is no original position to try to reconstruct.
 */
export function resetSlot(key: SlotKey): Action {
  return {
    label: 'Reset element',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => {
        if (!(key in inputs.slotTransforms)) return inputs;
        const next = Object.fromEntries(
          Object.entries(inputs.slotTransforms).filter(([entry]) => entry !== key),
        );
        return { ...inputs, slotTransforms: next };
      }),
  };
}

export function resetSceneLayout(): Action {
  return {
    label: 'Reset layout',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) =>
        Object.keys(inputs.slotTransforms).length === 0
          ? inputs
          : { ...inputs, slotTransforms: {} },
      ),
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

/**
 * Switches a scene to another template.
 *
 * Takes the new template's photo slots so the scene's photo list can be
 * reconciled in the same step. Without that, moving a four-photo scene onto a
 * one-slot template left four photos in the document: the renderer coped —
 * `fillSlots` takes the first — but the inspector's stepper read "4 of 1", and
 * three unused photographs were carried into every export's media transfer.
 *
 * The count is clamped into the new range rather than reset to its default, so
 * a deliberate choice survives a template change wherever it still can.
 */
export function setTemplate(
  templateId: string,
  options?: { durationMs?: number; photoSlots?: { min: number; max: number } },
): Action {
  return {
    label: 'Change template',
    apply: (project, scope) =>
      editScene(project, scope, (scene) => {
        if (scene.templateId === templateId) return scene;

        const durationMs = options?.durationMs;
        const next: Scene = {
          ...scene,
          templateId,
          ...(durationMs === undefined ? {} : { durationMs }),
        };

        const slots = options?.photoSlots;
        if (!slots) return next;

        const photos = fitPhotos(scene.inputs.photos, slots);
        return photos === scene.inputs.photos
          ? next
          : { ...next, inputs: { ...next.inputs, photos } };
      }),
  };
}

/**
 * Brings a photo list inside a template's declared slot range.
 *
 * §8.1: "increasing beyond the supplied photos reuses earlier ones". An empty
 * list stays empty — there is nothing to reuse, and inventing entries would
 * put ids in the document that the media store has never heard of.
 */
export function fitPhotos(
  photos: readonly PhotoInput[],
  slots: { min: number; max: number },
): readonly PhotoInput[] {
  if (photos.length === 0) return photos;

  const target = Math.round(clamp(photos.length, slots.min, slots.max));
  if (target === photos.length) return photos;
  if (target < photos.length) return photos.slice(0, target);

  const grown = [...photos];
  while (grown.length < target) {
    const source = photos[grown.length % photos.length];
    if (!source) break;
    grown.push(source);
  }
  return grown;
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

/**
 * Drops whatever does not fit inside the free tier's cap (§12).
 *
 * The spec's own words for the offer: "remove this scene to keep working with
 * the first 15 seconds" — so afterwards the project has to actually *be*
 * inside the cap. Keeping the scene that straddles it left the piece over
 * length and the banner still up, which makes the button look broken.
 *
 * At least one scene always survives, because a project without one has
 * nothing to render, and a single scene longer than the cap is the user's own
 * to shorten.
 */
export function trimToLimit(maxDurationMs: number): Action {
  return {
    label: 'Remove the scenes past the limit',
    apply: (project) => {
      const kept: Scene[] = [];
      let elapsed = 0;

      for (const scene of project.scenes) {
        // D-004: a transition overlaps its neighbours, so it does not add time.
        const next = elapsed + scene.durationMs - (scene.transitionIn?.durationMs ?? 0);
        if (kept.length > 0 && next > maxDurationMs) break;
        kept.push(scene);
        elapsed = next;
      }

      if (kept.length === project.scenes.length) return project;

      // The first scene never carries a transition (D-004).
      const first = kept[0];
      const scenes = first ? [{ ...first, transitionIn: null }, ...kept.slice(1)] : kept;
      return {
        ...project,
        scenes,
        overlays: project.overlays.filter((overlay) => overlay.startMs < maxDurationMs),
      };
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

/**
 * A copy under a new id, sharing the same media.
 *
 * The document holds only ids (§5), so duplicating is genuinely cheap — the
 * photographs are not copied, they are referred to twice. That is also why the
 * media store is keyed by `mediaId` across projects rather than per project.
 */
export function duplicateProject(project: Project): Project {
  const copy = `${project.name} copy`.slice(0, 80);
  return { ...project, id: newId('prj'), name: copy, createdAt: Date.now(), updatedAt: Date.now() };
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

/**
 * Stacking, for an overlay.
 *
 * §6.4 draws overlays by track and then by their position in the list, so
 * both have to move: the track is the coarse control the timeline already
 * shows as lanes, and the list position settles ties inside one. Doing only
 * the track would leave two overlays on the same lane stuck in whatever order
 * they were added, which is exactly the case where someone reaches for this.
 */
export function arrangeOverlay(id: string, to: 'front' | 'back'): Action {
  return {
    label: to === 'front' ? 'Bring to front' : 'Send to back',
    apply: (project) => {
      const overlay = project.overlays.find((o) => o.id === id);
      if (!overlay) return project;

      const others = project.overlays.filter((o) => o.id !== id);
      const track =
        to === 'front'
          ? Math.min(MAX_OVERLAY_TRACK, Math.max(0, ...others.map((o) => o.track)))
          : 0;
      const moved = { ...overlay, track };

      return { ...project, overlays: to === 'front' ? [...others, moved] : [moved, ...others] };
    },
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

/** Matches the timeline's row cap; nothing is ever pushed past it. */
const MAX_OVERLAY_TRACK = 7;

/** How close two keyframes have to be to count as the same moment. */
export const POSE_TOLERANCE_MS = 60;

/**
 * Turns an overlay's motion path on or off.
 *
 * Switching on seeds a single pose from wherever the overlay already sits, so
 * nothing moves and nothing is lost — one keyframe is the same picture as no
 * keyframes. Switching off freezes it where the playhead is, which is the
 * position the user is actually looking at when they decide they have had
 * enough of animating it.
 */
export function setOverlayAnimated(id: string, animated: boolean, atMs: number): Action {
  return {
    label: animated ? 'Animate overlay' : 'Stop animating overlay',
    apply: (project) =>
      editOverlay(project, id, (overlay) => {
        if (animated) {
          if (isAnimated(overlay)) return overlay;
          return { ...overlay, poses: [{ atMs: 0, transform: { ...overlay.transform } }] };
        }
        const frozen = poseAt(overlay, atMs);
        const { poses: _poses, ...rest } = overlay;
        return { ...rest, transform: frozen };
      }),
  };
}

/**
 * Gives an overlay a motion running from `atMs` for the default length.
 *
 * Both ends start as the pose the overlay already holds, so adding a motion
 * changes nothing until the element is moved at one end of it — which is the
 * point: the bar appears on the timeline first, and the destination is set by
 * dragging the thing itself.
 */
export function addOverlayMotion(id: string, atMs: number): Action {
  return {
    label: 'Add motion',
    apply: (project) =>
      editOverlay(project, id, (overlay) => {
        const limit = Math.max(MIN_MOTION_MS, overlay.endMs - overlay.startMs);
        const span = newSpan(Math.max(0, atMs), limit);
        const held = poseAt(overlay, span.startMs);
        return {
          ...overlay,
          poses: [
            { atMs: span.startMs, transform: { ...held } },
            { atMs: span.endMs, transform: { ...held } },
          ],
        };
      }),
  };
}

/** Slides or stretches an overlay's motion on the timeline. */
export function reshapeOverlayMotion(
  id: string,
  change: { move: number } | { edge: 'start' | 'end'; toMs: number },
): Action {
  return {
    label: 'move' in change ? 'Move motion' : 'Change motion length',
    coalesceKey: `overlayMotion:${id}`,
    apply: (project) =>
      editOverlay(project, id, (overlay) => {
        const poses = overlay.poses ?? [];
        const span = spanOf(poses.map((pose) => pose.atMs));
        if (!span) return overlay;

        const limit = Math.max(MIN_MOTION_MS, overlay.endMs - overlay.startMs);
        const next =
          'move' in change
            ? movedSpan(span, change.move, limit)
            : resizedSpan(span, change.edge, change.toMs, limit);

        return { ...overlay, poses: retimed(poses, span, next, (pose) => pose.atMs, (pose, atMs) => ({ ...pose, atMs })) };
      }),
  };
}

/** The same, for one of the template's own elements. */
export function addSlotMotion(key: SlotKey, atMs: number, sceneMs: number): Action {
  return {
    label: 'Add motion',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => {
        const current = inputs.slotTransforms[key] ?? NO_SLOT_TRANSFORM;
        const span = newSpan(Math.max(0, atMs), Math.max(MIN_MOTION_MS, sceneMs));
        const held = nudgeAt(current, span.startMs);
        return {
          ...inputs,
          slotTransforms: {
            ...inputs.slotTransforms,
            [key]: {
              ...current,
              poses: [
                { ...held, atMs: span.startMs },
                { ...held, atMs: span.endMs },
              ],
            },
          },
        };
      }),
  };
}

export function reshapeSlotMotion(
  key: SlotKey,
  sceneMs: number,
  change: { move: number } | { edge: 'start' | 'end'; toMs: number },
): Action {
  return {
    label: 'move' in change ? 'Move motion' : 'Change motion length',
    coalesceKey: `slotMotion:${key}`,
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => {
        const current = inputs.slotTransforms[key];
        const poses = current?.poses ?? [];
        const span = spanOf(poses.map((pose) => pose.atMs));
        if (!current || !span) return inputs;

        const limit = Math.max(MIN_MOTION_MS, sceneMs);
        const next =
          'move' in change
            ? movedSpan(span, change.move, limit)
            : resizedSpan(span, change.edge, change.toMs, limit);

        return {
          ...inputs,
          slotTransforms: {
            ...inputs.slotTransforms,
            [key]: {
              ...current,
              poses: retimed(poses, span, next, (pose) => pose.atMs, (pose, atMs) => ({ ...pose, atMs })),
            },
          },
        };
      }),
  };
}

export function setSlotEasing(key: SlotKey, easing: OverlayEasing): Action {
  return {
    label: 'Change motion style',
    apply: (project, scope) =>
      editInputs(project, scope, (inputs) => {
        const current = inputs.slotTransforms[key] ?? NO_SLOT_TRANSFORM;
        return {
          ...inputs,
          slotTransforms: { ...inputs.slotTransforms, [key]: { ...current, easing } },
        };
      }),
  };
}

/**
 * Maps pose times from one span onto another.
 *
 * The ends land exactly on the new ends; anything between keeps its position
 * *proportionally*, so stretching a three-point path stretches the whole path
 * rather than dragging one end away from a stationary middle.
 */
function retimed<T>(
  poses: readonly T[],
  from: { startMs: number; endMs: number },
  to: { startMs: number; endMs: number },
  timeOf: (pose: T) => number,
  withTime: (pose: T, atMs: number) => T,
): readonly T[] {
  const fromLength = Math.max(1, from.endMs - from.startMs);
  const toLength = to.endMs - to.startMs;

  return poses
    .map((pose) => {
      const ratio = (timeOf(pose) - from.startMs) / fromLength;
      return withTime(pose, Math.round(to.startMs + ratio * toLength));
    })
    .sort((a, b) => timeOf(a) - timeOf(b));
}

export function setOverlayEasing(id: string, easing: OverlayEasing): Action {
  return {
    label: 'Change overlay easing',
    apply: (project) => editOverlay(project, id, (overlay) => ({ ...overlay, easing })),
  };
}

/**
 * Writes a keyframe at `atMs`, creating one if there is not already one there.
 *
 * The new pose is seeded from everything the overlay is *already* doing at
 * that moment and then patched, rather than from the patch alone. Otherwise
 * dropping a keyframe to move something sideways would snap its size, rotation
 * and opacity to their defaults at the same instant — the classic way a
 * keyframe editor surprises someone who only wanted to nudge one thing.
 */
export function setOverlayPose(id: string, atMs: number, patch: PropValues): Action {
  return {
    label: 'Move overlay',
    // Per moment as well as per overlay: dragging at one keyframe and then at
    // another is two undo steps, which is what it looks like from outside.
    coalesceKey: `overlayPose:${id}:${Math.round(atMs / POSE_TOLERANCE_MS)}`,
    apply: (project) =>
      editOverlay(project, id, (overlay) => {
        const at = Math.max(0, Math.round(atMs));
        const seeded: OverlayPose = { atMs: at, transform: { ...poseAt(overlay, at), ...patch } };

        const poses = overlay.poses ?? [{ atMs: 0, transform: { ...overlay.transform } }];
        const existing = poseIndexAt({ ...overlay, poses }, at, POSE_TOLERANCE_MS);

        const next =
          existing >= 0
            ? poses.map((pose, index) =>
                index === existing ? { ...seeded, atMs: pose.atMs } : pose,
              )
            : [...poses, seeded].sort((a, b) => a.atMs - b.atMs);

        return { ...overlay, poses: next };
      }),
  };
}

/**
 * Removes the keyframe at `atMs`.
 *
 * Taking away the last one turns animation off rather than leaving an overlay
 * animated by an empty path, which would have no defined position at all.
 */
export function removeOverlayPose(id: string, atMs: number): Action {
  return {
    label: 'Remove keyframe',
    apply: (project) =>
      editOverlay(project, id, (overlay) => {
        const index = poseIndexAt(overlay, atMs, POSE_TOLERANCE_MS);
        if (index < 0) return overlay;

        const remaining = (overlay.poses ?? []).filter((_, at) => at !== index);
        if (remaining.length === 0) {
          const frozen = poseAt(overlay, atMs);
          const { poses: _poses, ...rest } = overlay;
          return { ...rest, transform: frozen };
        }
        return { ...overlay, poses: remaining };
      }),
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

// ── Audio (§10) ─────────────────────────────────────────────────────────────

/**
 * §5 gives a project an `audio` array and §10 says "one track for now". The
 * array stays, because the shape is right and a second track is a UI problem
 * rather than a model one — but `addAudio` replaces rather than appends, so
 * the timeline never shows two clips fighting over one row.
 */
function editAudio(project: Project, id: string, edit: (clip: AudioClip) => AudioClip): Project {
  const index = project.audio.findIndex((c) => c.id === id);
  const current = project.audio[index];
  if (!current) return project;

  const next = edit(current);
  if (next === current) return project;

  const audio = [...project.audio];
  audio[index] = next;
  return { ...project, audio, updatedAt: Date.now() };
}

export function makeAudioClip(
  mediaId: string,
  options: { startMs?: number; durationMs: number },
): AudioClip {
  return {
    id: newId('aud'),
    mediaId,
    startMs: Math.max(0, Math.round(options.startMs ?? 0)),
    trimStartMs: 0,
    trimEndMs: Math.max(0, Math.round(options.durationMs)),
    gainDb: 0,
    fadeInMs: 0,
    // A short tail by default. Music that stops dead at the end of an ad is
    // the single most common way an otherwise finished piece sounds unfinished.
    fadeOutMs: Math.min(1_200, Math.round(options.durationMs / 4)),
  };
}

/**
 * Appends rather than replaces.
 *
 * §10's "one track for now" is about tracks, not clips — splitting a clip and
 * dropping a second passage onto the same row are both ordinary things to want,
 * and the mixdown has always summed whatever the array holds.
 */
export function addAudio(clip: AudioClip): Action {
  return {
    label: 'Add music',
    apply: (project) => ({ ...project, audio: [...project.audio, clip], updatedAt: Date.now() }),
  };
}

export function removeAudio(id: string): Action {
  return {
    label: 'Remove music',
    apply: (project) => {
      const audio = project.audio.filter((c) => c.id !== id);
      return audio.length === project.audio.length
        ? project
        : { ...project, audio, updatedAt: Date.now() };
    },
  };
}

export function setAudioStart(id: string, startMs: number): Action {
  return {
    label: 'Move music',
    coalesceKey: `audioStart:${id}`,
    apply: (project) =>
      editAudio(project, id, (clip) => {
        const next = Math.max(0, Math.round(startMs));
        return clip.startMs === next ? clip : { ...clip, startMs: next };
      }),
  };
}

/**
 * Trimming, slipping and moving — one atomic action per gesture.
 *
 * The first version dragged the left edge by dispatching *two* actions, a trim
 * and a move, with different coalesce keys. Coalescing only merges a commit
 * with the one before it when the keys match, so alternating keys meant every
 * single pointermove pushed a fresh undo entry: one drag could push a hundred
 * and evict the user's real history off the end of MAX_HISTORY. Each gesture
 * is now one action carrying one key.
 */

/** Keeps a trim window inside the source and never shorter than this. */
const MIN_CLIP_MS = 300;

function clampWindow(
  trimStartMs: number,
  trimEndMs: number,
  sourceMs: number,
): { trimStartMs: number; trimEndMs: number } {
  const limit = Math.max(MIN_CLIP_MS, sourceMs);
  const start = clamp(Math.round(trimStartMs), 0, limit - MIN_CLIP_MS);
  const end = clamp(Math.round(trimEndMs), start + MIN_CLIP_MS, limit);
  return { trimStartMs: start, trimEndMs: end };
}

/**
 * Drags the clip's left edge.
 *
 * Moves the trim window *and* the clip's position together, so the audio under
 * the cursor stays where it is — dragging the edge reveals or hides the
 * opening of the track rather than sliding the whole thing along the timeline.
 */
export function trimAudioStart(id: string, deltaMs: number, sourceMs: number): Action {
  return {
    label: 'Trim music',
    coalesceKey: `audioEdge:${id}`,
    apply: (project) =>
      editAudio(project, id, (clip) => {
        const window = clampWindow(clip.trimStartMs + deltaMs, clip.trimEndMs, sourceMs);
        // Whatever the clamp actually allowed, not what was asked for.
        const applied = window.trimStartMs - clip.trimStartMs;
        const startMs = Math.max(0, clip.startMs + applied);

        /*
         * Both edges are written, not just the one being dragged. The clamp
         * pushes the far edge along when the near one would otherwise pass it,
         * and writing only trimStartMs left an inverted window — trimStart
         * beyond trimEnd — whose duration computes to zero, so the clip
         * silently disappeared instead of stopping at its minimum length.
         */
        return window.trimStartMs === clip.trimStartMs
          && window.trimEndMs === clip.trimEndMs
          && startMs === clip.startMs
          ? clip
          : { ...clip, trimStartMs: window.trimStartMs, trimEndMs: window.trimEndMs, startMs };
      }),
  };
}

export function trimAudioEnd(id: string, deltaMs: number, sourceMs: number): Action {
  return {
    label: 'Trim music',
    coalesceKey: `audioEdge:${id}`,
    apply: (project) =>
      editAudio(project, id, (clip) => {
        const window = clampWindow(clip.trimStartMs, clip.trimEndMs + deltaMs, sourceMs);
        // Symmetrically: the clamp may move the start, and dropping that would
        // invert the window from the other direction.
        return window.trimEndMs === clip.trimEndMs && window.trimStartMs === clip.trimStartMs
          ? clip
          : { ...clip, ...window };
      }),
  };
}

/**
 * Slips the clip: changes *which part* of the track plays without moving it.
 *
 * The gesture that was missing. Trimming can only shorten from the ends, so
 * with trim alone the only way to reach a chorus ninety seconds in is to cut
 * away the ninety seconds before it — which also moves the clip. Slipping
 * holds the clip's position and length still and slides the source underneath.
 */
export function slipAudio(id: string, deltaMs: number, sourceMs: number): Action {
  return {
    label: 'Slip music',
    coalesceKey: `audioSlip:${id}`,
    apply: (project) =>
      editAudio(project, id, (clip) => {
        const length = clip.trimEndMs - clip.trimStartMs;
        const limit = Math.max(MIN_CLIP_MS, sourceMs);

        // The window keeps its length, so the clip's duration never changes —
        // it just stops at the ends of the source.
        const start = clamp(Math.round(clip.trimStartMs + deltaMs), 0, Math.max(0, limit - length));
        return start === clip.trimStartMs
          ? clip
          : { ...clip, trimStartMs: start, trimEndMs: start + length };
      }),
  };
}

/**
 * Trims the clip to exactly cover the video, from wherever it currently starts.
 *
 * The one-click answer to the common case: a track far longer than the piece,
 * which otherwise needs a drag with the far edge somewhere off in the overhang.
 */
export function fitAudioToProject(id: string, projectMs: number, sourceMs: number): Action {
  return {
    label: 'Fit music to video',
    apply: (project) =>
      editAudio(project, id, (clip) => {
        const wanted = Math.max(MIN_CLIP_MS, Math.round(projectMs));
        const available = Math.max(MIN_CLIP_MS, sourceMs);

        // Prefer keeping the chosen section's start; pull it back only if the
        // source runs out before the video does.
        const length = Math.min(wanted, available);
        const start = clamp(clip.trimStartMs, 0, Math.max(0, available - length));

        return { ...clip, startMs: 0, trimStartMs: start, trimEndMs: start + length };
      }),
  };
}

/**
 * Sets *where in the track* the clip starts, absolutely.
 *
 * The control `slipAudio` cannot replace. Slipping is relative and driven by a
 * drag, and a drag maps pixels against the lane — so on a fifteen-second lane
 * the entire width is fifteen seconds of slip, and reaching 1:30 in a
 * three-minute track would take six full drags. Absolute addressing is the
 * only way to say "start at 1:30" and mean it.
 *
 * Length is preserved, so this moves the window rather than resizing it.
 */
export function setAudioSection(id: string, sourceStartMs: number, sourceMs: number): Action {
  return {
    label: 'Change music section',
    coalesceKey: `audioSection:${id}`,
    apply: (project) =>
      editAudio(project, id, (clip) => {
        const length = clip.trimEndMs - clip.trimStartMs;
        const limit = Math.max(MIN_CLIP_MS, sourceMs);
        const start = clamp(Math.round(sourceStartMs), 0, Math.max(0, limit - length));
        return start === clip.trimStartMs
          ? clip
          : { ...clip, trimStartMs: start, trimEndMs: start + length };
      }),
  };
}

/** Sets how much of the track is used, from wherever the section starts. */
export function setAudioLength(id: string, lengthMs: number, sourceMs: number): Action {
  return {
    label: 'Change music length',
    coalesceKey: `audioLength:${id}`,
    apply: (project) =>
      editAudio(project, id, (clip) => {
        const limit = Math.max(MIN_CLIP_MS, sourceMs);
        const available = limit - clip.trimStartMs;
        const length = clamp(Math.round(lengthMs), MIN_CLIP_MS, Math.max(MIN_CLIP_MS, available));
        const trimEndMs = clip.trimStartMs + length;
        return trimEndMs === clip.trimEndMs ? clip : { ...clip, trimEndMs };
      }),
  };
}

/**
 * Splits a clip in two at a point on the project timeline.
 *
 * What "cut a section out of the music" actually needs: split twice and delete
 * the middle. §10 says "one track for now" — one *track*, not one clip, and
 * `project.audio` has always been an array. The renderer and the mixdown both
 * iterate it already, so this costs the model nothing.
 *
 * Refuses rather than producing a sliver: either side shorter than the minimum
 * would be a clip too small to grab, which is how a split becomes a way to
 * lose audio.
 */
export function splitAudio(id: string, atMs: number): Action {
  return {
    label: 'Split music',
    apply: (project) => {
      const index = project.audio.findIndex((c) => c.id === id);
      const clip = project.audio[index];
      if (!clip) return project;

      const offset = Math.round(atMs) - clip.startMs;
      const length = clip.trimEndMs - clip.trimStartMs;
      if (offset < MIN_CLIP_MS || length - offset < MIN_CLIP_MS) return project;

      const cut = clip.trimStartMs + offset;

      // Fades belong to the outer edges: the left keeps its fade in, the right
      // its fade out, and the new inner edges are butt joins.
      const left: AudioClip = { ...clip, trimEndMs: cut, fadeOutMs: 0 };
      const right: AudioClip = {
        ...clip,
        id: newId('aud'),
        startMs: clip.startMs + offset,
        trimStartMs: cut,
        fadeInMs: 0,
      };

      const audio = [...project.audio];
      audio.splice(index, 1, left, right);
      return { ...project, audio, updatedAt: Date.now() };
    },
  };
}

export function resetAudioTrim(id: string, sourceMs: number): Action {
  return {
    label: 'Reset music trim',
    apply: (project) =>
      editAudio(project, id, (clip) => ({
        ...clip,
        trimStartMs: 0,
        trimEndMs: Math.max(MIN_CLIP_MS, Math.round(sourceMs)),
      })),
  };
}

export function setAudioGain(id: string, gainDb: number): Action {
  return {
    label: 'Change volume',
    coalesceKey: `audioGain:${id}`,
    apply: (project) =>
      editAudio(project, id, (clip) => {
        // −60dB is the silence floor dbToGain uses; +12 is as loud as anything
        // here should be able to make itself.
        const next = clamp(gainDb, -60, 12);
        return clip.gainDb === next ? clip : { ...clip, gainDb: next };
      }),
  };
}

export function setAudioFades(id: string, fades: { fadeInMs?: number; fadeOutMs?: number }): Action {
  return {
    label: 'Change fades',
    coalesceKey: `audioFades:${id}`,
    apply: (project) =>
      editAudio(project, id, (clip) => {
        // Not clamped against the clip length here: `resolvedFades` scales
        // overlapping fades at playback, so a long fade on a short clip stays
        // a long fade if the clip is later lengthened.
        const fadeInMs = Math.max(0, Math.round(fades.fadeInMs ?? clip.fadeInMs));
        const fadeOutMs = Math.max(0, Math.round(fades.fadeOutMs ?? clip.fadeOutMs));
        return clip.fadeInMs === fadeInMs && clip.fadeOutMs === fadeOutMs
          ? clip
          : { ...clip, fadeInMs, fadeOutMs };
      }),
  };
}
