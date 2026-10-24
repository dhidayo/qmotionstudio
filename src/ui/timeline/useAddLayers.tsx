import { useCallback, useRef } from 'react';
import * as actions from '@/document/actions';
import type { Overlay } from '@/document/types';
import { DEFAULT_OVERLAY_TEXT_STYLE } from '@/document/defaults';
import { useEntitlements } from '@/entitlements';
import { spotFor } from '@/ui/editing/addLayer';
import { useEditor } from '@/state/store';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { AUDIO_ACCEPT_ATTRIBUTE, VIDEO_ACCEPT_ATTRIBUTE, useUpload } from '@/ui/media/useUpload';

/**
 * Adding layers and music, from anywhere (D-109): the add bar on a computer,
 * the Add sheet on a phone (D-153). One implementation, so a caption added on
 * a phone lands exactly where one added on a computer would.
 *
 * The file inputs it needs are returned as `inputs`, to be rendered once by
 * whoever uses it.
 */
export function useAddLayers(): {
  addText: () => void;
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
  const { limits } = useEntitlements(useEditor((s) => s.project.mode));

  /*
   * A new element goes on a layer that has room for it (D-103): on the layer
   * the person chose, at the playhead or straight after the clip it would have
   * landed on; otherwise on the highest layer free at the playhead; a new layer
   * only when none is. On a design, which has no timeline, it lasts as long as
   * the design does — the add bar adds to designs too (D-153).
   */
  const placeOverlay = useCallback((content: Overlay['content']): void => {
    const { project, playheadMs, targetTrack } = useEditor.getState();
    const overlay = actions.makeOverlay(content, spotFor(project, project.overlays, playheadMs, targetTrack));
    dispatch(actions.addOverlay(overlay));
    selectOverlay(overlay.id);
  }, [dispatch, selectOverlay]);

  const addText = useCallback((): void => {
    placeOverlay({ kind: 'text', text: 'New caption', style: DEFAULT_OVERLAY_TEXT_STYLE });
  }, [placeOverlay]);

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

  const music = useMusicUpload();

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
      {music.input}
    </>
  );

  return {
    addText,
    pickVideo: () => { videoInput.current?.click(); },
    pickMusic: music.pick,
    canVideo: limits.customMedia,
    videoBusy: videoUpload.busy,
    musicBusy: music.busy,
    error: videoUpload.error ?? music.error,
    inputs,
  };
}

/**
 * Music from the device (§10): a hidden file input and what happens once a
 * track is decoded — a clip from the start of the video, selected. The add
 * bar's "+ Music" uses it, and so does the sound library's "Use a music file
 * from your device…" (D-156), each with an input of its own name.
 */
export function useMusicUpload(label = 'Add a music track'): {
  pick: () => void;
  busy: boolean;
  error: string | null;
  input: React.JSX.Element;
} {
  const media = useMediaStore();
  const dispatch = useEditor((s) => s.dispatch);
  const selectAudio = useEditor((s) => s.selectAudio);
  const audioInput = useRef<HTMLInputElement>(null);
  const onAudioAdded = useCallback((ids: string[]) => {
    const first = ids[0];
    if (first === undefined) return;
    const clip = actions.makeAudioClip(first, { startMs: 0, durationMs: media.durationMsOf(first) ?? 0 });
    dispatch(actions.addAudio(clip));
    selectAudio(clip.id);
  }, [media, dispatch, selectAudio]);
  const { state, addFiles } = useUpload(media, onAudioAdded, {
    artboardLongestEdge: 1920,
    audio: true,
  });
  const input = (
    <input
      ref={audioInput}
      type="file"
      accept={AUDIO_ACCEPT_ATTRIBUTE}
      hidden
      aria-label={label}
      onChange={(e) => {
        void addFiles([...(e.target.files ?? [])]);
        e.target.value = '';
      }}
    />
  );
  return { pick: () => { audioInput.current?.click(); }, busy: state.busy, error: state.error, input };
}
