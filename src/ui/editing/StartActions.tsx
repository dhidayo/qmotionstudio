import { useCallback, useRef } from 'react';
import * as actions from '@/document/actions';
import { useEditor } from '@/state/store';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { ACCEPT_ATTRIBUTE, useUpload } from '@/ui/media/useUpload';
import { Icon } from '@/ui/mobile/Icon';
import { MODE_COPY } from '@/ui/shell/modeLabels';
import { useOverlays } from '@/ui/shell/overlays';
import { addPhotoLayers } from './addLayer';
import { addedPhotosMessage, onTopMessage } from './photoMessages';

/**
 * The start row: what anyone opening the editor is here to do, said as what
 * it does (D-109), and always there (D-116).
 *
 * They used to disappear once the picture held a photo of the person's own,
 * or while something was selected — "Add Your Photos should be always shown,
 * to be able to replace all photos on template instead of only replace when
 * specific items are selected, same for choose template". Adding photos puts
 * each in place of one sample photo in the scene being worked on (D-137,
 * D-152) — the whole design when it is one scene — in one step that one undo
 * takes back.
 *
 * The row follows the mode (D-155). An image is one design: **Choose a
 * design** and **Add your photos**. A video is scenes, and a video template
 * is a whole video, so "choosing a design" there was confused with adding a
 * scene — "after choose a design, you should have Add a scene, and add your
 * photos to differentiate these". Video's row is **Choose a video template**,
 * **Add a scene** (the scene picker, as + Scene opens it) and **Add your
 * photos**. On a phone the three share the width as columns, the icon above
 * the words.
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
  const mode = useEditor((s) => s.project.mode);
  const sceneNumber = useEditor((s) => s.selectedScene + 1);
  const copy = MODE_COPY[mode];
  const video = copy.addScene !== null;
  const phone = variant === 'phone';
  // Three across a phone: a column each, the icon above a short label.
  const stacked = phone && video;
  const size = stacked
    ? 'min-w-0 flex-1 flex-col gap-1 px-1 py-2 text-[12px] leading-tight'
    : phone ? 'flex-1 gap-2 py-2.5 text-[14px]' : 'gap-2 px-4 py-2 text-[13px]';
  const button = `flex items-center justify-center rounded-xl font-semibold ${size}`;
  const quiet = `${button} border border-edge bg-panel hover:bg-panel-alt`;

  return (
    <div className={phone ? 'flex shrink-0 gap-2 border-t border-edge bg-panel px-3 py-2' : 'flex gap-2'} data-start-actions={mode}>
      <button
        type="button"
        onClick={onChooseDesign}
        data-tour="design"
        title={copy.chooseHint}
        aria-label={stacked ? copy.choose : undefined}
        className={quiet}
      >
        <Icon name="designs" size={18} /> {stacked ? copy.chooseShort : copy.choose}
      </button>
      {copy.addScene !== null && (
        <button
          type="button"
          onClick={() => { useOverlays.getState().openScenePicker('add'); }}
          data-start-add-scene
          title={`A new scene after scene ${sceneNumber}: a new design, or one of your saved images`}
          className={quiet}
        >
          <Icon name="scene" size={18} /> {copy.addScene}
        </button>
      )}
      <button
        type="button"
        onClick={add.pick}
        disabled={add.busy}
        data-tour="photos"
        title={video
          ? `Your photos replace the sample photos in scene ${sceneNumber}, one for one, and stay in Your photos. Nothing is uploaded.`
          : 'Your photos replace the sample photos, one for one, and stay in Your photos. Nothing is uploaded.'}
        className={`${button} bg-accent text-accent-ink hover:bg-accent-hover`}
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
 * (D-116, D-147, D-152). A design with no photo spots takes them on top
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
