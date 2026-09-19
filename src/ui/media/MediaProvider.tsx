import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { MediaStore } from '@/media/store';

/**
 * Makes the media store reachable from the inspector.
 *
 * A context rather than Zustand state: the store holds ImageBitmaps and is
 * mutated in place, so putting it in the document state would make every undo
 * snapshot carry decoded pixels — exactly what §5 keeps out by storing ids.
 */
const MediaContext = createContext<MediaStore | null>(null);

export function MediaProvider({ store, children }: { store: MediaStore; children: ReactNode }): React.JSX.Element {
  return <MediaContext.Provider value={store}>{children}</MediaContext.Provider>;
}

export function useMediaStore(): MediaStore {
  const store = useContext(MediaContext);
  if (!store) throw new Error('useMediaStore used outside a MediaProvider.');
  return store;
}

/**
 * Re-renders the caller when the store changes.
 *
 * Decoded bitmaps land in a Map, which React cannot see. The artboard does not
 * care — it repaints every animation frame — but the inspector renders once,
 * and without this its thumbnails stay empty forever after losing the race
 * against a decode. That race was invisible while the samples were 95KB
 * gradients and unmissable once they became photographs (D-049).
 */
export function useMediaRevision(): number {
  const store = useMediaStore();
  return useSyncExternalStore(store.subscribe, store.getRevision, store.getRevision);
}

export function createMediaStore(): MediaStore {
  return new MediaStore();
}

/** Stable per-mount store, for the app root. */
export function useNewMediaStore(): MediaStore {
  return useMemo(() => new MediaStore(), []);
}
