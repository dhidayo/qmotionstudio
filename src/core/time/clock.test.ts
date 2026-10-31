import { describe, expect, it } from 'vitest';
import { PreviewClock } from './clock';

describe('PreviewClock', () => {
  it('does not advance while paused', () => {
    const clock = new PreviewClock(1000);
    clock.tick(500);
    expect(clock.timeMs).toBe(0);
  });

  it('advances by the delta while playing', () => {
    const clock = new PreviewClock(1000);
    clock.play();
    clock.tick(16);
    expect(clock.timeMs).toBeCloseTo(16, 6);
  });

  it('wraps at the duration when looping', () => {
    const clock = new PreviewClock(1000);
    clock.play();
    clock.seek(990);
    clock.tick(20);
    expect(clock.timeMs).toBeCloseTo(10, 6);
  });

  it('stops at the duration when not looping', () => {
    const clock = new PreviewClock(1000, { loop: false });
    clock.play();
    clock.seek(990);
    clock.tick(50);
    expect(clock.timeMs).toBe(1000);
    expect(clock.playing).toBe(false);
  });

  it('clamps a huge delta so a backgrounded tab does not leap on refocus', () => {
    const clock = new PreviewClock(10_000);
    clock.play();
    clock.tick(8000);
    expect(clock.timeMs).toBe(100);
  });

  it('clamps seeks to the timeline', () => {
    const clock = new PreviewClock(1000);
    clock.seek(-50);
    expect(clock.timeMs).toBe(0);
    clock.seek(5000);
    expect(clock.timeMs).toBe(1000);
  });

  describe('playing once (D-155)', () => {
    const once = (): PreviewClock => {
      const clock = new PreviewClock(1000);
      clock.setLoop(false);
      return clock;
    };

    it('rests on the picture moment and reports that it has ended', () => {
      const clock = once();
      clock.setRest(400);
      clock.play();
      clock.seek(990);
      clock.tick(50);
      expect(clock.timeMs).toBe(400);
      expect(clock.playing).toBe(false);
      expect(clock.ended).toBe(true);
    });

    it('rests on the end when there is no picture moment', () => {
      const clock = once();
      clock.play();
      for (let i = 0; i < 20; i++) clock.tick(60);
      expect(clock.timeMs).toBe(1000);
      expect(clock.ended).toBe(true);
    });

    it('never rests past the end of a shortened timeline', () => {
      const clock = once();
      clock.setRest(5000);
      clock.play();
      for (let i = 0; i < 12; i++) clock.tick(100);
      expect(clock.timeMs).toBe(1000);
    });

    it("stops on the picture moment itself on the editor's own play, without playing on (D-164)", () => {
      const clock = once();
      clock.setRest(400);
      clock.play({ untilRest: true });
      const seen: number[] = [];
      for (let i = 0; i < 12; i++) seen.push(clock.tick(60));
      expect(Math.max(...seen)).toBe(400);
      expect(clock.timeMs).toBe(400);
      expect(clock.playing).toBe(false);
      expect(clock.ended).toBe(true);
    });

    it('runs to the end on Play and Replay, then rests on the picture moment (D-164)', () => {
      const clock = once();
      clock.setRest(400);
      clock.play({ untilRest: true });
      for (let i = 0; i < 12; i++) clock.tick(60);
      clock.play();
      const seen: number[] = [];
      for (let i = 0; i < 20; i++) seen.push(clock.tick(60));
      expect(Math.max(...seen)).toBeGreaterThan(900);
      expect(clock.timeMs).toBe(400);
      expect(clock.ended).toBe(true);
    });

    it('plays on to the end once the playhead is taken in hand (D-164)', () => {
      const clock = once();
      clock.setRest(400);
      clock.play({ untilRest: true });
      clock.seek(200);
      for (let i = 0; i < 4; i++) clock.tick(60);
      expect(clock.playing).toBe(true);
      expect(clock.timeMs).toBeCloseTo(440, 6);
    });

    it('stops on the picture moment while the audio clock keeps time, too (D-164)', () => {
      const clock = once();
      clock.setRest(400);
      let audio = 0;
      clock.setAudioMaster(() => audio);
      clock.play({ untilRest: true });
      audio = 380;
      clock.tick(16);
      expect(clock.playing).toBe(true);
      audio = 410;
      clock.tick(16);
      expect(clock.timeMs).toBe(400);
      expect(clock.ended).toBe(true);
    });

    it('stops at the end when the design has no picture moment (D-164)', () => {
      const clock = once();
      clock.play({ untilRest: true });
      for (let i = 0; i < 20; i++) clock.tick(60);
      expect(clock.timeMs).toBe(1000);
      expect(clock.ended).toBe(true);
    });

    it('plays again from the start after it has ended', () => {
      const clock = once();
      clock.setRest(400);
      clock.play();
      for (let i = 0; i < 12; i++) clock.tick(100);
      expect(clock.ended).toBe(true);
      clock.play();
      expect(clock.timeMs).toBe(0);
      expect(clock.ended).toBe(false);
      clock.tick(16);
      expect(clock.timeMs).toBeCloseTo(16, 6);
    });

    it('tells subscribers once when it stops by itself', () => {
      const clock = once();
      clock.play();
      let heard = 0;
      clock.subscribe(() => { heard += 1; });
      for (let i = 0; i < 15; i++) clock.tick(100);
      expect(heard).toBe(1);
    });

    it('is no longer ended once the playhead is moved by hand', () => {
      const clock = once();
      clock.setRest(400);
      clock.play();
      for (let i = 0; i < 12; i++) clock.tick(100);
      clock.seek(400);
      expect(clock.ended).toBe(false);
      clock.play();
      // Resumed from where it was put, not from the start.
      expect(clock.timeMs).toBe(400);
    });

    it('stops at the end even while the audio clock keeps time', () => {
      const clock = once();
      clock.setRest(300);
      clock.setAudioMaster(() => 1200);
      clock.play();
      clock.tick(16);
      expect(clock.timeMs).toBe(300);
      expect(clock.ended).toBe(true);
    });

    it('stops when the audio clock loops back to the start, as the engine does at the end', () => {
      const clock = once();
      clock.setRest(300);
      let audioMs = 900;
      clock.setAudioMaster(() => audioMs);
      clock.play();
      clock.tick(16);
      expect(clock.timeMs).toBe(900);
      // Small steps back are the smoother settling, not the end.
      audioMs = 880;
      clock.tick(16);
      expect(clock.playing).toBe(true);
      audioMs = 20;
      clock.tick(16);
      expect(clock.timeMs).toBe(300);
      expect(clock.ended).toBe(true);
    });

    it('stays on the end of a longer timeline when it ended on the end', () => {
      const clock = once();
      clock.play();
      for (let i = 0; i < 12; i++) clock.tick(100);
      clock.setDuration(2000);
      expect(clock.timeMs).toBe(2000);
    });

    it('moves a resting clock to a new picture moment, so the screen and the export agree', () => {
      const clock = once();
      clock.setRest(400);
      clock.play();
      for (let i = 0; i < 12; i++) clock.tick(100);
      expect(clock.timeMs).toBe(400);
      let heard = 0;
      clock.subscribe(() => { heard += 1; });
      clock.setRest(200);
      expect(clock.timeMs).toBe(200);
      expect(clock.ended).toBe(true);
      expect(heard).toBe(1);
      // The same moment again is no change at all.
      clock.setRest(200);
      expect(heard).toBe(1);
    });

    it('leaves a clock that is not resting where it is when the picture moment changes', () => {
      const clock = once();
      clock.seek(700);
      clock.setRest(300);
      expect(clock.timeMs).toBe(700);
    });

    it('loops again, and forgets it ended, once looping is back on', () => {
      const clock = once();
      clock.play();
      for (let i = 0; i < 12; i++) clock.tick(100);
      clock.setLoop(true);
      expect(clock.ended).toBe(false);
      clock.seek(990);
      clock.play();
      clock.tick(20);
      expect(clock.timeMs).toBeCloseTo(10, 6);
    });
  });

  it('pulls the playhead back in when the duration shrinks beneath it', () => {
    const clock = new PreviewClock(10_000);
    clock.seek(9000);
    clock.setDuration(2000);
    expect(clock.timeMs).toBeLessThanOrEqual(2000);
  });
});
