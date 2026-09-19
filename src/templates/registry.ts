import type { Aspect } from '@/core/types';
import { validateTemplate, type SceneTemplate, type Template, type TemplateIssue } from './schema';

/**
 * Template registry (§7).
 *
 * Auto-registered by a glob import over `src/templates/<category>/<id>.ts`.
 *
 * The glob is **lazy** (D-029). §7 says "auto-registered by a glob import"; an
 * eager glob would put all 25 v1 templates in the initial bundle and spend
 * §14's whole cold-load budget before the editor drew anything. Each module is
 * fetched when its template is first used.
 *
 * The library grid needs names, categories, tiers and thumbnails to render, and
 * cannot wait on 25 dynamic imports to do it — so metadata lives in a separate
 * eager manifest. The lint script's job is partly to keep the two in step.
 */

type TemplateModule = { readonly default: Template };

/**
 * The glob deliberately excludes `_shared` and `_demo`.
 *
 * Without the exclusion, `knownTemplateIds()` reported `chrome`, `look`,
 * `photo`, `text` and `demoScene` as templates — helper modules with no
 * default export and no business in a library listing. Harmless in practice,
 * since nothing looked them up by those names, but it made every "unknown
 * template" error message misleading about what was actually available.
 */
const modules = import.meta.glob<TemplateModule>(
  ['./*/*.ts', '!./_*/**'],
  { eager: false },
);

const cache = new Map<string, Template>();

/** Maps a template id to its module path, derived from the file layout. */
function pathFor(id: string): string | undefined {
  return Object.keys(modules).find((path) => path.endsWith(`/${id}.ts`));
}

export function knownTemplateIds(): readonly string[] {
  return Object.keys(modules)
    .map((path) => path.split('/').pop()?.replace(/\.ts$/, '') ?? '')
    .filter((id) => id.length > 0)
    .sort();
}

/**
 * Loads a template by id.
 *
 * Validates on first load and throws on a failure rather than rendering
 * something broken — §16 forbids swallowing errors, and a malformed template
 * is a build-time mistake that should be loud.
 */
export async function loadTemplate(id: string): Promise<Template> {
  const hit = cache.get(id);
  if (hit) return hit;

  const path = pathFor(id);
  if (!path) throw new Error(`Unknown template "${id}". Known: ${knownTemplateIds().join(', ')}`);

  const loader = modules[path];
  if (!loader) throw new Error(`Template "${id}" resolved to a path with no loader: ${path}`);

  const module = await loader();
  const template = module.default;

  if (template.id !== id) {
    throw new Error(`Template in ${path} declares id "${template.id}" but the filename says "${id}".`);
  }

  const issues = validateTemplate(template);
  if (issues.length > 0) {
    throw new Error(
      `Template "${id}" is invalid:\n${issues.map((i) => `  - ${i.message}`).join('\n')}`,
    );
  }

  cache.set(id, template);
  return template;
}

export async function loadSceneTemplate(id: string): Promise<SceneTemplate> {
  const template = await loadTemplate(id);
  if (template.kind !== 'scene') {
    throw new Error(`Template "${id}" is an ad template; a scene template was expected.`);
  }
  return template;
}

/** Synchronous read for the render loop — null until the template has loaded. */
export function peekTemplate(id: string): Template | null {
  return cache.get(id) ?? null;
}

/** Loads every template. Used by the lint and thumbnail scripts, never by the app. */
export async function loadAllTemplates(): Promise<Template[]> {
  return Promise.all(knownTemplateIds().map((id) => loadTemplate(id)));
}

export function validateAll(templates: readonly Template[]): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const seen = new Map<string, string>();

  for (const template of templates) {
    issues.push(...validateTemplate(template));

    const duplicate = seen.get(template.id);
    if (duplicate) {
      issues.push({ templateId: template.id, message: `duplicate id, also declared by ${duplicate}` });
    }
    seen.set(template.id, template.name);
  }

  return issues;
}

/** Aspects a template will actually render well at (§6.5); the switcher hides the rest. */
export function supportsAspect(template: Template, aspect: Aspect): boolean {
  return template.supportedAspects.includes(aspect);
}
