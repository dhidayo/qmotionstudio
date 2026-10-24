import { clipDurationMs, dbToGain, isLooping } from '@/core/audio/envelope';
import * as actions from '@/document/actions';
import { totalDurationMs } from '@/document/select/timeline';
import { fitClip } from '@/document/select/audio';
import { soundFor } from '@/audio/library';
import { useEditor, useSelectedAudio } from '@/state/store';
import { useMediaRevision, useMediaStore } from '@/ui/media/MediaProvider';
import { Button, EmptyNote, Row, Section, Slider, Toggle } from './controls';
import { isApplePlatform, keysFor, useInputCaps } from '@/ui/shell/platform';

/**
 * The music clip editor (§10's per-clip trim, gain and fades).
 *
 * Trim is absent on purpose, like the overlay panel's timing: dragging the
 * clip's edges on the timeline is how a trim is set, and a pair of number
 * fields saying the same thing is a second source of truth to keep in step.
 *
 * Music can loop (D-156): its section repeats for as long as the clip runs,
 * set here or by dragging the clip's end. A sound from the library keeps its
 * own loop points — the section controls are for the person's own music,
 * where choosing the part that repeats is the point.
 */
export function AudioPanel(): React.JSX.Element {
  const selected = useSelectedAudio();
  const dispatch = useEditor((s) => s.dispatch);
  const selectAudio = useEditor((s) => s.selectAudio);
  const media = useMediaStore();
  useMediaRevision();
  // Above the early return below — hooks run in the same order every render.
  const videoMs = useEditor((state) => totalDurationMs(state.project));
  const playheadMs = useEditor((state) => state.playheadMs);

  if (!selected) {
    return <EmptyNote>That clip is gone. Pick another on the timeline.</EmptyNote>;
  }

  // As it plays: a loop that fits the video is as long as the video now is.
  const clip = fitClip(selected, videoMs);
  const { id } = clip;
  const sound = soundFor(clip.mediaId);
  const effect = sound?.kind === 'effect';
  const looping = isLooping(clip);
  const name = sound?.name ?? media.get(clip.mediaId)?.name ?? clip.mediaId;
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
        <span className="truncate text-[12px] font-semibold">{effect ? 'Sound' : sound ? 'Background music' : 'Music'}</span>
      </div>

      <Section title={effect ? 'Sound' : 'Track'}>
        <p className="truncate text-[12px]">{name}</p>
        {sound && <p className="mt-0.5 text-[11px] text-ink-muted">{sound.blurb}</p>}

        {/*
          * Which section is playing, in clock time. Without this the only
          * indication of *where* in a four-minute track you are is the shape
          * of the waveform, which is not something anyone can read. A library
          * sound plays its own section, so it has nothing to say here.
          */}
        {!sound && (
          <p className="tabular mt-0.5 text-[11px] text-ink-muted">
            {clock(clip.trimStartMs)} – {clock(clip.trimEndMs)}
            {sourceMs !== null && <span className="text-ink-faint"> of {clock(sourceMs)}</span>}
          </p>
        )}
        <p className="tabular mt-0.5 text-[10px] text-ink-faint">
          {(length / 1000).toFixed(1)}s {looping ? 'on the timeline' : 'used'} · video is {(videoMs / 1000).toFixed(1)}s
        </p>

        {overruns && (
          <EmptyNote>
            The music runs past the end of the video. Everything after {clock(videoMs)} is cut
            from the export.
          </EmptyNote>
        )}
        {!decoded && (
          <EmptyNote>
            {sound ? 'Still loading — playback starts when it arrives.' : 'Still decoding — playback starts when it lands.'}
          </EmptyNote>
        )}

        {/* An effect is a moment: it is not fitted to the video or opened out to its whole file. */}
        {!effect && (
          <div className="mt-2 flex gap-1.5">
            <Button
              onClick={() => {
                if (sourceMs !== null) dispatch(actions.fitAudioToProject(id, videoMs, sourceMs));
              }}
              disabled={sourceMs === null || (clip.fitsVideo === true && clip.startMs === 0)}
            >
              Fit to video
            </Button>
            {!sound && (
              <Button
                onClick={() => {
                  if (sourceMs !== null) dispatch(actions.resetAudioTrim(id, sourceMs));
                }}
                disabled={sourceMs === null}
              >
                Use all
              </Button>
            )}
          </div>
        )}

        <EmptyNote>
          <DragHint />
        </EmptyNote>
      </Section>

      {!effect && (
        <Section title="Loop">
          <Toggle
            checked={looping}
            onChange={(on) => { dispatch(actions.setAudioLoop(id, on, sourceMs ?? clip.trimEndMs)); }}
            label="Loop to fill the clip"
          />
          {looping ? (
            <>
              <div className="mt-2">
                {/* In seconds, to a tenth: a length of "30000" says nothing at a glance. */}
                <Slider
                  value={Math.round(length / 100) / 10}
                  min={0.3}
                  max={Math.max(60, Math.ceil(videoMs / 1000), Math.ceil(length / 1000))}
                  step={0.1}
                  onChange={(seconds) => { dispatch(actions.setAudioClipLength(id, seconds * 1000)); }}
                  label="Length on timeline"
                  suffix="s"
                />
              </div>
              <EmptyNote>
                {clip.fitsVideo === true
                  ? 'Runs to the end of the video, and follows it as scenes are added or removed. Setting a length here, or dragging the end, fixes it.'
                  : 'Repeats its section for as long as the clip runs. Drag the clip’s end on the timeline, or set the length here.'}
              </EmptyNote>
            </>
          ) : (
            <EmptyNote>Repeats the section for as long as the clip runs, so it can be drawn out past the end of the track.</EmptyNote>
          )}
        </Section>
      )}

      {/* The person's own music: which part plays, or which part repeats. */}
      {sourceMs !== null && !sound && (
        <Section title={looping ? 'Loop section' : 'Section of the track'}>
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
            value={clip.trimEndMs - clip.trimStartMs}
            min={300}
            max={Math.max(300, sourceMs - clip.trimStartMs)}
            step={100}
            onChange={(next) => { dispatch(actions.setAudioLength(id, next, sourceMs)); }}
            label={looping ? 'Section length' : 'Length used'}
            suffix=""
          />
          <p className="tabular -mt-1 text-[10px] text-ink-faint">
            {((clip.trimEndMs - clip.trimStartMs) / 1000).toFixed(1)}s — ends at {clock(clip.trimEndMs)}
          </p>
        </Section>
      )}

      <Section title="Cut">
        <EmptyNote>
          Splits this clip at the playhead. Split twice and remove the middle piece to take a
          section out of the {effect ? 'sound' : 'music'}.
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
            {effect ? 'Remove sound' : 'Remove music'}
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

/**
 * How to work the clip on the timeline, in this device's keys (D-161): ⌥ and
 * ⇧ on a Mac, Alt and Shift elsewhere, and no keys at all on a touch screen.
 */
function DragHint(): React.JSX.Element {
  const caps = useInputCaps();
  if (!caps.keyboard) return <>Drag the clip to move it, its edges to trim.</>;
  const keys = keysFor(isApplePlatform());
  return <>Drag the clip to move it, its edges to trim. Hold {keys.alt} and drag to slip. {keys.shift} turns off snapping.</>;
}
