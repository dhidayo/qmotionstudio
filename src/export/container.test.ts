import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_FORMATS, BufferSource, canEncodeVideo, EncodedAudioPacketSource, EncodedPacket,
  EncodedVideoPacketSource, Input, Quality,
} from 'mediabunny';
import { audioEncodingFor, makeOutput, videoEncodingFor } from './container';
import { DEFAULT_EXPORT, exportSize, type ExportSettings } from './config';

/**
 * The MP4 path up to the encoder (D-171).
 *
 * H.264 cannot be encoded where this suite runs — Linux Chromium builds
 * without the codec, and Node has no encoder at all — so a real MP4 export
 * is proven on the owner's Mac, PC and iPhone (see D-171's checklist). What
 * can be proven here is everything on either side of the encoder: what the
 * browser is asked for, and what the muxer makes of what an encoder hands
 * back.
 */

const MP4: ExportSettings = { ...DEFAULT_EXPORT, format: 'mp4' };
const PORTRAIT = exportSize('9:16', MP4);

afterEach(() => { vi.unstubAllGlobals(); });

describe('what an MP4 export asks for', () => {
  it('H.264 video with a key frame every two seconds and AAC sound (§11.2, §11.4)', () => {
    expect(videoEncodingFor(MP4, PORTRAIT)).toEqual({
      codec: 'avc',
      bitrate: Math.round(1080 * 1920 * 0.18 * 30),
      keyFrameInterval: 2,
      frameRate: 30,
    });
    expect(audioEncodingFor(MP4)).toEqual({ codec: 'aac', bitrate: 128_000 });
    expect(videoEncodingFor({ ...MP4, format: 'webm' }, PORTRAIT).codec).toBe('vp9');
    expect(audioEncodingFor({ ...MP4, format: 'webm' }).codec).toBe('opus');
  });

  /*
   * The codec string the browser is asked about. §11.2's `avc1.640028` is
   * High profile at level 4.0, which holds 1080p30 and not 1080p60 — so the
   * level must follow the frame rate, as D-003 left Mediabunny to do.
   */
  async function askedFor(settings: ExportSettings): Promise<string> {
    const asked: string[] = [];
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: (config: { codec: string }) => {
        asked.push(config.codec);
        return Promise.resolve({ supported: true, config });
      },
    });
    const size = exportSize('9:16', settings);
    const encoding = videoEncodingFor(settings, size);
    await canEncodeVideo(encoding.codec, {
      width: size.w,
      height: size.h,
      frameRate: encoding.frameRate,
      quality: new Quality({ bitrate: encoding.bitrate }),
    });
    const codec = asked[0];
    if (codec === undefined) throw new Error('the encoder was never asked');
    return codec;
  }

  const level = (codec: string): number => Number.parseInt(codec.slice(-2), 16);

  it('1080p30: High profile, at a level that holds it', async () => {
    const codec = await askedFor(MP4);
    expect(codec).toMatch(/^avc1\.64[0-9a-f]{4}$/);
    expect(level(codec)).toBeGreaterThanOrEqual(40);
  });

  /*
   * A finding, pinned so it cannot change unnoticed. Mediabunny chooses the
   * level from the size and bitrate, not the frame rate, and asks for 4.1 at
   * 1080p60; the H.264 level table puts 1080p60 at 4.2. Whether each
   * browser's encoder accepts 4.1 for it is on D-171's checklist. If one
   * refuses, the probe already says so (it asks with the same frame rate and
   * bitrate), the window falls back to WebM, and the fix is `fullCodecString`
   * with level 4.2 (`avc1.64002a`).
   */
  it('1080p60: level 4.1, as Mediabunny chooses it', async () => {
    expect(level(await askedFor({ ...MP4, fps: 60 }))).toBe(0x29);
  });

  it('720p: still H.264 High', async () => {
    expect(await askedFor({ ...MP4, shortEdge: 720 })).toMatch(/^avc1\.64/);
  });

  it('says no when the browser says no — the answer the export window turns into "WebM will be used"', async () => {
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: (config: { codec: string }) => Promise.resolve({ supported: !config.codec.startsWith('avc1'), config }),
    });
    expect(await canEncodeVideo('avc', { width: 1080, height: 1920 })).toBe(false);
    expect(await canEncodeVideo('vp9', { width: 1080, height: 1920 })).toBe(true);
  });
});

