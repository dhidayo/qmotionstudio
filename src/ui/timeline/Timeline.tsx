import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PreviewClock } from '@/core/time/clock';
import type { Overlay } from '@/document/types';
import {
  sceneSpans, timelineSpanMs, totalDurationMs, type SceneSpan,
} from '@/document/select/timeline';
import * as actions from '@/document/actions';
import { isAnimated, posesOf } from '@/document/select/overlay';
import { hasNudgePoses, nudgePoses } from '@/core/render/slots';
import { spanOf } from '@/document/select/motion';
import { MotionBar } from './MotionBar';
import { summaryFor } from '@/templates/manifest';
import { MAX_TRACKS } from '@/document/select/tracks';
import { useOverlays } from '@/ui/shell/overlays';
import { LongPress } from '@/ui/shell/ContextMenu';
import { useHoldStill } from '@/ui/shell/ClockProvider';
import { overlayMenu, sceneMenu } from '@/ui/editing/commands';
import { EffectClipView, laneEffects, packEffectRows } from './EffectRows';
import { MoreButton, TrimHandle } from './ClipParts';
import { useEditor } from '@/state/store';
import { TIER_SWITCHABLE, setTier, useEntitlements } from '@/entitlements';
import { capturePointer } from './pointerCapture';
import { SceneTools } from './SceneTools';
import { useAddLayers } from './useAddLayers';
import { useClockFrames } from '@/ui/hooks/useClockFrames';
import { MusicTrack } from './MusicTrack';
import { useSceneReorder } from './useSceneReorder';
import {
  dragResult, formatSeconds, msToPct, pxToMs, rowCount, snap, tickIntervalMs,
  type ClipDrag,
} from './timelineGeometry';

/**
 * The Motion Ads timeline (§1.2).
 *
 * "A track timeline showing overlay layers (L1, L2, …) plus a dedicated music
 * track." Showcase keeps its slider (§1.1) — the two modes genuinely want
 * different instruments, and giving Showcase a track editor for its single
 * scene would be clutter dressed as capability.
 *
 * The playhead and the readout follow the clock frame by frame without
 * re-rendering the panel (D-112) — see `useClockFrames`.
 */
const SNAP_MS = 100;
/** Pointer slop below which a press counts as a click rather than a drag. */
const CLICK_SLOP_PX = 3;
const MIN_OVERLAY_MS = 300;

