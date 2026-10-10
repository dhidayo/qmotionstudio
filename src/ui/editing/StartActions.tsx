import { useCallback, useRef } from 'react';
import * as actions from '@/document/actions';
import { scenePhotoIds } from '@/document/select/media';
import { useEditor } from '@/state/store';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { ACCEPT_ATTRIBUTE, useUpload } from '@/ui/media/useUpload';
import { Icon } from '@/ui/mobile/Icon';

/**
 * "Choose a design" and "Add your photos" — the two things anyone opening the
 * editor is here to do, said as what they do (D-109), and always there
 * (D-116).
 *
 * They used to disappear once the picture held a photo of the person's own,
 * or while something was selected — "Add Your Photos should be always shown,
 * to be able to replace all photos on template instead of only replace when
 * specific items are selected, same for choose template". Adding photos puts
 * them into the photo slots of the scene being worked on (D-137) — the whole
 * design when it is one scene — in one step that one undo takes back.
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
        title="Adds to Your photos and fills this scene's free photo spots. Nothing is uploaded."
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
 * photos" and fills the scene's free photo spots (D-116, D-147).
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
    const scene = s.project.scenes[s.selectedScene];
    const max = s.template?.photoSlots.max ?? scene?.inputs.photos.length ?? 0;
    const many = s.project.scenes.length > 1;
    const where = many ? `scene ${s.selectedScene + 1}` : 'the design';
    const saved = ids.length === 1 ? 'Your photo is saved in Your photos' : `Your ${ids.length} photos are saved in Your photos`;
    if (max === 0 && (scene?.inputs.photos.length ?? 0) === 0) {
      // A scene of words alone has nowhere to put them; keep them for the scenes that do.
      dispatch(actions.addYourPhotos(ids, { maxPhotos: 0 }));
      showToast(`${saved}. ${many ? `Scene ${s.selectedScene + 1}` : 'This design'} has no photo spots — use + Add photo in Photos to place one on top.`);
      return;
    }
    // Added to the project's photos, and to this scene while it has room (D-147).
    const before = scene === undefined ? [] : scenePhotoIds(scene);
    dispatch(actions.addYourPhotos(ids, { maxPhotos: max }));
    const after = useEditor.getState().project.scenes[s.selectedScene];
    const placed = (after === undefined ? 0 : scenePhotoIds(after).length) - before.length;
    showToast(placed > 0
      ? `${saved} and ${placed === 1 ? 'is' : 'are'} in ${where}. Add more any time — nothing is replaced.`
      : `${saved}. ${where[0]?.toUpperCase() ?? ''}${where.slice(1)} is full (${max} photos) — choose which to show in Photos.`);
  }, [dispatch, showToast]);
  const { state: upload, addFiles } = useUpload(media, onAdded, { artboardLongestEdge: 1920 });

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
