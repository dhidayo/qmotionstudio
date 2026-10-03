import { useRef } from 'react';
import * as actions from '@/document/actions';
import { effectName, frameEffect } from '@/core/effects/catalog';
import type { EffectClip, Project } from '@/document/types';
import type { SceneSpan } from '@/document/select/timeline';
import { useEditor } from '@/state/store';
import { useOverlays } from '@/ui/shell/overlays';
import { LongPress } from '@/ui/shell/ContextMenu';
import { useHoldStill } from '@/ui/shell/ClockProvider';
import { effectMenu } from '@/ui/editing/commands';
import { capturePointer } from './pointerCapture';
import { MoreButton, TrimHandle, laneTimeAt } from './ClipParts';
import { dragResult, formatSeconds, msToPct, snap, type ClipDrag } from './timelineGeometry';

/**
 * Every effect in time, on rows of their own (D-106).
 *
 * Two kinds share these rows: effects on the timeline itself, and each
 * scene's own effects, shown where their scene is. A scene effect used to be
 * invisible on the timeline — added, and then "it disappears into the scene" —
 * which made it impossible to see where it ran, let alone change it.
 *
 * Overlapping effects stack onto separate rows, so each can be picked up and
 * trimmed on its own; snow under a lightning strike is the point of having
 * both. A scene effect can be dragged and trimmed within its scene; "Move to
 * the timeline" in its menu frees it to cross into the next.
 *
 * Used by the Corporate Ads timeline and under Lifestyle's scrubber, so the
 * same clip behaves the same in both.
 */

export type LaneFx = {
  readonly clip: EffectClip;
  /** null for a timeline effect. */
  readonly sceneIndex: number | null;
  /** On the project clock. */
  readonly startMs: number;
  readonly endMs: number;
  /** Where it may be dragged: its scene, or the whole lane. */
  readonly minMs: number;
  readonly maxMs: number;
};

/** Every effect on the project clock, timeline effects and scene effects alike. */
export function laneEffects(project: Project, spans: readonly SceneSpan[], laneMs: number): LaneFx[] {
  const list: LaneFx[] = [];
  for (const clip of project.effects ?? []) {
    list.push({ clip, sceneIndex: null, startMs: clip.startMs, endMs: clip.endMs, minMs: 0, maxMs: Math.max(laneMs, clip.endMs) });
  }
  for (const span of spans) {
    const length = span.endMs - span.startMs;
    // An effect that runs to its scene's end keeps doing so (see wholeSceneFx).
    const reach = Math.min(span.scene.durationMs, length) - 1;
    for (const clip of span.scene.inputs.effects ?? []) {
      const end = clip.endMs >= reach ? length : Math.min(clip.endMs, length);
      list.push({
        clip,
        sceneIndex: span.index,
        startMs: span.startMs + Math.min(clip.startMs, length),
        endMs: span.startMs + end,
        minMs: span.startMs,
        maxMs: span.endMs,
      });
    }
  }
  return list;
}

/** As few rows as hold them all without overlap: each on the first row that is free by its start. */
export function packEffectRows(effects: readonly LaneFx[]): LaneFx[][] {
  const rows: LaneFx[][] = [];
  for (const fx of [...effects].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)) {
    const row = rows.find((r) => (r[r.length - 1]?.endMs ?? 0) <= fx.startMs);
    if (row) row.push(fx);
    else rows.push([fx]);
  }
  return rows;
}

/** The height of an effects row; clips are placed by it. */
export const EFFECT_ROW_PX = 28;

const SNAP_MS = 100;
const CLICK_SLOP_PX = 3;
const MIN_MS = 200;

type Drag = ClipDrag & {
  readonly fx: LaneFx;
  readonly downX: number;
  readonly wasSelected: boolean;
  moved: boolean;
};