export function Timeline({
  clock,
  embedded = false,
}: {
  clock: PreviewClock;
  /** Inside the phone's timeline sheet (D-109): as tall as its rows, no resize edge. */
  embedded?: boolean;
}): React.JSX.Element {
  const project = useEditor((s) => s.project);
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const selectedScene = useEditor((s) => s.selectedScene);
  const selectedOverlay = useEditor((s) => s.selectedOverlay);
  const selectOverlay = useEditor((s) => s.selectOverlay);
  const selectSceneClip = useEditor((s) => s.selectSceneClip);
  const sceneClipSelected = useEditor((s) => s.sceneClipSelected);
  const selectedEffect = useEditor((s) => s.selectedEffect);
  const targetTrack = useEditor((s) => s.targetTrack);
  const setTargetTrack = useEditor((s) => s.setTargetTrack);
  const openMenu = useOverlays((o) => o.openMenu);
  const openPicker = useOverlays((o) => o.openPicker);
  const openScenePicker = useOverlays((o) => o.openScenePicker);
  /** Picking a clip stops the preview where it is (D-110). */
  const holdStill = useHoldStill();
  const showToast = useEditor((s) => s.showToast);

  /*
   * Two different lengths, and conflating them was the bug that made a long
   * music track unmanageable (see timelineSpanMs).
   *
   *   videoMs  what renders and exports — the scenes, minus D-004's overlaps.
   *   durationMs  what the lane has to *show*, which includes audio running
   *               past the end of the video.
   */
  const videoMs = totalDurationMs(project);
  const durationMs = timelineSpanMs(project);
  const overhang = durationMs > videoMs + 1;
  const spans = sceneSpans(project.scenes);

  const [playing, setPlaying] = useState(clock.playing);
  const shownPlaying = useRef(clock.playing);
  const playheadLine = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);

  /*
   * The clock is a plain mutable object so the artboard can redraw without
   * re-rendering React sixty times a second (see PreviewClock). The playhead,
   * the readout and the slider's value follow it frame by frame by being
   * written straight to the page (D-112) — re-rendering this whole panel, every
   * clip in it, twelve times a second made the playhead step and cost frames
   * the picture needed. Only the play/pause label is state.
   */
  const setPlayhead = useEditor((s) => s.setPlayhead);
  useClockFrames(clock, (timeMs, isPlaying) => {
    if (playheadLine.current) playheadLine.current.style.left = `${msToPct(timeMs, durationMs)}%`;
    laneRef.current?.setAttribute('aria-valuenow', String(Math.round(timeMs)));
    const text = readout.current;
    if (text) {
      // Said plainly, so a held last frame does not read as a stall.
      const past = timeMs > videoMs;
      text.textContent = `${formatSeconds(timeMs)} / ${formatSeconds(videoMs)}${past ? ' past end' : ''}`;
      text.style.color = past ? 'var(--c-ink-faint)' : 'var(--c-ink-muted)';
    }
    if (isPlaying !== shownPlaying.current) {
      shownPlaying.current = isPlaying;
      setPlaying(isPlaying);
    }
  });

  const laneRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** A height the person dragged the timeline to, or null to fit its rows. */
  const [manualHeight, setManualHeight] = useState<number | null>(readHeight);
  const resizeFrom = useRef<{ y: number; height: number } | null>(null);
  const [heldHeight, setHeldHeight] = useState<number | null>(null);
  /*
   * The tallest the panel has had to be. It grows to fit new rows but does not
   * shrink by itself when one goes: the canvas above it resizes with it, and a
   * picture that jumps every time a layer is deleted is worse than some spare
   * room in the timeline. Double-clicking the top edge fits it again.
   */
  const [grownTo, setGrownTo] = useState(MIN_PANEL_PX);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.borderBoxSize[0]?.blockSize ?? panel.getBoundingClientRect().height;
      setGrownTo((current) => (height > current + 0.5 ? Math.round(height) : current));
    });
    observer.observe(panel);
    return () => { observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (heldHeight === null) return;
    const release = (): void => { setHeldHeight(null); };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [heldHeight]);
  /**
      * A press on a clip is a drag *or* a click, and which one it was is only
      * known when it ends. So the press records where it started and whether
      * the clip was already selected, and the release decides (D-087).
      */
  const dragRef = useRef<(ClipDrag & {
    downX: number;
    downY: number;
    moved: boolean;
    wasSelected: boolean;
    /** The layer it started on, to go back to if it is dropped on top of something (D-103). */
    originalTrack: number;
    track: number;
  }) | null>(null);
  /** The overlay rows, for working out which layer a drag is over. */
  const rowsRef = useRef<HTMLDivElement>(null);
  /** A finger held on a clip opens its menu (D-104). */
  const longPress = useRef(new LongPress());
  const sceneLongPress = useRef(new LongPress());

  /**
   * The lane's pixel width, measured rather than read from the ref during
   * render: the ruler's tick spacing depends on it, and a value read mid-render
   * is a frame stale on every resize.
   */
  const [laneWidth, setLaneWidth] = useState(800);
  useEffect(() => {
    const lane = laneRef.current;
    if (!lane) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setLaneWidth(Math.max(1, entry.contentRect.width));
    });
    observer.observe(lane);
    return () => { observer.disconnect(); };
  }, []);

  const laneMs = useCallback((clientX: number): number => {
    const lane = laneRef.current;
    if (!lane) return 0;
    const box = lane.getBoundingClientRect();
    return pxToMs(clientX - box.left, box.width, durationMs);
  }, [durationMs]);

  // Scenes rearranged by dragging (D-130).
  const reorder = useSceneReorder({
    spans,
    msAt: laneMs,
    onLift: () => { sceneLongPress.current.cancel(); },
    onMove: (from, to) => {
      useEditor.getState().dispatch(actions.moveScene(from, to));
      selectSceneClip(to);
    },
  });

  // ── Scrubbing ─────────────────────────────────────────────────────────────

  const scrubTo = useCallback((clientX: number): void => {
    clock.seek(laneMs(clientX));
    /*
     * Published straight away, not left to the 20Hz sampler.
     *
     * A scrub is a deliberate move to an exact moment, and everything that
     * acts on the playhead — where a keyframe gets written, whether a music
     * clip can be split — would otherwise be working from where the playhead
     * was up to fifty milliseconds ago. For keyframes that is inside the
     * tolerance that decides whether two of them are the same one, so a drag
     * immediately after a scrub could land on the wrong keyframe entirely.
     */
    setPlayhead(clock.timeMs);
  }, [clock, laneMs, setPlayhead]);

  /**
   * Scrubbing from the lane background.
   *
   * Separate from the ruler's handlers only because the ruler captures the
   * pointer for a continuous drag; here a press is a jump and a drag scrubs,
   * which is what a click on a track is for.
   */
  const seekTo = useCallback((projectMs: number): void => {
    clock.pause();
    clock.seek(projectMs);
    setPlayhead(clock.timeMs);
  }, [clock, setPlayhead]);

  const onLaneDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    // Only the background. A press that started on a clip has already been
    // stopped, and one on a control inside a lane is not a scrub either.
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).dataset['lane']) {
      return;
    }
    // Clicking a layer's empty space chooses that layer for the next element
    // added (D-103) — as well as moving the playhead, like any other click.
    const row = (event.target as HTMLElement).dataset['trackRow'];
    if (row !== undefined) setTargetTrack(Number(row));
    capturePointer(event.currentTarget, event.pointerId);
    scrubTo(event.clientX);
  };

  const onLaneMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.buttons === 0) return;
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).dataset['lane']) {
      return;
    }
    scrubTo(event.clientX);
  };

  const onRulerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    capturePointer(event.currentTarget, event.pointerId);
    scrubTo(event.clientX);
  };

  const onRulerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.buttons === 0) return;
    scrubTo(event.clientX);
  };

  // ── Overlay clip dragging ────────────────────────────────────────────────

  const beginClipDrag = (
    event: React.PointerEvent<HTMLElement>,
    overlay: Overlay,
    mode: ClipDrag['mode'],
  ): void => {
    if (event.button === 2) return; // A right-click opens the menu; it is not a drag.
    event.stopPropagation();
    capturePointer(event.currentTarget, event.pointerId);
    const wasSelected = selectedOverlay === overlay.id;
    selectOverlay(overlay.id);
    holdStill();
    dragRef.current = {
      mode,
      id: overlay.id,
      startMs: overlay.startMs,
      endMs: overlay.endMs,
      pointerMs: laneMs(event.clientX),
      downX: event.clientX,
      downY: event.clientY,
      moved: false,
      wasSelected,
      originalTrack: overlay.track,
      track: overlay.track,
    };
    longPress.current.start(event, (x, y) => {
      dragRef.current = null;
      openOverlayMenu(overlay, x, y);
    });
  };

  /** The layer under the pointer, counting the empty one at the bottom as a new layer. */
  const rowAt = (clientY: number, fallback: number): number => {
    const rows = rowsRef.current;
    if (!rows) return fallback;
    const box = rows.getBoundingClientRect();
    const count = rowCount(project.overlays);
    const row = Math.floor((clientY - box.top) / ROW_PX);
    return Math.max(0, Math.min(row, count - 1, MAX_TRACKS - 1));
  };

  const onClipMove = (event: React.PointerEvent<HTMLElement>): void => {
    longPress.current.move(event);
    const drag = dragRef.current;
    if (!drag || event.buttons === 0) return;
    // A few pixels of jitter between press and release is a click, not a drag.
    if (Math.abs(event.clientX - drag.downX) > CLICK_SLOP_PX || Math.abs(event.clientY - drag.downY) > ROW_PX / 2) {
      drag.moved = true;
    }

    const next = dragResult(drag, laneMs(event.clientX), { durationMs, minLengthMs: MIN_OVERLAY_MS });
    // ⌥ suspends snapping, which is the convention everywhere else and the only
    // way to place a clip on an exact frame.
    const free = event.altKey;
    // Only a move changes layer; trimming an end never should.
    drag.track = drag.mode === 'move' ? rowAt(event.clientY, drag.track) : drag.track;
    dispatch(actions.moveOverlayClip(
      drag.id,
      snap(next.startMs, SNAP_MS, free),
      snap(next.endMs, SNAP_MS, free),
      drag.track,
    ));
  };

  const endClipDrag = (): void => {
    longPress.current.cancel();
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;

    /*
     * Clicking a clip that was already selected moves the playhead there.
     *
     * The first click is for choosing the thing; a second says "and take me to
     * this moment in it". Reported as the missing half of selection: "when I
     * click an element on the timeline, the playhead does not move to that
     * click location… I keep looking for ways to bring the playhead to current
     * location" (D-087).
     */
    if (drag.mode === 'move' && !drag.moved && drag.wasSelected) {
      seekTo(laneMs(drag.downX));
      return;
    }
    if (drag.moved) {
      // Off anything it landed on, and with any emptied layer closed up — as
      // part of the same undo step as the drag itself.
      const before = useEditor.getState().project.overlays.find((o) => o.id === drag.id)?.track;
      dispatch(actions.settleOverlay(drag.id, drag.originalTrack));
      const after = useEditor.getState().project.overlays.find((o) => o.id === drag.id)?.track;
      if (before !== undefined && after !== undefined && after !== before) {
        showToast(`No room on L${before + 1} there, so it went on L${after + 1}.`);
      }
    }
    // One undo step for the whole drag, not one per pointermove.
    endInteraction();
  };

  const openOverlayMenu = (overlay: Overlay, x: number, y: number): void => {
    selectOverlay(overlay.id);
    holdStill();
    openMenu({
      x,
      y,
      title: labelFor(overlay),
      items: overlayMenu(overlay, seekTo, Math.max(overlay.startMs, Math.min(laneMs(x), overlay.endMs - 1))),
    });
  };

  const openSceneMenu = (index: number, x: number, y: number): void => {
    selectSceneClip(index);
    holdStill();
    const name = project.scenes[index] ? designName(project.scenes[index].templateId) : 'Scene';
    openMenu({ x, y, title: `Scene ${index + 1} · ${name}`, items: sceneMenu(index, seekTo, laneMs(x), openScenePicker) });
  };

  // ── Effects (D-100, D-106) ───────────────────────────────────────────────

  const fxRows = useMemo(() => {
    const rows = packEffectRows(laneEffects(project, spans, durationMs));
    // Always one row, so there is somewhere to see "+ Effect".
    return rows.length > 0 ? rows : [[]];
  }, [project, spans, durationMs]);

  // ── Adding overlays (§1.2) ───────────────────────────────────────────────

  const { tier, limits } = useEntitlements('motionAd');
  const [proNote, setProNote] = useState(false);
  // Shared with the phone's Add panel (D-109).
  const layers = useAddLayers();

  const rows = rowCount(project.overlays);
  const tick = tickIntervalMs(durationMs, laneWidth);
  const ticks: number[] = [];
  for (let t = 0; t <= durationMs; t += tick) ticks.push(t);

  return (
    <div
      ref={panelRef}
      className="relative flex shrink-0 flex-col border-t border-edge bg-panel"
      /*
       * As tall as its rows, up to half the window (D-106): a timeline that
       * gains effect rows or layers grows with them instead of hiding them
       * below a scrollbar. Dragging the top edge sets a height of your own;
       * double-clicking it goes back to fitting the rows.
       */
      style={
        embedded ? undefined
        : heldHeight !== null ? { height: heldHeight }
        : manualHeight === null ? { minHeight: grownTo, maxHeight: '50vh' }
        : { height: manualHeight }
      }
      aria-label="Timeline"
      /*
       * Held still while anything is being pressed or dragged in it: moving a
       * clip into the spare row adds a row, which would grow the panel and
       * move everything under the pointer half way through the gesture.
       */
      onPointerDownCapture={() => {
        if (manualHeight === null && !embedded) setHeldHeight(panelRef.current?.getBoundingClientRect().height ?? null);
      }}
    >
      {!embedded && <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize panel"
        title="Drag to resize · double-click to fit the rows"
        data-timeline-resize
        onPointerDown={(e) => {
          capturePointer(e.currentTarget, e.pointerId);
          resizeFrom.current = { y: e.clientY, height: panelRef.current?.getBoundingClientRect().height ?? 236 };
        }}
        onPointerMove={(e) => {
          const from = resizeFrom.current;
          if (!from || e.buttons === 0) return;
          const next = Math.round(Math.max(160, Math.min(window.innerHeight * 0.8, from.height - (e.clientY - from.y))));
          setManualHeight(next);
        }}
        onPointerUp={() => {
          resizeFrom.current = null;
          rememberHeight(manualHeight);
        }}
        onDoubleClick={() => { setManualHeight(null); rememberHeight(null); setGrownTo(MIN_PANEL_PX); }}
        className="absolute inset-x-0 -top-1 z-20 h-2 cursor-ns-resize hover:bg-[color-mix(in_srgb,var(--c-accent)_30%,transparent)]"
      />}
      {/* Transport and the "Add …" buttons. Scrolls sideways rather than
          pushing the page wider on a phone. */}
      <div className={`flex shrink-0 items-center gap-2 border-b border-edge px-3 py-1.5 ${embedded ? 'flex-wrap' : 'overflow-x-auto'}`}>
        <button
          type="button"
          onClick={() => { if (clock.playing) clock.pause(); else clock.play(); }}
          aria-label={playing ? 'Pause' : 'Play'}
          className="w-16 rounded-md border border-edge px-2 py-1 text-[12px] hover:bg-panel-alt"
        >
          {playing ? 'Pause' : 'Play'}
        </button>

        <span ref={readout} className="tabular w-32 text-[11px] text-ink-muted" />

        <div className="ml-2 flex items-center gap-1" role="group" aria-label="Add overlay">
          <AddButton onClick={layers.addPhoto} title="Add a photo overlay">+ Photo</AddButton>
          <AddButton onClick={layers.addText} title="Add a text overlay">+ Text</AddButton>
          <AddButton
            onClick={() => { openPicker({ target: { kind: 'timeline' } }); }}
            title="Add an effect at the playhead — snow, lightning, shake, a light leak…"
          >
            + Effect
          </AddButton>
          {/*
            * §12 keeps custom media behind Pro, and it stays behind Pro — but a
            * disabled button that does nothing when clicked is a dead end, not
            * a gate. It explains itself instead, and offers the dev switch §12
            * already specifies. The real upsell is M7's.
            */}
          <AddButton
            onClick={() => {
              if (!limits.customMedia) { setProNote(true); return; }
              layers.pickVideo();
            }}
            disabled={layers.videoBusy}
            title={limits.customMedia
              ? 'Add a video overlay'
              : 'Custom media is a Pro feature — click to find out how to enable it'}
          >
            {layers.videoBusy ? 'Reading…' : '+ Media'}
            {!limits.customMedia && (
              <span
                className="ml-1 rounded-sm px-1 text-[8px] font-bold uppercase"
                style={{ background: 'var(--c-pro-soft)', color: 'var(--c-pro)' }}
              >
                Pro
              </span>
            )}
          </AddButton>

          <AddButton
            onClick={layers.pickMusic}
            disabled={layers.musicBusy}
            title="Add a music track"
          >
            {layers.musicBusy ? 'Decoding…' : '+ Music'}
          </AddButton>
          {layers.inputs}
        </div>

        {proNote && !limits.customMedia && (
          <span className="flex items-center gap-1.5 text-[10px] text-ink-muted">
            Video overlays are Pro.
            {TIER_SWITCHABLE ? (
              <button
                type="button"
                onClick={() => { setTier('pro'); setProNote(false); }}
                className="rounded-md border px-1.5 py-0.5 text-[10px]"
                style={{ borderColor: 'var(--c-pro)', color: 'var(--c-pro)' }}
              >
                Switch to Pro ({tier === 'free' ? 'dev' : 'on'})
              </button>
            ) : (
              <span>Pro plans are coming soon.</span>
            )}
          </span>
        )}

        {layers.error !== null && (
          <span className="max-w-64 truncate text-[10px]" style={{ color: 'var(--c-danger)' }}>
            {layers.error}
          </span>
        )}

        <span className="ml-auto hidden shrink-0 text-[10px] text-ink-faint sm:inline">
          {project.scenes.length} scenes · {project.overlays.length} overlays
          {overhang && ` · music runs ${formatSeconds(durationMs - videoMs)} past the end`}
        </span>
      </div>

      <SceneTools />

      {/*
        * Tracks: one row per lane, its label and its content side by side.
        *
        * The labels used to be a separate column of fixed-height boxes beside
        * a column of lanes, and the two had drifted — the ruler was 20px and
        * its label 28px, so every row below sat 8px off its name. In one row
        * they cannot disagree, and a lane that grows takes its label with it.
        */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="relative"
          /*
           * Clicking anywhere on the timeline moves the playhead.
           *
           * Clips stop the event themselves, so dragging a scene, a layer or
           * the music still does what it did; this only catches the empty
           * space of a lane. Labels are not lanes and do not scrub.
           */
          onPointerDown={onLaneDown}
          onPointerMove={onLaneMove}
        >
          {/* Ruler, which is also the scrub surface. */}
          <Row label="Time" height={20} lane={false}>
            <div
              ref={laneRef}
              // Clipped, so the last second's label cannot push the panel sideways.
              className="relative h-full cursor-ew-resize overflow-hidden"
              onPointerDown={onRulerDown}
              onPointerMove={onRulerMove}
              role="slider"
              tabIndex={0}
              aria-label="Scrub"
              aria-valuemin={0}
              /*
               * The lane's length, because the playhead now reaches all of it.
               *
               * It used to report the video's, which was honest at the time —
               * the transport was clamped to the video and promising more would
               * have been a lie. Now the transport spans the lane so that
               * overhanging music can actually be auditioned, and this follows.
               */
              aria-valuemax={Math.round(durationMs)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                clock.seek(clock.timeMs + (e.key === 'ArrowRight' ? 100 : -100));
              }}
            >
              {ticks.map((t) => (
                <span
                  key={t}
                  className="tabular absolute top-0 border-l border-edge pl-1 text-[9px] leading-5 text-ink-faint"
                  style={{ left: `${msToPct(t, durationMs)}%` }}
                >
                  {formatSeconds(t)}
                </span>
              ))}
            </div>
          </Row>

          {/* Scene track. Clip widths come from the spans, so a transition
              overlap is visible as two clips that touch rather than a gap. */}
          <Row label="Scenes" height={36}>
            {spans.map((span) => {
              const active = span.index === selectedScene && selectedOverlay === null && selectedEffect === null;
              return (
                <button
                  key={span.scene.id}
                  type="button"
                  data-scene-clip={span.index}
                  onClick={(e) => {
                    if (sceneLongPress.current.fired || reorder.wasDrag()) return;
                    // Already selected? Then this click is about the moment,
                    // not the choice (D-087). Either way the scene is now the
                    // thing Delete would remove (D-104).
                    if (active) seekTo(laneMs(e.clientX));
                    selectSceneClip(span.index);
                    holdStill();
                  }}
                  onContextMenu={(e) => { e.preventDefault(); openSceneMenu(span.index, e.clientX, e.clientY); }}
                  onPointerDown={(e) => {
                    sceneLongPress.current.start(e, (x, y) => { openSceneMenu(span.index, x, y); });
                    reorder.handlers(span.index).onPointerDown(e);
                  }}
                  onPointerMove={(e) => { sceneLongPress.current.move(e); reorder.handlers(span.index).onPointerMove(e); }}
                  onPointerUp={(e) => { sceneLongPress.current.cancel(); reorder.handlers(span.index).onPointerUp(e); }}
                  onPointerCancel={() => { sceneLongPress.current.cancel(); reorder.handlers(span.index).onPointerCancel(); }}
                  aria-pressed={active}
                  title={`${designName(span.scene.templateId)} · ${formatSeconds(span.endMs - span.startMs)} — drag to rearrange`}
                  className="absolute inset-y-1 overflow-hidden rounded-md border px-1.5 text-left text-[10px] transition-colors"
                  style={{
                    // Lifted while dragged (D-130): it follows the pointer, over the others.
                    ...(reorder.drag?.from === span.index
                      ? { transform: `translateX(${reorder.drag.dx}px)`, zIndex: 10, opacity: 0.9, cursor: 'grabbing', boxShadow: 'var(--shadow-lg)' }
                      : {}),
                    left: `${msToPct(span.startMs, durationMs)}%`,
                    width: `${msToPct(span.endMs, durationMs) - msToPct(span.startMs, durationMs)}%`,
                    borderColor: active ? 'var(--c-accent)' : 'var(--c-edge-strong)',
                    background: active ? 'var(--c-accent-soft)' : 'var(--c-panel-alt)',
                    color: active ? 'var(--c-accent)' : 'var(--c-ink-muted)',
                    fontWeight: active ? 600 : 400,
                    ...(reorder.drag?.from === span.index ? {} : { boxShadow: active && sceneClipSelected ? '0 0 0 1px var(--c-accent)' : 'none' }),
                    transitionDuration: 'var(--t-fast)',
                    WebkitTouchCallout: 'none',
                  }}
                >
                  <span className="block truncate leading-[26px]">
                    {span.index + 1}. {designName(span.scene.templateId)}
                  </span>
                  {span.transitionIn && span.transitionIn.kind !== 'cut' && (
                    <span
                      className="pointer-events-none absolute inset-y-0 left-0 border-l-2 border-dashed"
                      style={{
                        width: `${((span.transitionEndMs - span.transitionStartMs) / Math.max(1, span.endMs - span.startMs)) * 100}%`,
                        borderColor: 'var(--c-accent)',
                        background: 'color-mix(in srgb, var(--c-accent) 12%, transparent)',
                      }}
                    />
                  )}
                </button>
              );
            })}
            {reorder.drag && reorder.drag.to !== reorder.drag.from && (
              <span
                aria-hidden
                data-scene-drop
                className="pointer-events-none absolute inset-y-0 z-20 w-1 -translate-x-1/2 rounded-full"
                style={{ left: `${msToPct(reorder.drag.markerMs, durationMs)}%`, background: 'var(--c-accent)' }}
              />
            )}
          </Row>

          {/*
            * The selected element's motion, on a lane of its own: a motion is
            * a span of time, so it belongs on the same time axis as everything.
            */}
          <Row label="Path" height={28}>
            <MotionLane spans={spans} durationMs={durationMs} onSeek={seekTo} />
          </Row>

          {/*
            * Effects (D-100, D-106): the timeline's own and every scene's, so
            * none of them is hidden inside a scene. Overlapping ones stack onto
            * rows of their own, so each can be picked up and trimmed.
            */}
          <div className="relative">
            {fxRows.map((row, r) => (
              <Row
                key={`fx-${r}`}
                label={r === 0 ? 'Effects' : ''}
                title="Effects — on the timeline (solid) and on scenes (dashed)"
                height={ROW_PX}
                laneProps={{ 'data-fx-lane': r }}
              >
                {r === 0 && row.length === 0 && (
                  <span className="pointer-events-none absolute inset-y-0 left-2 text-[10px] leading-7 text-ink-faint">
                    Effects at a moment — snow, lightning, a shake. Use “+ Effect” above.
                  </span>
                )}
              </Row>
            ))}
            <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: LABEL_PX }} data-lane="true">
              {fxRows.flatMap((row, r) => row.map((fx) => (
                <EffectClipView key={fx.clip.id} fx={fx} row={r} durationMs={durationMs} onSeek={seekTo} showScene />
              )))}
            </div>
          </div>

          {/*
            * Overlay layers, L1 first (§6.4 draws them in this order: L1 at the
            * back). The rows are lanes to click; the clips sit in one layer over
            * them and move between rows by position — never by being rebuilt
            * inside another row, which lost hold of the pointer mid-drag.
            */}
          <div ref={rowsRef} className="relative">
            {Array.from({ length: rows }, (_, row) => (
              /* Pressing a layer's empty stretch also makes it the layer new
                 elements go on (D-103). */
              <Row
                key={row}
                height={ROW_PX}
                labelNode={
                  <TrackGutter
                    track={row}
                    target={targetTrack === row}
                    empty={row >= rows - 1 && !project.overlays.some((o) => o.track === row)}
                    onChoose={() => { setTargetTrack(targetTrack === row ? null : row); }}
                  />
                }
                laneProps={{
                  'data-track-row': row,
                  style: targetTrack === row ? { background: 'color-mix(in srgb, var(--c-accent) 6%, transparent)' } : undefined,
                }}
              >
                {null}
              </Row>
            ))}
            <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: LABEL_PX }} data-lane="true">
              {project.overlays.map((overlay) => {
                    const active = overlay.id === selectedOverlay;
                    return (
                      <div
                        key={overlay.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={active}
                        aria-label={`${labelFor(overlay)}, layer ${overlay.track + 1}`}
                        title={`${labelFor(overlay)} · L${overlay.track + 1} · drag across to move, up or down to change layer, right-click for more`}
                        data-overlay-clip={overlay.id}
                        onPointerDown={(e) => { beginClipDrag(e, overlay, 'move'); }}
                        onPointerMove={onClipMove}
                        onPointerUp={endClipDrag}
                        onPointerCancel={endClipDrag}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openOverlayMenu(overlay, e.clientX, e.clientY); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') selectOverlay(overlay.id);
                          if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                            e.preventDefault();
                            const box = e.currentTarget.getBoundingClientRect();
                            openOverlayMenu(overlay, box.left, box.bottom);
                          }
                        }}
                        data-track={overlay.track}
                        className="pointer-events-auto absolute cursor-grab touch-none select-none overflow-hidden rounded-sm border text-[10px] leading-[18px]"
                        style={{
                          top: overlay.track * ROW_PX + 4,
                          height: ROW_PX - 9,
                          left: `${msToPct(overlay.startMs, durationMs)}%`,
                          width: `${Math.max(1.2, msToPct(overlay.endMs, durationMs) - msToPct(overlay.startMs, durationMs))}%`,
                          borderColor: active ? 'var(--c-accent)' : 'var(--c-edge-strong)',
                          background: active ? 'var(--c-accent-soft)' : 'var(--c-panel-alt)',
                          color: active ? 'var(--c-accent)' : 'var(--c-ink-muted)',
                          WebkitTouchCallout: 'none',
                        }}
                      >
                        <TrimHandle side="start" onDown={(e) => { beginClipDrag(e, overlay, 'trimStart'); }} onMove={onClipMove} onUp={endClipDrag} />
                        <span className="pointer-events-none block truncate px-3">{labelFor(overlay)}</span>
                        {active && (
                          <MoreButton label={`More for ${labelFor(overlay)}`} onOpen={(x, y) => { openOverlayMenu(overlay, x, y); }} />
                        )}
                        <TrimHandle side="end" onDown={(e) => { beginClipDrag(e, overlay, 'trimEnd'); }} onMove={onClipMove} onUp={endClipDrag} />
                      </div>
                    );
                })}
            </div>
          </div>

          {/* §1.2's dedicated music track, §10's waveform. */}
          <Row label="Music" height={28}>
            <MusicTrack
              clips={project.audio}
              durationMs={durationMs}
              videoMs={videoMs}
              laneWidth={laneWidth}
              onSeek={seekTo}
            />
          </Row>

          {/* Over the lanes only, never the labels. */}
          <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: LABEL_PX }}>
            {/*
              * Everything past the end of the video, dimmed: D-053 cuts the
              * exported mix to the video's length, and this makes it visible.
              */}
            {overhang && (
              <div
                className="pointer-events-none absolute inset-y-0"
                style={{
                  left: `${msToPct(videoMs, durationMs)}%`,
                  right: 0,
                  background: 'color-mix(in srgb, var(--c-stage) 55%, transparent)',
                  borderLeft: '1px dashed var(--c-edge-strong)',
                }}
                aria-hidden
              />
            )}

            {/* Playhead, over every row. */}
            <div
              ref={playheadLine}
              data-playhead
              className="pointer-events-none absolute inset-y-0 left-0 w-px"
              style={{ background: 'var(--c-accent)' }}
              aria-hidden
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const HEIGHT_KEY = 'ms.timelineHeight';
/** The least the timeline panel is ever given, so the transport and a few rows always show. */
const MIN_PANEL_PX = 200;

