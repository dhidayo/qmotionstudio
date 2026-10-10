import type { LookSettings } from '@/document/types';
import { DEFAULT_LOOK } from '@/document/defaults';
import { summaryFor } from './manifest';
import { lookPreset, withLookPreset, type LookPreset } from './_shared/look';

/**
 * The look a design opens in (D-121), from the eager manifest, so a project
 * can be given it before the design's code has loaded.
 */
export function designLookPreset(templateId: string): LookPreset | undefined {
  const id = summaryFor(templateId)?.look;
  return id === undefined ? undefined : lookPreset(id);
}

/** `base` restyled in the design's own look; `base` itself when it names none. */
export function designLook(templateId: string, base: LookSettings = DEFAULT_LOOK): LookSettings {
  const preset = designLookPreset(templateId);
  return preset ? withLookPreset(base, preset) : base;
}
