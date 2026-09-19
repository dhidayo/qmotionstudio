import { useCallback, useEffect, useState } from 'react';
import { decodeImage, UnsupportedImageError, ACCEPTED_TYPES } from '@/media/image/decode';
import type { MediaStore } from '@/media/store';

/**
 * Photo upload (§8.1: drag/drop, paste and file picker all work; §9 for decode).
 *
 * Nothing leaves the device — files are decoded straight to bitmaps in memory.
 * Failures surface rather than disappearing (§16); a HEIC gets its own message
 * because it is the single most likely failure, iPhone photos being HEIC by
 * default.
 */

export const ACCEPT_ATTRIBUTE = [...ACCEPTED_TYPES, 'image/heic', 'image/heif'].join(',');

export type UploadState = {
  readonly busy: boolean;
  readonly error: string | null;
};

let counter = 0;
function nextMediaId(): string {
  counter += 1;
  return `upload:${Date.now().toString(36)}:${counter}`;
}

export function useUpload(
  store: MediaStore,
  onAdded: (mediaIds: string[]) => void,
  options: { artboardLongestEdge: number },
): {
  state: UploadState;
  addFiles: (files: readonly File[]) => Promise<void>;
  clearError: () => void;
} {
  const [state, setState] = useState<UploadState>({ busy: false, error: null });

  const addFiles = useCallback(
    async (files: readonly File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/') || /\.(hei[cf])$/i.test(f.name));
      if (images.length === 0) {
        setState({ busy: false, error: 'No images in that drop.' });
        return;
      }

      setState({ busy: true, error: null });
      const added: string[] = [];
      const failures: string[] = [];

      for (const file of images) {
        const id = nextMediaId();
        try {
          const entry = await decodeImage(file, {
            id,
            name: file.name,
            artboardLongestEdge: options.artboardLongestEdge,
          });
          store.set(entry);
          added.push(id);
        } catch (error) {
          failures.push(
            error instanceof UnsupportedImageError
              ? error.message
              : `Could not read "${file.name}".`,
          );
        }
      }

      if (added.length > 0) onAdded(added);
      setState({ busy: false, error: failures[0] ?? null });
    },
    [store, onAdded, options.artboardLongestEdge],
  );

  const clearError = useCallback(() => { setState((s) => ({ ...s, error: null })); }, []);

  // §8.1: paste works anywhere in the editor, not just over a drop zone.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName));
      if (typing) return;

      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      event.preventDefault();
      void addFiles(files);
    };

    addEventListener('paste', onPaste);
    return () => { removeEventListener('paste', onPaste); };
  }, [addFiles]);

  return { state, addFiles, clearError };
}
