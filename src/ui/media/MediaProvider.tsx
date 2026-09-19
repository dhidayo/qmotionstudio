import { createContext, useContext, useMemo, type ReactNode } from 'react';
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

export function createMediaStore(): MediaStore {
  return new MediaStore();
}

/** Stable per-mount store, for the app root. */
export function useNewMediaStore(): MediaStore {
  return useMemo(() => new MediaStore(), []);
}
