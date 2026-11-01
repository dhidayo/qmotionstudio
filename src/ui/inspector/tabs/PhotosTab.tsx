import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import * as actions from '@/document/actions';
import { isSampleSpot } from '@/document/actions';
import { projectPhotos } from '@/document/select/media';
import type { PhotoCropMode, PhotoFrame, PhotoInput, PhotoSizeMode } from '@/document/types';
import { useEditor } from '@/state/store';
import type { PhotoSlots, SceneTemplate } from '@/templates/schema';
import { useAddPhotoLayers, useAddYourPhotos } from '@/ui/editing/useAddYourPhotos';
import { addLayer } from '@/ui/editing/addLayer';
import { undoHint } from '@/ui/editing/commands';
import { useMediaRevision, useMediaStore } from '@/ui/media/MediaProvider';
import { Icon } from '@/ui/mobile/Icon';
import { useOverlays } from '@/ui/shell/overlays';
import { useLayout } from '@/ui/shell/useLayout';
import { Button, Section, Segmented, Slider, Stepper } from '../controls';
import { SlotPlacement } from '../SlotPlacement';
import { stepTarget } from '../spotDrag';
import { LiftedSpot, useSpotDrag } from '../useSpotDrag';

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
 *                          a sample, with + Add photos to replace the samples
 *                          (D-162), and under Photo spots, theirs that are
 *                          not in it, waiting to be used (D-165)
 *   Photo N                the chosen spot's frame, size and crop
 *   Extra photos           photos on top, anywhere
 *
 * A design with no photo spots shows only Extra photos, with theirs waiting
 * under its button, to be placed on top.
 *
 * The waiting photos were a section of their own, "Your photos", folded away
 * on a phone. D-165 moved them under Photo spots: "I will rather like the
 * pictures to be listed right under the Photo spots section where I have x of
 * n … since those two actions speak to the same thing and section."
 */
const NO_PHOTOS: readonly PhotoInput[] = [];
const ANY_SLOTS: PhotoSlots = { min: 1, max: 8, default: 3 };

