import { useCallback, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import * as actions from '@/document/actions';
import { isSampleSpot } from '@/document/actions';
import { projectPhotos } from '@/document/select/media';
import type { PhotoCropMode, PhotoFrame, PhotoInput, PhotoSizeMode } from '@/document/types';
import { useEditor } from '@/state/store';
import type { PhotoSlots, SceneTemplate } from '@/templates/schema';
import { useAddYourPhotos } from '@/ui/editing/StartActions';
import { addLayer, addPhotoLayers } from '@/ui/editing/addLayer';
import { undoHint } from '@/ui/editing/commands';
import { useMediaRevision, useMediaStore } from '@/ui/media/MediaProvider';
import { ACCEPT_ATTRIBUTE, useUpload } from '@/ui/media/useUpload';
import { Icon } from '@/ui/mobile/Icon';
import { useOverlays } from '@/ui/shell/overlays';
import { useLayout } from '@/ui/shell/useLayout';
import { Button, Section, Segmented, Slider, Stepper } from '../controls';
import { SlotPlacement } from '../SlotPlacement';

/**
 * §8.1, rebuilt for D-152. Every control here goes through dispatch; none
 * touches the document.
 *
 * "On the top of the Photo pane, Photo in this design section should represent
 * photos for the design template, hence the +Add Photo should replace sample
 * photos and that section. Then, Extra Photos will add additional photos that
 * are not part of the template. That is an understandable design. For designs
 * that have not photos, Extra photos applies to those templates." So, top to
 * bottom:
 *
 *   Photos in this design  the design's own spots, each a photo of theirs or
 *                          a sample, with + Add photo to replace the samples
 *   Your photos            only while some of theirs are not in the design
 *   Photo N                the chosen spot's frame, size and crop
 *   Extra photos           photos on top, anywhere
 *
 * A design with no photo spots shows Extra photos first, then Your photos.
 */
const NO_PHOTOS: readonly PhotoInput[] = [];
const ANY_SLOTS: PhotoSlots = { min: 1, max: 8, default: 3 };

export function PhotosTab({ template }: { template: SceneTemplate | null }): React.JSX.Element {
  // A design of words alone — Blank, a quote — has no spots of its own (D-097).
  if (template !== null && template.photoSlots.max === 0) {
    return (
      <div>
        <PhotoLayers blank />
        <YourPhotos maxPhotos={0} />
      </div>
    );
  }

  const slots = template?.photoSlots ?? ANY_SLOTS;
  return (
    <div>
      <DesignPhotos slots={slots} />
      <YourPhotos maxPhotos={slots.max} />
      <SpotSettings />
      <PhotoLayers blank={false} />
    </div>
  );
}

const useScenePhotos = (): readonly PhotoInput[] =>
  useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.photos ?? NO_PHOTOS);

/** "design" for a single design, "scene" in a video, where each scene has its own. */
const useDesignWord = (): 'design' | 'scene' => useEditor((s) => (s.project.scenes.length > 1 ? 'scene' : 'design'));

/** A file dragged in from outside, as opposed to a spot being moved. */
const carriesFiles = (event: React.DragEvent): boolean => [...event.dataTransfer.types].includes('Files');

/**
 * "Photos in this design" (D-152): the template's own photo spots, in order.
 * Each shows one of the person's photos or a sample; + Add photo, Take photo,
 * a drop or a paste put new photos in place of the samples, first spot first.
 */
