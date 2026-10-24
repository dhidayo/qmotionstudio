import { describe, expect, it } from 'vitest';
import type { AudioClip, Overlay, OverlayContent, Project } from '@/document/types';
import { createProject } from '@/document/defaults';
import { clipEndMs, sourceMsAt } from '@/core/audio/envelope';
import { loopPlan } from '@/core/audio/graph';
import { wrap } from '@/media/video/clip';
import * as actions from '@/document/actions';
import { resolvedAudio } from './timeline';
import { VIDEO_SOUND_PREFIX, playedAudio, videoSoundClips, type VideoSoundLookup } from './videoSound';

/** A video layer's own sound (D-163): derived from the overlay, never stored. */

const VIDEO_MS = 3_000;
const withSound: VideoSoundLookup = (mediaId) => (mediaId === 'clip' ? { lengthMs: VIDEO_MS } : null);

function video(patch: Partial<OverlayContent & { kind: 'customMedia' }> = {}, span: { startMs: number; endMs: number } = { startMs: 2_000, endMs: 9_500 }): Overlay {
  return {
    ...actions.makeOverlay({ kind: 'customMedia', mediaId: 'clip', ...patch }, { ...span, track: 0 }),
    id: 'ovl_video',
  };
}

function withOverlays(overlays: Overlay[], audio: AudioClip[] = []): Project {
  return { ...createProject(), overlays, audio };
}

const onlyClip = (clips: readonly AudioClip[]): AudioClip => {
  const clip = clips[0];
  if (clips.length !== 1 || !clip) throw new Error(`expected one clip, got ${String(clips.length)}`);
  return clip;
};

describe('the clip a video layer sounds as', () => {
  it('starts with the layer, lasts as long as it does, and loops the whole video', () => {
    const clip = onlyClip(videoSoundClips([video()], withSound));
    expect(clip).toMatchObject({
      id: `${VIDEO_SOUND_PREFIX}ovl_video`,
      mediaId: 'clip',
      startMs: 2_000,
      trimStartMs: 0,
      trimEndMs: VIDEO_MS,
      loop: true,
      lengthMs: 7_500,
      loopPhaseMs: 0,
      gainDb: 0,
    });
    expect(clipEndMs(clip)).toBe(9_500);
  });

  it('hears the moment of the video the picture shows, through every loop', () => {
    const clip = onlyClip(videoSoundClips([video()], withSound));
    // The video layer draws `wrap(local, length)` of its clip (VideoClip.localMs).
    for (const local of [0, 1_234, 2_999, 3_000, 4_500, 7_400]) {
      expect(sourceMsAt(clip, local)).toBeCloseTo(wrap(local, VIDEO_MS), 6);
    }
    // And the scheduler starts the source there when playback begins inside it.
    const plan = loopPlan(clip, 4_500, 3_000, VIDEO_MS);
    expect(plan).toMatchObject({ loop: true, offsetMs: 1_500, loopStartMs: 0, loopEndMs: VIDEO_MS });
  });

  it('plays at the layer’s volume, clamped to −40…+6 dB', () => {
    expect(onlyClip(videoSoundClips([video({ volumeDb: -12 })], withSound)).gainDb).toBe(-12);
    expect(onlyClip(videoSoundClips([video({ volumeDb: 20 })], withSound)).gainDb).toBe(6);
    expect(onlyClip(videoSoundClips([video({ volumeDb: -90 })], withSound)).gainDb).toBe(-40);
  });

  it('is not there when the layer is muted, the video has no sound, or the layer has no length', () => {
    expect(videoSoundClips([video({ muted: true })], withSound)).toEqual([]);
    expect(videoSoundClips([video({ mediaId: 'silent' })], withSound)).toEqual([]);
    expect(videoSoundClips([video({}, { startMs: 1_000, endMs: 1_000 })], withSound)).toEqual([]);
  });

  it('ignores every other kind of layer', () => {
    const photo = actions.makeOverlay({ kind: 'photo', mediaId: 'clip' }, { startMs: 0, endMs: 5_000, track: 0 });
    expect(videoSoundClips([photo], withSound)).toEqual([]);
  });
});

describe('everything that sounds, for preview and export alike', () => {
  const music: AudioClip = { id: 'aud_1', mediaId: 'song', startMs: 0, trimStartMs: 0, trimEndMs: 10_000, gainDb: -3, fadeInMs: 0, fadeOutMs: 0 };

  it('is the project’s own audio, then each video’s sound', () => {
    const project = withOverlays([video()], [music]);
    const played = playedAudio(project, withSound);
    expect(played.map((clip) => clip.id)).toEqual(['aud_1', `${VIDEO_SOUND_PREFIX}ovl_video`]);
  });

  it('is the project’s own audio, untouched, with no video sound', () => {
    const project = withOverlays([video({ muted: true })], [music]);
    expect(playedAudio(project, withSound)).toBe(resolvedAudio(project));
  });

  it('gives back the same array until something that sounds changes', () => {
    const project = withOverlays([video()], [music]);
    const once = playedAudio(project, withSound);
    expect(playedAudio({ ...project, name: 'Renamed' }, withSound)).toBe(once);
    const louder = actions.setVideoVolume('ovl_video', -6).apply(project, actions.FIRST_SCENE);
    expect(playedAudio(louder, withSound)).not.toBe(once);
  });
});

describe('the volume and mute actions', () => {
  const scope = actions.FIRST_SCENE;
  const contentOf = (project: Project): OverlayContent | undefined => project.overlays[0]?.content;

  it('sets the volume, clamped and rounded, as one undo step per drag', () => {
    const action = actions.setVideoVolume('ovl_video', -7.26);
    expect(action.coalesceKey).toBe('videoVolume:ovl_video');
    expect(contentOf(action.apply(withOverlays([video()]), scope))).toMatchObject({ volumeDb: -7.3 });
    expect(contentOf(actions.setVideoVolume('ovl_video', 99).apply(withOverlays([video()]), scope))).toMatchObject({ volumeDb: 6 });
  });

  it('changes nothing when the volume is already that', () => {
    const project = withOverlays([video()]);
    expect(actions.setVideoVolume('ovl_video', 0).apply(project, scope)).toBe(project);
  });

  it('mutes and unmutes, keeping the volume it had', () => {
    const muted = actions.setVideoMuted('ovl_video', true).apply(withOverlays([video({ volumeDb: -10 })]), scope);
    expect(contentOf(muted)).toMatchObject({ muted: true, volumeDb: -10 });
    const back = actions.setVideoMuted('ovl_video', false).apply(muted, scope);
    expect(contentOf(back)).toEqual({ kind: 'customMedia', mediaId: 'clip', volumeDb: -10 });
  });

  it('keeps the sound settings when the clip is swapped for another', () => {
    const project = withOverlays([video({ volumeDb: -4, muted: true })]);
    const swapped = actions.setOverlayMedia('ovl_video', 'other').apply(project, scope);
    expect(contentOf(swapped)).toEqual({ kind: 'customMedia', mediaId: 'other', volumeDb: -4, muted: true });
  });

  it('leaves other layers alone', () => {
    const photo = { ...actions.makeOverlay({ kind: 'photo', mediaId: 'p' }, { startMs: 0, endMs: 1_000, track: 0 }), id: 'ovl_video' };
    const project = withOverlays([photo]);
    expect(actions.setVideoVolume('ovl_video', -6).apply(project, scope)).toBe(project);
    expect(actions.setVideoMuted('ovl_video', true).apply(project, scope)).toBe(project);
  });
});
