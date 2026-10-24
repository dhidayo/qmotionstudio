import type { LibrarySound } from '@/audio/library';
import { useEditor } from '@/state/store';
import { placeSound } from './placeSound';

/** Adds a library sound where it belongs (see `placeSound`, D-156). Returns the toast. */
export function addSound(sound: LibrarySound): string {
  const state = useEditor.getState();
  const { action, select, message } = placeSound(state.project, state.playheadMs, sound);
  if (action) state.dispatch(action);
  if (select !== null) state.selectAudio(select);
  return message;
}
