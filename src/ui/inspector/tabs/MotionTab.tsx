import * as actions from '@/document/actions';
import { LOGO_KEY, NO_TUNING, type MotionFeel, type MotionTuning } from '@/document/types';
import { useEditor } from '@/state/store';
import { sceneLengthMs } from '@/document/select/timeline';
import type { SceneTemplate } from '@/templates/schema';
import { ElementEffectsEditor, SceneEffectsEditor } from '@/ui/effects/EffectEditors';
import { Button, EmptyNote, Row, Section, Segmented, Slider } from '../controls';
import { SlotKeyframes } from '../SlotKeyframes';

/**
 * Effects (D-132; "Motion" before it): "I'm not sure what motion does on the
 * app… if you have to rethink the concept, please do."
 *
 * One word for one idea, the same word as the Effects button under the
 * picture, and the three things in it in the order people reach for them:
 *
 *   1. effects on this scene — snow, light, a camera shake, a film look;
 *   2. the photo or text picked on the canvas — how it comes in, what it does
 *      while it is there, how it leaves, and how much it moves;
 *   3. speed and movement for the whole scene, in plain words.
 *
 * Each is a navy section that folds (D-131). Nothing here is template-specific,
 * so every design has all of it.
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
      <p className="mb-3 text-[11px] leading-relaxed text-ink-muted">
        Bring the scene to life with an effect, or pick a photo or some text on the canvas to make it fly in, pulse
        or leave in style.
      </p>

      <Section title="Effects on this scene">
        <SceneEffectsEditor />
      </Section>

      {selectedSlot !== null ? (
        <SelectedElement slotKey={selectedSlot} label={slotLabel(selectedSlot, template)} name={slotName(selectedSlot, template)} />
      ) : selectedLogo && scene.inputs.logo.mediaId !== null ? (
        <Section title="Logo — entrance, exit and emphasis">
          <ElementEffectsEditor
            target={{ kind: 'logo' }}
            label="the logo"
            effects={scene.inputs.elementEffects?.[LOGO_KEY] ?? []}
          />
        </Section>
      ) : (
        <Section title="A photo or text">
          <EmptyNote>
            Click a photo, some text or the logo on the canvas. Then give it an entrance — spin in, slide up — an
            effect while it is on screen, and an exit.
          </EmptyNote>
        </Section>
      )}

      <SceneMotion />
    </div>
  );
}

/** What a picked element is called on its section bar: "Photo 2", "Headline", "Logo". */
function slotName(key: string, template: SceneTemplate | null): string {
  const photo = /^photo:(\d+)$/.exec(key);
  if (photo) return `Photo ${Number(photo[1]) + 1}`;
  const text = /^text:(.+)$/.exec(key);
  if (text) return template?.textSlots.find((slot) => slot.id === text[1])?.label ?? 'This text';
  return 'This element';
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
        label="How much it moves"
        value={Math.round(tuning.strength * 100)}
        min={0}
        max={250}
        step={5}
        suffix="%"
        onChange={(pct) => { onChange({ strength: pct / 100 }); }}
      />
      <p className="-mt-1.5 mb-2.5 text-[10px] text-ink-faint">
        How far things travel, zoom and turn. 100% is the design as made; 0% holds still; more is bolder.
      </p>
      <Segmented
        label="Movement style"
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

function SelectedElement({ slotKey, label, name }: { slotKey: string; label: string; name: string }): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const own = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.slotMotion?.[slotKey]);
  const sceneTuning = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.motion) ?? NO_TUNING;
  const effects = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.elementEffects?.[slotKey]) ?? [];

  return (
    <>
      <Section title={`${name} — entrance, exit and emphasis`}>
        <ElementEffectsEditor target={{ kind: 'slot', key: slotKey }} label={label} effects={effects} />
      </Section>
      <Section title={`${name} — how it moves`}>
        <TuningControls
          tuning={own ?? sceneTuning}
          onChange={(patch) => { dispatch(actions.setSlotMotion(slotKey, patch)); }}
          onReset={own ? () => { dispatch(actions.setSlotMotion(slotKey, null)); } : null}
          resetLabel="Same as the scene"
        />
      </Section>
      {/* Where it travels — the same control as in Photos and Text, so all of
          an element's movement can be found in one place. */}
      <SlotKeyframes slotKey={slotKey} />
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
    <Section title="Speed and movement">
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
