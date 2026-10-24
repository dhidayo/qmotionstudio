import { useEffect } from 'react';
import type { AnimPreset, CustomMediaContent, TextStyle } from '@/document/types';
import { dbToGain } from '@/core/audio/envelope';
import { VIDEO_VOLUME_MAX_DB, VIDEO_VOLUME_MIN_DB, videoVolumeDb } from '@/document/select/videoSound';
import * as actions from '@/document/actions';
import { ANIM_PRESETS } from '@/core/render/overlays';
import { useEditor, useSelectedOverlay } from '@/state/store';
import { isAnimated, poseAt } from '@/document/select/overlay';
import { Keyframes } from './Keyframes';
import { ElementEffectsEditor } from '@/ui/effects/EffectEditors';
import { useMediaRevision, useMediaStore } from '@/ui/media/MediaProvider';
import { Button, ColorField, EmptyNote, Row, Section, Segmented, Slider, TextInput, Toggle } from './controls';
import { useLayout } from '@/ui/shell/useLayout';
import { useOverlays } from '@/ui/shell/overlays';
import { ELEMENT_SECTIONS, overlayName, overlayThis } from '@/ui/editing/commands';
import { FontPicker } from './FontPicker';
import { CounterSection, ShapeSection, StickerSection } from './ElementSections';

/**
 * The overlay editor (§1.2, §3C).
 *
 * An overlay is not a scene, so it does not fit the four tabs of §1.3 — it has
 * no photo slots, no template text slots and no look. Rather than add a fifth
 * tab that is empty most of the time, the inspector shows this panel *instead*
 * of the tabs while a clip is selected, and the way back is one button.
 *
 * Timing is deliberately absent: dragging the clip is how you set when an
 * overlay runs, and a pair of number fields saying the same thing is a second
 * source of truth to keep in step.
 */
const PRESET_LABELS: Record<AnimPreset, string> = {
  none: 'None',
  fade: 'Fade',
  riseIn: 'Rise',
  popIn: 'Pop',
  slideIn: 'Slide',
  wipeIn: 'Wipe',
};

