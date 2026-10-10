import { useCallback, useRef, useState } from 'react';
import { projectPhotos, scenePhotoIds } from '@/document/select/media';
import { useAddYourPhotos } from '@/ui/editing/StartActions';
import { useLayout } from '@/ui/shell/useLayout';
import * as actions from '@/document/actions';
import type { PhotoCropMode, PhotoFrame, PhotoSizeMode } from '@/document/types';
import { useEditor } from '@/state/store';
import { loadSamples, SAMPLE_NAMES, sampleMediaId } from '@/media/samples';
import type { SceneTemplate } from '@/templates/schema';
import { useMediaRevision, useMediaStore } from '@/ui/media/MediaProvider';
import { ACCEPT_ATTRIBUTE, useUpload } from '@/ui/media/useUpload';
import { Button, EmptyNote, Section, Segmented, Slider, Stepper } from '../controls';
import { SlotPlacement } from '../SlotPlacement';
import { useShallow } from 'zustand/react/shallow';
import { useOverlays } from '@/ui/shell/overlays';
import { addLayer } from '@/ui/editing/addLayer';
import { undoHint } from '@/ui/editing/commands';
import { Icon } from '@/ui/mobile/Icon';

/** §8.1. Every control here goes through dispatch; none touches the document. */
export function PhotosTab({ template }: { template: SceneTemplate | null }): React.JSX.Element {
  const store = useMediaStore();
  const dispatch = useEditor((s) => s.dispatch);
  const photos = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.photos ?? []);
  const selected = useEditor((s) => s.selectedPhoto);
  const selectPhoto = useEditor((s) => s.selectPhoto);

  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const slots = template?.photoSlots ?? { min: 1, max: 8, default: 3 };
  const current = selected !== null ? photos[selected] : undefined;

  const useSamples = (): void => {
    const count = Math.min(slots.default, SAMPLE_NAMES.length);
    void loadSamples(store, { artboardLongestEdge: 1920 }).then(() => {
      dispatch(actions.removeAllPhotos());
      dispatch(actions.addPhotos(SAMPLE_NAMES.slice(0, count).map(sampleMediaId)));
    });
  };

  /*
   * A design with no photo slots — Blank — has nothing for this panel to fill.
   * Saying "the template draws placeholders" and "0 of 0" there was wrong
   * twice over; the photos on a blank canvas are layers on the timeline, so
   * that is where this sends people (D-097).
   */
  if (template !== null && template.photoSlots.max === 0) {
    return (
      <div>
        <YourPhotos maxPhotos={0} />
        <PhotoLayers blank />
      </div>
    );
  }

  return (
    <div>
      <YourPhotos maxPhotos={slots.max} />

      <Section title={`Photo spots in this scene (${photos.length})`}>
        <div className="mb-2 flex flex-wrap gap-1">
          <Button onClick={useSamples}>Try sample photos</Button>
          <Button
            onClick={() => { dispatch(actions.removeAllPhotos()); selectPhoto(null); }}
            variant="danger"
            disabled={photos.length === 0}
          >
            Remove all
          </Button>
        </div>
        {photos.length === 0 ? (
          <EmptyNote>No photos yet. The template draws placeholders until you add some.</EmptyNote>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {photos.map((photo, index) => (
              <PhotoThumb
                key={`${photo.mediaId}:${index}`}
                index={index}
                mediaId={photo.mediaId}
                active={index === selected}
                onSelect={() => { selectPhoto(index); }}
                onRemove={() => {
                  dispatch(actions.removePhoto(index));
                  selectPhoto(index >= photos.length - 1 ? null : index);
                }}
                onDragStart={() => { setDragFrom(index); }}
                onDropOn={() => {
                  if (dragFrom !== null) dispatch(actions.reorderPhoto(dragFrom, index));
                  setDragFrom(null);
                }}
              />
            ))}
          </div>
        )}

        <div className="mt-2.5">
          <Stepper
            label="Photo count"
            value={photos.length}
            min={slots.min}
            max={slots.max}
            onChange={(count) => { dispatch(actions.setPhotoCount(count, slots)); }}
          />
          {photos.length > 0 && photos.length < slots.max && (
            <EmptyNote>Adding beyond your photos reuses earlier ones.</EmptyNote>
          )}
        </div>
      </Section>

      {current === undefined ? (
        <Section title="Selected photo">
          <EmptyNote>Select a photo above to change its frame, size and crop.</EmptyNote>
        </Section>
      ) : (
        <>
        <SlotPlacement slotKey={`photo:${selected ?? 0}`} />
        <Section title={`Photo ${(selected ?? 0) + 1}`}>
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
            onChange={(frame) => { dispatch(actions.setPhotoFrame(selected ?? 0, frame)); }}
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
            onChange={(sizeMode) => { dispatch(actions.setPhotoSizeMode(selected ?? 0, sizeMode)); }}
          />

          {current.sizeMode === 'template' || current.sizeMode === 'fillFrame' ? (
            <EmptyNote>
              {current.sizeMode === 'fillFrame'
                ? 'The photo fills the whole canvas, behind the rest of the design. Drag its corners on the canvas to adjust.'
                : 'Size percentage applies to Larger and Overflow.'}
            </EmptyNote>
          ) : (
            <Slider
              label="Size"
              value={current.sizePct}
              min={100}
              max={400}
              suffix="%"
              onChange={(sizePct) => { dispatch(actions.setPhotoSizePct(selected ?? 0, sizePct)); }}
            />
          )}

          <Segmented<PhotoCropMode>
            label="Crop"
            value={current.cropMode}
            options={[
              { value: 'template', label: 'Template crop' },
              { value: 'original', label: 'Original photo' },
            ]}
            onChange={(cropMode) => { dispatch(actions.setPhotoCropMode(selected ?? 0, cropMode)); }}
          />
        </Section>
        </>
      )}

      <PhotoLayers blank={false} />
    </div>
  );
}

