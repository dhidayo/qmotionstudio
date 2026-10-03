import { useState } from 'react';
import * as actions from '@/document/actions';
import { elementEffect, frameEffect } from '@/core/effects/catalog';
import type { ElementPhase, ParamSpec } from '@/core/effects/types';
import type { EffectClip, EffectParams, ElementEffect } from '@/document/types';
import { sceneSpans } from '@/document/select/timeline';
import { useEditor } from '@/state/store';
import { useOverlays } from '@/ui/shell/overlays';
import { Button, ColorField, EmptyNote, Row, Segmented, Slider } from '@/ui/inspector/controls';

/**
 * Editing placed effects (D-100): how strong, when, and each one's own
 * settings. Shared by the Motion panel, the logo's section, the overlay panel
 * and the timeline-effect panel, so an effect looks and behaves the same
 * wherever it is edited.
 */

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

const PHASE_LABEL: Readonly<Record<ElementPhase, string>> = {
  enter: 'As it enters',
  during: 'Throughout',
  exit: 'As it leaves',
};

/** One effect's own settings — snow's wind, a flare's colour. */
export function ParamsEditor({
  specs,
  values,
  onChange,
}: {
  specs: readonly ParamSpec[];
  values: EffectParams;
  onChange: (patch: EffectParams) => void;
}): React.JSX.Element | null {
  if (specs.length === 0) return null;
  return (
    <div className="mt-1">
      {specs.map((spec) => {
        const value = values[spec.key];
        switch (spec.kind) {
          case 'number':
            return (
              <Slider
                key={spec.key}
                label={spec.label}
                value={typeof value === 'number' ? value : spec.default}
                min={spec.min}
                max={spec.max}
                step={spec.step ?? 1}
                {...(spec.suffix === undefined ? {} : { suffix: spec.suffix })}
                onChange={(v) => { onChange({ [spec.key]: v }); }}
              />
            );
          case 'color': {
            const current = typeof value === 'string' ? value : spec.default;
            const brand = current === 'brand';
            return (
              <div key={spec.key} className="mb-2.5 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  {brand ? (
                    <span className="text-[11px] text-ink-muted">{spec.label}: your accent colour</span>
                  ) : (
                    <ColorField label={spec.label} value={current} onChange={(v) => { onChange({ [spec.key]: v }); }} />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { onChange({ [spec.key]: brand ? spec.default : 'brand' }); }}
                  aria-pressed={brand}
                  title="Use the scene's accent colour"
                  className="rounded-md border px-1.5 py-0.5 text-[10px]"
                  style={{
                    borderColor: brand ? 'var(--c-accent)' : 'var(--c-edge)',
                    color: brand ? 'var(--c-accent)' : 'var(--c-ink-faint)',
                  }}
                >
                  Brand
                </button>
              </div>
            );
          }
          case 'choice': {
            const current = typeof value === 'string' && spec.options.some((o) => o.value === value) ? value : spec.default;
            if (spec.options.length <= 3) {
              return (
                <Segmented
                  key={spec.key}
                  label={spec.label}
                  value={current}
                  options={spec.options}
                  onChange={(v) => { onChange({ [spec.key]: v }); }}
                />
              );
            }
            return (
              <Row key={spec.key} label={spec.label}>
                <select
                  value={current}
                  aria-label={spec.label}
                  onChange={(event) => { onChange({ [spec.key]: event.target.value }); }}
                  className="w-full rounded-md border border-edge bg-panel-alt px-2 py-1 text-[11px]"
                >
                  {spec.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Row>
            );
          }
        }
      })}
    </div>
  );
}

/** The frame of an effect row: its name, a remove button, and a fold for the rest. */
function EffectCard({
  name,
  badge,
  onRemove,
  children,
  testId,
}: {
  name: string;
  badge: string;
  onRemove: () => void;
  children: React.ReactNode;
  testId: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-2 rounded-md border border-edge bg-panel-alt/40" data-effect-row={testId}>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={() => { setOpen(!open); }}
          aria-expanded={open}
          aria-label={`${open ? 'Fold' : 'Unfold'} ${name}`}
          className="text-[10px] text-ink-faint"
        >
          {open ? '▾' : '▸'}
        </button>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{name}</span>
        <span className="rounded-sm px-1 text-[9px] uppercase tracking-wide text-ink-faint" style={{ background: 'var(--c-panel)' }}>
          {badge}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          title="Remove"
          className="grid size-5 place-items-center rounded text-[13px] leading-none text-ink-faint hover:bg-panel hover:text-[var(--c-danger)]"
        >
          ×
        </button>
      </div>
      {open && <div className="border-t border-edge px-2 pb-1 pt-2">{children}</div>}
    </div>
  );
}

