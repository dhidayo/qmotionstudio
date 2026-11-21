import { Suspense } from 'react';
import type { PreviewClock } from '@/core/time/clock';
import { useOverlays } from '@/ui/shell/overlays';
import { lazyPart } from '@/ui/shell/lazyPart';
import { WindowBoundary } from '@/ui/shell/Boundaries';
import { PartLoading } from '@/ui/shell/PartLoading';

/**
 * The phone's panels — designs, photos, text, effects, style, the timeline —
 * fetched when one first opens, not with the editor (D-173).
 *
 * They are the inspector, the library and the timeline in a sheet, which is
 * most of the interface's code; none of it is on the first screen. Fetched
 * when the editor is idle (src/ui/shell/prefetch.ts), so the first tap
 * opens at once. One that did not download closes and says so (D-171).
 */
export const PHONE_PANELS = lazyPart<{ clock: PreviewClock; scenePicker?: boolean }>(
  async () => (await import('./PhonePanels')).PhonePanels,
);

export function PhonePanelsPart({ clock, scenePicker = true }: { clock: PreviewClock; scenePicker?: boolean }): React.JSX.Element | null {
  const panel = useOverlays((o) => o.phonePanel);
  const picking = useOverlays((o) => o.scenePicker);
  const close = (): void => {
    useOverlays.getState().openPhonePanel(null);
    useOverlays.getState().openScenePicker(null);
  };
  if (panel === null && (!scenePicker || picking === null)) return null;
  return (
    <WindowBoundary onFailed={close}>
      <Suspense fallback={<PartLoading />}>
        <PHONE_PANELS.Component clock={clock} scenePicker={scenePicker} />
      </Suspense>
    </WindowBoundary>
  );
}
