import { useCallback, useEffect, useRef } from 'react';
import { create } from 'zustand';
import * as actions from '@/document/actions';
import { useEditor } from '@/state/store';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { readingLabel } from '@/ui/media/uploadMessages';
import { IDLE_UPLOAD, PHOTO_ACCEPT_ATTRIBUTE, useUpload, type UploadState } from '@/ui/media/useUpload';
import { addPhotoLayers } from './addLayer';
import { addedPhotosMessage, onTopMessage } from './photoMessages';

/**
 * Picks photographs — or takes one with the camera — adds them to the
 * project's photos, and puts each in place of one sample in the scene being
 * worked on (D-116, D-147, D-152). A design with no photo spots takes them on
 * top instead, as extra photos. Either way the toast says exactly what
 * happened.
 *
 * Behind **+ Photos** in the add bar and the phone's Add sheet, and the Photos
 * panel's **+ Add photos** and **Take photo** — one behaviour under every way
 * in (D-162), so the same words never do two different things. The panel's
 * **+ Add extra photos** (D-124) goes through here too, to put photos on top.
 *
 * The file inputs and their uploads are mounted once, by the editor itself
 * (`PhotoInputs`), not by the button that opens them (D-165). On a phone the
 * button sits in a sheet, and a sheet can close — and unmount whatever it
 * holds — while the photo library is open; an input that is gone by then
 * never hears which photos were chosen. Mounted once, it always does, and the
 * one upload that takes pasted pictures is this one (see `useUpload`), so a
 * paste is added once.
 */

type Target = 'spots' | 'layers';

const usePhotoUploads = create<Record<Target, UploadState>>(() => ({ spots: IDLE_UPLOAD, layers: IDLE_UPLOAD }));

/** The mounted inputs and uploads, read when they are used, never captured. */
const host: {
  library: HTMLInputElement | null;
  camera: HTMLInputElement | null;
  layers: HTMLInputElement | null;
  addFiles: Record<Target, ((files: readonly File[]) => Promise<void>) | null>;
  /** What to do once the chosen photos have landed — the phone's sheet closes then. */
  after: (() => void) | undefined;
} = { library: null, camera: null, layers: null, addFiles: { spots: null, layers: null }, after: undefined };

/** A chooser closed without a choice leaves nothing to do afterwards. */
function forget(): void { host.after = undefined; }

function useTargetUpload(target: Target, onAdded: (ids: string[]) => void): (files: readonly File[]) => Promise<void> {
  const media = useMediaStore();
  // Only + Photos takes a paste; a pasted photo going on top too would be added twice (D-152).
  const { state, addFiles } = useUpload(media, onAdded, { artboardLongestEdge: 1920, paste: target === 'spots' });
  useEffect(() => { usePhotoUploads.setState({ [target]: state }); }, [target, state]);
  useEffect(() => {
    host.addFiles[target] = addFiles;
    return () => { if (host.addFiles[target] === addFiles) host.addFiles[target] = null; };
  }, [target, addFiles]);
  return addFiles;
}

/** The photo inputs, mounted once for the whole editor (D-165). */
export function PhotoInputs(): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const showToast = useEditor((s) => s.showToast);

  const onSpots = useCallback((ids: string[]) => {
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
    const after = host.after;
    host.after = undefined;
    after?.();
  }, [dispatch, showToast]);

  const onLayers = useCallback((ids: string[]) => {
    // Kept with the project's photos too, for any scene to use later (D-147).
    addPhotoLayers(ids);
    showToast(ids.length === 1 ? 'Photo added on top. Drag it where you want it.' : `${ids.length} photos added on top. Drag them where you want them.`);
  }, [showToast]);

  const addSpots = useTargetUpload('spots', onSpots);
  const addLayers = useTargetUpload('layers', onLayers);

  const take = (add: (files: readonly File[]) => Promise<void>) => (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    void add(files);
  };

  return (
    <div hidden data-photo-inputs>
      <input
        ref={(el) => { host.library = el; el?.addEventListener('cancel', forget); }}
        type="file"
        accept={PHOTO_ACCEPT_ATTRIBUTE}
        multiple
        aria-label="Add your photos"
        onChange={take(addSpots)}
      />
      <input
        ref={(el) => { host.camera = el; el?.addEventListener('cancel', forget); }}
        type="file"
        accept={PHOTO_ACCEPT_ATTRIBUTE}
        capture="environment"
        aria-label="Take a photo"
        onChange={take(addSpots)}
      />
      <input
        ref={(el) => { host.layers = el; }}
        type="file"
        accept={PHOTO_ACCEPT_ATTRIBUTE}
        multiple
        aria-label="Add a photo on top of the design"
        onChange={take(addLayers)}
      />
    </div>
  );
}

export function useAddYourPhotos(after?: () => void): {
  pick: () => void;
  /** Opens the camera on a phone; a file picker elsewhere. */
  takePhoto: () => void;
  addFiles: (files: readonly File[]) => Promise<void>;
  busy: boolean;
  /** The button's words while busy: "Reading 2 of 5…". */
  reading: string;
  error: string | null;
} {
  const state = usePhotoUploads((s) => s.spots);
  // Read when the chooser opens, so the newest one is used.
  const afterRef = useRef(after);
  useEffect(() => { afterRef.current = after; });

  return {
    pick: () => { host.after = afterRef.current; host.library?.click(); },
    takePhoto: () => { host.after = afterRef.current; host.camera?.click(); },
    addFiles: (files) => { host.after = undefined; return host.addFiles.spots?.(files) ?? Promise.resolve(); },
    busy: state.busy,
    reading: readingLabel(state.progress),
    error: state.error,
  };
}

/**
 * "+ Add extra photos": picks photos and puts each on the canvas as a layer of
 * its own (D-124). Named for what it adds, so it never reads as a second copy
 * of the panel's "+ Add photos", which fills the design's spots (D-162).
 */
export function useAddPhotoLayers(): { pick: () => void; busy: boolean; reading: string; error: string | null } {
  const state = usePhotoUploads((s) => s.layers);
  return {
    pick: () => { host.layers?.click(); },
    busy: state.busy,
    reading: readingLabel(state.progress),
    error: state.error,
  };
}
