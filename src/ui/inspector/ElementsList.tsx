import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import * as actions from '@/document/actions';
import { sceneSpans } from '@/document/select/timeline';
import type { DrawnScene } from '@/core/render/rig';
import type { PreviewClock } from '@/core/time/clock';
import type { Project } from '@/document/types';
import { useEditor } from '@/state/store';
import { restMomentMs } from '@/templates/restMoment';
import { useDrawnScene } from '@/ui/artboard/drawnScene';
import {
  elementGroups, isSelectedRow, momentToShow, secondsLabel, slotWindow, type ElementRow, type Window,
} from '@/ui/editing/elementsList';
import { Icon } from '@/ui/mobile/Icon';
import { usePreviewClock } from '@/ui/shell/ClockProvider';
import { sceneStillProject, stillMomentMs } from '@/ui/timeline/sceneStills';

/**
 * Elements (D-167): everything in the design, or in the selected scene, as a
 * list to pick from — "I would prefer a way to see all design elements and
 * select them to update as I like. Just think for a better design and
 * accessibility."
 *
 * Choosing a row does exactly what a tap on that thing on the picture does
 * (the same `selectSlot`, `selectOverlay` or `selectLogo`), so its own tools
 * and settings open as they always do; and when it is not on screen at the
 * playhead — a word that arrives later — the playhead goes, paused, to a
 * moment where it is. A deleted part or text is listed dimmed; choosing it
 * puts it back and picks it.
 *
 * One stop on Tab, then ↑ ↓ Home End between rows, Enter or Space to choose —
 * each row a real button whose name says what it is and its state, under
 * real headings. The row of what is selected is marked, whatever selected it.
 */
