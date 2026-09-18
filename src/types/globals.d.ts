/// <reference types="vite/client" />

/**
 * Ambient declarations for platform APIs that lib.dom does not yet describe.
 *
 * §17 forbids `any` and `@ts-ignore`, so anything the standard libs are missing
 * gets declared properly here instead of being cast away at the call site.
 *
 * Expected additions as the build progresses:
 *   - WorkerGlobalScope.fonts (FontFaceSet in workers) at M4, for the export
 *     worker's font loading. Implemented in all three engines but not yet in
 *     TypeScript's WebWorker lib.
 */
export {};