/** One effect clip: drag it, trim its dotted ends, right-click or hold it for its menu. */
export function EffectClipView({
  fx,
  row,
  durationMs,
  onSeek,
  showScene,
}: {
  fx: LaneFx;
  /** Which effects row it sits on; clips are placed in one layer over the rows. */
  row: number;
  /** The lane's length, which pointer positions are measured against. */
  durationMs: number;
  onSeek: (projectMs: number) => void;
  /** Say which scene it belongs to — useful on a timeline of several. */
  showScene: boolean;
}): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const selectedEffect = useEditor((s) => s.selectedEffect);
  const selectEffect = useEditor((s) => s.selectEffect);
  const openMenu = useOverlays((o) => o.openMenu);
  const drag = useRef<Drag | null>(null);
  const longPress = useRef(new LongPress());
  /** Picking a clip stops the preview where it is (D-110). */
  const holdStill = useHoldStill();

  const { clip } = fx;
  const name = effectName(clip.effectId);
  const def = frameEffect(clip.effectId);
  const active = selectedEffect === clip.id;
  const label = fx.sceneIndex === null || !showScene ? name : `${name} · scene ${fx.sceneIndex + 1}`;

  const openClipMenu = (x: number, y: number, element: Element): void => {
    selectEffect(clip.id);
    holdStill();
    const at = Math.max(fx.startMs, Math.min(laneTimeAt(x, element, durationMs), fx.endMs - 1));
    openMenu({ x, y, title: label, items: effectMenu(clip.id, onSeek, at) });
  };

  const begin = (event: React.PointerEvent<HTMLElement>, mode: ClipDrag['mode']): void => {
    if (event.button === 2) return;
    event.stopPropagation();
    capturePointer(event.currentTarget, event.pointerId);
    const element = event.currentTarget;
    drag.current = {
      mode,
      id: clip.id,
      startMs: fx.startMs,
      endMs: fx.endMs,
      pointerMs: laneTimeAt(event.clientX, element, durationMs),
      fx,
      downX: event.clientX,
      wasSelected: active,
      moved: false,
    };
    selectEffect(clip.id);
    holdStill();
    longPress.current.start(event, (x, y) => {
      drag.current = null;
      openClipMenu(x, y, element);
    });
  };

  const move = (event: React.PointerEvent<HTMLElement>): void => {
    longPress.current.move(event);
    const current = drag.current;
    if (!current || event.buttons === 0) return;
    if (Math.abs(event.clientX - current.downX) > CLICK_SLOP_PX) current.moved = true;
    if (!current.moved) return;

    // Within the effect's own bounds: its scene, or the whole lane.
    const bounded: ClipDrag = {
      ...current,
      startMs: current.startMs - current.fx.minMs,
      endMs: current.endMs - current.fx.minMs,
      pointerMs: current.pointerMs - current.fx.minMs,
    };
    const span = current.fx.maxMs - current.fx.minMs;
    const pointer = laneTimeAt(event.clientX, event.currentTarget, durationMs) - current.fx.minMs;
    const next = dragResult(bounded, pointer, { durationMs: span, minLengthMs: MIN_MS });
    const free = event.altKey;
    const start = snap(next.startMs, SNAP_MS, free);
    const end = Math.min(span, snap(next.endMs, SNAP_MS, free));

    if (current.fx.sceneIndex === null) {
      dispatch(actions.moveTimelineEffect(clip.id, start, end));
    } else {
      // Scene effects are stored in their scene's own time.
      dispatch(actions.moveSceneEffect(clip.id, start, end));
    }
  };

  const end = (): void => {
    longPress.current.cancel();
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    if (current.mode === 'move' && !current.moved && current.wasSelected) {
      onSeek(Math.max(fx.startMs, Math.min(current.pointerMs, fx.endMs - 1)));
      return;
    }
    endInteraction();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={`Effect: ${label}`}
      data-fx-clip={clip.effectId}
      data-fx-scope={fx.sceneIndex === null ? 'timeline' : `scene-${fx.sceneIndex}`}
      data-fx-row={row}
      title={`${label} · ${formatSeconds(fx.endMs - fx.startMs)}${def ? ` — ${def.blurb}` : ''}. Drag to move, drag the dotted ends to resize, right-click for more.`}
      onPointerDown={(e) => { begin(e, 'move'); }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openClipMenu(e.clientX, e.clientY, e.currentTarget); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') selectEffect(clip.id);
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          const box = e.currentTarget.getBoundingClientRect();
          openClipMenu(box.left, box.bottom, e.currentTarget);
        }
      }}
      className="pointer-events-auto absolute cursor-grab touch-none select-none overflow-hidden rounded-sm border text-[10px] leading-[18px]"
      style={{
        top: row * EFFECT_ROW_PX + 4,
        height: EFFECT_ROW_PX - 9,
        left: `${msToPct(fx.startMs, durationMs)}%`,
        width: `${Math.max(1.5, msToPct(fx.endMs, durationMs) - msToPct(fx.startMs, durationMs))}%`,
        borderColor: active ? 'var(--c-pro)' : 'color-mix(in srgb, var(--c-pro) 45%, var(--c-edge-strong))',
        borderStyle: fx.sceneIndex === null ? 'solid' : 'dashed',
        background: active ? 'var(--c-pro-soft)' : 'color-mix(in srgb, var(--c-pro-soft) 55%, var(--c-panel-alt))',
        color: active ? 'var(--c-pro)' : 'var(--c-ink-muted)',
        WebkitTouchCallout: 'none',
      }}
    >
      <TrimHandle side="start" label={name} onDown={(e) => { begin(e, 'trimStart'); }} onMove={move} onUp={end} />
      <span className="pointer-events-none block truncate px-3">✦ {label}</span>
      {active && <MoreButton label={`More for ${name}`} onOpen={(x, y) => { openMenu({ x, y, title: label, items: effectMenu(clip.id, onSeek, fx.startMs) }); }} />}
      <TrimHandle side="end" label={name} onDown={(e) => { begin(e, 'trimEnd'); }} onMove={move} onUp={end} />
    </div>
  );
}
