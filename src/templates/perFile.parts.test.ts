import { loadTemplate } from './registry';
import { isSceneTemplate, type SceneTemplate } from './schema';
import { describeTemplateChecks } from './_test/partChecks';

/** The designs built a layer at a time, part by part (D-159). */
const IDS = ['kinetic-counter', 'kinetic-statement', 'kinetic-list', 'kinetic-quote', 'kinetic-swap', 'angle-flip', 'angle-pinwheel', 'split-band', 'split-pair', 'split-panels', 'split-inset', 'depth-focus', 'depth-spotlight', 'depth-tunnel', 'pop-dream'];
const templates = (await Promise.all(IDS.map((id) => loadTemplate(id)))).filter((t): t is SceneTemplate => isSceneTemplate(t));
describeTemplateChecks(templates.map((template) => ({ template })));