/** Top-level ISO BMFF boxes, in file order. */
function boxes(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found: string[] = [];
  for (let at = 0; at + 8 <= bytes.length;) {
    const size = view.getUint32(at);
    found.push(String.fromCharCode(...bytes.subarray(at + 4, at + 8)));
    if (size < 8) break;
    at += size;
  }
  return found;
}

const contains = (bytes: Uint8Array, tag: string): boolean => {
  const want = Array.from({ length: tag.length }, (_, i) => tag.charCodeAt(i));
  return bytes.some((_, i) => want.every((b, j) => bytes[i + j] === b));
};

describe('the MP4 the muxer writes', () => {
  /*
   * What an H.264 and an AAC encoder hand the muxer: packets, and with the
   * first, the decoder configuration. The payload bytes are stand-ins — no
   * encoder exists here — but the configuration is the shape a browser's
   * encoder gives, so the boxes written from it are the real ones.
   */
  const AVCC = new Uint8Array([
    0x01, 0x64, 0x00, 0x28, 0xff, 0xe1, 0x00, 0x04, 0x67, 0x64, 0x00, 0x28,
    0x01, 0x00, 0x04, 0x68, 0xee, 0x3c, 0x80,
  ]);
  const ASC = new Uint8Array([0x11, 0x90]); // AAC-LC, 48kHz, stereo

  async function mux(seconds: number): Promise<Uint8Array> {
    const output = makeOutput(MP4);
    const video = new EncodedVideoPacketSource('avc');
    const audio = new EncodedAudioPacketSource('aac');
    output.addVideoTrack(video, { frameRate: 30 });
    output.addAudioTrack(audio);
    await output.start();

    const frames = seconds * 30;
    for (let i = 0; i < frames; i++) {
      const key = i % 60 === 0;
      const packet = new EncodedPacket(new Uint8Array([0, 0, 0, 1, key ? 0x65 : 0x41, i & 0xff]), key ? 'key' : 'delta', i / 30, 1 / 30);
      await video.add(packet, i === 0 ? {
        decoderConfig: { codec: 'avc1.640028', codedWidth: PORTRAIT.w, codedHeight: PORTRAIT.h, description: AVCC },
      } : undefined);
    }
    const blocks = Math.round((seconds * 48_000) / 1024);
    for (let i = 0; i < blocks; i++) {
      const packet = new EncodedPacket(new Uint8Array([0x21, 0x10, i & 0xff]), 'key', (i * 1024) / 48_000, 1024 / 48_000);
      await audio.add(packet, i === 0 ? {
        decoderConfig: { codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2, description: ASC },
      } : undefined);
    }
    await output.finalize();
    const buffer = output.target.buffer;
    if (buffer === null) throw new Error('no file was written');
    return new Uint8Array(buffer);
  }

  it('is a fast-start MP4: the index before the media, so a phone can play it as it reads', async () => {
    const order = boxes(await mux(2));
    expect(order[0]).toBe('ftyp');
    expect(order.indexOf('moov')).toBeGreaterThan(-1);
    expect(order.indexOf('moov')).toBeLessThan(order.indexOf('mdat'));
  });

  it('carries an H.264 track (avc1 with its avcC) and an AAC track (mp4a with its esds)', async () => {
    const file = await mux(2);
    for (const tag of ['avc1', 'avcC', 'mp4a', 'esds', 'stss']) expect(contains(file, tag), tag).toBe(true);
  });

  it('reads back as 1080×1920 H.264 with AAC, for as long as it was made', async () => {
    const input = new Input({ source: new BufferSource(await mux(3)), formats: ALL_FORMATS });
    expect(await input.getMimeType()).toMatch(/^video\/mp4/);
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (video === null || audio === null) throw new Error('a track is missing');
    expect(await video.getCodec()).toBe('avc');
    expect(await video.getDisplayWidth()).toBe(1080);
    expect(await video.getDisplayHeight()).toBe(1920);
    expect(await audio.getCodec()).toBe('aac');
    expect(await audio.getSampleRate()).toBe(48_000);
    expect(await input.computeDuration()).toBeCloseTo(3, 1);
  });
});
