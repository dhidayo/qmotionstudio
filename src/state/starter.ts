import type { Aspect } from '@/core/types';
import type { Project } from '@/document/types';
import { createProject } from '@/document/defaults';
import { designLook } from '@/templates/looks';
import { WORKSPACE_IDS, WORKSPACES, type WorkspaceId } from '@/templates/workspaces';

/**
 * The project a workspace opens on (D-149), and how to tell that the open
 * project is still exactly that — untouched — so a workspace chosen now may
 * swap it for its own opener without taking anything the person made.
 */

export function starterProject(id: WorkspaceId, options: { readonly aspect?: Aspect | undefined } = {}): Project {
  const { templateId, aspect, photoCount, durationMs } = WORKSPACES[id].opener;
  const project = createProject({
    templateId,
    aspect: options.aspect ?? aspect,
    photoCount,
    look: designLook(templateId),
  });
  return { ...project, scenes: project.scenes.map((scene) => ({ ...scene, durationMs })) };
}

/** JSON with keys in a fixed order, so two equal documents compare equal however they were built. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return inner;
    const record = inner as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));
  });
}

/** A project's content without what differs between two copies of the same starter. */
function content(project: Project): string {
  const { id: _id, createdAt: _created, updatedAt: _updated, ...rest } = project;
  return canonical({ ...rest, scenes: rest.scenes.map(({ id: _scene, ...scene }) => scene) });
}

export function sameContent(a: Project, b: Project): boolean {
  return content(a) === content(b);
}

/**
 * The workspace whose starter this project still is, or null once anything
 * in it has changed — a word, a photo, a colour, the name, a scene, the mode.
 * The frame shape is allowed to differ: changing it is an undo step, and the
 * caller also requires an empty history.
 */
export function untouchedStarterOf(project: Project): WorkspaceId | null {
  for (const id of WORKSPACE_IDS) {
    if (sameContent(project, starterProject(id, { aspect: project.aspect }))) return id;
  }
  return null;
}

/**
 * What New video opens on: no scenes yet — they come from the library or from
 * the person's saved images (D-140, D-155) — and no layers.
 */
export function emptyVideo(aspect: Aspect): Project {
  return createProject({ name: 'Untitled video', aspect, mode: 'motionAd', templateId: 'blank', photoCount: 0 });
}

/**
 * Whether a project holds anything worth coming back to (D-168): "users may
 * be coming back to start a new design". False while it is still a
 * workspace's starter or the empty video New video opens on — nothing there
 * would be missed — and true once anything differs: a photo, a word, a
 * colour, the name, a scene, a layer, a sound.
 */
export function hasWork(project: Project): boolean {
  if (untouchedStarterOf(project) !== null) return false;
  return !sameContent(project, emptyVideo(project.aspect));
}