/** A per-viewer convenience, like the theme: never document data, never required. */
function readHeight(): number | null {
  try {
    const stored = Number(localStorage.getItem(HEIGHT_KEY));
    return Number.isFinite(stored) && stored >= 160 ? stored : null;
  } catch {
    return null;
  }
}

function rememberHeight(height: number | null): void {
  try {
    if (height === null) localStorage.removeItem(HEIGHT_KEY);
    else localStorage.setItem(HEIGHT_KEY, String(height));
  } catch {
    // A remembered height is a convenience; failing to store it changes nothing.
  }
}

/** The height of one layer row, which a drag between layers is measured in. */
const ROW_PX = 28;

/** The label column's width — wide enough for the labels to be words. */
const LABEL_PX = 80;

/**
 * One row of the timeline: its label and its lane, the same height by
 * construction. The lane is a time axis (`data-lane`) unless told otherwise,
 * so a press on its empty stretch moves the playhead.
 */
function Row({
  label,
  labelNode,
  title,
  height,
  lane = true,
  laneProps,
  children,
}: {
  label?: string;
  labelNode?: React.ReactNode;
  title?: string;
  height: number;
  lane?: boolean;
  laneProps?: Record<string, unknown> & { style?: React.CSSProperties | undefined };
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex border-b border-edge" style={{ height }}>
      <div
        className="flex shrink-0 items-center truncate border-r border-edge text-[10px] uppercase tracking-wide text-ink-faint"
        style={{ width: LABEL_PX, paddingInline: labelNode === undefined ? 8 : 0 }}
        title={title}
      >
        {labelNode ?? label}
      </div>
      <div className="relative min-w-0 flex-1" {...(lane ? { 'data-lane': 'true' } : {})} {...laneProps}>
        {children}
      </div>
    </div>
  );
}

