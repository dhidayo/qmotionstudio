import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPENER_MODULES } from '../../deploy/openers';
import { sceneVariant } from './catalog';
import { WORKSPACE_IDS, WORKSPACES } from './workspaces';

/**
 * The build preloads the code each purpose's opening design is drawn with
 * (D-171). If an opener changes and the list does not, a first visit quietly
 * goes back to fetching its design last — nothing breaks, so only a test
 * notices.
 */
describe('the opening designs are preloaded', () => {
  it.each(WORKSPACE_IDS)('%s', (id) => {
    const { templateId } = WORKSPACES[id].opener;
    const variant = sceneVariant(templateId);
    const module = variant !== undefined
      ? `src/templates/_families/${variant.family}.ts`
      : OPENER_MODULES.find((path) => path.endsWith(`/${templateId}.ts`));
    expect(module, `${templateId} has no module in deploy/openers.ts`).toBeDefined();
    expect(OPENER_MODULES).toContain(module);
  });

  it('names only files that exist', () => {
    for (const path of OPENER_MODULES) expect(existsSync(path), path).toBe(true);
  });
});
