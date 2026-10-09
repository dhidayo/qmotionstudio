import { useCallback, useRef } from 'react';
import * as actions from '@/document/actions';
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
 * specific items are selected, same for choose template". Adding photos now
 * puts them into every photo slot of the design, across all its scenes, in one
 * step that one undo takes back.
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
        className={`flex items-center justify-center gap-2 rounded-xl border border-edge bg-panel font-semibold hover:bg-panel-alt ${size}`}
      >
        <Icon name="designs" size={18} /> Choose a design
      </button>
      <button
        type="button"
        onClick={add.pick}
        disabled={add.busy}
        title="Your photos go into every photo in the design, in order. Nothing is uploaded."
        className={`flex items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-accent-ink hover:bg-accent-hover ${size}`}
      >
        <Icon name="photo" size={18} /> {add.busy ? 'Reading…' : 'Add your photos'}
      </button>
      {add.input}
      {add.error !== null && <span className="sr-only" role="alert">{add.error}</span>}
    </div>
  );
}

/** Picks photographs and puts them into every photo slot of the design (D-116). */
export function useAddYourPhotos(): {
  pick: () => void;
  busy: boolean;
  error: string | null;
  input: React.JSX.Element;
} {
  const media = useMediaStore();
  const dispatch = useEditor((s) => s.dispatch);
  const showToast = useEditor((s) => s.showToast);
  const input = useRef<HTMLInputElement>(null);

  const onAdded = useCallback((ids: string[]) => {
    dispatch(actions.placeOwnPhotos(ids));
    showToast(ids.length === 1
      ? 'Your photo is in every photo of the design. Undo puts the old ones back.'
      : `Your ${ids.length} photos are in the design, in order. Undo puts the old ones back.`);
  }, [dispatch, showToast]);
  const { state: upload, addFiles } = useUpload(media, onAdded, { artboardLongestEdge: 1920 });

  return {
    pick: () => { input.current?.click(); },
    busy: upload.busy,
    error: upload.error,
    input: (
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        hidden
        aria-label="Add your photos"
        onChange={(e) => {
          void addFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    ),
  };
}