export function OverlayPanel(): React.JSX.Element {
  const overlay = useSelectedOverlay();
  const dispatch = useEditor((s) => s.dispatch);
  const selectOverlay = useEditor((s) => s.selectOverlay);
  // Above the early return below — hooks run in the same order every render.
  const playheadMs = useEditor((s) => s.playheadMs);
  const phone = useLayout() === 'phone';

  // An element's own settings, asked for from the picture (D-158): its section, in view.
  const focus = useOverlays((o) => o.inspectorSection);
  useEffect(() => {
    if (focus === null || !(Object.values(ELEMENT_SECTIONS) as readonly string[]).includes(focus)) return;
    document.querySelector(`[data-section="${focus}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    useOverlays.getState().focusInspectorSection(null);
  }, [focus]);

  if (!overlay) {
    return <EmptyNote>That overlay is gone. Pick another clip on the timeline.</EmptyNote>;
  }

  const { id } = overlay;

  /*
   * Keyframe times are in the overlay's own time, like every other layer time
   * in §6.1 — so a clip dragged along the timeline takes its motion with it
   * rather than having it re-interpreted against the project clock.
   */
  const localMs = Math.round(playheadMs - overlay.startMs);
  const animated = isAnimated(overlay);
  /*
   * On an animated overlay the sliders edit the pose under the playhead, the
   * same as dragging does.
   *
   * They used to read and write `transform`, which is the *resting* placement
   * and is ignored entirely while a path exists — so they showed a stale
   * number and moving one appeared to do nothing at all. Two ways of saying
   * the same thing have to say it to the same place.
   */
  const transform = animated ? poseAt(overlay, localMs) : overlay.transform;
  const set = (patch: Parameters<typeof actions.setOverlayTransform>[1]): void => {
    dispatch(
      animated
        ? actions.setOverlayPose(id, localMs, patch)
        : actions.setOverlayTransform(id, patch),
    );
  };

  return (
    <>
      {/* A phone's toolbar says what is selected and has its own Done (D-109). */}
      {!phone && <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => { selectOverlay(null); }}
          className="rounded-md border border-edge px-2 py-1 text-[11px] text-ink-muted hover:bg-panel-alt"
        >
          ← Scene
        </button>
        <span className="truncate text-[12px] font-semibold">
          {overlayName(overlay)}
        </span>
      </div>}

      {overlay.content.kind === 'text' && (
        <Section title="Content">
          <Row label="Text">
            <TextInput
              value={overlay.content.text}
              onChange={(text) => { dispatch(actions.setOverlayText(id, text)); }}
              label="Overlay text"
              placeholder="Say something"
              maxLength={120}
              multiline
            />
          </Row>
          <TextStyleControls id={id} style={overlay.content.style} />
        </Section>
      )}

      {overlay.content.kind === 'shape' && <ShapeSection overlay={overlay} content={overlay.content} />}
      {overlay.content.kind === 'sticker' && <StickerSection overlay={overlay} content={overlay.content} />}
      {overlay.content.kind === 'counter' && (
        <CounterSection overlay={overlay} content={overlay.content}>
          <TextStyleControls id={id} style={overlay.content.style} number />
        </CounterSection>
      )}

      {(overlay.content.kind === 'photo' || overlay.content.kind === 'customMedia') && (
        <Section title="Source">
          {/* An overlay can only be pointed at media of its own kind: a photo
              overlay draws bitmaps and a custom-media one draws decoded video
              frames, and crossing them yields an element that never appears. */}
          <MediaPicker
            id={id}
            kind={overlay.content.kind === 'photo' ? 'image' : 'video'}
            current={overlay.content.mediaId}
          />
        </Section>
      )}
      {overlay.content.kind === 'customMedia' && <VideoSound id={id} content={overlay.content} />}

      <Keyframes overlay={overlay} />

      <Section title="Placement">
        {/* Normalised, so an overlay stays where it was put when the aspect
            changes (D-044). Percentages are what the user sees. */}
        <Slider
          value={Math.round((transform.x ?? 0.5) * 100)}
          min={0}
          max={100}
          onChange={(v) => { set({ x: v / 100 }); }}
          label="Across"
          suffix="%"
        />
        <Slider
          value={Math.round((transform.y ?? 0.5) * 100)}
          min={0}
          max={100}
          onChange={(v) => { set({ y: v / 100 }); }}
          label="Down"
          suffix="%"
        />
        <Slider
          value={Math.round((transform.scaleX ?? 1) * 100)}
          min={20}
          max={600}
          onChange={(v) => { set({ scaleX: v / 100, scaleY: v / 100 }); }}
          label="Size"
          suffix="%"
        />
        <Slider
          value={Math.round(transform.rotation ?? 0)}
          min={-180}
          max={180}
          onChange={(v) => { set({ rotation: v }); }}
          label="Rotation"
          suffix="°"
        />
        <Slider
          value={Math.round((transform.opacity ?? 1) * 100)}
          min={0}
          max={100}
          onChange={(v) => { set({ opacity: v / 100 }); }}
          label="Opacity"
          suffix="%"
        />
      </Section>

      <Section title="Entrance and exit">
        <Segmented
          value={overlay.enterAnim}
          options={ANIM_PRESETS.map((p) => ({ value: p, label: PRESET_LABELS[p] }))}
          onChange={(preset) => { dispatch(actions.setOverlayAnim(id, 'enter', preset)); }}
          label="Entrance"
          columns={3}
        />
        <Segmented
          value={overlay.exitAnim}
          options={ANIM_PRESETS.map((p) => ({ value: p, label: PRESET_LABELS[p] }))}
          onChange={(preset) => { dispatch(actions.setOverlayAnim(id, 'exit', preset)); }}
          label="Exit"
          columns={3}
        />
      </Section>

      <Section title="Effects">
        <ElementEffectsEditor
          target={{ kind: 'overlay', id }}
          label={overlayThis(overlay)}
          effects={overlay.effects ?? []}
        />
      </Section>

      <Section title="Arrange">
        <div className="flex gap-1.5">
          <Button onClick={() => { dispatch(actions.arrangeOverlay(id, 'front')); }}>
            Bring to front
          </Button>
          <Button onClick={() => { dispatch(actions.arrangeOverlay(id, 'back')); }}>
            Send to back
          </Button>
        </div>
        <Row label="Layer" hint={`L${overlay.track + 1}`}>
          <div className="flex gap-1.5">
            <Button onClick={() => { dispatch(actions.moveOverlayLayer(id, -1)); }} disabled={overlay.track === 0}>
              Down a layer
            </Button>
            <Button onClick={() => { dispatch(actions.moveOverlayLayer(id, 1)); }}>
              Up a layer
            </Button>
          </div>
        </Row>
        <EmptyNote>
          Higher layers draw in front. You can also drag the clip up or down on the timeline.
        </EmptyNote>
      </Section>

      <Section>
        <div className="flex gap-1.5">
          <Button
            variant="danger"
            onClick={() => { dispatch(actions.removeOverlay(id)); selectOverlay(null); }}
          >
            Delete layer (⌫)
          </Button>
        </div>
      </Section>
    </>
  );
}

/**
 * The media this overlay can point at, of its own kind.
 *
 * Video shows its length too: a clip shorter than the overlay loops (D-051),
 * and knowing which is which is the difference between a deliberate loop and
 * an apparent stutter.
 */
/**
 * A video layer's sound (D-163): "uploaded video should have volume control
 * on the setting where I can reduce, increase or mute sound of the videos."
 *
 * A Mute switch and a Volume slider from −40 dB to +6 dB, with the level it
 * comes to as a percentage of the recording beside it, so 0 dB reads plainly
 * as "as recorded". A drag is one undo step, like a music clip's volume. A
 * video with no sound track says so rather than offering controls that would
 * do nothing.
 */
function VideoSound({ id, content }: { id: string; content: CustomMediaContent }): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const media = useMediaStore();
  useMediaRevision();
  const decoded = media.has(content.mediaId);
  const hasSound = media.hasSound(content.mediaId);
  const muted = content.muted === true;
  const db = videoVolumeDb(content);
  const percent = Math.round(dbToGain(db) * 100);
  return (
    <Section title="Sound">
      <div data-video-sound={hasSound ? (muted ? 'muted' : 'on') : 'none'}>
        {!decoded ? (
          <p className="text-[11px] text-ink-faint">Reading this video…</p>
        ) : !hasSound ? (
          <p className="text-[11px] text-ink-muted">This video has no sound.</p>
        ) : (
          <>
            <Toggle checked={muted} onChange={(on) => { dispatch(actions.setVideoMuted(id, on)); }} label="Mute" />
            <div className="mt-2" style={muted ? { opacity: 0.5 } : undefined}>
              <Slider
                value={db}
                min={VIDEO_VOLUME_MIN_DB}
                max={VIDEO_VOLUME_MAX_DB}
                step={1}
                onChange={(next) => { dispatch(actions.setVideoVolume(id, next)); }}
                label="Volume"
                suffix=" dB"
              />
            </div>
            <p className="mt-1 text-[10px] text-ink-faint" data-video-volume-note>
              {muted
                ? 'Muted: this video plays silently, in the preview and the export.'
                : db === 0
                  ? '0 dB plays it as recorded.'
                  : `${percent}% of the recorded level. 0 dB plays it as recorded.`}
            </p>
          </>
        )}
      </div>
    </Section>
  );
}

function MediaPicker({
  id,
  kind,
  current,
}: {
  id: string;
  kind: 'image' | 'video';
  current: string;
}): React.JSX.Element {
  const media = useMediaStore();
  useMediaRevision();
  const dispatch = useEditor((s) => s.dispatch);
  const ids = media.ids(kind);

  if (ids.length === 0) {
    return (
      <EmptyNote>
        {kind === 'video'
          ? 'No clips loaded. Use “+ Video” on the timeline to add one.'
          : 'No photos loaded. Add some in the Photos tab first.'}
      </EmptyNote>
    );
  }

  return (
    <Segmented
      value={current}
      options={ids.map((mediaId) => {
        const name = media.get(mediaId)?.name ?? mediaId;
        const durationMs = media.durationMsOf(mediaId);
        return {
          value: mediaId,
          label: durationMs === null ? name : `${name} · ${(durationMs / 1000).toFixed(1)}s`,
        };
      })}
      onChange={(mediaId) => { dispatch(actions.setOverlayMedia(id, mediaId)); }}
      label={kind === 'video' ? 'Clip' : 'Photo'}
      columns={1}
    />
  );
}

/**
 * The subset of §8.2's text block that means something without a template slot.
 * A `number` (D-158) never wraps, and its size reads as the number's.
 */
export function TextStyleControls({ id, style, number = false }: { id: string; style: TextStyle; number?: boolean }): React.JSX.Element {
  // No colour of its own means the look's ink: show that, not white (D-121's light looks).
  const ink = useEditor((st) => st.project.scenes[st.selectedScene]?.inputs.look.palette.ink ?? '#ffffff');
  const dispatch = useEditor((s) => s.dispatch);
  const patch = (fields: Partial<TextStyle>, options?: { coalesceKey?: string }): void => {
    dispatch(actions.setOverlayTextStyle(id, fields, {
      ...(options?.coalesceKey === undefined ? {} : { coalesceKey: options.coalesceKey }),
    }));
  };

  return (
    <>
      <FontPicker value={style.fontId} onChange={(fontId) => { patch({ fontId }); }} />
      <Segmented
        value={style.weight}
        options={([400, 500, 600, 700, 800] as const).map((w) => ({ value: w, label: String(w) }))}
        onChange={(weight) => { patch({ weight }); }}
        label="Weight"
      />
      <Segmented
        value={style.align}
        options={[
          { value: 'left' as const, label: 'Left' },
          { value: 'center' as const, label: 'Centre' },
          { value: 'right' as const, label: 'Right' },
        ]}
        onChange={(align) => { patch({ align }); }}
        label="Alignment"
      />
      <Slider
        value={style.sizePct}
        min={40}
        max={260}
        onChange={(sizePct) => { patch({ sizePct }, { coalesceKey: `overlaySize:${id}` }); }}
        // Distinct from the Placement section's own "Size": one sets the type
        // size, the other scales the whole overlay, and a screen reader that
        // announced both as "Size" would make them indistinguishable.
        label={number ? 'Number size' : 'Text size'}
        suffix="%"
      />
      <Row label="Colour">
        <ColorField
          value={style.color.length > 0 ? style.color : ink}
          onChange={(color) => { patch({ color }, { coalesceKey: `overlayColor:${id}` }); }}
          label={number ? 'Number colour' : 'Text colour'}
        />
      </Row>
      <div className="mt-1.5 grid grid-cols-2 gap-1">
        {!number && <Toggle checked={style.wrap} onChange={(wrap) => { patch({ wrap }); }} label="Wrap" />}
        <Toggle checked={style.shadow} onChange={(shadow) => { patch({ shadow }); }} label="Shadow" />
        <Toggle checked={style.outline} onChange={(outline) => { patch({ outline }); }} label="Outline" />
        <Toggle checked={style.pill} onChange={(pill) => { patch({ pill }); }} label="Pill" />
      </div>
    </>
  );
}
