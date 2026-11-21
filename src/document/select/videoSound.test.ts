import { describe, expect, it } from 'vitest';
import type { AudioClip, Overlay, OverlayContent, Project } from '@/document/types';
import { createProject } from '@/document/defaults';
import { clipEndMs, sourceMsAt } from '@/core/audio/envelope';
import { loopPlan, scheduleClips } from '@/core/audio/graph';
import { wrap } from '@/media/video/clip';
import * as actions from '@/document/actions';
import { resolvedAudio } from './timeline';
import { VIDEO_SOUND_PREFIX, playedAudio, videoSoundClips, videoSoundsPending, type VideoSoundLookup } from './videoSound';

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

/**
 * A decoded track is rarely exactly as long as its picture (D-172). The
 * source node is driven through the one scheduler the preview and export
 * share, and then played out frame by frame as Web Audio's looping source
 * does: its loop end clamped to the buffer, its playhead wrapping back by the
 * loop's length when it reaches it. Each repeat must start where the
 * picture's does.
 */
describe('a video’s sound stays in step with its picture', () => {
  const RATE = 48_000;
  const PICTURE_MS = 2_000;
  const LOOPS = 20;

  type Source = { buffer: { length: number; sampleRate: number } | null; loop: boolean; loopStart: number; loopEnd: number; start: number[] };

  function schedule(soundMs: number): Source {
    const sources: Source[] = [];
    const param = { setValueAtTime: () => param, linearRampToValueAtTime: () => param };
    const decoded = { length: Math.round((soundMs / 1000) * RATE), sampleRate: RATE, numberOfChannels: 1, duration: soundMs / 1000, getChannelData: () => new Float32Array(0) };
    const ctx = {
      createGain: () => ({ gain: param, connect: () => undefined, disconnect: () => undefined }),
      createBuffer: (channels: number, length: number, sampleRate: number) => ({ numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, copyToChannel: () => undefined }),
      createBufferSource: () => {
        const source: Source = { buffer: null, loop: false, loopStart: 0, loopEnd: 0, start: [] };
        sources.push(source);
        return Object.assign(source, { connect: () => undefined, disconnect: () => undefined, start: (...args: number[]) => { source.start = args; }, stop: () => undefined });
      },
    } as unknown as BaseAudioContext;
    const sound: VideoSoundLookup = () => ({ lengthMs: PICTURE_MS });
    const clips = videoSoundClips([video({}, { startMs: 0, endMs: PICTURE_MS * LOOPS })], sound);
    scheduleClips(ctx, {} as AudioNode, clips, () => decoded as unknown as AudioBuffer, { fromMs: 0, atContextTime: 0 });
    const [source] = sources;
    if (!source?.buffer) throw new Error('nothing was scheduled');
    return source;
  }

  /** The output frame at which each repeat after the first begins, as a looping source plays it. */
  function repeatStarts(source: Source): number[] {
    const buffer = source.buffer;
    if (!buffer) return [];
    const loopStart = source.loopStart * RATE;
    const loopEnd = Math.min(source.loopEnd * RATE, buffer.length);
    let position = (source.start[1] ?? 0) * RATE;
    const starts: number[] = [];
    for (let frame = 0; starts.length < LOOPS - 1; frame++) {
      if (position >= loopEnd) {
        position -= loopEnd - loopStart;
        starts.push(frame);
      }
      position += 1;
    }
    return starts;
  }

  for (const soundMs of [1_980, 2_030]) {
    it(`starts every repeat of a ${String(soundMs / 1000)}s sound within a frame of the picture’s loop`, () => {
      const source = schedule(soundMs);
      expect(source.loop).toBe(true);
      expect(source.loopEnd).toBe(PICTURE_MS / 1000);
      repeatStarts(source).forEach((frame, i) => {
        expect(Math.abs(frame - ((i + 1) * PICTURE_MS * RATE) / 1000)).toBeLessThanOrEqual(1);
      });
    });
  }
});

describe('a video still loading when the design is exported (D-172)', () => {
  it('names each unmuted video whose media is not in yet, once', () => {
    const second = { ...video(), id: 'ovl_two' };
    expect(videoSoundsPending([video(), second], () => false)).toEqual(['clip']);
    expect(videoSoundsPending([video()], (id) => id === 'clip')).toEqual([]);
  });

  it('does not wait for a muted video, a layer with no length or another kind of layer', () => {
    const photo = actions.makeOverlay({ kind: 'photo', mediaId: 'clip' }, { startMs: 0, endMs: 5_000, track: 0 });
    expect(videoSoundsPending([video({ muted: true }), video({}, { startMs: 1_000, endMs: 1_000 }), photo], () => false)).toEqual([]);
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
