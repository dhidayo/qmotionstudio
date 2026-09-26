import { useCallback, useRef, useState } from 'react';
import * as actions from '@/document/actions';
import type { PhotoCropMode, PhotoFrame, PhotoSizeMode } from '@/document/types';
import { useEditor } from '@/state/store';
import { loadSamples, SAMPLE_NAMES, sampleMediaId } from '@/media/samples';
import type { SceneTemplate } from '@/templates/schema';
import { useMediaRevision, useMediaStore } from '@/ui/media/MediaProvider';
import { ACCEPT_ATTRIBUTE, useUpload } from '@/ui/media/useUpload';
import { Button, EmptyNote, Section, Segmented, Slider, Stepper } from '../controls';
import { SlotPlacement } from '../SlotPlacement';

/** §8.1. Every control here goes through dispatch; none touches the document. */
export function PhotosTab({ template }: { template: SceneTemplate | null }): React.JSX.Element {
  const store = useMediaStore();
  const dispatch = useEditor((s) => s.dispatch);
  const photos = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.photos ?? []);
  const selected = useEditor((s) => s.selectedPhoto);
  const selectPhoto = useEditor((s) => s.selectPhoto);

  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const onAdded = useCallback(
    (mediaIds: string[]) => { dispatch(actions.addPhotos(mediaIds)); },
    [dispatch],
  );
  const { state: upload, addFiles } = useUpload(store, onAdded, { artboardLongestEdge: 1920 });

  const slots = template?.photoSlots ?? { min: 1, max: 8, default: 3 };
  const current = selected !== null ? photos[selected] : undefined;

  const useSamples = (): void => {
    const count = Math.min(slots.default, SAMPLE_NAMES.length);
    void loadSamples(store, { artboardLongestEdge: 1920 }).then(() => {
      dispatch(actions.removeAllPhotos());
      dispatch(actions.addPhotos(SAMPLE_NAMES.slice(0, count).map(sampleMediaId)));
    });
  };

  return (
    <div>
      <Section>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => { setDragOver(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void addFiles([...e.dataTransfer.files]);
          }}
          onClick={() => { fileInput.current?.click(); }}
          className="cursor-pointer rounded-md border border-dashed px-3 py-4 text-center transition-colors"
          style={{
            borderColor: dragOver ? 'var(--c-accent)' : 'var(--c-edge-strong)',
            background: dragOver ? 'var(--c-accent-soft)' : 'transparent',
            transitionDuration: 'var(--t-fast)',
          }}
        >
          <p className="text-[12px] font-medium">{upload.busy ? 'Reading…' : 'Add photos'}</p>
          <p className="mt-0.5 text-[10px] text-ink-faint">Drop, paste or click. Nothing is uploaded.</p>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            multiple
            hidden
            onChange={(e) => {
              void addFiles([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
        </div>

        {upload.error !== null && (
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--c-danger)' }}>
            {upload.error}
          </p>
        )}

        <div className="mt-2 flex gap-1">
          <Button onClick={useSamples}>Try sample photos</Button>
          <Button
            onClick={() => { dispatch(actions.removeAllPhotos()); selectPhoto(null); }}
            variant="danger"
            disabled={photos.length === 0}
          >
            Remove all
          </Button>
        </div>
      </Section>

      <Section title={`Photos (${photos.length})`}>
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
              { value: 'fillFrame', label: 'Fill frame' },
              { value: 'overflow', label: 'Overflow' },
            ]}
            onChange={(sizeMode) => { dispatch(actions.setPhotoSizeMode(selected ?? 0, sizeMode)); }}
          />

          {current.sizeMode === 'template' || current.sizeMode === 'fillFrame' ? (
            <EmptyNote>Size percentage applies to Larger and Overflow.</EmptyNote>
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
        className="absolute right-0.5 top-0.5 hidden size-4 place-items-center rounded-sm text-[10px] leading-none group-hover:grid"
        style={{ background: 'var(--c-panel)', color: 'var(--c-danger)', border: '1px solid var(--c-edge)' }}
      >
        ×
      </button>
    </div>
  );
}
