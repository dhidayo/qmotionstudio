import { useCallback, useRef } from 'react';
import * as actions from '@/document/actions';
import type { Overlay } from '@/document/types';
import { DEFAULT_OVERLAY_MS, DEFAULT_OVERLAY_TEXT_STYLE, STARTER_PHOTO_IDS } from '@/document/defaults';
import { placeNew } from '@/document/select/tracks';
import { timelineSpanMs } from '@/document/select/timeline';
import { useEntitlements } from '@/entitlements';
import { useEditor } from '@/state/store';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { AUDIO_ACCEPT_ATTRIBUTE, VIDEO_ACCEPT_ATTRIBUTE, useUpload } from '@/ui/media/useUpload';

/**
 * Adding layers and music to an ad, from anywhere (D-109): the timeline's
 * toolbar on a computer, the Add panel on a phone. One implementation, so a
 * caption added on a phone lands exactly where one added on a computer would.
 *
 * The file inputs it needs are returned as `inputs`, to be rendered once by
 * whoever uses it.
 */
export function useAddLayers(): {
  addText: () => void;
  addPhoto: () => void;
  pickVideo: () => void;
  pickMusic: () => void;
  canVideo: boolean;
  videoBusy: boolean;
  musicBusy: boolean;
  error: string | null;
  inputs: React.JSX.Element;
} {
  const media = useMediaStore();
  const dispatch = useEditor((s) => s.dispatch);
  const selectOverlay = useEditor((s) => s.selectOverlay);
  const selectAudio = useEditor((s) => s.selectAudio);
  const { limits } = useEntitlements('motionAd');

  /*
   * A new element goes on a layer that has room for it (D-103): on the layer
   * the person chose, at the playhead or straight after the clip it would have
   * landed on; otherwise on the highest layer free at the playhead; a new layer
   * only when none is.
   */
  const placeOverlay = useCallback((content: Overlay['content']): void => {
    const { project, playheadMs, targetTrack } = useEditor.getState();
    const spot = placeNew(project.overlays, {
      atMs: playheadMs,
      lengthMs: DEFAULT_OVERLAY_MS,
      durationMs: timelineSpanMs(project),
      preferTrack: targetTrack,
    });
    const overlay = actions.makeOverlay(content, spot);
    dispatch(actions.addOverlay(overlay));
    selectOverlay(overlay.id);
  }, [dispatch, selectOverlay]);

  const addText = useCallback((): void => {
    placeOverlay({ kind: 'text', text: 'New caption', style: DEFAULT_OVERLAY_TEXT_STYLE });
  }, [placeOverlay]);

  // A photo layer needs something to show: the person's own photos first, the
  // samples as a fallback so the button is never a dead end.
  const addPhoto = useCallback((): void => {
    const own = media.ids('image').find((id) => !id.startsWith('sample:'));
    const first = own ?? media.ids('image')[0] ?? STARTER_PHOTO_IDS[0] ?? '';
    placeOverlay({ kind: 'photo', mediaId: first });
  }, [media, placeOverlay]);

  // Video picks its file first: a clip is not something to invent a default for (§9).
  const videoInput = useRef<HTMLInputElement>(null);
  const onVideoAdded = useCallback((ids: string[]) => {
    const first = ids[0];
    if (first !== undefined) placeOverlay({ kind: 'customMedia', mediaId: first });
  }, [placeOverlay]);
  const { state: videoUpload, addFiles: addVideoFiles } = useUpload(media, onVideoAdded, {
    artboardLongestEdge: 1920,
    video: true,
  });

  // Music (§10): one track per project, so adding replaces.
  const audioInput = useRef<HTMLInputElement>(null);
  const onAudioAdded = useCallback((ids: string[]) => {
    const first = ids[0];
    if (first === undefined) return;
    const clip = actions.makeAudioClip(first, { startMs: 0, durationMs: media.durationMsOf(first) ?? 0 });
    dispatch(actions.addAudio(clip));
    selectAudio(clip.id);
  }, [media, dispatch, selectAudio]);
  const { state: audioUpload, addFiles: addAudioFiles } = useUpload(media, onAudioAdded, {
    artboardLongestEdge: 1920,
    audio: true,
  });

  const inputs = (
    <>
      <input
        ref={videoInput}
        type="file"
        accept={VIDEO_ACCEPT_ATTRIBUTE}
        hidden
        aria-label="Add a video overlay"
        onChange={(e) => {
          void addVideoFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <input
        ref={audioInput}
        type="file"
        accept={AUDIO_ACCEPT_ATTRIBUTE}
        hidden
        aria-label="Add a music track"
        onChange={(e) => {
          void addAudioFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    </>
  );

  return {
    addText,
    addPhoto,
    pickVideo: () => { videoInput.current?.click(); },
    pickMusic: () => { audioInput.current?.click(); },
    canVideo: limits.customMedia,
    videoBusy: videoUpload.busy,
    musicBusy: audioUpload.busy,
    error: videoUpload.error ?? audioUpload.error,
    inputs,
  };
}
