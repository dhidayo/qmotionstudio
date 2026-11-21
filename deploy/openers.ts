/**
 * The code a first visit draws its first frame with (D-171).
 *
 * The opening design's template is loaded on demand (D-029), so a cold load
 * used to fetch it only once the editor's own script had arrived, run and
 * rendered — one more round trip at the very end, about a second on a slow
 * phone connection. The build names these modules in the page as
 * `modulepreload` links instead, so they download alongside the editor.
 *
 * One entry per purpose's opener in src/templates/workspaces.ts: a template
 * with a file of its own, or the family module that makes a catalogue
 * variant (src/templates/registry.ts). Together they are about 15KB
 * compressed. `src/templates/openers.test.ts` fails if an opener changes and this
 * list is not changed with it.
 *
 * Plain paths with no imports, because vite.config.ts reads this file.
 */
export const OPENER_MODULES: readonly string[] = [
  'src/templates/depth-stage/depth-parallax.ts', // All: depth-parallax
  'src/templates/_families/flow.ts', // Social: flow-polaroid-pass
  'src/templates/_families/product.ts', // Business: pd-new-arrival
  'src/templates/_families/element.ts', // News: el-eyebrow-title
];
