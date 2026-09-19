/*
 * Ambient declaration for libheif-js's ESM bundle.
 *
 * Deliberately NOT a module file — no top-level import or export — because
 * `declare module` inside a module is an *augmentation* and requires the module
 * to already have types. This one has none for the ESM path.
 *
 * Typed as `unknown` on purpose: heic.ts narrows it to the handful of methods
 * it actually calls, so the assumption about a 2MB third-party module lives in
 * one readable place rather than in a hand-copied interface that silently rots.
 */
declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  const factory: unknown;
  export default factory;
}