export function PhotosTab({ template }: { template: SceneTemplate | null }): React.JSX.Element {
  // A design of words alone — Blank, a quote — has no spots of its own (D-097).
  if (template !== null && template.photoSlots.max === 0) {
    return (
      <div>
        <PhotoLayers blank />
      </div>
    );
  }

  const slots = template?.photoSlots ?? ANY_SLOTS;
  return (
    <div>
      <DesignPhotos slots={slots} />
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
 * Each shows one of the person's photos or a sample; + Add photos, Take photo,
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
  const add = useAddYourPhotos();
  const phone = useLayout() === 'phone';
  const [dropping, setDropping] = useState(false);
  const store = useMediaStore();

  /*
   * Moving a photo to another spot (D-165): by pressing and dragging it, or
   * with Move earlier and Move later on the chosen one. Either is one change,
   * one undo step, and the moved photo stays chosen, at its new spot.
   */
  const move = (from: number, to: number): void => {
    dispatch(actions.reorderPhoto(from, to));
    selectPhoto(to);
    showToast(`Photo moved to spot ${to + 1}.`);
  };
  const drag = useSpotDrag(move);
  const chosen = selected !== null && selected < photos.length ? selected : null;
  const earlier = chosen === null ? null : stepTarget(chosen, -1, photos.length);
  const later = chosen === null ? null : stepTarget(chosen, 1, photos.length);

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
    showToast(`Photo ${index + 1} shows a sample again. Your photo is still in this project, under Photo spots.`);
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
            {add.busy ? add.reading : '+ Add photos'}
          </button>
          {phone && (
            <button type="button" onClick={add.takePhoto} disabled={add.busy} className={`${addButton} border border-edge bg-panel hover:bg-panel-alt`}>
              <Icon name="photo" size={16} /> Take photo
            </button>
          )}
        </div>
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
                lifted={drag.lift?.from === index}
                target={drag.lift !== null && drag.lift.over === index && drag.lift.from !== index}
                press={drag.bind(index)}
                onSelect={() => { selectPhoto(index); }}
                onToSample={() => { toSample(index); }}
              />
            ))}
          </div>
        )}
        {drag.lift !== null && (
          <LiftedSpot lift={drag.lift} url={store.previewUrl(photos[drag.lift.from]?.mediaId ?? '')} />
        )}
        {photos.length > 1 && (
          <div className="mt-1.5" data-spot-move>
            <p className="text-[11px] leading-snug text-ink-muted">
              Hold a photo and drag it to another spot to move it.
            </p>
            {chosen !== null && (
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={earlier === null}
                  onClick={() => { if (earlier !== null) move(chosen, earlier); }}
                  title={`Move photo ${chosen + 1} one spot earlier`}
                  className="rounded-md border border-edge px-2 py-1.5 text-[11px] font-medium hover:bg-panel-alt disabled:opacity-40"
                >
                  ← Move earlier
                </button>
                <button
                  type="button"
                  disabled={later === null}
                  onClick={() => { if (later !== null) move(chosen, later); }}
                  title={`Move photo ${chosen + 1} one spot later`}
                  className="rounded-md border border-edge px-2 py-1.5 text-[11px] font-medium hover:bg-panel-alt disabled:opacity-40"
                >
                  Move later →
                </button>
              </div>
            )}
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
        <WaitingPhotos maxPhotos={slots.max} />

        {own.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Button
              onClick={() => {
                dispatch(actions.restoreSamples());
                showToast(`Samples are back in every spot. Your photos are still in this project, under Photo spots. ${undoHint()}`);
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
 * chooses it, for its settings below; pressing and dragging moves it (D-165).
 * While a photo is being moved, its own spot is faded and the spot it would
 * go to is outlined.
 */
function SpotTile({
  index,
  mediaId,
  active,
  lifted,
  target,
  press,
  onSelect,
  onToSample,
}: {
  index: number;
  mediaId: string;
  active: boolean;
  lifted: boolean;
  target: boolean;
  press: ReturnType<ReturnType<typeof useSpotDrag>['bind']>;
  onSelect: () => void;
  onToSample: () => void;
}): React.JSX.Element {
  const store = useMediaStore();
  // Redraws when the decode lands; without it the tile stays empty.
  useMediaRevision();
  const url = store.previewUrl(mediaId);
  const sample = isSampleSpot(mediaId);
  const number = index + 1;

  return (
    <div
      {...press}
      className="relative select-none [-webkit-touch-callout:none]"
      style={{ opacity: lifted ? 0.35 : 1, transition: 'opacity var(--t-fast)' }}
      data-spot={index}
      data-spot-target={target ? '' : undefined}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        aria-label={`Photo ${number}: ${sample ? 'a sample' : 'your photo'}`}
        data-media-id={mediaId}
        className="block aspect-square w-full overflow-hidden rounded-md border-2"
        style={{
          borderColor: active || target ? 'var(--c-accent)' : 'var(--c-edge)',
          borderStyle: target ? 'dashed' : 'solid',
          background: target ? 'var(--c-accent-soft)' : 'var(--c-panel-alt)',
        }}
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
          data-spot-out
          aria-label={`Take your photo out of spot ${number}`}
          title="Take your photo out of this spot. A sample goes back; your photo stays in this project, under Photo spots."
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
  const add = useAddPhotoLayers();
  const small = 'rounded-md border border-edge px-2 py-0.5 text-[11px] hover:bg-panel-alt';

  return (
    <Section title="Extra photos">
      <p className="mb-2 text-[11px] leading-snug text-ink-muted">
        {blank
          ? 'This design has no photo spots. Add photos on top and place them anywhere.'
          : 'Photos on top of the design, placed anywhere. They are not part of it.'}
      </p>
      <div className="mb-2 flex">
        {/* "+ Add extra photos": named for what it adds, never a second "+ Add photos" (D-162). */}
        <button
          type="button"
          data-add-photo-layer
          onClick={add.pick}
          disabled={add.busy}
          className={`min-w-[7.5rem] whitespace-nowrap rounded-lg px-3 py-2 text-[12px] font-semibold disabled:opacity-60 ${blank ? 'flex-1 bg-accent text-accent-ink hover:bg-accent-hover' : 'border border-edge hover:bg-panel-alt'}`}
        >
          {add.busy ? add.reading : '+ Add extra photos'}
        </button>
      </div>
      {add.error !== null && <p className="mb-2 text-[11px]" style={{ color: 'var(--c-danger)' }}>{add.error}</p>}
      {blank && <WaitingPhotos maxPhotos={0} />}
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

/**
 * The project's photos that are not in this design (D-147): every photograph
 * added to the project is kept until the person deletes it. Shown only while
 * some are waiting, small, so they never compete with the design's own photos
 * (D-152) — under Photo spots, always in view, not in a section of their own
 * to open (D-165).
 *
 * A tap puts one in the design in place of the first sample, or in a new spot
 * while the design has room; on a design with no photo spots it goes on top
 * instead. × deletes it from the project — from every scene that shows it,
 * which shows a sample there instead — and undo brings it back.
 */
function WaitingPhotos({ maxPhotos }: { maxPhotos: number }): React.JSX.Element | null {
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

  return (
    <div data-your-photos className={spots ? 'mb-2.5 border-t border-edge pt-2.5' : 'mb-2 mt-1'}>
      <p className="mb-2 text-[11px] leading-snug text-ink-muted">
        {spots
          ? <><span className="font-semibold text-ink">Not in this {word}</span> — tap one to use it. × deletes it from the project.</>
          : <><span className="font-semibold text-ink">Your photos</span> — tap one to place it on top of the design. × deletes it from the project.</>}
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
  );
}
