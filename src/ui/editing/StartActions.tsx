import { useCallback, useRef } from 'react';
import * as actions from '@/document/actions';
import { useEditor } from '@/state/store';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { ACCEPT_ATTRIBUTE, useUpload } from '@/ui/media/useUpload';
import { Icon } from '@/ui/mobile/Icon';
import { addPhotoLayers } from './addLayer';
import { addedPhotosMessage, onTopMessage } from './photoMessages';

/**
 * "Choose a design" and "Add your photos" — the two things anyone opening the
 * editor is here to do, said as what they do (D-109), and always there
 * (D-116).
 *
 * They used to disappear once the picture held a photo of the person's own,
 * or while something was selected — "Add Your Photos should be always shown,
 * to be able to replace all photos on template instead of only replace when
 * specific items are selected, same for choose template". Adding photos puts
 * each in place of one sample photo in the scene being worked on (D-137,
 * D-150) — the whole design when it is one scene — in one step that one undo
 * takes back.
 */
export function StartActions({
  onChooseDesign,
  variant,
}: {
  onChooseDesign: () => void;
  /** A phone's row spans the screen; a computer's sits under the picture. */
  variant: 'phone' | 'wide';
}): React.JSX.Element {
  const add = useAddYourPhotos();
  const phone = variant === 'phone';
  const size = phone ? 'flex-1 py-2.5 text-[14px]' : 'px-4 py-2 text-[13px]';

  return (
    <div className={phone ? 'flex shrink-0 gap-2 border-t border-edge bg-panel px-3 py-2' : 'flex gap-2'} data-start-actions>
      <button
        type="button"
        onClick={onChooseDesign}
        data-tour="design"
        className={`flex items-center justify-center gap-2 rounded-xl border border-edge bg-panel font-semibold hover:bg-panel-alt ${size}`}
      >
        <Icon name="designs" size={18} /> Choose a design
      </button>
      <button
        type="button"
        onClick={add.pick}
        disabled={add.busy}
        data-tour="photos"
        title="Your photos replace the sample photos, one for one, and stay in Your photos. Nothing is uploaded."
        className={`flex items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-accent-ink hover:bg-accent-hover ${size}`}
      >
        <Icon name="photo" size={18} /> {add.busy ? 'Reading…' : 'Add your photos'}
      </button>
      {add.input}
      {add.error !== null && <span className="sr-only" role="alert">{add.error}</span>}
    </div>
  );
}

/**
 * Picks photographs — or takes one with the camera — adds them to "Your
 * photos", and puts each in place of one sample in the scene being worked on
 * (D-116, D-147, D-150). A design with no photo spots takes them on top
 * instead, as extra photos. Either way the toast says exactly what happened.
 *
 * Every instance takes pasted pictures too; only the one opened last answers
 * (see `useUpload`), so a paste is added once.
 */
export function useAddYourPhotos(label = 'Add your photos'): {
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

  const onAdded = useCallback((ids: string[]) => {
    const s = useEditor.getState();
    const spots = s.project.scenes[s.selectedScene]?.inputs.photos ?? [];
    const max = s.template?.photoSlots.max ?? spots.length;
    const scene = s.project.scenes.length > 1 ? s.selectedScene + 1 : null;
    if (max === 0 && spots.length === 0) {
      // Nowhere in the design to put them: on top, where they can go anywhere.
      addPhotoLayers(ids);
      showToast(onTopMessage(ids.length, scene));
      return;
    }
    const plan = actions.placeInSpots(spots, ids, max);
    dispatch(actions.addYourPhotos(ids, { maxPhotos: max }));
    showToast(addedPhotosMessage(plan, scene));
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