function DesignPhotos({ slots }: { slots: PhotoSlots }): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const showToast = useEditor((s) => s.showToast);
  const selected = useEditor((s) => s.selectedPhoto);
  const selectPhoto = useEditor((s) => s.selectPhoto);
  const sceneCount = useEditor((s) => s.project.scenes.length);
  const photos = useScenePhotos();
  const word = useDesignWord();
  const add = useAddYourPhotos('Add photos to this scene');
  const phone = useLayout() === 'phone';
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropping, setDropping] = useState(false);

  const own = [...new Set(photos.map((p) => p.mediaId).filter((id) => !isSampleSpot(id)))];
  const samples = photos.filter((p) => isSampleSpot(p.mediaId)).length;
  const hint = photos.length === 0
    ? `Each photo you add gets a spot of its own, up to ${slots.max}. Nothing is uploaded.`
    : samples > 0
      ? 'Your photos replace the samples in order. Nothing is uploaded.'
      : photos.length < slots.max
        ? `Every spot shows one of your photos. Another photo gets a new spot, up to ${slots.max}.`
        : 'Every spot shows one of your photos. To use another, take one out with ×.';

  const toSample = (index: number): void => {
    dispatch(actions.sampleAt(index));
    showToast(`Photo ${index + 1} shows a sample again. Your photo is still in Your photos.`);
  };

  const addButton = 'flex min-w-[7.5rem] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[12px] font-semibold disabled:opacity-60';

  return (
    <Section title={`Photos in this ${word}`}>
      <div
        data-design-photos
        onDragOver={(e) => { if (carriesFiles(e)) { e.preventDefault(); setDropping(true); } }}
        onDragLeave={() => { setDropping(false); }}
        onDrop={(e) => {
          setDropping(false);
          if (!carriesFiles(e)) return;
          e.preventDefault();
          void add.addFiles([...e.dataTransfer.files]);
        }}
        className="-m-1 rounded-md p-1 transition-colors"
        style={{ background: dropping ? 'var(--c-accent-soft)' : 'transparent', transitionDuration: 'var(--t-fast)' }}
      >
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={add.pick} disabled={add.busy} data-add-photo className={`${addButton} bg-accent text-accent-ink hover:bg-accent-hover`}>
            {add.busy ? 'Reading…' : '+ Add photo'}
          </button>
          {phone && (
            <button type="button" onClick={add.takePhoto} disabled={add.busy} className={`${addButton} border border-edge bg-panel hover:bg-panel-alt`}>
              <Icon name="photo" size={16} /> Take photo
            </button>
          )}
        </div>
        {add.input}
        <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">{hint}</p>
        {add.error !== null && <p className="mt-1 text-[11px]" style={{ color: 'var(--c-danger)' }}>{add.error}</p>}

        {photos.length > 0 && (
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {photos.map((photo, index) => (
              <SpotTile
                key={`${index}:${photo.mediaId}`}
                index={index}
                mediaId={photo.mediaId}
                active={index === selected}
                onSelect={() => { selectPhoto(index); }}
                onToSample={() => { toSample(index); }}
                onDragStart={() => { setDragFrom(index); }}
                onDropOn={() => {
                  if (dragFrom !== null && dragFrom !== index) {
                    dispatch(actions.reorderPhoto(dragFrom, index));
                    selectPhoto(index);
                  }
                  setDragFrom(null);
                }}
              />
            ))}
          </div>
        )}

        <div className="mt-2.5">
          <Stepper
            label="Photo spots"
            value={photos.length}
            min={slots.min}
            max={slots.max}
            onChange={(count) => { dispatch(actions.setPhotoCount(count, slots)); }}
          />
        </div>

        {own.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Button
              onClick={() => {
                dispatch(actions.restoreSamples());
                showToast(`Samples are back in every spot. Your photos are still in Your photos. ${undoHint()}`);
              }}
            >
              Use samples again
            </Button>
            {sceneCount > 1 && (
              <Button
                onClick={() => {
                  // The whole video in this scene's photos, carried on scene to scene (D-137).
                  dispatch(actions.placeOwnPhotos(own, { everyScene: true }));
                  showToast(`${own.length === 1 ? 'This photo is' : `These ${own.length} photos are`} now in every scene, in turn. ${undoHint()}`);
                }}
              >
                Use on every scene
              </Button>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

/**
 * One photo spot: its picture, its number, "Sample" on a sample, and — on a
 * photo of the person's own only — an × that puts a sample back there. A tap
 * chooses it, for its settings below; a drag moves it.
 */
function SpotTile({
  index,
  mediaId,
  active,
  onSelect,
  onToSample,
  onDragStart,
  onDropOn,
}: {
  index: number;
  mediaId: string;
  active: boolean;
  onSelect: () => void;
  onToSample: () => void;
  onDragStart: () => void;
  onDropOn: () => void;
}): React.JSX.Element {
  const store = useMediaStore();
  // Redraws when the decode lands; without it the tile stays empty.
  useMediaRevision();
  const url = store.previewUrl(mediaId);
  const sample = isSampleSpot(mediaId);
  const number = index + 1;

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragOver={(e) => { if (!carriesFiles(e)) e.preventDefault(); }}
      onDrop={(e) => { if (carriesFiles(e)) return; e.preventDefault(); e.stopPropagation(); onDropOn(); }}
      className="relative"
      data-spot={index}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        aria-label={`Photo ${number}: ${sample ? 'a sample' : 'your photo'}`}
        data-media-id={mediaId}
        className="block aspect-square w-full overflow-hidden rounded-md border-2"
        style={{ borderColor: active ? 'var(--c-accent)' : 'var(--c-edge)', background: 'var(--c-panel-alt)' }}
      >
        {url !== null && <img src={url} alt="" draggable={false} className="size-full object-cover" />}
      </button>
      <span
        aria-hidden
        className="pointer-events-none absolute left-1 top-1 grid size-[18px] place-items-center rounded-full text-[10px] font-bold tabular"
        style={active
          ? { background: 'var(--c-accent)', color: 'var(--c-accent-ink)' }
          : { background: 'rgb(0 0 0 / 0.62)', color: '#fff' }}
      >
        {number}
      </span>
      {sample ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 left-1 rounded-[4px] px-1 py-px text-[9px] font-semibold leading-tight"
          style={{ background: 'rgb(0 0 0 / 0.62)', color: '#fff' }}
        >
          Sample
        </span>
      ) : (
        <button
          type="button"
          onClick={onToSample}
          aria-label={`Take your photo out of spot ${number}`}
          title="Take your photo out of this spot. A sample goes back; your photo stays in Your photos."
          className="absolute right-0.5 top-0.5 grid size-6 place-items-center rounded-full text-[13px] leading-none sm:size-5 sm:text-[12px]"
          style={{ background: 'var(--c-panel)', color: 'var(--c-ink)', border: '1px solid var(--c-edge-strong)' }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/**
 * The chosen spot's frame, size and crop, with Replace on its bar — another
 * picture for this one spot (D-107), from the device or from Your photos.
 */
function SpotSettings(): React.JSX.Element | null {
  const dispatch = useEditor((s) => s.dispatch);
  const selected = useEditor((s) => s.selectedPhoto);
  const photos = useScenePhotos();
  const openPhotoPicker = useOverlays((o) => o.openPhotoPicker);
  const index = selected ?? 0;
  const current = selected === null ? undefined : photos[selected];
  if (current === undefined) return null;

  return (
    <>
      <SlotPlacement slotKey={`photo:${index}`} />
      <Section
        title={`Photo ${index + 1}`}
        actions={(
          <button
            type="button"
            onClick={() => { openPhotoPicker({ kind: 'slot', index }); }}
            className="shrink-0 whitespace-nowrap rounded-md border border-edge-strong px-2 py-1 text-[11px] font-semibold hover:bg-panel-alt"
          >
            Replace…
          </button>
        )}
      >
        <Segmented<PhotoFrame>
          label="Frame ratio"
          value={current.frame}
          columns={5}
          options={[
            { value: '1:1', label: '1:1' },
            { value: '4:3', label: '4:3' },
            { value: '3:4', label: '3:4' },
            { value: '16:9', label: '16:9' },
            { value: '9:16', label: '9:16' },
          ]}
          onChange={(frame) => { dispatch(actions.setPhotoFrame(index, frame)); }}
        />

        <Segmented<PhotoSizeMode>
          label="Size mode"
          value={current.sizeMode}
          columns={2}
          options={[
            { value: 'template', label: 'Template' },
            { value: 'larger', label: 'Larger' },
            { value: 'fillFrame', label: 'Fill canvas' },
            { value: 'overflow', label: 'Overflow' },
          ]}
          onChange={(sizeMode) => { dispatch(actions.setPhotoSizeMode(index, sizeMode)); }}
        />

        {current.sizeMode === 'template' || current.sizeMode === 'fillFrame' ? (
          <p className="mb-2.5 text-[11px] leading-relaxed text-ink-faint">
            {current.sizeMode === 'fillFrame'
              ? 'The photo fills the whole canvas, behind the rest of the design. Drag its corners on the canvas to adjust.'
              : 'Size percentage applies to Larger and Overflow.'}
          </p>
        ) : (
          <Slider
            label="Size"
            value={current.sizePct}
            min={100}
            max={400}
            suffix="%"
            onChange={(sizePct) => { dispatch(actions.setPhotoSizePct(index, sizePct)); }}
          />
        )}

        <Segmented<PhotoCropMode>
          label="Crop"
          value={current.cropMode}
          options={[
            { value: 'template', label: 'Template crop' },
            { value: 'original', label: 'Original photo' },
          ]}
          onChange={(cropMode) => { dispatch(actions.setPhotoCropMode(index, cropMode)); }}
        />
      </Section>
    </>
  );
}

/**
 * "Extra photos" (D-124, D-152) — photos on top of the design, anywhere, not
 * part of the template: "Under text, I am able to add texts with + Add text
 * button. Under Photos, no." Each is a layer of its own, to be moved, sized
 * and animated like any other, listed here with Replace, Settings and Delete.
 * On a design with no photo spots this comes first, and its button is the
 * main one.
 */
function PhotoLayers({ blank }: { blank: boolean }): React.JSX.Element {
  const store = useMediaStore();
  useMediaRevision();
  const dispatch = useEditor((s) => s.dispatch);
  const selectOverlay = useEditor((s) => s.selectOverlay);
  const showToast = useEditor((s) => s.showToast);
  const layers = useEditor(useShallow((s) => s.project.overlays.filter((o) => o.content.kind === 'photo')));
  const openPhotoPicker = useOverlays((o) => o.openPhotoPicker);
  const add = useAddPhotoLayers(blank);
  const small = 'rounded-md border border-edge px-2 py-0.5 text-[11px] hover:bg-panel-alt';

  return (
    <Section title="Extra photos">
      <p className="mb-2 text-[11px] leading-snug text-ink-muted">
        {blank
          ? 'This design has no photo spots. Add photos on top and place them anywhere.'
          : 'Photos on top of the design, placed anywhere. They are not part of it.'}
      </p>
      <div className="mb-2 flex">{add.button}</div>
      {add.error}
      <div className="flex flex-col gap-1.5">
        {layers.map((layer, i) => {
          const mediaId = layer.content.kind === 'photo' ? layer.content.mediaId : '';
          const url = store.previewUrl(mediaId);
          return (
            <div key={layer.id} data-photo-layer={layer.id} className="brand-surface flex items-center gap-2 rounded-[7px] p-1.5">
              <span className="size-11 shrink-0 overflow-hidden rounded-md" style={{ background: 'rgb(255 255 255 / 0.12)' }}>
                {url !== null && <img src={url} alt="" className="size-full object-cover" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold leading-tight">Extra photo {i + 1}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <button type="button" onClick={() => { openPhotoPicker({ kind: 'overlay', id: layer.id }); }} className={small}>Replace</button>
                  <button type="button" onClick={() => { selectOverlay(layer.id); }} className={small} title="Placement, motion, entrance and exit, effects">Settings</button>
                  <button
                    type="button"
                    aria-label={`Delete extra photo ${i + 1}`}
                    title="Delete"
                    onClick={() => { dispatch(actions.removeOverlay(layer.id)); showToast(`Photo deleted. ${undoHint()}`); }}
                    className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-panel-alt"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** "+ Add photo" for Extra photos: picks photos and puts each on the canvas as a layer of its own (D-124). */
function useAddPhotoLayers(primary: boolean): { button: React.JSX.Element; error: React.JSX.Element | null } {
  const store = useMediaStore();
  const showToast = useEditor((s) => s.showToast);
  const input = useRef<HTMLInputElement>(null);
  const onAdded = useCallback((ids: string[]) => {
    // Kept in Your photos too, for any scene to use later (D-147).
    addPhotoLayers(ids);
    showToast(ids.length === 1 ? 'Photo added on top. Drag it where you want it.' : `${ids.length} photos added on top. Drag them where you want them.`);
  }, [showToast]);
  const { state: upload, addFiles } = useUpload(store, onAdded, { artboardLongestEdge: 1920 });
  return {
    button: (
      <>
        <button
          type="button"
          data-add-photo-layer
          onClick={() => { input.current?.click(); }}
          disabled={upload.busy}
          className={`min-w-[7.5rem] whitespace-nowrap rounded-lg px-3 py-2 text-[12px] font-semibold disabled:opacity-60 ${primary ? 'flex-1 bg-accent text-accent-ink hover:bg-accent-hover' : 'border border-edge hover:bg-panel-alt'}`}
        >
          {upload.busy ? 'Reading…' : '+ Add photo'}
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          multiple
          hidden
          aria-label="Add a photo on top of the design"
          onChange={(e) => {
            void addFiles([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </>
    ),
    error: upload.error === null ? null : <p className="mb-2 text-[11px]" style={{ color: 'var(--c-danger)' }}>{upload.error}</p>,
  };
}

/**
 * "Your photos" (D-147): every photograph added to the project, kept until
 * the person deletes it — shown here only while some are not in this design,
 * small, so it never competes with the design's own photos above (D-152).
 *
 * A tap puts one in the design in place of the first sample, or in a new spot
 * while the design has room; on a design with no photo spots it goes on top
 * instead. × deletes it from the project — from every scene that shows it,
 * which shows a sample there instead — and undo brings it back.
 */
function YourPhotos({ maxPhotos }: { maxPhotos: number }): React.JSX.Element | null {
  const store = useMediaStore();
  useMediaRevision();
  const dispatch = useEditor((s) => s.dispatch);
  const showToast = useEditor((s) => s.showToast);
  const selectPhoto = useEditor((s) => s.selectPhoto);
  const photos = useScenePhotos();
  const word = useDesignWord();
  const library = useEditor(useShallow((s) => projectPhotos(s.project)));
  const spots = maxPhotos > 0;
  const inDesign = new Set(photos.map((p) => p.mediaId));
  const waiting = spots ? library.filter((id) => !inDesign.has(id)) : library;
  if (waiting.length === 0) return null;

  const putInDesign = (id: string): void => {
    if (!spots) {
      addLayer({ kind: 'photo', mediaId: id }, { x: 0.5, y: 0.5 });
      showToast('Photo placed on top of the design. Drag it where you want it.');
      return;
    }
    const plan = actions.placeInSpots(photos, [id], maxPhotos);
    if (plan.replaced + plan.added === 0) {
      showToast(`This ${word} is full. Take one of your photos out of it first, with the × on that photo.`);
      return;
    }
    const spot = plan.photos.findIndex((p, i) => p.mediaId === id && photos[i]?.mediaId !== id);
    dispatch(actions.placePhotos([id], { maxPhotos }));
    selectPhoto(spot);
    showToast(plan.replaced > 0 ? `Your photo replaced the sample in spot ${spot + 1}.` : `Your photo is in a new spot, number ${spot + 1}.`);
  };

  const remove = (id: string): void => {
    dispatch(actions.removeFromLibrary(id));
    showToast(`Photo deleted from this project. ${undoHint()}`);
  };

  // No count in the name: a phone's sheet keeps a section open by its name,
  // and the count would change with every photo used from here.
  return (
    <Section title="Your photos">
      <div data-your-photos>
        <p className="mb-2 text-[11px] leading-snug text-ink-muted">
          {spots
            ? `Not in this ${word}. Tap one to use it here. × deletes it from the project.`
            : 'Tap one to place it on top of the design. × deletes it from the project.'}
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {waiting.map((id) => {
            const url = store.previewUrl(id);
            return (
              <div key={id} className="relative" data-library-photo={id}>
                <button
                  type="button"
                  onClick={() => { putInDesign(id); }}
                  aria-label={spots ? `Use this photo in the ${word}` : 'Place this photo on top of the design'}
                  className="block aspect-square w-full overflow-hidden rounded-md border border-edge hover:border-accent"
                  style={{ background: 'var(--c-panel-alt)' }}
                >
                  {url !== null && <img src={url} alt="" className="size-full object-cover" />}
                </button>
                <button
                  type="button"
                  onClick={() => { remove(id); }}
                  aria-label="Delete this photo from the project"
                  title="Delete from the project"
                  className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full text-[12px] leading-none"
                  style={{ background: 'var(--c-panel)', color: 'var(--c-danger)', border: '1px solid var(--c-edge-strong)' }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