/**
 * A layer's label, which is also how to choose it: new elements go on the
 * chosen layer (D-103). Saying so in the tooltip is what makes it findable.
 */
function TrackGutter({
  track,
  target,
  empty,
  onChoose,
}: {
  track: number;
  target: boolean;
  empty: boolean;
  onChoose: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-pressed={target}
      data-track-label={track}
      title={
        empty
          ? 'An empty layer: drag a clip here to put it in front of everything else.'
          : `Layer ${track + 1}${track === 0 ? ' — at the back' : ''}. Click to add new elements here.`
      }
      className="block h-full w-full truncate px-2 text-left text-[10px] uppercase tracking-wide"
      style={{
        lineHeight: `${ROW_PX - 1}px`,
        color: target ? 'var(--c-accent)' : 'var(--c-ink-faint)',
        background: target ? 'var(--c-accent-soft)' : 'transparent',
        fontWeight: target ? 600 : 400,
      }}
    >
      {`Layer ${track + 1}`}
      {target && <span className="ml-1 normal-case tracking-normal">· adding here</span>}
    </button>
  );
}

function labelFor(overlay: Overlay): string {
  if (overlay.content.kind === 'text') return overlay.content.text || 'Text';
  return overlay.content.kind === 'photo' ? 'Photo' : 'Media';
}

