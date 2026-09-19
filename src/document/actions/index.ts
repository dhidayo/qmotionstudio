import type { Palette, PaletteRole } from '@/core/types';
import { DEFAULT_LOGO } from '../defaults';
import type {
  BackgroundTreatment,
  LogoPlacement,
  PhotoCropMode,
  PhotoFrame,
  PhotoInput,
  PhotoSizeMode,
  Project,
  Scene,
  SceneInputs,
  TextStyle,
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

export type Action = {
  readonly label: string;
  readonly coalesceKey?: string;
  apply(project: Project): Project;
};

// ── Plumbing ────────────────────────────────────────────────────────────────

/** Showcase edits target the single scene (§5); M5 will take a scene index. */
function editScene(project: Project, edit: (scene: Scene) => Scene): Project {
  const [scene, ...rest] = project.scenes;
  if (!scene) return project;

  const next = edit(scene);
  if (next === scene) return project;

  return { ...project, scenes: [next, ...rest], updatedAt: Date.now() };
}

function editInputs(project: Project, edit: (inputs: SceneInputs) => SceneInputs): Project {
  return editScene(project, (scene) => {
    const inputs = edit(scene.inputs);
    return inputs === scene.inputs ? scene : { ...scene, inputs };
  });
}

function editPhotos(project: Project, edit: (photos: readonly PhotoInput[]) => readonly PhotoInput[]): Project {
  return editInputs(project, (inputs) => {
    const photos = edit(inputs.photos);
    return photos === inputs.photos ? inputs : { ...inputs, photos };
  });
}

function editPhotoAt(project: Project, index: number, edit: (photo: PhotoInput) => PhotoInput): Project {
  return editPhotos(project, (photos) => {
    const photo = photos[index];
    if (!photo) return photos;
    const next = edit(photo);
    if (next === photo) return photos;
    const copy = [...photos];
    copy[index] = next;
    return copy;
  });
}

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

// ── Photos (§8.1) ───────────────────────────────────────────────────────────

export function addPhotos(mediaIds: readonly string[]): Action {
  return {
    label: mediaIds.length === 1 ? 'Add photo' : `Add ${mediaIds.length} photos`,
    apply: (project) =>
      editPhotos(project, (photos) => [
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
    apply: (project) =>
      editPhotos(project, (photos) =>
        index < 0 || index >= photos.length ? photos : photos.filter((_, i) => i !== index),
      ),
  };
}

export function removeAllPhotos(): Action {
  return {
    label: 'Remove all photos',
    apply: (project) => editPhotos(project, (photos) => (photos.length === 0 ? photos : [])),
  };
}

export function reorderPhoto(from: number, to: number): Action {
  return {
    label: 'Reorder photos',
    apply: (project) =>
      editPhotos(project, (photos) => {
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
    apply: (project) =>
      editPhotos(project, (photos) => {
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
    apply: (project) => editPhotoAt(project, index, (photo) => ({ ...photo, frame })),
  };
}

export function setPhotoSizeMode(index: number, sizeMode: PhotoSizeMode): Action {
  return {
    label: 'Change size mode',
    apply: (project) => editPhotoAt(project, index, (photo) => ({ ...photo, sizeMode })),
  };
}

export function setPhotoSizePct(index: number, sizePct: number): Action {
  return {
    label: 'Change photo size',
    coalesceKey: `photoSize:${index}`,
    apply: (project) =>
      editPhotoAt(project, index, (photo) => ({ ...photo, sizePct: clamp(sizePct, 100, 400) })),
  };
}

export function setPhotoCropMode(index: number, cropMode: PhotoCropMode): Action {
  return {
    label: 'Change crop mode',
    apply: (project) => editPhotoAt(project, index, (photo) => ({ ...photo, cropMode })),
  };
}

// ── Text (§8.2) ─────────────────────────────────────────────────────────────

export function setText(slotId: string, text: string): Action {
  return {
    label: 'Edit text',
    // Typing is one undo step per field, not one per keystroke.
    coalesceKey: `text:${slotId}`,
    apply: (project) =>
      editInputs(project, (inputs) =>
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
    apply: (project) =>
      editInputs(project, (inputs) => ({
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
    apply: (project) =>
      editInputs(project, (inputs) => ({ ...inputs, logo: { ...inputs.logo, mediaId } })),
  };
}

export function setLogoSize(sizePct: number): Action {
  return {
    label: 'Resize logo',
    coalesceKey: 'logoSize',
    apply: (project) =>
      editInputs(project, (inputs) => ({
        ...inputs,
        logo: { ...inputs.logo, sizePct: clamp(sizePct, 2, 40) },
      })),
  };
}

export function setLogoPlacement(placement: LogoPlacement): Action {
  return {
    label: 'Move logo',
    apply: (project) =>
      editInputs(project, (inputs) => ({ ...inputs, logo: { ...inputs.logo, placement } })),
  };
}

export function setLogoOpacity(opacity: number): Action {
  return {
    label: 'Change logo opacity',
    coalesceKey: 'logoOpacity',
    apply: (project) =>
      editInputs(project, (inputs) => ({
        ...inputs,
        logo: { ...inputs.logo, opacity: clamp(opacity, 0, 1) },
      })),
  };
}

export function setLogoLockup(lockup: boolean, lockupText?: string): Action {
  return {
    label: lockup ? 'Enable lockup' : 'Disable lockup',
    apply: (project) =>
      editInputs(project, (inputs) => ({
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
    apply: (project) =>
      editInputs(project, (inputs) => ({ ...inputs, logo: { ...inputs.logo, lockupText } })),
  };
}

export function resetLogo(): Action {
  return {
    label: 'Reset logo',
    apply: (project) => editInputs(project, (inputs) => ({ ...inputs, logo: DEFAULT_LOGO })),
  };
}

// ── Look (§8.4) ─────────────────────────────────────────────────────────────

export function setPaletteRole(role: PaletteRole, color: string): Action {
  return {
    label: 'Change colour',
    coalesceKey: `palette:${role}`,
    apply: (project) =>
      editInputs(project, (inputs) => ({
        ...inputs,
        look: { ...inputs.look, palette: { ...inputs.look.palette, [role]: color } },
      })),
  };
}

export function applyPalette(palette: Palette): Action {
  return {
    label: 'Apply palette',
    apply: (project) =>
      editInputs(project, (inputs) => ({ ...inputs, look: { ...inputs.look, palette } })),
  };
}

export function setBackground(background: BackgroundTreatment): Action {
  return {
    label: 'Change background',
    apply: (project) =>
      editInputs(project, (inputs) => ({ ...inputs, look: { ...inputs.look, background } })),
  };
}

export function setGrain(grain: number): Action {
  return {
    label: 'Change grain',
    coalesceKey: 'grain',
    apply: (project) =>
      editInputs(project, (inputs) => ({ ...inputs, look: { ...inputs.look, grain: clamp(grain, 0, 1) } })),
  };
}

export function setVignette(vignette: number): Action {
  return {
    label: 'Change vignette',
    coalesceKey: 'vignette',
    apply: (project) =>
      editInputs(project, (inputs) => ({
        ...inputs,
        look: { ...inputs.look, vignette: clamp(vignette, 0, 1) },
      })),
  };
}

export function setSpeed(speed: number): Action {
  return {
    label: 'Change speed',
    coalesceKey: 'speed',
    apply: (project) =>
      editInputs(project, (inputs) => ({ ...inputs, look: { ...inputs.look, speed: clamp(speed, 0.25, 3) } })),
  };
}

export function setCornerRadius(cornerRadius: number): Action {
  return {
    label: 'Change corner radius',
    coalesceKey: 'cornerRadius',
    apply: (project) =>
      editInputs(project, (inputs) => ({
        ...inputs,
        look: { ...inputs.look, cornerRadius: clamp(cornerRadius, 0, 160) },
      })),
  };
}

// ── Scene and project ───────────────────────────────────────────────────────

export function setTemplate(templateId: string, durationMs?: number): Action {
  return {
    label: 'Change template',
    apply: (project) =>
      editScene(project, (scene) =>
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
    apply: (project) =>
      editScene(project, (scene) => {
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
