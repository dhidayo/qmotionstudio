import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { AudioClip } from '@/document/types';
import type { PreviewClock } from '@/core/time/clock';
import type { MediaStore } from '@/media/store';
import { AudioEngine } from './AudioEngine';

/**
 * Keeps the audio engine in step with the transport (§10).
 *
 * Web Audio cannot move a source once it has started, so every play, pause and
 * seek tears the graph down and reschedules it. That sounds wasteful and is
 * not: a project has one music track (§10), and rebuilding two or three nodes
 * costs far less than the bookkeeping needed to avoid it.
 *
 * The engine also becomes the clock's master while it is sounding (D-054), so
 * the visual loop draws whatever time the audio device says it is rather than
 * accumulating its own.
 */
export function useAudioPlayback(
  clock: PreviewClock,
  clips: readonly AudioClip[],
  media: MediaStore,
  durationMs: number,
): void {
  const engine = useMemo(() => new AudioEngine(), []);

  /*
   * Decoded buffers land asynchronously, so a track added before its decode
   * finishes has to start playing once it arrives.
   *
   * Subscribed to the store passed in, not to the one in context: AppShell
   * *renders* the MediaProvider rather than sitting inside it, so a context
   * read here throws before the editor has drawn a single frame.
   */
  const revision = useSyncExternalStore(media.subscribe, media.getRevision, media.getRevision);

  /*
   * Read inside the subscription without making the subscription depend on
   * them — resubscribing on every playhead movement would defeat the point.
   * Written in an effect rather than during render, because a ref mutated
   * mid-render is not something React guarantees anything about.
   */
  const latest = useRef({ clips, media, durationMs });
  useEffect(() => {
    latest.current = { clips, media, durationMs };
  }, [clips, media, durationMs]);

  useEffect(() => {
    clock.setAudioMaster(() => engine.currentProjectMs());
    return () => { clock.setAudioMaster(null); };
  }, [clock, engine]);

  useEffect(() => {
    const sync = (): void => {
      const { clips: current, media: store, durationMs: total } = latest.current;

      if (!clock.playing || current.length === 0) {
        engine.stop();
        return;
      }

      void engine.play(current, store, { fromMs: clock.timeMs, durationMs: total })
        .catch((error: unknown) => {
          // §16. The commonest cause is a context the browser will not resume
          // without a gesture, which is worth saying rather than leaving as
          // silent playback.
          console.error('Could not start audio playback.', error);
        });
    };

    const unsubscribe = clock.subscribe(sync);
    sync();
    return () => {
      unsubscribe();
      engine.stop();
    };
    // `revision` is a dependency on purpose: a newly decoded track has to be
    // picked up, and `clips` because retiming or refading one must be heard.
  }, [clock, engine, clips, revision]);

  useEffect(() => () => { void engine.dispose(); }, [engine]);
}
