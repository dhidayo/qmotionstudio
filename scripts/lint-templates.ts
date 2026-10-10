import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { ASPECTS } from '../src/core/types';
import { validateTemplate, type Template, type TemplateIssue } from '../src/templates/schema';
import { TEMPLATE_MANIFEST, CATEGORIES } from '../src/templates/manifest';
import { AD_FILM_TEMPLATES, SCENE_VARIANTS, type SceneVariant } from '../src/templates/catalog';
import { lookPreset } from '../src/templates/_shared/look';

/**
 * `npm run lint:templates` (§7).
 *
 * Checks that ids are unique, slot ranges are sane, durations are within
 * bounds, and that the eager manifest agrees with the templates on disk.
 *
 * Does not go through src/templates/registry.ts: that uses `import.meta.glob`,
 * which is a Vite transform and does not exist under plain Node. Walking the
 * directory here keeps the script runnable without a bundler, which is what
 * makes it usable in CI.
 *
 * §7 also asks that "every declared aspect actually renders". That needs a
 * browser, so it lives in `npm run thumbs`, which renders each template at
 * every aspect it claims and fails if one comes back blank.
 */

const TEMPLATE_ROOT = resolve(process.cwd(), 'src/templates');
// The catalogue's data and family code are not template files (D-119); the
// templates they make are checked below, from the catalogue itself.
const IGNORED_DIRS = new Set(['_shared', '_demo', '_catalog', '_families']);

async function templateFiles(): Promise<string[]> {
  const entries = await readdir(TEMPLATE_ROOT, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) continue;
    const inner = await readdir(resolve(TEMPLATE_ROOT, entry.name), { withFileTypes: true });
    for (const file of inner) {
      if (file.isFile() && file.name.endsWith('.ts') && !file.name.endsWith('.test.ts')) {
        files.push(resolve(TEMPLATE_ROOT, entry.name, file.name));
      }
    }
  }
  return files.sort();
}

