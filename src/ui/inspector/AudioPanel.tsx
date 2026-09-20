import { clipDurationMs, dbToGain } from '@/core/audio/envelope';
import * as actions from '@/document/actions';
import { totalDurationMs } from '@/document/select/timeline';
import { useEditor, useSelectedAudio } from '@/state/store';
import { useMediaRevision, useMediaStore } from '@/ui/media/MediaProvider';
import { Button, EmptyNote, Row, Section, Slider } from './controls';

/**
 * The music clip editor (§10's per-clip trim, gain and fades).
 *
 * Trim is absent on purpose, like the overlay panel's timing: dragging the
 * clip's edges on the timeline is how a trim is set, and a pair of number
 * fields saying the same thing is a second source of truth to keep in step.
 */
export function AudioPanel(): React.JSX.Element {
  const clip = useSelectedAudio();
  const dispatch = useEditor((s) => s.dispatch);
  const selectAudio = useEditor((s) => s.selectAudio);
  const media = useMediaStore();
  useMediaRevision();
  // Above the early return below — hooks run in the same order every render.
  const videoMs = useEditor((state) => totalDurationMs(state.project));
  const playheadMs = useEditor((state) => state.playheadMs);

  if (!clip) {
    return <EmptyNote>That clip is gone. Pick another on the timeline.</EmptyNote>;
  }

  const { id } = clip;
  const name = media.get(clip.mediaId)?.name ?? clip.mediaId;
  const sourceMs = media.durationMsOf(clip.mediaId);
  const length = clipDurationMs(clip);
  const decoded = media.getAudioBuffer(clip.mediaId) !== null;
  const overruns = clip.startMs + length > videoMs + 1;
  // A split needs room on both sides, or it produces a clip too small to grab.
  const splittable =
    playheadMs > clip.startMs + 300 && playheadMs < clip.startMs + length - 300;

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => { selectAudio(null); }}
          className="rounded-md border border-edge px-2 py-1 text-[11px] text-ink-muted hover:bg-panel-alt"
        >
          ← Scene
        </button>
        <span className="truncate text-[12px] font-semibold">Music</span>
      </div>

      <Section title="Track">
        <p className="truncate text-[12px]">{name}</p>

        {/*
          * Which section is playing, in clock time. Without this the only
          * indication of *where* in a four-minute track you are is the shape
          * of the waveform, which is not something anyone can read.
          */}
        <p className="tabular mt-0.5 text-[11px] text-ink-muted">
          {clock(clip.trimStartMs)} – {clock(clip.trimEndMs)}
          {sourceMs !== null && <span className="text-ink-faint"> of {clock(sourceMs)}</span>}
        </p>
        <p className="tabular mt-0.5 text-[10px] text-ink-faint">
          {(length / 1000).toFixed(1)}s used · video is {(videoMs / 1000).toFixed(1)}s
        </p>

        {overruns && (
          <EmptyNote>
            The music runs past the end of the video. Everything after {clock(videoMs)} is cut
            from the export.
          </EmptyNote>
        )}
        {!decoded && <EmptyNote>Still decoding — playback starts when it lands.</EmptyNote>}

        <div className="mt-2 flex gap-1.5">
          <Button
            onClick={() => {
              if (sourceMs !== null) dispatch(actions.fitAudioToProject(id, videoMs, sourceMs));
            }}
            disabled={sourceMs === null}
          >
            Fit to video
          </Button>
          <Button
            onClick={() => {
              if (sourceMs !== null) dispatch(actions.resetAudioTrim(id, sourceMs));
            }}
            disabled={sourceMs === null}
          >
            Use all
          </Button>
        </div>

        <EmptyNote>
          Drag the clip to move it, its edges to trim. Hold ⌥ and drag to slip. ⇧ turns off
          snapping.
        </EmptyNote>
      </Section>

      {sourceMs !== null && (
        <Section title="Section of the track">
          {/*
            * Absolute, and spanning the whole track — which dragging cannot do.
            * A slip drag maps pixels against the lane, so on a fifteen-second
            * lane the entire width is fifteen seconds of slip and reaching 1:30
            * in a three-minute track would take six full drags. This is how you
            * say "start at 1:30" and mean it.
            */}
          <Slider
            value={clip.trimStartMs}
            min={0}
            max={Math.max(0, sourceMs - length)}
            step={100}
            onChange={(startAt) => { dispatch(actions.setAudioSection(id, startAt, sourceMs)); }}
            label="Start from"
            suffix=""
          />
          <p className="tabular -mt-1 mb-2 text-[10px] text-ink-faint">
            {clock(clip.trimStartMs)} into the track
          </p>

          <Slider
            value={length}
            min={300}
            max={Math.max(300, sourceMs - clip.trimStartMs)}
            step={100}
            onChange={(next) => { dispatch(actions.setAudioLength(id, next, sourceMs)); }}
            label="Length used"
            suffix=""
          />
          <p className="tabular -mt-1 text-[10px] text-ink-faint">
            {(length / 1000).toFixed(1)}s — ends at {clock(clip.trimEndMs)}
          </p>
        </Section>
      )}

      <Section title="Cut">
        <EmptyNote>
          Splits this clip at the playhead. Split twice and remove the middle piece to take a
          section out of the music.
        </EmptyNote>
        <div className="mt-2 flex gap-1.5">
          <Button
            onClick={() => { dispatch(actions.splitAudio(id, playheadMs)); }}
            disabled={!splittable}
          >
            Split at playhead
          </Button>
        </div>
        {!splittable && (
          <EmptyNote>Move the playhead inside this clip to split it.</EmptyNote>
        )}
      </Section>

      <Section title="Level">
        {/*
          * Decibels, not a percentage. §10 specifies gain in dB and it is the
          * unit the scale actually behaves in: −6dB is half the amplitude
          * wherever you are on the slider, which "50%" is not.
          */}
        <Slider
          value={clip.gainDb}
          min={-40}
          max={12}
          step={1}
          onChange={(gainDb) => { dispatch(actions.setAudioGain(id, gainDb)); }}
          label="Volume"
          suffix=" dB"
        />
        <Row label="Effective gain" hint={`${(dbToGain(clip.gainDb) * 100).toFixed(0)}%`}>
          <span className="sr-only">{`${(dbToGain(clip.gainDb) * 100).toFixed(0)} percent`}</span>
        </Row>
      </Section>

      <Section title="Fades">
        <Slider
          value={clip.fadeInMs}
          min={0}
          max={8_000}
          step={100}
          onChange={(fadeInMs) => { dispatch(actions.setAudioFades(id, { fadeInMs })); }}
          label="Fade in"
          suffix=" ms"
        />
        <Slider
          value={clip.fadeOutMs}
          min={0}
          max={8_000}
          step={100}
          onChange={(fadeOutMs) => { dispatch(actions.setAudioFades(id, { fadeOutMs })); }}
          label="Fade out"
          suffix=" ms"
        />
        {clip.fadeInMs + clip.fadeOutMs > length && (
          <EmptyNote>
            Longer than the clip — both are scaled down in proportion so each stays audible.
          </EmptyNote>
        )}
      </Section>

      <Section>
        <div className="flex gap-1.5">
          <Button
            variant="danger"
            onClick={() => { dispatch(actions.removeAudio(id)); selectAudio(null); }}
          >
            Remove music
          </Button>
        </div>
      </Section>
    </>
  );
}

/** mm:ss, because "142.4s" is not a place in a song. */
function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
