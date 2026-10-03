import { useCallback, useEffect, useRef } from 'react';
import * as actions from '@/document/actions';
import { useEditor } from '@/state/store';
import { useOverlays, type PhotoTarget } from '@/ui/shell/overlays';
import { useMediaRevision, useMediaStore } from './MediaProvider';
import { ACCEPT_ATTRIBUTE, useUpload } from './useUpload';

/**
 * "Replace photo" — choosing a different picture for what is on the canvas
 * (D-107).
 *
 * Every photograph already in the editor, the person's own first, and a way
 * to bring in a new one. Picking one puts it straight in; a new upload goes in
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
    else dispatch(actions.setLogoMedia(mediaId));
    showToast(target.kind === 'logo' ? 'Logo replaced.' : 'Photo replaced.');
    close(null);
  }, [target, dispatch, showToast, close]);

  const onAdded = useCallback((ids: string[]) => {
    const first = ids[0];
    if (first !== undefined) apply(first);
  }, [apply]);
  const { state: upload, addFiles } = useUpload(store, onAdded, { artboardLongestEdge: 1920 });

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); close(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [close]);

  // The person's own photographs first, then the samples.
  const ids = [...store.ids('image')].sort((a, b) => Number(a.startsWith('sample:')) - Number(b.startsWith('sample:')));
  const title = target.kind === 'logo' ? 'Replace the logo' : 'Replace photo';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: 'rgb(0 0 0 / 0.45)' }}
      onClick={(event) => { if (event.target === event.currentTarget) close(null); }}
    >
      <div className="flex max-h-[80vh] w-[640px] max-w-full flex-col rounded-lg border border-edge bg-panel shadow-lg">
        <div className="flex items-center gap-3 border-b border-edge px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold">{title}</h2>
            <p className="text-[11px] text-ink-faint">Pick one of your photos, or add a new one. Nothing is uploaded.</p>
          </div>
          <button
            type="button"
            onClick={() => { fileInput.current?.click(); }}
            disabled={upload.busy}
            className="rounded-md border px-2.5 py-1 text-[11px] font-semibold"
            style={{ borderColor: 'var(--c-accent)', color: 'var(--c-accent)', background: 'var(--c-accent-soft)' }}
          >
            {upload.busy ? 'Reading…' : 'Add a new photo'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            hidden
            aria-label="Add a new photo"
            onChange={(e) => {
              void addFiles([...(e.target.files ?? [])].slice(0, 1));
              e.target.value = '';
            }}
          />
          <button type="button" onClick={() => { close(null); }} className="rounded-md border border-edge px-2 py-1 text-[11px] hover:bg-panel-alt">
            Cancel
          </button>
        </div>
        {upload.error !== null && (
          <p className="px-4 pt-2 text-[11px]" style={{ color: 'var(--c-danger)' }}>{upload.error}</p>
        )}
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto p-4 sm:grid-cols-5">
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
          {ids.length === 0 && (
            <p className="col-span-full py-6 text-center text-[12px] text-ink-faint">No photos yet — add one.</p>
          )}
        </div>
      </div>
    </div>
  );
}
