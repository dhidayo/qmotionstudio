import { clipDurationMs, dbToGain } from '@/core/audio/envelope';
import * as actions from '@/document/actions';
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

  if (!clip) {
    return <EmptyNote>That clip is gone. Pick another on the timeline.</EmptyNote>;
  }

  const { id } = clip;
  const name = media.get(clip.mediaId)?.name ?? clip.mediaId;
  const sourceMs = media.durationMsOf(clip.mediaId);
  const length = clipDurationMs(clip);
  const decoded = media.getAudioBuffer(clip.mediaId) !== null;

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
        <p className="tabular mt-0.5 text-[10px] text-ink-faint">
          {(length / 1000).toFixed(1)}s used
          {sourceMs !== null && ` of ${(sourceMs / 1000).toFixed(1)}s`}
        </p>
        {!decoded && <EmptyNote>Still decoding — playback starts when it lands.</EmptyNote>}
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
