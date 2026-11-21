import { Suspense, useEffect } from 'react';
import { useEditor } from '@/state/store';
import { useOverlays } from '@/ui/shell/overlays';
import { useMusicUpload } from '@/ui/timeline/useAddLayers';
import { WindowBoundary } from '@/ui/shell/Boundaries';
import { PartLoading } from '@/ui/shell/PartLoading';
import { SOUND_DIALOG } from '@/ui/shell/parts';

/**
 * + Sound: the sound library (D-156).
 *
 * "Generic sounds with effects that help the product ship videos with sounds
 * instead of only custom music." Two kinds, said plainly: background music,
 * which loops under the whole video, and effects, which go at the playhead.
 * Every sound can be listened to first — a background goes round its loop
 * exactly as it will under the video — and added with one press.
 *
 * The person's own file comes first (D-163): "I do not need to have a
 * separate + Music … under sound, I can have custom upload, and the upload
 * could be sound or music." The add bar's + Music went, and the list opens on
 * **Upload your own sound or music** — any MP3, M4A, WAV or OGG, a song or a
 * single effect, which lands as a music clip from the start of the video, as
 * + Music's did.
 *
 * A window on a computer, a sheet from the bottom on a phone, like the
 * effect library. Opened from the add bar's + Sound.
 *
 * The library's window is fetched when first opened, or when the editor is
 * idle (D-173); the file chooser stays here, on the page from the start.
 */
export function SoundPicker(): React.JSX.Element {
  const open = useOverlays((s) => s.soundPicker);
  /*
   * The device's file chooser lives here, outside the dialog, so it is still
   * on the page when the chosen file arrives — the dialog closes as the
   * chooser opens. It keeps the name + Music's input had, "Add a music
   * track", now that it is the only one (D-163).
   */
  const music = useMusicUpload();
  const showToast = useEditor((s) => s.showToast);
  useEffect(() => { if (music.error !== null) showToast(music.error); }, [music.error, showToast]);
  return (
    <>
      {music.input}
      {open && (
        <WindowBoundary onFailed={() => { useOverlays.getState().openSoundPicker(false); }}>
          <Suspense fallback={<PartLoading />}>
            <SOUND_DIALOG.Component onUseFile={music.pick} busy={music.busy} />
          </Suspense>
        </WindowBoundary>
      )}
    </>
  );
}