export function ElementsList({ onPicked }: {
  /** After a row is chosen: the phone's sheet closes, so the element's tools are in view. */
  onPicked?: () => void;
}): React.JSX.Element {
  const project = useEditor((s) => s.project);
  const sceneIndex = useEditor((s) => s.selectedScene);
  const template = useEditor((s) => s.template);
  const selection = useEditor(useShallow((s) => ({ slot: s.selectedSlot, overlay: s.selectedOverlay, logo: s.selectedLogo })));
  const drawn = useDrawnScene((d) => d.drawn);
  const clock = usePreviewClock();
  const scene = project.scenes[sceneIndex];
  /*
   * What the preview drew for this scene, kept while a playing video is in
   * another one, so the list does not lose the scene's parts as the playhead
   * passes — until the scene's design changes.
   */
  const [kept, setKept] = useState<{ sceneId: string; templateId: string; layers: DrawnScene['layers'] } | null>(null);
  if (drawn && scene && drawn.sceneId === scene.id && kept?.layers !== drawn.layers) {
    setKept({ sceneId: scene.id, templateId: scene.templateId, layers: drawn.layers });
  }
  const own = drawn && scene && drawn.sceneId === scene.id ? drawn.layers : null;
  const layers = own ?? (scene && kept?.sceneId === scene.id && kept.templateId === scene.templateId ? kept.layers : null);
  const groups = useMemo(
    () => elementGroups({ project, sceneIndex, template, layers }),
    [project, sceneIndex, template, layers],
  );
  const rows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  const list = useRef<HTMLDivElement>(null);

  /*
   * The list is of the selected scene, so the picture should be too: in a
   * video whose playhead is in another scene, it goes to this one's picture
   * moment, paused. That is also what lets the list name the scene's parts,
   * which come from what the preview drew.
   */
  const sceneId = scene?.id;
  useEffect(() => {
    if (clock === null || sceneId === undefined) return;
    const s = useEditor.getState();
    const span = sceneSpans(s.project.scenes)[s.selectedScene];
    if (!span || (s.playheadMs >= span.startMs && s.playheadMs < span.endMs)) return;
    const at = pictureOf(s.project, s.selectedScene) ?? span.startMs;
    clock.pause();
    clock.seek(at);
    s.setPlayhead(at);
  }, [clock, sceneId]);

  // Picked on the picture, the row comes into view (D-167), without a glide for anyone who asked for less motion.
  const selectedId = rows.find((row) => isSelectedRow(row, selection))?.id ?? null;
  useEffect(() => {
    if (selectedId === null) return;
    const node = list.current?.querySelector<HTMLElement>(`[data-element-row="${CSS.escape(selectedId)}"]`);
    node?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [selectedId]);

  // One stop on Tab: the selected row, else the first (a roving tab index).
  const tabStop = selectedId ?? rows[0]?.id ?? null;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('[data-element-row]') ?? [])];
    const at = buttons.findIndex((b) => b === document.activeElement);
    if (at < 0) return;
    const to = event.key === 'ArrowDown' ? Math.min(buttons.length - 1, at + 1)
      : event.key === 'ArrowUp' ? Math.max(0, at - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? buttons.length - 1
      : null;
    if (to === null) return;
    event.preventDefault();
    for (const b of buttons) b.tabIndex = -1;
    const next = buttons[to];
    if (next) { next.tabIndex = 0; next.focus(); }
  };

  const multi = project.mode === 'motionAd' && project.scenes.length > 1;

  if (rows.length === 0) {
    return <p className="px-1 py-2 text-[12px] text-ink-muted">{template === null ? 'Loading the design…' : 'Nothing in this design yet.'}</p>;
  }

  return (
    <div ref={list} data-elements-list onKeyDown={onKeyDown}>
      <p className="mb-2 text-[12px] text-ink-muted">
        {multi ? `Everything in scene ${sceneIndex + 1}.` : 'Everything in this design.'} Choose one to change it.
      </p>
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`elements-${group.id}`} className="mb-3">
          <h3 id={`elements-${group.id}`} className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            {group.heading}
          </h3>
          <ul className="flex flex-col gap-1">
            {group.rows.map((row) => (
              <li key={row.id}>
                <Row
                  row={row}
                  selected={row.id === selectedId}
                  tabStop={row.id === tabStop}
                  onChoose={() => { choose(row, clock); onPicked?.(); }}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Row({ row, selected, tabStop, onChoose }: { row: ElementRow; selected: boolean; tabStop: boolean; onChoose: () => void }): React.JSX.Element {
  const deleted = row.state === 'deleted';
  return (
    <button
      type="button"
      data-element-row={row.id}
      data-element-state={row.state ?? undefined}
      tabIndex={tabStop ? 0 : -1}
      aria-label={row.label}
      aria-current={selected ? 'true' : undefined}
      onClick={onChoose}
      className="flex min-h-10 w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left text-[13px] hover:bg-panel-alt focus-visible:outline-offset-[-2px] pointer-coarse:min-h-11"
      style={{
        borderColor: selected ? 'var(--c-accent)' : 'var(--c-edge)',
        background: selected ? 'var(--c-accent-soft)' : undefined,
      }}
    >
      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md" style={{ background: 'var(--c-panel-alt)', color: deleted ? 'var(--c-ink-muted)' : 'var(--c-ink)' }}>
        <Icon name={row.icon} size={16} />
      </span>
      <span className="min-w-0 flex-1 truncate" style={{ color: deleted ? 'var(--c-ink-muted)' : 'var(--c-ink)' }}>
        <span className={`font-semibold ${deleted ? 'line-through decoration-1' : ''}`}>{row.name}</span>
        {row.detail !== null && <span className="text-ink-muted"> — {row.detail}</span>}
      </span>
      {row.when && <span className="tabular shrink-0 text-[11px] text-ink-muted">{secondsLabel(row.when.startMs)}–{secondsLabel(row.when.endMs)}</span>}
      {row.state === 'sample' && <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-ink-muted" style={{ background: 'var(--c-panel-alt)' }}>Sample</span>}
      {deleted && (
        <span className="shrink-0 rounded-md border border-edge-strong px-2 py-0.5 text-[12px] font-semibold" style={{ color: 'var(--c-accent)' }}>
          Put back
        </span>
      )}
    </button>
  );
}

/**
 * Chooses a row: puts it back first if it was deleted, shows it at a moment it
 * is on screen, and selects it as a tap on the picture would.
 */
function choose(row: ElementRow, clock: PreviewClock | null): void {
  const s = useEditor.getState();
  if (row.restore?.kind === 'shape') s.dispatch(actions.showShape(row.restore.key));
  if (row.restore?.kind === 'text') s.dispatch(actions.restoreText(row.restore.slot));

  const seen = windowOf(row);
  if (seen && clock) {
    // Held still where it is (D-110), then moved only if the element is not on screen there.
    if (clock.playing) clock.pause();
    const at = momentToShow(clock.timeMs, seen, pictureOf(s.project, s.selectedScene));
    if (at !== null) {
      clock.seek(at);
      s.setPlayhead(at);
    }
  }

  const { target } = row;
  if (target.kind === 'overlay') s.selectOverlay(target.id);
  else if (target.kind === 'logo') s.selectLogo(true);
  else s.selectSlot(target.key, target.tab, target.photoIndex);

  // Keyboard focus follows to the settings the choice opened, rather than falling to the page.
  requestAnimationFrame(() => {
    const into = document.querySelector<HTMLElement>('[data-phone-toolbar="selection"] button')
      ?? document.querySelector<HTMLElement>('aside[aria-label="Inspector"] [role="tab"][aria-selected="true"]')
      ?? document.querySelector<HTMLElement>('aside[data-inspector-focus]');
    into?.focus({ preventScroll: true });
  });
}

/** When a row's element is on screen, on the project clock; null when it cannot be worked out. */
function windowOf(row: ElementRow): Window | null {
  const s = useEditor.getState();
  const scene = s.project.scenes[s.selectedScene];
  const span = sceneSpans(s.project.scenes)[s.selectedScene];
  if (!scene || !span) return null;
  const sceneWindow = { startMs: span.startMs, endMs: span.endMs };
  const { target } = row;
  if (target.kind === 'logo') return sceneWindow;
  if (target.kind === 'overlay') {
    const overlay = s.project.overlays.find((o) => o.id === target.id);
    if (!overlay) return null;
    // In a video, the part of it within this scene; an image's layers by their own time.
    const video = s.project.mode === 'motionAd';
    const startMs = video ? Math.max(overlay.startMs, span.startMs) : overlay.startMs;
    const endMs = video ? Math.min(overlay.endMs, span.endMs) : overlay.endMs;
    return endMs > startMs ? { startMs, endMs } : null;
  }
  const { drawn } = useDrawnScene.getState();
  if (!drawn || drawn.sceneId !== scene.id) return null;
  return slotWindow(drawn.layers, target.key, sceneWindow, scene.inputs.look.speed);
}

/** The picture moment (D-155): an image's own, or in a video the selected scene's, as its strip still shows it (D-166). */
function pictureOf(project: Project, index: number): number | null {
  if (project.mode !== 'motionAd') return restMomentMs(project);
  const scene = project.scenes[index];
  const span = sceneSpans(project.scenes)[index];
  if (!scene || !span) return null;
  return Math.min(span.endMs - 1, span.startMs + stillMomentMs(sceneStillProject(project, scene)));
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
