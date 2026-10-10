import { useState } from 'react';
import * as actions from '@/document/actions';
import { elementEffect, frameEffect } from '@/core/effects/catalog';
import type { ElementPhase, ParamSpec } from '@/core/effects/types';
import type { EffectClip, EffectParams, ElementEffect } from '@/document/types';
import { sceneLengthMs, sceneSpans } from '@/document/select/timeline';
import { useEditor } from '@/state/store';
import { useOverlays } from '@/ui/shell/overlays';
import { findEffect } from '@/ui/editing/commands';
import { BarDelete, Button, ColorField, EmptyNote, Row, Segmented, Slider } from '@/ui/inspector/controls';

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

/**
 * An effect, as a navy bar (D-131): tap it to fold its settings away or bring
 * them back; delete sits on the bar, plain to see — "the header for it should
 * have been navy blue… clearly shown that I can collapse the section and
 * delete the section on the header".
 */
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
    <div className="mb-2" data-effect-row={testId}>
      <div className={`brand-surface flex items-center gap-1 pr-1 ${open ? 'rounded-t-[8px]' : 'rounded-[8px]'}`}>
        <button
          type="button"
          onClick={() => { setOpen(!open); }}
          aria-expanded={open}
          aria-label={`${open ? 'Fold' : 'Unfold'} ${name}`}
          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
        >
          <span aria-hidden className="inline-block w-3 text-center text-[13px] leading-none transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none', transitionDuration: 'var(--t-fast)' }}>›</span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{name}</span>
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wide" style={{ background: 'rgb(255 255 255 / 0.14)' }}>
            {badge}
          </span>
        </button>
        <BarDelete label={`Remove ${name}`} onDelete={onRemove} />
      </div>
      {open && <div className="rounded-b-[8px] border border-t-0 border-edge px-2.5 pb-1 pt-2.5">{children}</div>}
    </div>
  );
}

// ── Scene effects ───────────────────────────────────────────────────────────

export function SceneEffectsEditor(): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const effects = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.effects);
  // The scene's real length on the timeline — its design length at its speed.
  const sceneMs = useEditor((s) => {
    const scene = s.project.scenes[s.selectedScene];
    return scene ? sceneLengthMs(scene) : 0;
  });
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

/**
 * The panel for an effect picked on the timeline — a timeline effect, or one
 * of a scene's own (D-106).
 */
export function TimelineEffectPanel(): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const id = useEditor((s) => s.selectedEffect);
  const project = useEditor((s) => s.project);
  const selectEffect = useEditor((s) => s.selectEffect);
  const playheadMs = useEditor((s) => s.playheadMs);

  const found = id === null ? null : findEffect(project, id);
  if (!found || id === null) return <EmptyNote>That effect is no longer there.</EmptyNote>;
  const { clip, sceneIndex } = found;
  const def = frameEffect(clip.effectId);
  const span = sceneIndex === null ? null : sceneSpans(project.scenes)[sceneIndex] ?? null;
  const sceneMs = span ? span.endMs - span.startMs : 0;
  const origin = span?.startMs ?? 0;
  const endMs = span && clip.endMs >= Math.min(span.scene.durationMs, sceneMs) - 1 ? sceneMs : clip.endMs;
  const update = (patch: actions.EffectPatch): void => {
    dispatch(sceneIndex === null ? actions.updateTimelineEffect(clip.id, patch) : actions.updateSceneEffect(clip.id, patch));
  };
  const local = Math.max(0, playheadMs - origin);
  const where = sceneIndex === null
    ? 'On the timeline · over every scene and layer'
    : `In scene ${sceneIndex + 1} · moves with the scene`;

  const remove = (): void => {
    dispatch(sceneIndex === null ? actions.removeTimelineEffect(clip.id) : actions.removeSceneEffect(clip.id));
    selectEffect(null);
  };

  return (
    <div>
      {/* The effect's own bar (D-131): its name and where it is, Done to put it down, delete beside it. */}
      <div className="brand-surface mb-3 flex items-center gap-1 rounded-[8px] py-1.5 pl-3 pr-1" data-effect-panel-bar>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-semibold">{def?.name ?? clip.effectId}</h2>
          <p className="truncate text-[11px] text-ink-muted">
            {where} · {seconds(origin + clip.startMs)} – {seconds(origin + endMs)}
          </p>
        </div>
        <button type="button" onClick={() => { selectEffect(null); }} className="rounded-md px-2.5 py-1.5 text-[12px] font-semibold hover:bg-panel-alt">
          Done
        </button>
        <BarDelete label={`Delete ${def?.name ?? 'effect'}`} onDelete={remove} />
      </div>
      {def && <p className="mb-3 text-[11px] text-ink-muted">{def.blurb}</p>}
      <Slider label="Intensity" value={Math.round(clip.intensity * 100)} min={0} max={100} suffix="%"
        onChange={(pct) => { update({ intensity: pct / 100 }); }} />
      <Slider label="Length" value={Math.round((endMs - clip.startMs) / 100) / 10} min={0.2}
        max={Math.max(0.3, sceneIndex === null ? 60 : (sceneMs - clip.startMs) / 1000)} step={0.1} suffix="s"
        onChange={(s) => { update({ endMs: clip.startMs + s * 1000 }); }} />
      <div className="mb-3 flex gap-1">
        <Button onClick={() => {
          const length = endMs - clip.startMs;
          const start = sceneIndex === null ? playheadMs : Math.min(local, Math.max(0, sceneMs - length));
          update({ startMs: start, endMs: start + length });
        }}>
          Move to playhead
        </Button>
        {sceneIndex !== null && (
          <Button onClick={() => { update({ startMs: 0, endMs: sceneMs }); }}>Whole scene</Button>
        )}
      </div>
      {def && <ParamsEditor specs={def.params} values={clip.params} onChange={(params) => { update({ params }); }} />}
      <div className="mt-3 flex gap-1">
        <Button onClick={() => {
          dispatch(sceneIndex === null ? actions.duplicateTimelineEffect(clip.id) : actions.duplicateSceneEffect(clip.id));
        }}>
          Duplicate
        </Button>
        <Button variant="danger" onClick={remove}>
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
