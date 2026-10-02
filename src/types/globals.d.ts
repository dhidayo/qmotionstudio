/// <reference types="vite/client" />

/**
 * Ambient declarations for platform APIs that lib.dom does not yet describe.
 *
 * §17 forbids `any` and `@ts-ignore`, so anything the standard libs are missing
 * gets declared properly here instead of being cast away at the call site.
 *
 * WorkerGlobalScope.fonts is implemented in all three engines — Firefox since
 * 105, WebKit via bug 224178 — but TypeScript's WebWorker lib does not declare
 * it. The export worker needs it for §3E: faces added to the *document's*
 * FontFaceSet are invisible inside a worker, so it loads its own copies.
 */
interface WorkerGlobalScope {
  readonly fonts: FontFaceSet;
}

/** Build-time switches. Read through `src/entitlements` only. */
interface ImportMetaEnv {
  /** "1" to allow switching tier inside a production build (D-093). */
  readonly VITE_TIER_TOGGLE?: string;
}

export {};
