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

const TIER_KEY = 'ms.tier';
let currentTier: Tier = readTier();
const listeners = new Set<() => void>();

function readTier(): Tier {
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
