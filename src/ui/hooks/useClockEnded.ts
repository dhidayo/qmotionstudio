import { useCallback, useSyncExternalStore } from 'react';
import type { PreviewClock } from '@/core/time/clock';

/**
 * Whether the preview has played once and come to rest (D-155): what turns a
 * Play button into Replay. Read from the clock's transport changes, which is
 * when it can change, rather than every frame.
 */
export function useClockEnded(clock: PreviewClock): boolean {
  const subscribe = useCallback((onChange: () => void) => clock.subscribe(onChange), [clock]);
  return useSyncExternalStore(subscribe, () => clock.ended, () => false);
}