function AddButton({
  onClick,
  children,
  disabled,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  title: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-md border border-edge px-2 py-1 text-[11px] text-ink-muted hover:bg-panel-alt disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * Whatever is selected, and what its motion is doing.
 *
 * One lane for all of them. An overlay, a template photograph and a block of
 * template text are three different things in the document and exactly the same
 * thing here — something with a span of time attached — so giving each its own
 * row would be three rows of which two are always empty.
 *
 * The lane says something even when there is no motion, because the commonest
 * report about this feature was never that it worked badly. It was that nobody
 * could find it.
 */
function MotionLane({
  spans,
  durationMs,
  onSeek,
}: {
  spans: readonly SceneSpan[];
  durationMs: number;
  onSeek: (projectMs: number) => void;
}): React.JSX.Element {
  const overlay = useEditor((s) => s.project.overlays.find((o) => o.id === s.selectedOverlay) ?? null);
  const selectedSlot = useEditor((s) => s.selectedSlot);

  if (overlay) return <OverlayMotion overlay={overlay} durationMs={durationMs} onSeek={onSeek} />;
  if (selectedSlot !== null) {
    return <SlotMotion slotKey={selectedSlot} spans={spans} durationMs={durationMs} onSeek={onSeek} />;
  }
  return <LaneNote>Select a photo, some text or a layer to make it travel along a path.</LaneNote>;
}

function LaneNote({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[10px] text-ink-faint">
      {children}
    </span>
  );
}

/**
 * The way in, on the lane rather than only in the panel.
 *
 * Named "+ Motion" to sit alongside "+ Photo" and "+ Text" in the toolbar
 * above, and so that it does not collide with the panel's own "Add motion" —
 * two controls with one name is a worse problem than a slightly terser label.
 */
function AddMotionHere({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className="absolute inset-y-0 left-2 flex items-center gap-2">
      <button
        type="button"
        onPointerDown={(e) => { e.stopPropagation(); }}
        onClick={onAdd}
        title="Give the selected element a motion"
        className="rounded-md border px-2 py-0.5 text-[10px] font-semibold"
        style={{ borderColor: 'var(--c-accent)', color: 'var(--c-accent)', background: 'var(--c-accent-soft)' }}
      >
        + Motion
      </button>
      <span className="pointer-events-none text-[10px] text-ink-faint">
        Then put the playhead at the end and drag it to say where it finishes.
      </span>
    </div>
  );
}

/**
 * The selected template element's motion.
 *
 * Times are in the scene's own clock, after §8.4's speed remap, so they have to
 * be mapped back out to the project's before anything is drawn — a scene played
 * at half speed spreads its motion over twice as much timeline.
 */
function SlotMotion({
  slotKey,
  spans,
  durationMs,
  onSeek,
}: {
  slotKey: string;
  spans: readonly SceneSpan[];
  durationMs: number;
  onSeek: (projectMs: number) => void;
}): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const playheadMs = useEditor((s) => s.playheadMs);
  const selectedScene = useEditor((s) => s.selectedScene);
  const transform = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.slotTransforms[slotKey]);

  const sceneSpan = spans[selectedScene];
  if (!sceneSpan) return <LaneNote>No scene selected.</LaneNote>;

  const speed = sceneSpan.scene.inputs.look.speed;
  const scale = speed === 0 ? 1 : 1 / speed;
  const sceneMs = sceneSpan.scene.durationMs;
  const localMs = Math.max(0, Math.min(Math.round((playheadMs - sceneSpan.startMs) * speed), sceneMs));

  if (!transform || !hasNudgePoses(transform)) {
    return (
      <AddMotionHere
        onAdd={() => {
          dispatch(actions.setSlotAnimated(slotKey, true, localMs));
          dispatch(actions.addSlotMotion(slotKey, localMs, sceneMs));
        }}
      />
    );
  }

  const times = nudgePoses(transform).map((pose) => pose.atMs);
  const span = spanOf(times);
  if (!span) return <LaneNote>No motion on this element.</LaneNote>;

  return (
    <MotionBar
      span={span}
      poseTimes={times}
      originMs={sceneSpan.startMs}
      scale={scale}
      laneMs={durationMs}
      onChange={(change) => { dispatch(actions.reshapeSlotMotion(slotKey, sceneMs, change)); }}
      onCommit={endInteraction}
      onSeek={(atMs) => { onSeek(sceneSpan.startMs + Math.min(atMs, sceneMs - 1) * scale); }}
    />
  );
}

