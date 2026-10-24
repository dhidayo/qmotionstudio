import { useState } from 'react';
import { TIER_SWITCHABLE, setTier, useEntitlements } from '@/entitlements';
import { useEditor } from '@/state/store';
import type { IconName } from '@/ui/mobile/Icon';
import { usePreviewClock } from '@/ui/shell/ClockProvider';
import { useOverlays } from '@/ui/shell/overlays';
import { useAddLayers } from '@/ui/timeline/useAddLayers';
import { addItemIds, gridItemIds, type AddItemId } from './addItems';
import { addMotionToSelection } from './motion';
import { useAddYourPhotos } from './useAddYourPhotos';

/** One thing the add bar can add (D-153). */
export type AddItem = {
  readonly id: AddItemId;
  /** The word after the "+": "Text", "Photos". */
  readonly label: string;
  readonly icon: IconName;
  /** The tooltip: what it does. Tests find several of these by it, so they are kept as they were. */
  readonly title: string;
  /** The line under the label in the phone's sheet. */
  readonly hint: string;
  /** Said instead of the label while a file is being read; the item waits meanwhile. */
  readonly busy: string | null;
  /** Behind Pro on this plan: it says so, and explains itself when pressed (§12). */
  readonly pro: boolean;
  /** Lit, because there is something for it to act on — the selection, for "+ Motion". */
  readonly ready: boolean;
  /** The main thing anyone opens the editor to do: drawn in the accent colour (D-162). */
  readonly primary: boolean;
  /** Opens the device's file chooser, whose input lives with the bar — so a sheet holding it stays open. */
  readonly picksFile: boolean;
  readonly run: () => void;
};

/** An item as written below: the flags that are usually off may be left out. */
type ItemSpec = Omit<AddItem, 'id' | 'busy' | 'pro' | 'ready' | 'primary' | 'picksFile'>
  & Partial<Pick<AddItem, 'busy' | 'pro' | 'ready' | 'primary' | 'picksFile'>>;

/**
 * The add bar's items for the project's mode, with what each one does — the
 * one list behind the bar on a computer and the sheet on a phone (D-153).
 *
 * `inputs` are the hidden file inputs for photos, video and music, to be
 * rendered once by whoever draws the items: two copies on one page would give
 * two controls of the same name. `note` is the Pro explanation or an upload
 * error, when there is one. `order` is the bar's, or the phone sheet's, which
 * puts + Photos and + Scene first (D-162). `onPhotosAdded` runs once photos
 * have landed — the phone's sheet closes then, so the picture can be seen.
 */
