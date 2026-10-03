import { useEffect } from 'react';
import * as actions from '@/document/actions';
import { PALETTE_ROLES, type PaletteRole } from '@/core/types';
import type { BackgroundTreatment } from '@/document/types';
import { useEditor } from '@/state/store';
import type { SceneTemplate } from '@/templates/schema';
import { ColorField, EmptyNote, Section, Segmented, Slider } from '../controls';
import { SceneLayoutReset } from '../SlotPlacement';
import { LogoSection } from '../LogoSection';

const ROLE_LABELS: Record<PaletteRole, string> = {
  bg: 'Background',
  surface: 'Surface',
  ink: 'Ink',
  inkMuted: 'Muted ink',
  accent: 'Accent',
};

const BACKGROUND_LABELS: Record<BackgroundTreatment, string> = {
  solid: 'Solid',
  gradient: 'Gradient',
  blurredPhoto: 'Blurred photo',
  pattern: 'Pattern',
};

/** §8.4. */
export function LookTab({ template }: { template: SceneTemplate | null }): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const look = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.look);
  const durationMs = useEditor((s) => s.project.scenes[s.selectedScene]?.durationMs ?? 10_000);
  const selectedLogo = useEditor((s) => s.selectedLogo);

  // Picking the logo on the canvas opens Look; this brings its controls into view.
  useEffect(() => {
    if (!selectedLogo) return;
    document.querySelector('[data-logo-section]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [selectedLogo]);

  if (!look) return <EmptyNote>No scene.</EmptyNote>;

  const palettes = template?.look.palettes ?? [];
  const backgrounds = template?.look.backgrounds ?? ['solid'];

  return (
    <div>
      {palettes.length > 0 && (
        <Section title="Preset palettes">
          <div className="grid grid-cols-3 gap-1.5">
            {palettes.map((preset) => {
              const active = PALETTE_ROLES.every((role) => preset.palette[role] === look.palette[role]);
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => { dispatch(actions.applyPalette(preset.palette)); }}
                  aria-pressed={active}
                  title={preset.label}
                  className="overflow-hidden rounded-md border"
                  style={{ borderColor: active ? 'var(--c-accent)' : 'var(--c-edge)' }}
                >
                  <span className="flex h-6 w-full">
                    {PALETTE_ROLES.map((role) => (
                      <span key={role} className="flex-1" style={{ background: preset.palette[role] }} />
                    ))}
                  </span>
                  <span className="block truncate px-1 py-0.5 text-[10px] text-ink-muted">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Colours">
        <div className="flex flex-col gap-1.5">
          {PALETTE_ROLES.map((role) => (
            <ColorField
              key={role}
              label={ROLE_LABELS[role]}
              value={look.palette[role]}
              onChange={(color) => { dispatch(actions.setPaletteRole(role, color)); }}
            />
          ))}
        </div>
      </Section>

      <Section title="Background">
        <Segmented
          label="Treatment"
          value={look.background}
          columns={2}
          options={backgrounds.map((b) => ({ value: b, label: BACKGROUND_LABELS[b] }))}
          onChange={(background) => { dispatch(actions.setBackground(background)); }}
        />
        {backgrounds.length === 1 && (
          <EmptyNote>This template fills the frame with your photo, so there is no background to treat.</EmptyNote>
        )}
      </Section>

      <LogoSection template={template} />

      <Section title="Texture">
        {template?.look.supportsGrain === false ? (
          <EmptyNote>This template does not use grain.</EmptyNote>
        ) : (
          <Slider
            label="Grain"
            value={Math.round(look.grain * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(pct) => { dispatch(actions.setGrain(pct / 100)); }}
          />
        )}
        {template?.look.supportsVignette !== false && (
          <Slider
            label="Vignette"
            value={Math.round(look.vignette * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(pct) => { dispatch(actions.setVignette(pct / 100)); }}
          />
        )}
        {template?.look.supportsCornerRadius !== false && (
          <Slider
            label="Corner radius"
            value={look.cornerRadius}
            min={0}
            max={160}
            onChange={(cornerRadius) => { dispatch(actions.setCornerRadius(cornerRadius)); }}
          />
        )}
      </Section>

      <Section title="Timing">
        <Slider
          label="Duration"
          value={Math.round(durationMs / 100) / 10}
          min={(template?.minDurationMs ?? 3000) / 1000}
          max={(template?.maxDurationMs ?? 30000) / 1000}
          step={0.5}
          suffix="s"
          onChange={(seconds) => {
            dispatch(
              actions.setDuration(seconds * 1000, {
                min: template?.minDurationMs ?? 3000,
                max: template?.maxDurationMs ?? 30000,
              }),
            );
          }}
        />
      </Section>

      <SceneLayoutReset />
    </div>
  );
}