/**
 * An overlay's motion.
 *
 * Times are the overlay's own (§6.1), so dragging the clip along the timeline
 * takes the motion with it and the bar follows on the next render.
 */
function OverlayMotion({
  overlay,
  durationMs,
  onSeek,
}: {
  overlay: Overlay;
  durationMs: number;
  onSeek: (projectMs: number) => void;
}): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const endInteraction = useEditor((s) => s.endInteraction);
  const playheadMs = useEditor((s) => s.playheadMs);

  const spanMs = Math.max(1, overlay.endMs - overlay.startMs);
  const localMs = Math.max(0, Math.min(Math.round(playheadMs - overlay.startMs), spanMs));

  if (!isAnimated(overlay)) {
    return (
      <AddMotionHere
        onAdd={() => {
          dispatch(actions.setOverlayAnimated(overlay.id, true, localMs));
          dispatch(actions.addOverlayMotion(overlay.id, localMs));
        }}
      />
    );
  }

  const times = posesOf(overlay).map((pose) => pose.atMs);
  const span = spanOf(times);
  if (!span) return <LaneNote>No motion on this overlay.</LaneNote>;

  return (
    <MotionBar
      span={span}
      poseTimes={times}
      originMs={overlay.startMs}
      scale={1}
      laneMs={durationMs}
      onChange={(change) => { dispatch(actions.reshapeOverlayMotion(overlay.id, change)); }}
      onCommit={endInteraction}
      /*
       * Never the exact end: a layer's range is half-open, so the instant a
       * motion finishes is the first instant the overlay is gone, and standing
       * there leaves nothing on screen to drag.
       */
      onSeek={(atMs) => { onSeek(overlay.startMs + Math.min(atMs, spanMs - 1)); }}
    />
  );
}

/**
 * A scene's design by the name people chose it by — "Float Away", not
 * "pop-float". The id is an internal key and reads as a bug in a timeline.
 */
function designName(templateId: string): string {
  return summaryFor(templateId)?.name ?? templateId;
}

