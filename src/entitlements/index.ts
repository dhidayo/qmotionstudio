/**
 * §12. Free/Pro gating is real in the UI and stubbed in the backend for v1.
 *
 * Swapping in a real API call later must touch this file and nothing else, so
 * both a plain function and a hook are exported: the renderer needs the limits
 * too (§6.4 draws the free-tier watermark) and it cannot call a React hook
 * without breaking D-001.
 */
import { useSyncExternalStore } from 'react';

export type Tier = 'free' | 'pro';

export type Limits = {
  readonly maxDurationMs: number;
  readonly proTemplates: boolean;
  readonly customMedia: boolean;
  readonly maxExportHeight: number;
  readonly watermark: boolean;
};

export type Mode = 'showcase' | 'motionAd';

/**
 * §12's watermark rule, on its own because the renderer needs it.
 *
 * It does not depend on the mode — only the tier — so exposing it separately
 * saves every caller inventing a mode to ask about, and keeps the rule in this
 * file where §12 requires it to be.
 */
export function watermarked(): boolean {
  return getTier() === 'free';
}

export function getLimits(tier: Tier, mode: Mode): Limits {
  if (tier === 'pro') {
    return {
      maxDurationMs: mode === 'motionAd' ? 120_000 : 60_000,
      proTemplates: true,
      customMedia: true,
      maxExportHeight: 1080,
      watermark: false,
    };
  }
  return {
    maxDurationMs: mode === 'motionAd' ? 15_000 : 60_000,
    proTemplates: false,
    customMedia: false,
    maxExportHeight: 1080,
    watermark: true,
  };
}

// ── v1 stub: tier lives in local state with a dev toggle ────────────────────

/**
 * Whether the tier can be switched from inside the app (D-093).
 *
 * v1 has no payments (§12), so the only road to Pro is a switch — a
 * developer's tool. Shipped, it handed Pro to anyone who clicked the badge in
 * the top bar or the "Go Pro" button, which made every Pro limit decoration.
 *
 * On in development. Off in a production build unless that build is made
 * with `VITE_TIER_TOGGLE=1`, which is for a private staging copy and for
 * `npm run e2e:prod` — never for the public site. When real subscriptions
 * arrive, this and `setTier` are what they replace.
 */
export const TIER_SWITCHABLE: boolean =
  import.meta.env.DEV || import.meta.env.VITE_TIER_TOGGLE === '1';

const TIER_KEY = 'ms.tier';
let currentTier: Tier = readTier();
const listeners = new Set<() => void>();

function readTier(): Tier {
  // A tier left in storage by a development session, or typed in by hand,
  // must not survive into a build where nobody can choose it.
  if (!TIER_SWITCHABLE) return 'free';
  try {
    return localStorage.getItem(TIER_KEY) === 'pro' ? 'pro' : 'free';
  } catch {
    return 'free';
  }
}

export function getTier(): Tier {
  return currentTier;
}

export function setTier(tier: Tier): void {
  if (!TIER_SWITCHABLE) return;
  currentTier = tier;
  try {
    localStorage.setItem(TIER_KEY, tier);
  } catch {
    // Non-fatal: the toggle still works for this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEntitlements(mode: Mode = 'showcase'): { tier: Tier; limits: Limits } {
  const tier = useSyncExternalStore(subscribe, getTier, getTier);
  return { tier, limits: getLimits(tier, mode) };
}