// ── Scene effects ───────────────────────────────────────────────────────────

export function SceneEffectsEditor(): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const effects = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.effects);
  const sceneMs = useEditor((s) => s.project.scenes[s.selectedScene]?.durationMs ?? 0);
  const sceneCount = useEditor((s) => s.project.scenes.length);
  const openPicker = useOverlays((s) => s.openPicker);
  const showToast = useEditor((s) => s.showToast);
  const list = effects ?? [];

  return (
    <div>
      {list.length === 0 && (
        <EmptyNote>Snow, sparkles, light leaks, a camera shake, a film look — add one to bring this scene to life.</EmptyNote>
      )}
      {list.map((clip) => (
        <SceneEffectRow key={clip.id} clip={clip} sceneMs={sceneMs} />
      ))}
      <div className="mt-2 flex gap-1">
        <Button variant="accent" onClick={() => { openPicker({ target: { kind: 'scene' } }); }}>
          + Add effect
        </Button>
        {sceneCount > 1 && list.length > 0 && (
          <Button
            onClick={() => {
              dispatch(actions.copySceneEffectsToAll());
              showToast(`These effects are now on all ${sceneCount} scenes.`);
            }}
          >
            Use on every scene
          </Button>
        )}
      </div>
    </div>
  );
}

function SceneEffectRow({ clip, sceneMs }: { clip: EffectClip; sceneMs: number }): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const playheadMs = useEditor((s) => s.playheadMs);
  const spanStart = useEditor((s) => sceneSpans(s.project.scenes)[s.selectedScene]?.startMs ?? 0);
  const def = frameEffect(clip.effectId);
  const whole = clip.startMs <= 0 && clip.endMs >= sceneMs;
  const local = Math.max(0, Math.min(playheadMs - spanStart, sceneMs));
  const update = (patch: actions.EffectPatch): void => { dispatch(actions.updateSceneEffect(clip.id, patch)); };

  return (
    <EffectCard
      name={def?.name ?? clip.effectId}
      badge={def?.category ?? 'Effect'}
      testId={clip.effectId}
      onRemove={() => { dispatch(actions.removeSceneEffect(clip.id)); }}
    >
      <Slider label="Intensity" value={Math.round(clip.intensity * 100)} min={0} max={100} suffix="%"
        onChange={(pct) => { update({ intensity: pct / 100 }); }} />
      <Segmented
        label="When"
        value={whole ? 'whole' : 'part'}
        options={[{ value: 'whole', label: 'Whole scene' }, { value: 'part', label: 'Part of it' }]}
        onChange={(v) => {
          if (v === 'whole') update({ startMs: 0, endMs: sceneMs });
          else {
            const length = Math.min(def?.defaultMs ?? 2_000, sceneMs);
            const startMs = Math.max(0, Math.min(local, sceneMs - length));
            update({ startMs, endMs: startMs + length });
          }
        }}
      />
      {!whole && (
        <Row label="From – to" hint={`${seconds(clip.startMs)} – ${seconds(Math.min(clip.endMs, sceneMs))}`}>
          <div className="flex gap-1">
            <Button onClick={() => { update({ startMs: Math.min(local, clip.endMs - 100) }); }}>Start at playhead</Button>
            <Button onClick={() => { update({ endMs: Math.max(local, clip.startMs + 100) }); }}>End at playhead</Button>
          </div>
        </Row>
      )}
      {def && <ParamsEditor specs={def.params} values={clip.params} onChange={(params) => { update({ params }); }} />}
    </EffectCard>
  );
}

// ── Timeline effects ────────────────────────────────────────────────────────