function PhotoThumb({
  index,
  mediaId,
  active,
  onSelect,
  onRemove,
  onDragStart,
  onDropOn,
}: {
  index: number;
  mediaId: string;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDropOn: () => void;
}): React.JSX.Element {
  const store = useMediaStore();
  // Redraws when the decode lands; without it the tile stays empty.
  useMediaRevision();
  const preview = store.previewUrl(mediaId);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); onDropOn(); }}
      className="group relative"
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        aria-label={`Photo ${index + 1}`}
        data-media-id={mediaId}
        className="block w-full overflow-hidden rounded-md border"
        style={{ borderColor: active ? 'var(--c-accent)' : 'var(--c-edge)' }}
      >
        <span
          className="block aspect-square w-full bg-cover bg-center"
          style={{
            background: preview === null ? 'var(--c-panel-alt)' : `center/cover url(${preview})`,
          }}
        />
      </button>

      {/* §8.1: the first photo is badged FIRST — templates treat it specially. */}
      {index === 0 && (
        <span
          className="pointer-events-none absolute left-0.5 top-0.5 rounded-sm px-1 text-[8px] font-bold uppercase"
          style={{ background: 'var(--c-accent)', color: 'var(--c-accent-ink)' }}
        >
          First
        </span>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove photo ${index + 1}`}
        className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-sm text-[11px] leading-none"
        style={{ background: 'var(--c-panel)', color: 'var(--c-danger)', border: '1px solid var(--c-edge)' }}
      >
        ×
      </button>
    </div>
  );
}

/**
 * Photos added on top of the design (D-124) — "Under text, I am able to add
 * texts with + Add text button. Under Photos, no." A photo of the person's own
 * goes onto the canvas as a layer of its own, to be moved, sized and animated
 * like any other, and is listed here with its settings and a delete.
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

  return (
    <Section title={blank ? 'Photos' : 'Extra photos'}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-ink-muted">{blank ? 'This design has no photo spots of its own — add photos on top, anywhere.' : 'More photos on top of the design, placed anywhere.'}</p>
        {add.button}
      </div>
      {add.error}
      <div className="flex flex-col gap-1.5">
        {layers.map((layer, i) => {
          const mediaId = layer.content.kind === 'photo' ? layer.content.mediaId : '';
          const url = store.previewUrl(mediaId);
          return (
            <div key={layer.id} data-photo-layer={layer.id} className="brand-surface flex items-center gap-2 rounded-[7px] p-1.5">
              <span className="size-10 shrink-0 overflow-hidden rounded-md" style={{ background: 'rgb(255 255 255 / 0.12)' }}>
                {url !== null && <img src={url} alt="" className="size-full object-cover" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">Added photo {i + 1}</span>
              <button type="button" onClick={() => { openPhotoPicker({ kind: 'overlay', id: layer.id }); }} className="rounded-md px-2 py-1 text-[11px] hover:bg-panel-alt">Replace</button>
              <button type="button" onClick={() => { selectOverlay(layer.id); }} className="rounded-md px-2 py-1 text-[11px] hover:bg-panel-alt" title="Placement, motion, entrance and exit, effects">Settings</button>
              <button
                type="button"
                aria-label={`Delete added photo ${i + 1}`}
                title="Delete"
                onClick={() => { dispatch(actions.removeOverlay(layer.id)); showToast(`Photo deleted. ${undoHint()}`); }}
                className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-panel-alt"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          );
        })}
        {layers.length === 0 && blank && <EmptyNote>No photos yet.</EmptyNote>}
      </div>
    </Section>
  );
}

/** "+ Add photo": picks photos and puts each on the canvas as a layer of its own (D-124). */
function useAddPhotoLayers(): { button: React.JSX.Element; error: React.JSX.Element | null } {
  const store = useMediaStore();
  const dispatch = useEditor((s) => s.dispatch);
  const showToast = useEditor((s) => s.showToast);
  const input = useRef<HTMLInputElement>(null);
  const onAdded = useCallback((ids: string[]) => {
    // A little apart, so several added at once do not sit exactly on top of each other.
    ids.forEach((mediaId, i) => { addLayer({ kind: 'photo', mediaId }, { x: 0.5 + i * 0.04, y: 0.5 + i * 0.04 }); });
    // Kept in Your photos too, for any scene to use later (D-147).
    dispatch(actions.addToLibrary(ids));
    showToast(ids.length === 1 ? 'Photo added to the canvas. Drag it where you want it.' : `${ids.length} photos added to the canvas.`);
  }, [dispatch, showToast]);
  const { state: upload, addFiles } = useUpload(store, onAdded, { artboardLongestEdge: 1920 });
  return {
    button: (
      <>
        <button
          type="button"
          data-add-photo-layer
          onClick={() => { input.current?.click(); }}
          disabled={upload.busy}
          className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-[12px] font-semibold text-accent-ink hover:bg-accent-hover"
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
 * "Your photos" (D-147): every photograph added to the project, kept until the
 * person deletes it, and which of them this scene shows.
 *
 * "When I click take another photo, only the current photo is shown on
 * template and the previously taken photo is lost … let the photos remain as
 * part of uploaded photos for the project … I can select active photos and
 * inactive photos for different scenes." A tap uses a photo here or stops
 * using it; the number on it is its place in the scene. The × deletes it from
 * the project, and undo brings it back. On a design without photo spots a tap
 * puts the photo on the canvas instead.
 */
function YourPhotos({ maxPhotos }: { maxPhotos: number }): React.JSX.Element {
  const store = useMediaStore();
  useMediaRevision();
  const dispatch = useEditor((s) => s.dispatch);
  const showToast = useEditor((s) => s.showToast);
  const selectPhoto = useEditor((s) => s.selectPhoto);
  const library = useEditor(useShallow((s) => projectPhotos(s.project)));
  const active = useEditor(useShallow((s) => {
    const scene = s.project.scenes[s.selectedScene];
    return scene === undefined ? [] : scenePhotoIds(scene);
  }));
  const spotCount = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.photos.length ?? 0);
  const sceneCount = useEditor((s) => s.project.scenes.length);
  const add = useAddYourPhotos('Add photos to this scene');
  const phone = useLayout() === 'phone';
  const [dragOver, setDragOver] = useState(false);
  const spots = maxPhotos > 0;

  // The samples a scene falls back to when none of the person's photos is left in it.
  const withSamples = (run: (fallback: readonly string[]) => void): void => {
    const count = Math.max(1, Math.min(spotCount || 3, SAMPLE_NAMES.length));
    void loadSamples(store, { artboardLongestEdge: 1920 }).then(() => {
      run(SAMPLE_NAMES.slice(0, count).map(sampleMediaId));
    });
  };

  const toggle = (id: string): void => {
    if (!spots) {
      addLayer({ kind: 'photo', mediaId: id }, { x: 0.5, y: 0.5 });
      showToast('Photo placed on the canvas. Drag it where you want it.');
      return;
    }
    if (active.includes(id)) {
      selectPhoto(null);
      withSamples((fallback) => { dispatch(actions.setScenePhotos(active.filter((a) => a !== id), { maxPhotos, fallback })); });
      return;
    }
    if (active.length >= maxPhotos) {
      showToast(`This scene shows up to ${maxPhotos} photo${maxPhotos === 1 ? '' : 's'}. Tap a numbered one to take it out first.`);
      return;
    }
    dispatch(actions.setScenePhotos([...active, id], { maxPhotos, fallback: [] }));
  };

  const remove = (id: string): void => {
    selectPhoto(null);
    withSamples((fallback) => {
      dispatch(actions.removeFromLibrary(id, fallback));
      showToast(`Photo deleted from this project. ${undoHint()}`);
    });
  };

  const addButton = 'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold';

  return (
    <Section title={`Your photos (${library.length})`}>
      <div
        data-your-photos
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => { setDragOver(false); }}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void add.addFiles([...e.dataTransfer.files]); }}
        className="rounded-md transition-colors"
        style={{ background: dragOver ? 'var(--c-accent-soft)' : 'transparent', transitionDuration: 'var(--t-fast)' }}
      >
        <div className="flex gap-1.5">
          <button type="button" onClick={add.pick} disabled={add.busy} className={`${addButton} bg-accent text-accent-ink hover:bg-accent-hover`}>
            <Icon name="photo" size={16} /> {add.busy ? 'Reading…' : 'Add photos'}
          </button>
          {phone && (
            <button type="button" onClick={add.takePhoto} disabled={add.busy} className={`${addButton} border border-edge bg-panel hover:bg-panel-alt`}>
              Take a photo
            </button>
          )}
        </div>
        {add.input}
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
          {library.length === 0
            ? `Photos you add or take are kept here for the whole project. ${phone ? '' : 'Drop or paste them too. '}Nothing is uploaded.`
            : spots
              ? `Tap a photo to use it in this ${sceneCount > 1 ? 'scene' : 'design'}, or tap again to take it out. The number is its place. × deletes it from the project.`
              : 'Tap a photo to place it on the canvas. × deletes it from the project.'}
        </p>
        {add.error !== null && <p className="mt-1 text-[11px]" style={{ color: 'var(--c-danger)' }}>{add.error}</p>}

        {library.length > 0 && (
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {library.map((id) => {
              const place = active.indexOf(id);
              const url = store.previewUrl(id);
              return (
                <div key={id} className="relative" data-library-photo={id}>
                  <button
                    type="button"
                    onClick={() => { toggle(id); }}
                    aria-pressed={spots ? place >= 0 : undefined}
                    aria-label={spots ? (place >= 0 ? `Photo in use, number ${place + 1} — tap to take it out` : 'Use this photo here') : 'Place this photo on the canvas'}
                    className="block aspect-square w-full overflow-hidden rounded-md border-2"
                    style={{ borderColor: place >= 0 ? 'var(--c-accent)' : 'var(--c-edge)', background: 'var(--c-panel-alt)', opacity: spots && place < 0 ? 0.7 : 1 }}
                  >
                    {url !== null && <img src={url} alt="" className="size-full object-cover" />}
                  </button>
                  {place >= 0 && (
                    <span
                      className="pointer-events-none absolute left-1 top-1 grid size-5 place-items-center rounded-full text-[10px] font-bold"
                      style={{ background: 'var(--c-accent)', color: 'var(--c-accent-ink)' }}
                    >
                      {place + 1}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => { remove(id); }}
                    aria-label="Delete this photo from the project"
                    title="Delete from the project"
                    className="absolute right-0.5 top-0.5 grid size-6 place-items-center rounded-full text-[12px] leading-none"
                    style={{ background: 'var(--c-panel)', color: 'var(--c-danger)', border: '1px solid var(--c-edge)' }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {spots && sceneCount > 1 && active.length > 0 && (
          <div className="mt-2">
            <Button
              onClick={() => {
                // A whole video in this scene's photos, carried on scene to scene (D-137).
                dispatch(actions.placeOwnPhotos(active, { everyScene: true }));
                showToast(`These photos are now in all ${sceneCount} scenes, in turn. Undo takes them back out.`);
              }}
            >
              Use on every scene
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}
