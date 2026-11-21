import { Suspense, type ComponentType, type ReactNode } from 'react';
import type { PreviewClock } from '@/core/time/clock';
import { lazyPart, type LazyPart } from './lazyPart';
import { WindowBoundary } from './Boundaries';
import { PartLoading } from './PartLoading';

/**
 * The parts of the interface the first screen does not show, each fetched
 * when first opened or when the editor is idle (D-173, ./lazyPart.ts).
 *
 * Windows and pickers open over the editor; the timeline is a video's only.
 * Kept in one place so the idle prefetch (./prefetch.ts) and the places that
 * draw them name the same downloads.
 */
type Closable = { onClose: () => void };

export const EXPORT_DIALOG = lazyPart<Closable>(async () => (await import('@/ui/export/ExportDialog')).ExportDialog);
export const PROJECTS_DIALOG = lazyPart<Closable>(async () => (await import('@/ui/projects/ProjectsDialog')).ProjectsDialog);
export const EFFECT_PICKER = lazyPart<Record<string, never>>(async () => (await import('@/ui/effects/EffectPicker')).EffectPicker);
export const ELEMENT_PICKER = lazyPart<Record<string, never>>(async () => (await import('@/ui/elements/ElementPicker')).ElementPicker);
export const PHOTO_PICKER = lazyPart<Record<string, never>>(async () => (await import('@/ui/media/PhotoPickerDialog')).PhotoPickerDialog);
export const SHORTCUTS = lazyPart<Record<string, never>>(async () => (await import('./ShortcutsDialog')).ShortcutsDialog);
export const SOUND_DIALOG = lazyPart<{ onUseFile: () => void; busy: boolean }>(
  async () => (await import('@/ui/audio/SoundDialog')).SoundDialog,
);
export const TIMELINE = lazyPart<{ clock: PreviewClock; embedded?: boolean }>(
  async () => (await import('@/ui/timeline/Timeline')).Timeline,
);

/**
 * A window drawn only while it is open, fetched the first time it is. One
 * that did not download closes and says so, with Reload (D-171).
 */
export function LazyWindow<P extends object>({
  open,
  part,
  props,
  onFailed,
}: {
  open: boolean;
  part: LazyPart<P>;
  props: P;
  onFailed: () => void;
}): ReactNode {
  if (!open) return null;
  const Part = part.Component as unknown as ComponentType<P>;
  return (
    <WindowBoundary onFailed={onFailed}>
      <Suspense fallback={<PartLoading />}>
        <Part {...props} />
      </Suspense>
    </WindowBoundary>
  );
}
