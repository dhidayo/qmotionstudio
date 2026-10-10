import { useCallback, useEffect, useRef } from 'react';
import * as actions from '@/document/actions';
import { useShallow } from 'zustand/react/shallow';
import { projectPhotos } from '@/document/select/media';
import { useEditor } from '@/state/store';
import { useOverlays, type PhotoTarget } from '@/ui/shell/overlays';
import { useMediaRevision, useMediaStore } from './MediaProvider';
import { ACCEPT_ATTRIBUTE, useUpload } from './useUpload';
import { useLayout } from '@/ui/shell/useLayout';
import { BottomSheet } from '@/ui/mobile/BottomSheet';

/**
 * "Replace photo" — choosing a different picture for what is on the canvas
 * (D-107).
 *
 * A way to bring in a new photograph, first and largest, and the person's own
 * photographs already in the editor. Picking one puts it straight in; a new upload goes in
 * as soon as it has decoded. Nothing leaves the device (§9).
 */
export function PhotoPickerDialog(): React.JSX.Element | null {
  const target = useOverlays((o) => o.photoPicker);
  if (!target) return null;
  return <Picker target={target} />;
}

function Picker({ target }: { target: PhotoTarget }): React.JSX.Element {
  const close = useOverlays((o) => o.openPhotoPicker);
  const store = useMediaStore();
  useMediaRevision();
  const dispatch = useEditor((s) => s.dispatch);
  const showToast = useEditor((s) => s.showToast);
  const fileInput = useRef<HTMLInputElement>(null);

  const apply = useCallback((mediaId: string): void => {
    if (target.kind === 'slot') dispatch(actions.replacePhoto(target.index, mediaId));
    else if (target.kind === 'overlay') dispatch(actions.setOverlayMedia(target.id, mediaId));
    else if (target.kind === 'background') dispatch(actions.setBackgroundPicture(mediaId));
    else dispatch(actions.setLogoMedia(mediaId));
    showToast(target.kind === 'logo' ? 'Logo replaced.' : target.kind === 'background' ? 'Background changed.' : 'Photo replaced.');
    close(null);
  }, [target, dispatch, showToast, close]);

  const onAdded = useCallback((ids: string[]) => {
    const first = ids[0];
    if (first === undefined) return;
    // A new photograph stays in Your photos for later (D-147); a logo is not one.
    if (target.kind !== 'logo') dispatch(actions.addToLibrary([first]));
    apply(first);
  }, [apply, dispatch, target.kind]);
  const { state: uploadState, addFiles } = useUpload(store, onAdded, { artboardLongestEdge: 1920 });

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); close(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [close]);

  /*
   * The person's own photographs only (point 6 of the phone review). The
   * samples are there so a new project has something to look at; offering
   * them as replacements put a wall of stock pictures between the person and
   * the one thing they came here to do, which is use their own.
   */
  const library = useEditor(useShallow((s) => projectPhotos(s.project)));
  const ids = library.filter((id) => store.has(id));
  const title = target.kind === 'logo' ? 'Replace the logo' : target.kind === 'background' ? 'Background picture' : 'Replace photo';
  const phone = useLayout() === 'phone';

  const upload = (
    <>
      <button
        type="button"
        onClick={() => { fileInput.current?.click(); }}
        disabled={uploadState.busy}
        data-photo-upload
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-5 text-[14px] font-semibold"
        style={{ borderColor: 'var(--c-accent)', color: 'var(--c-accent)', background: 'var(--c-accent-soft)' }}
      >
        <span aria-hidden className="text-[20px] leading-none">＋</span>
        {uploadState.busy ? 'Reading…' : phone ? 'Choose from your phone' : 'Upload a photo'}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        hidden
        aria-label="Upload a photo"
        onChange={(e) => {
          void addFiles([...(e.target.files ?? [])].slice(0, 1));
          e.target.value = '';
        }}
      />
      <p className="mt-1.5 text-center text-[11px] text-ink-faint">It stays on this device — nothing is uploaded to a server.</p>
      {uploadState.error !== null && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--c-danger)' }}>{uploadState.error}</p>
      )}
    </>
  );

  const yours = ids.length > 0 && (
    <>
      <h3 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Or use one of Your photos</h3>
      <div className={`grid gap-2 ${phone ? 'grid-cols-3' : 'grid-cols-4'}`}>
        {ids.map((id) => {
          const url = store.previewUrl(id);
          const entry = store.get(id);
          return (
            <button
              key={id}
              type="button"
              data-photo-choice={id}
              onClick={() => { apply(id); }}
              title={entry?.name ?? id}
              className="aspect-square overflow-hidden rounded-md border border-edge hover:border-accent focus:border-accent focus:outline-none"
              style={{ background: 'var(--c-panel-alt)' }}
            >
              {url !== null && <img src={url} alt={entry?.name ?? 'Photo'} className="size-full object-cover" />}
            </button>
          );
        })}
      </div>
    </>
  );

  if (phone) {
    return (
      <BottomSheet title={title} onClose={() => { close(null); }}>
        {upload}
        {yours}
      </BottomSheet>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: 'rgb(0 0 0 / 0.35)' }}
      onClick={(event) => { if (event.target === event.currentTarget) close(null); }}
    >
      <div className="flex max-h-[70vh] w-[460px] max-w-full flex-col rounded-xl border border-edge bg-panel shadow-lg">
        <div className="flex items-center gap-3 px-4 pb-2 pt-3">
          <h2 className="min-w-0 flex-1 text-[14px] font-semibold">{title}</h2>
          <button
            type="button"
            onClick={() => { close(null); }}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full text-[16px] text-ink-muted hover:bg-panel-alt"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {upload}
          {yours}
        </div>
      </div>
    </div>
  );
}
