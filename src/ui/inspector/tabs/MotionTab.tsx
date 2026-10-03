import * as actions from '@/document/actions';
import { LOGO_KEY, NO_TUNING, type MotionFeel, type MotionTuning } from '@/document/types';
import { useEditor } from '@/state/store';
import { sceneLengthMs } from '@/document/select/timeline';
import type { SceneTemplate } from '@/templates/schema';
import { ElementEffectsEditor, SceneEffectsEditor } from '@/ui/effects/EffectEditors';
import { Button, EmptyNote, Row, Section, Segmented, Slider } from '../controls';
import { SlotKeyframes } from '../SlotKeyframes';

/**
 * Motion: how the design moves, and what happens on top of it (D-102, D-100).
 *
 * Three things, from the particular to the general, because that is the
 * order people reach for them in:
 *
 *   1. the element they have selected — how strongly its own animation plays,
 *      and effects as it enters, while it is on screen, and as it leaves;
 *   2. the whole scene's motion — speed, strength and feel;
 *   3. the scene's effects — weather, light, camera, looks.
 *
 * Nothing here is template-specific, so every design in the library has all
 * of it, including designs not written yet.
 */

const FEELS: readonly { value: MotionFeel; label: string }[] = [
  { value: 'template', label: 'As designed' },
  { value: 'smooth', label: 'Smooth' },
  { value: 'gentle', label: 'Gentle' },
  { value: 'snappy', label: 'Snappy' },
  { value: 'bouncy', label: 'Bouncy' },
  { value: 'linear', label: 'Even' },
];

export function slotLabel(key: string, template: SceneTemplate | null): string {
  const photo = /^photo:(\d+)$/.exec(key);
  if (photo) return `photo ${Number(photo[1]) + 1}`;
  const text = /^text:(.+)$/.exec(key);
  if (text) {
    const def = template?.textSlots.find((slot) => slot.id === text[1]);
    return def ? `the ${def.label.toLowerCase()}` : 'this text';
  }
  return 'this element';
}

export function MotionTab({ template }: { template: SceneTemplate | null }): React.JSX.Element {
  const scene = useEditor((s) => s.project.scenes[s.selectedScene]);
  const selectedSlot = useEditor((s) => s.selectedSlot);
  const selectedLogo = useEditor((s) => s.selectedLogo);

  if (!scene) return <EmptyNote>No scene.</EmptyNote>;

  return (
    <div>
      {selectedSlot !== null ? (
        <SelectedElement slotKey={selectedSlot} label={slotLabel(selectedSlot, template)} />
      ) : selectedLogo && scene.inputs.logo.mediaId !== null ? (
        <Section title="The logo">
          <ElementEffectsEditor
            target={{ kind: 'logo' }}
            label="the logo"
            effects={scene.inputs.elementEffects?.[LOGO_KEY] ?? []}
          />
        </Section>
      ) : (
        <Section title="An element">
          <EmptyNote>
            Click a photo, some text or the logo on the canvas to tune its own motion and give it entrance, exit
            and emphasis effects.
          </EmptyNote>
        </Section>
      )}

      <SceneMotion />

      <Section title="Scene effects">
        <SceneEffectsEditor />
      </Section>
    </div>
  );
}

function TuningControls({
  tuning,
  onChange,
  onReset,
  resetLabel,
}: {
  tuning: MotionTuning;
  onChange: (patch: Partial<MotionTuning>) => void;
  onReset: (() => void) | null;
  resetLabel: string;
}): React.JSX.Element {
  return (
    <>
      <Slider
        label="Motion strength"
        value={Math.round(tuning.strength * 100)}
        min={0}
        max={250}
        step={5}
        suffix="%"
        onChange={(pct) => { onChange({ strength: pct / 100 }); }}
      />
      <p className="-mt-1.5 mb-2.5 text-[10px] text-ink-faint">
        How far things move, zoom and turn. 100% is the design as made; 0% holds still.
      </p>
      <Segmented
        label="Feel"
        value={tuning.feel}
        columns={3}
        options={FEELS}
        onChange={(feel) => { onChange({ feel }); }}
      />
      {onReset && (
        <div className="flex">
          <Button onClick={onReset}>{resetLabel}</Button>
        </div>
      )}
    </>
  );
}

function SelectedElement({ slotKey, label }: { slotKey: string; label: string }): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const own = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.slotMotion?.[slotKey]);
  const sceneTuning = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.motion) ?? NO_TUNING;
  const effects = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.elementEffects?.[slotKey]) ?? [];
  const title = label.charAt(0).toUpperCase() + label.slice(1);

  return (
    <>
      {/* Where it travels — the same control as in Photos and Text, so all of
          an element's motion can be found in one place. */}
      <SlotKeyframes slotKey={slotKey} />
      <Section title={`${title} — motion`}>
        <TuningControls
          tuning={own ?? sceneTuning}
          onChange={(patch) => { dispatch(actions.setSlotMotion(slotKey, patch)); }}
          onReset={own ? () => { dispatch(actions.setSlotMotion(slotKey, null)); } : null}
          resetLabel="Follow the scene"
        />
      </Section>
      <Section title={`${title} — effects`}>
        <ElementEffectsEditor target={{ kind: 'slot', key: slotKey }} label={label} effects={effects} />
      </Section>
    </>
  );
}

function SceneMotion(): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const look = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.look);
  const motion = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.motion);
  const playsMs = useEditor((s) => {
    const scene = s.project.scenes[s.selectedScene];
    return scene ? sceneLengthMs(scene) : 0;
  });
  const endInteraction = useEditor((s) => s.endInteraction);

  return (
    <Section title="Whole scene — motion">
      {look && (
        <Row label="Speed" hint={`${look.speed.toFixed(2)}× · plays in ${(playsMs / 1000).toFixed(1)}s`}>
          <input
            type="range"
            min={25}
            max={300}
            value={Math.round(look.speed * 100)}
            aria-label="Speed"
            onChange={(e) => { dispatch(actions.setSpeed(Number(e.target.value) / 100)); }}
            onPointerUp={endInteraction}
            className="h-1 w-full accent-[var(--c-accent)]"
          />
        </Row>
      )}
      <TuningControls
        tuning={motion ?? NO_TUNING}
        onChange={(patch) => { dispatch(actions.setSceneMotion(patch)); }}
        onReset={motion ? () => { dispatch(actions.setSceneMotion(null)); } : null}
        resetLabel="Back to the design"
      />
    </Section>
  );
}
