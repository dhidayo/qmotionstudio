import { SCHEMA_VERSION, type Project, type Scene, type SceneInputs } from './types';

/**
 * Bringing an older saved document up to the current shape (§5, §13).
 *
 * Saves outlive code. The moment anything is written to disk, every future
 * change to the document shape has to answer "what happens to the ones already
 * saved?", and the honest place to answer it is here rather than in a hundred
 * defensive `?? []`s scattered through the reader.
 *
 * Each step takes the shape at version N and returns the shape at N+1, so the
 * chain is `while (version < SCHEMA_VERSION) step()` and adding a version means
 * adding one function. Steps take `unknown` and are written defensively,
 * because by definition they are handed data this build has never produced.
 */

export type MigrationResult =
  | { readonly ok: true; readonly project: Project; readonly migrated: boolean }
  | { readonly ok: false; readonly reason: string };

type Step = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Keyed by the version being migrated *from*.
 *
 * v1 → v2 adds `slotTransforms` to every scene, for D-061's nudges. No v1
 * document was ever written to disk — persistence arrived with v2 — so this
 * step is here to keep the chain honest and to give the mechanism something
 * real to be tested against, not because anyone's save needs it.
 */
const STEPS: Readonly<Record<number, Step>> = {
  1: (raw) => ({
    ...raw,
    schemaVersion: 2,
    scenes: asArray(raw['scenes']).map((scene) => {
      const inputs = asRecord(asRecord(scene)['inputs']);
      return {
        ...asRecord(scene),
        inputs: { ...inputs, slotTransforms: inputs['slotTransforms'] ?? {} },
      };
    }),
  }),
};

export function migrate(raw: unknown): MigrationResult {
  if (!isRecord(raw)) return { ok: false, reason: 'That save is not a document.' };

  const start = raw['schemaVersion'];
  if (typeof start !== 'number' || !Number.isFinite(start)) {
    return { ok: false, reason: 'That save has no schema version.' };
  }

  if (start > SCHEMA_VERSION) {
    // Forwards is not a migration, it is a guess. Better to say so than to
    // open a document written by a newer build and quietly drop what it added.
    return {
      ok: false,
      reason: 'That project was saved by a newer version of Motion Studio.',
    };
  }

  let current: Record<string, unknown> = raw;
  let version = start;
  while (version < SCHEMA_VERSION) {
    const step = STEPS[version];
    if (!step) return { ok: false, reason: `No way to upgrade a version ${version} save.` };
    current = step(current);
    version += 1;
  }

  const project = asProject(current);
  return project
    ? { ok: true, project, migrated: start !== SCHEMA_VERSION }
    : { ok: false, reason: 'That save is missing the parts a project needs.' };
}

/**
 * The shallow check a reader owes itself.
 *
 * Not a full validation: the document is written by this application and read
 * back by it, so the realistic failure is a *truncated* or hand-edited record,
 * not a subtly wrong one. What this catches is the case where opening it would
 * throw somewhere deep in the renderer with no idea why.
 */
function asProject(raw: Record<string, unknown>): Project | null {
  const scenes = raw['scenes'];
  if (typeof raw['id'] !== 'string') return null;
  if (!Array.isArray(scenes) || scenes.length === 0) return null;
  if (!scenes.every((scene) => isRecord(scene) && typeof scene['templateId'] === 'string')) {
    return null;
  }
  if (!Array.isArray(raw['overlays']) || !Array.isArray(raw['audio'])) return null;

  const project = raw as unknown as Project;
  // Every scene needs the fields added since the shape it was written in; the
  // steps above guarantee it, and this is the belt to that pair of braces.
  return {
    ...project,
    scenes: project.scenes.map(withDefaults),
  };
}

function withDefaults(scene: Scene): Scene {
  // Typed as optional on purpose: this function exists precisely for records
  // that do not match the current type, and TypeScript would otherwise insist
  // the field is always there and elide the default.
  const inputs = scene.inputs as Omit<SceneInputs, 'slotTransforms'> & {
    slotTransforms?: SceneInputs['slotTransforms'];
  };
  return { ...scene, inputs: { ...inputs, slotTransforms: inputs.slotTransforms ?? {} } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}
