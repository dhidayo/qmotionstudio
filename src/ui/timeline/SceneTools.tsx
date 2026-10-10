import type { TransitionKind } from '@/document/types';
import { TRANSITION_LABELS } from './transitionLabels';
import * as actions from '@/document/actions';
import { TRANSITION_KINDS, usesDirection } from '@/core/render/transitions';
import { useEditor } from '@/state/store';
import { formatSeconds } from './timelineGeometry';
import { ScenePicker } from './ScenePicker';
import { sceneLengthMs } from '@/document/select/timeline';
import { useOverlays } from '@/ui/shell/overlays';

/**
 * Timing controls for the selected scene.
 *
 * These live in the timeline rather than in the inspector on purpose. §1.3
 * fixes the inspector at four tabs — Photos, Text, Logo, Look — and they all
 * answer "what does this scene contain". How long it runs and how it arrives
 * are questions about the *sequence*, and the sequence is what the timeline is.
 *
 * The transition control is hidden on scene one, because there is nothing to
 * transition from (D-004).
 */
const LABELS = TRANSITION_LABELS;

export function SceneTools(): React.JSX.Element | null {
  const project = useEditor((s) => s.project);
  const index = useEditor((s) => s.selectedScene);
  const template = useEditor((s) => s.template);
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const selectScene = useEditor((s) => s.selectScene);
  // In the overlay store, so the timeline's right-click menu can open it too.
  const picking = useOverlays((o) => o.scenePicker);
  const setPicking = useOverlays((o) => o.openScenePicker);

  const scene = project.scenes[index];
  if (!scene) return null;

  const transition = scene.transitionIn;
  const bounds = {
    min: template?.minDurationMs ?? 1_000,
    max: template?.maxDurationMs ?? 60_000,
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-edge px-3 py-1.5">
      <span className="text-[11px] font-semibold text-ink">
        Scene {index + 1}
        <span className="font-normal text-ink-faint"> of {project.scenes.length}</span>
      </span>

      <label className="flex items-center gap-1.5 text-[10px] text-ink-muted">
        Length
        <input
          type="range"
          min={bounds.min}
          max={bounds.max}
          step={100}
          value={scene.durationMs}
          aria-label="Scene length"
          onChange={(e) => {
            dispatch(actions.setSceneDurationAt(index, Number(e.target.value), bounds));
          }}
          onPointerUp={endInteraction}
          onBlur={endInteraction}
          className="h-1 w-24 accent-[var(--c-accent)]"
        />
        <span className="tabular w-9 text-ink-faint">{formatSeconds(scene.durationMs)}</span>
        {scene.inputs.look.speed !== 1 && (
          // Speed changes how long it lasts on the timeline, so say so here.
          <span className="tabular text-ink-faint">
            plays in {formatSeconds(sceneLengthMs(scene))} at {scene.inputs.look.speed.toFixed(2)}×
          </span>
        )}
      </label>

      {index > 0 && (
        <>
          <label className="flex items-center gap-1.5 text-[10px] text-ink-muted">
            In
            <select
              value={transition?.kind ?? 'crossFade'}
              aria-label="Transition"
              onChange={(e) => {
                dispatch(actions.setSceneTransition(index, { kind: e.target.value as TransitionKind }));
                endInteraction();
              }}
              className="rounded-md border border-edge bg-panel-alt px-1.5 py-0.5 text-[11px] text-ink focus:border-accent focus:outline-none"
            >
              {TRANSITION_KINDS.map((kind) => (
                <option key={kind} value={kind}>{LABELS[kind]}</option>
              ))}
            </select>
          </label>

          {transition !== null && transition.kind !== 'cut' && (
            <label className="flex items-center gap-1.5 text-[10px] text-ink-muted">
              Over
              <input
                type="range"
                min={100}
                max={1_500}
                step={50}
                value={transition.durationMs}
                aria-label="Transition length"
                onChange={(e) => {
                  dispatch(actions.setSceneTransition(index, { durationMs: Number(e.target.value) }));
                }}
                onPointerUp={endInteraction}
                onBlur={endInteraction}
                className="h-1 w-16 accent-[var(--c-accent)]"
              />
              <span className="tabular w-9 text-ink-faint">{transition.durationMs}ms</span>
            </label>
          )}

          {transition !== null && usesDirection(transition.kind) && (
            <label className="flex items-center gap-1.5 text-[10px] text-ink-muted">
              Dir
              <select
                value={transition.direction ?? 'left'}
                aria-label="Transition direction"
                onChange={(e) => {
                  dispatch(actions.setSceneTransition(index, {
                    direction: e.target.value as 'left' | 'right' | 'up' | 'down',
                  }));
                  endInteraction();
                }}
                className="rounded-md border border-edge bg-panel-alt px-1.5 py-0.5 text-[11px] text-ink focus:border-accent focus:outline-none"
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="up">Up</option>
                <option value="down">Down</option>
              </select>
            </label>
          )}
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        {/*
          * Both open the scene picker (D-097). "+ Scene" used to copy the
          * selected scene with no choice offered, and nothing changed a beat's
          * design at all in Motion Ads.
          */}
        <ToolButton onClick={() => { setPicking('add'); }} label="Add a scene after this one — choose its design">+ Scene</ToolButton>
        <ToolButton onClick={() => { setPicking('replace'); }} label="Change this scene's design">Change design</ToolButton>
        <ToolButton
          onClick={() => { dispatch(actions.duplicateScene(index)); selectScene(index + 1); }}
          label="Duplicate this scene"
        >
          Duplicate
        </ToolButton>
        <ToolButton
          onClick={() => { dispatch(actions.moveScene(index, index - 1)); selectScene(index - 1); }}
          label="Move this scene earlier"
          disabled={index === 0}
        >
          ←
        </ToolButton>
        <ToolButton
          onClick={() => { dispatch(actions.moveScene(index, index + 1)); selectScene(index + 1); }}
          label="Move this scene later"
          disabled={index >= project.scenes.length - 1}
        >
          →
        </ToolButton>
        <ToolButton
          onClick={() => { dispatch(actions.removeScene(index)); }}
          label="Remove this scene"
          disabled={project.scenes.length <= 1}
          danger
        >
          Remove
        </ToolButton>
      </div>

      {picking !== null && <ScenePicker mode={picking} onClose={() => { setPicking(null); }} />}
    </div>
  );
}

function ToolButton({
  onClick,
  children,
  label,
  disabled,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  label: string;
  disabled?: boolean;
  danger?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="rounded-md border border-edge px-1.5 py-0.5 text-[10px] hover:bg-panel-alt disabled:opacity-30"
      style={{ color: danger === true ? 'var(--c-danger)' : 'var(--c-ink-muted)' }}
    >
      {children}
    </button>
  );
}
