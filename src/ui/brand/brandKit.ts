import { useSyncExternalStore } from 'react';
import type { LogoSettings, LookRestyle } from '@/document/types';

/**
 * My brand (D-134): an organisation's colours, ground and logo, saved once on
 * this device and put on any design in one tap — the local first step of the
 * roadmap's Brand Kit, before accounts can carry it between devices.
 *
 * Kept in browser storage as a few colours and an id: the logo's picture
 * itself is in the media store with every other photo, never in storage here
 * (§5, no image data in localStorage).
 */
export type BrandKit = {
  readonly look: LookRestyle;
  readonly logo: LogoSettings | null;
  readonly savedAt: number;
};

const KEY = 'ms.brand';
const listeners = new Set<() => void>();
let cached: BrandKit | null | undefined;

function isKit(value: unknown): value is BrandKit {
  if (typeof value !== 'object' || value === null) return false;
  const kit = value as { look?: { palette?: unknown; background?: unknown } };
  return typeof kit.look?.palette === 'object' && typeof kit.look.background === 'string';
}

export function readBrandKit(): BrandKit | null {
  if (cached !== undefined) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    cached = isKit(parsed) ? parsed : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function saveBrandKit(kit: BrandKit | null): void {
  cached = kit;
  try {
    if (kit === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(kit));
  } catch {
    // Kept for this visit; a private window forgets it.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useBrandKit(): BrandKit | null {
  return useSyncExternalStore(subscribe, readBrandKit, () => null);
}
