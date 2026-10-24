import { useCallback, useEffect, useRef } from 'react';
import * as actions from '@/document/actions';
import { useEditor } from '@/state/store';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { ACCEPT_ATTRIBUTE, useUpload } from '@/ui/media/useUpload';
import { addPhotoLayers } from './addLayer';
import { addedPhotosMessage, onTopMessage } from './photoMessages';

/**
 * Picks photographs — or takes one with the camera — adds them to "Your
 * photos", and puts each in place of one sample in the scene being worked on
 * (D-116, D-147, D-152). A design with no photo spots takes them on top
 * instead, as extra photos. Either way the toast says exactly what happened.
 *
 * Behind **+ Photos** in the add bar and the phone's Add sheet, and the Photos
 * panel's **+ Add photos** — one behaviour under every way in (D-162), so the
 * same words never do two different things.
 *
 * Every instance takes pasted pictures too; only the one opened last answers
 * (see `useUpload`), so a paste is added once.
 */
export function useAddYourPhotos(label = 'Add your photos', after?: () => void): {
  pick: () => void;
  /** Opens the camera on a phone; a file picker elsewhere. */
  takePhoto: () => void;
  addFiles: (files: readonly File[]) => Promise<void>;
  busy: boolean;
  error: string | null;
  input: React.JSX.Element;
} {
  const camera = useRef<HTMLInputElement>(null);
  const media = useMediaStore();
  const dispatch = useEditor((s) => s.dispatch);
  const showToast = useEditor((s) => s.showToast);
  const input = useRef<HTMLInputElement>(null);
  // Read when the photos land, not when the hook was made: the caller's sheet may have closed meanwhile.
  const afterRef = useRef(after);
  useEffect(() => { afterRef.current = after; });

  const onAdded = useCallback((ids: string[]) => {
    const s = useEditor.getState();
    const spots = s.project.scenes[s.selectedScene]?.inputs.photos ?? [];
    const max = s.template?.photoSlots.max ?? spots.length;
    const scene = s.project.scenes.length > 1 ? s.selectedScene + 1 : null;
    if (max === 0 && spots.length === 0) {
      // Nowhere in the design to put them: on top, where they can go anywhere.
      addPhotoLayers(ids);
      showToast(onTopMessage(ids.length, scene));
    } else {
      const plan = actions.placeInSpots(spots, ids, max);
      dispatch(actions.addYourPhotos(ids, { maxPhotos: max }));
      showToast(addedPhotosMessage(plan, scene));
    }
    afterRef.current?.();
  }, [dispatch, showToast]);
  const { state: upload, addFiles } = useUpload(media, onAdded, { artboardLongestEdge: 1920, paste: true });

  return {
    pick: () => { input.current?.click(); },
    takePhoto: () => { camera.current?.click(); },
    addFiles,
    busy: upload.busy,
    error: upload.error,
    input: (
      <>
        <input
          ref={input}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          multiple
          hidden
          aria-label={label}
          onChange={(e) => {
            void addFiles([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          aria-label="Take a photo"
          onChange={(e) => {
            void addFiles([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </>
    ),
  };
}
