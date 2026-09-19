import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { ASPECTS } from '../src/core/types';
import { validateTemplate, type Template, type TemplateIssue } from '../src/templates/schema';
import { TEMPLATE_MANIFEST, CATEGORIES } from '../src/templates/manifest';

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
const IGNORED_DIRS = new Set(['_shared', '_demo']);

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

    if (template.kind === 'scene') {
      if (summary.photoSlots.min !== template.photoSlots.min) mismatches.push('photoSlots.min');
      if (summary.photoSlots.max !== template.photoSlots.max) mismatches.push('photoSlots.max');
    }

    for (const field of mismatches) {
      issues.push({ templateId: template.id, message: `manifest disagrees with the template on ${field}` });
    }
  }

  for (const summary of TEMPLATE_MANIFEST) {
    if (!loaded.some(({ template }) => template.id === summary.id)) {
      issues.push({ templateId: summary.id, message: 'is in TEMPLATE_MANIFEST but has no file on disk' });
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