export function useAddItems({ order = 'bar', onPhotosAdded }: {
  order?: 'bar' | 'grid';
  onPhotosAdded?: (() => void) | undefined;
} = {}): {
  items: readonly AddItem[];
  inputs: React.JSX.Element;
  note: React.JSX.Element | null;
} {
  const mode = useEditor((s) => s.project.mode);
  const video = mode === 'motionAd';
  // Only whether something is selected, never the playhead: the bar would
  // otherwise re-render on every frame of playback.
  const selected = useEditor((s) => s.selectedOverlay !== null || s.selectedSlot !== null);
  const clock = usePreviewClock();
  const layers = useAddLayers();
  const photos = useAddYourPhotos('Add your photos', onPhotosAdded);
  const sceneNumber = useEditor((s) => s.selectedScene + 1);
  const { tier } = useEntitlements(mode);
  const [proNote, setProNote] = useState(false);

  const overlays = useOverlays.getState;
  const all: Record<AddItemId, ItemSpec> = {
    /*
     * The one way to add photos (D-162), doing what "Add your photos" did:
     * each takes the place of a sample photo, one for one, and stays in Your
     * photos; a design with no photo spots takes them on top. Nothing is
     * uploaded.
     */
    photos: {
      label: 'Photos',
      icon: 'photo',
      title: video
        ? `Your photos replace the sample photos in scene ${sceneNumber}, one for one, and stay in Your photos. Nothing is uploaded.`
        : 'Your photos replace the sample photos, one for one, and stay in Your photos. Nothing is uploaded.',
      hint: 'Yours in place of the samples',
      busy: photos.busy ? 'Reading…' : null,
      primary: true,
      picksFile: true,
      run: photos.pick,
    },
    text: {
      label: 'Text',
      icon: 'text',
      title: 'Add a text overlay',
      hint: video ? 'A caption at the playhead' : 'A caption on the design',
      run: layers.addText,
    },
    video: {
      label: 'Video',
      icon: 'video',
      /*
       * §12 keeps custom media behind Pro, and it stays behind Pro — but a
       * disabled button that does nothing when clicked is a dead end, not a
       * gate. It explains itself instead, and offers the dev switch §12
       * already specifies. The real upsell is M7's.
       */
      title: layers.canVideo
        ? 'Add a video overlay'
        : 'Custom media is a Pro feature — click to find out how to enable it',
      hint: 'A clip from your device',
      busy: layers.videoBusy ? 'Reading…' : null,
      pro: !layers.canVideo,
      picksFile: true,
      run: () => {
        if (!layers.canVideo) { setProNote(true); return; }
        layers.pickVideo();
      },
    },
    shape: {
      label: 'Shape',
      icon: 'shape',
      title: 'Add a shape — a box, a circle, a line, an arrow…',
      hint: 'A box, circle, line or arrow',
      run: () => { overlays().openElementPicker({ category: 'Shapes' }); },
    },
    sticker: {
      label: 'Sticker',
      icon: 'sticker',
      title: 'Add an animated sticker — like, subscribe, follow…',
      hint: 'Like, subscribe, follow and more',
      run: () => { overlays().openElementPicker({ category: 'Stickers' }); },
    },
    number: {
      label: 'Number',
      icon: 'number',
      title: 'Add a number — a step, a rank or a figure',
      hint: 'A step, a rank or a figure',
      run: () => { overlays().openElementPicker({ category: 'Numbers' }); },
    },
    motion: {
      label: 'Motion',
      icon: 'motion',
      title: selected
        ? 'Make the selected element move — then drag it to where it should finish'
        : 'Make something move: select a photo, some text or an element first',
      hint: 'Make the selected thing move',
      ready: selected,
      run: () => { addMotionToSelection(clock); },
    },
    effect: {
      label: 'Effect',
      icon: 'effects',
      title: video
        ? 'Add an effect at the playhead — snow, lightning, shake, a light leak…'
        : 'Add an effect — snow, sparkles, light, a shake, a film look…',
      hint: video ? 'Snow, light, a shake — at the playhead' : 'Snow, sparkles, light, a shake',
      run: () => { overlays().openPicker({ target: { kind: video ? 'timeline' : 'scene' } }); },
    },
    sound: {
      label: 'Sound',
      icon: 'sound',
      title: 'Add a sound — a background or an effect, looped to fit',
      hint: 'Backgrounds and effects',
      run: () => { overlays().openSoundPicker(true); },
    },
    music: {
      label: 'Music',
      icon: 'music',
      title: 'Add a music track',
      hint: 'A track from your device',
      busy: layers.musicBusy ? 'Decoding…' : null,
      picksFile: true,
      run: layers.pickMusic,
    },
    // What the scene bar's "+ Scene" was, beside everything else (D-162).
    scene: {
      label: 'Scene',
      icon: 'scene',
      title: `Add a scene after scene ${sceneNumber} — a new design, or one of your saved images`,
      hint: 'A new scene after this one, in any design',
      run: () => { overlays().openScenePicker('add'); },
    },
  };

  const items = (order === 'grid' ? gridItemIds(mode) : addItemIds(mode)).map((id): AddItem => {
    const item = all[id];
    return { busy: null, pro: false, ready: false, primary: false, picksFile: false, ...item, id };
  });

  const pro = proNote && !layers.canVideo ? (
    <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-ink-muted" data-add-note>
      Video overlays are Pro.
      {TIER_SWITCHABLE ? (
        <button
          type="button"
          onClick={() => { setTier('pro'); setProNote(false); }}
          className="rounded-md border px-1.5 py-0.5 text-[10px]"
          style={{ borderColor: 'var(--c-pro)', color: 'var(--c-pro)' }}
        >
          Switch to Pro ({tier === 'free' ? 'dev' : 'on'})
        </button>
      ) : (
        <span>Pro plans are coming soon.</span>
      )}
    </span>
  ) : null;
  const problem = photos.error ?? layers.error;
  const error = problem === null ? null : (
    <span className="max-w-64 shrink-0 truncate text-[10px]" style={{ color: 'var(--c-danger)' }} data-add-note role="alert">
      {problem}
    </span>
  );

  return {
    items,
    inputs: <>{photos.input}{layers.inputs}</>,
    note: pro === null && error === null ? null : <>{pro}{error}</>,
  };
}