export function TimelineEffectPanel(): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const id = useEditor((s) => s.selectedEffect);
  const clip = useEditor((s) => s.project.effects?.find((c) => c.id === s.selectedEffect));
  const selectEffect = useEditor((s) => s.selectEffect);
  const playheadMs = useEditor((s) => s.playheadMs);

  if (!clip || id === null) return <EmptyNote>That effect is no longer on the timeline.</EmptyNote>;
  const def = frameEffect(clip.effectId);
  const update = (patch: actions.EffectPatch): void => { dispatch(actions.updateTimelineEffect(clip.id, patch)); };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold">{def?.name ?? clip.effectId}</h2>
          <p className="text-[11px] text-ink-faint">
            Timeline effect · {seconds(clip.startMs)} – {seconds(clip.endMs)} · over every scene and layer
          </p>
        </div>
        <button type="button" onClick={() => { selectEffect(null); }} className="text-[11px] text-ink-faint hover:text-ink">
          Done
        </button>
      </div>
      {def && <p className="mb-3 text-[11px] text-ink-muted">{def.blurb}</p>}
      <Slider label="Intensity" value={Math.round(clip.intensity * 100)} min={0} max={100} suffix="%"
        onChange={(pct) => { update({ intensity: pct / 100 }); }} />
      <Slider label="Length" value={Math.round((clip.endMs - clip.startMs) / 100) / 10} min={0.2} max={60} step={0.1} suffix="s"
        onChange={(s) => { update({ endMs: clip.startMs + s * 1000 }); }} />
      <div className="mb-3 flex gap-1">
        <Button onClick={() => { update({ startMs: playheadMs, endMs: playheadMs + (clip.endMs - clip.startMs) }); }}>
          Move to playhead
        </Button>
      </div>
      {def && <ParamsEditor specs={def.params} values={clip.params} onChange={(params) => { update({ params }); }} />}
      <div className="mt-3 flex gap-1">
        <Button onClick={() => { dispatch(actions.duplicateTimelineEffect(clip.id)); }}>Duplicate</Button>
        <Button variant="danger" onClick={() => { dispatch(actions.removeTimelineEffect(clip.id)); selectEffect(null); }}>
          Delete
        </Button>
      </div>
    </div>
  );
}

// ── Element effects ─────────────────────────────────────────────────────────

/** The effects on one element, and the way to add more. */
export function ElementEffectsEditor({
  target,
  label,
  effects,
}: {
  target: actions.ElementTarget;
  /** How the element is named in the picker and in toasts: "the logo", "this photo". */
  label: string;
  effects: readonly ElementEffect[];
}): React.JSX.Element {
  const openPicker = useOverlays((s) => s.openPicker);
  return (
    <div>
      {effects.length === 0 && (
        <EmptyNote>Spin it in, shine across it, make it pulse or sparkle, blow it away at the end.</EmptyNote>
      )}
      {effects.map((effect) => (
        <ElementEffectRow key={effect.id} target={target} effect={effect} />
      ))}
      <div className="mt-2 flex gap-1">
        <Button variant="accent" onClick={() => { openPicker({ target: { kind: 'element', target, label } }); }}>
          + Add effect
        </Button>
      </div>
    </div>
  );
}

function ElementEffectRow({ target, effect }: { target: actions.ElementTarget; effect: ElementEffect }): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const def = elementEffect(effect.effectId);
  const update = (patch: Parameters<typeof actions.updateElementEffect>[2]): void => {
    dispatch(actions.updateElementEffect(target, effect.id, patch));
  };
  const phases = def?.phases ?? ['during'];

  return (
    <EffectCard
      name={def?.name ?? effect.effectId}
      badge={def?.category ?? 'Effect'}
      testId={effect.effectId}
      onRemove={() => { dispatch(actions.removeElementEffect(target, effect.id)); }}
    >
      {phases.length > 1 && (
        <Segmented
          label="When"
          value={effect.phase}
          options={phases.map((phase) => ({ value: phase, label: PHASE_LABEL[phase] }))}
          onChange={(phase) => { update({ phase }); }}
        />
      )}
      {effect.phase !== 'during' && (
        <Slider label="Length" value={Math.round(effect.durationMs / 100) / 10} min={0.2} max={5} step={0.1} suffix="s"
          onChange={(s) => { update({ durationMs: s * 1000 }); }} />
      )}
      <Slider label="Intensity" value={Math.round(effect.intensity * 100)} min={0} max={100} suffix="%"
        onChange={(pct) => { update({ intensity: pct / 100 }); }} />
      {def && <ParamsEditor specs={def.params} values={effect.params} onChange={(params) => { update({ params }); }} />}
    </EffectCard>
  );
}