async function main(): Promise<void> {
  const files = await templateFiles();
  const issues: TemplateIssue[] = [];
  const loaded: { template: Template; file: string }[] = [];
  const seen = new Map<string, string>();

  for (const file of files) {
    const module: unknown = await import(pathToFileURL(file).href);
    const template = (module as { default?: Template }).default;

    const relative = file.slice(TEMPLATE_ROOT.length + 1);
    if (!template) {
      issues.push({ templateId: relative, message: 'has no default export' });
      continue;
    }

    loaded.push({ template, file: relative });
    issues.push(...validateTemplate(template));

    // The filename is the id. The registry maps one to the other, so a
    // mismatch means a template that can never be loaded.
    const expected = relative.split('/')[1]?.replace(/\.ts$/, '');
    if (template.id !== expected) {
      issues.push({ templateId: template.id, message: `id does not match its filename (${expected ?? '?'})` });
    }

    const folder = relative.split('/')[0];
    const folderSlug = template.category.toLowerCase().replace(/\s+/g, '-');
    if (folder !== folderSlug) {
      issues.push({
        templateId: template.id,
        message: `sits in "${folder ?? '?'}" but declares category "${template.category}" (expected folder "${folderSlug}")`,
      });
    }

    if (!CATEGORIES.includes(template.category)) {
      issues.push({ templateId: template.id, message: `category "${template.category}" is not in the manifest's CATEGORIES` });
    }

    const duplicate = seen.get(template.id);
    if (duplicate) {
      issues.push({ templateId: template.id, message: `duplicate id, also declared by ${duplicate}` });
    }
    seen.set(template.id, relative);
  }

  // ── The catalogue (D-119) ─────────────────────────────────────────────────
  // Variants are made by their family's code; films are data. Both are held to
  // the same rules as a template file.
  const families = new Map<string, (variant: SceneVariant) => Template>();
  const catalogued: Template[] = [...AD_FILM_TEMPLATES];
  for (const variant of SCENE_VARIANTS) {
    let make = families.get(variant.family);
    if (!make) {
      const module = (await import(pathToFileURL(resolve(TEMPLATE_ROOT, '_families', `${variant.family}.ts`)).href)) as { create?: (v: SceneVariant) => Template };
      if (!module.create) {
        issues.push({ templateId: variant.id, message: `family "${variant.family}" exports no create()` });
        continue;
      }
      make = module.create;
      families.set(variant.family, make);
    }
    catalogued.push(make(variant));
  }
  for (const template of catalogued) {
    const where = `catalogue (${template.kind === 'ad' ? 'film' : 'variant'})`;
    loaded.push({ template, file: where });
    issues.push(...validateTemplate(template));
    if (!CATEGORIES.includes(template.category)) {
      issues.push({ templateId: template.id, message: `category "${template.category}" is not in the manifest's CATEGORIES` });
    }
    const duplicate = seen.get(template.id);
    if (duplicate) issues.push({ templateId: template.id, message: `duplicate id, also declared by ${duplicate}` });
    seen.set(template.id, where);
  }

  // ── Manifest agreement ────────────────────────────────────────────────────
  // The library grid renders from the manifest without loading template code
  // (D-029), so drift between the two ships a card that opens something else.
  for (const { template } of loaded) {
    const summary = TEMPLATE_MANIFEST.find((t) => t.id === template.id);
    if (!summary) {
      issues.push({ templateId: template.id, message: 'is missing from TEMPLATE_MANIFEST' });
      continue;
    }

    const mismatches: string[] = [];
    if (summary.name !== template.name) mismatches.push(`name (${summary.name} vs ${template.name})`);
    if (summary.category !== template.category) mismatches.push('category');
    if (summary.tier !== template.tier) mismatches.push('tier');
    if ((summary.isNew ?? false) !== (template.isNew ?? false)) mismatches.push('isNew');
    if (summary.supportedAspects.join() !== template.supportedAspects.join()) mismatches.push('supportedAspects');

    if (summary.kind !== template.kind) mismatches.push('kind');

    if (template.kind === 'scene') {
      if (summary.photoSlots.min !== template.photoSlots.min) mismatches.push('photoSlots.min');
      if (summary.photoSlots.max !== template.photoSlots.max) mismatches.push('photoSlots.max');
    } else {
      if (summary.sceneCount !== template.scenes.length) mismatches.push('sceneCount');
      if (summary.durationMs !== template.defaultDurationMs) mismatches.push('durationMs');
      if (summary.blurb !== template.blurb) mismatches.push('blurb');
      if (summary.look !== template.paletteId) mismatches.push('look (the ad\'s paletteId)');
    }

    if (summary.look !== undefined && !lookPreset(summary.look)) mismatches.push(`look ("${summary.look}" is not one of the Style tab's looks)`);

    for (const field of mismatches) {
      issues.push({ templateId: template.id, message: `manifest disagrees with the template on ${field}` });
    }
  }

  for (const summary of TEMPLATE_MANIFEST) {
    if (!loaded.some(({ template }) => template.id === summary.id)) {
      issues.push({ templateId: summary.id, message: 'is in TEMPLATE_MANIFEST but has no file on disk' });
    }
  }

  // ── Ad templates reference real scene templates ───────────────────────────
  // An ad expands into scenes at pick time (D-013), by which point a bad
  // reference is a runtime failure in front of the user. It is a static fact,
  // so it belongs here.
  const byId = new Map(loaded.map(({ template }) => [template.id, template]));

  for (const { template } of loaded) {
    if (template.kind !== 'ad') continue;

    for (const [i, ref] of template.scenes.entries()) {
      const sub = byId.get(ref.templateId);
      const where = `scene ${i} ("${ref.templateId}")`;

      if (!sub) {
        issues.push({ templateId: template.id, message: `${where} references a template that does not exist` });
        continue;
      }
      if (sub.kind !== 'scene') {
        issues.push({ templateId: template.id, message: `${where} references another ad template` });
        continue;
      }

      if (ref.durationMs < sub.minDurationMs || ref.durationMs > sub.maxDurationMs) {
        issues.push({
          templateId: template.id,
          message: `${where} runs ${ref.durationMs}ms, outside that template's ${sub.minDurationMs}–${sub.maxDurationMs}ms`,
        });
      }

      if (ref.photoCount !== undefined && (ref.photoCount < sub.photoSlots.min || ref.photoCount > sub.photoSlots.max)) {
        issues.push({
          templateId: template.id,
          message: `${where} asks for ${ref.photoCount} photos, outside that template's ${sub.photoSlots.min}–${sub.photoSlots.max}`,
        });
      }

      for (const aspect of template.supportedAspects) {
        if (!sub.supportedAspects.includes(aspect)) {
          issues.push({
            templateId: template.id,
            message: `${where} does not support ${aspect}, which the ad claims`,
          });
        }
      }

      for (const slotId of Object.keys(ref.texts ?? {})) {
        if (!sub.textSlots.some((slot) => slot.id === slotId)) {
          issues.push({ templateId: template.id, message: `${where} seeds unknown text slot "${slotId}"` });
        }
      }

      // D-004 again, from the other side: an overlap longer than half of
      // either neighbour gets clamped at render time, so the declared length
      // and the rendered one would silently disagree.
      const previous = template.scenes[i - 1];
      const overlap = ref.transitionIn === null || ref.transitionIn.kind === 'cut' ? 0 : ref.transitionIn.durationMs;
      if (previous && overlap > Math.min(ref.durationMs, previous.durationMs) / 2) {
        issues.push({
          templateId: template.id,
          message: `${where} has a ${overlap}ms transition, more than half of its shorter neighbour`,
        });
      }
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const byCategory = new Map<string, number>();
  for (const { template } of loaded) {
    byCategory.set(template.category, (byCategory.get(template.category) ?? 0) + 1);
  }

  console.log(`Checked ${loaded.length} templates across ${byCategory.size} categories.`);
  for (const category of CATEGORIES) {
    console.log(`  ${category.padEnd(16)} ${byCategory.get(category) ?? 0}`);
  }

  const aspectCoverage = new Set(loaded.flatMap(({ template }) => template.supportedAspects));
  const uncovered = ASPECTS.filter((a) => !aspectCoverage.has(a));
  if (uncovered.length > 0) {
    console.log(`\nNote: no template supports ${uncovered.join(', ')}.`);
  }

  if (issues.length === 0) {
    console.log('\nAll templates pass.');
    return;
  }

  console.error(`\n${issues.length} problem${issues.length === 1 ? '' : 's'}:\n`);
  for (const issue of issues) {
    console.error(`  ${issue.templateId}: ${issue.message}`);
  }
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error('lint:templates failed:', error);
  process.exitCode = 1;
});
