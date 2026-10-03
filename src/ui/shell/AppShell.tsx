import { useCallback, useEffect, useMemo, useState } from 'react';
import { Artboard } from '@/ui/artboard/Artboard';
import { ScrubBar } from '@/ui/artboard/ScrubBar';
import { Timeline } from '@/ui/timeline/Timeline';
import { LibraryRail } from '@/ui/library/LibraryRail';
import { Inspector } from '@/ui/inspector/Inspector';
import { PerfOverlay } from '@/dev/PerfOverlay';
import { PreviewClock } from '@/core/time/clock';
import { createRenderRig, disposeRenderRig } from '@/core/render/rig';
import { pendingAdTemplateId, useEditor } from '@/state/store';
import * as documentActions from '@/document/actions';
import { timelineSpanMs } from '@/document/select/timeline';
import { MediaProvider } from '@/ui/media/MediaProvider';
import { watermarked } from '@/entitlements';
import { ClockProvider } from './ClockProvider';
import { Sheet } from './Sheet';
import { useLayout } from './useLayout';
import { ProjectsDialog } from '@/ui/projects/ProjectsDialog';
import { MediaStore } from '@/media/store';
import { loadSamples, sampleNameOf, type SampleName } from '@/media/samples';
import { loadTemplate } from '@/templates/registry';
import { DEMO_TEMPLATE_ID, PLACEHOLDER_TEMPLATE_ID } from '@/document/defaults';
import { renderParams } from '@/dev/renderParams';
import { useKeyboard } from '@/ui/hooks/useKeyboard';
import { useAudioPlayback } from '@/ui/audio/useAudioPlayback';
import { useAutosave } from '@/ui/persist/useAutosave';
import { useRestore } from '@/ui/persist/useRestore';
import { Toast } from './Toast';
import { ContextMenu } from './ContextMenu';
import { EffectPicker } from '@/ui/effects/EffectPicker';
import { ExportDialog } from '@/ui/export/ExportDialog';

export function AppShell(): React.JSX.Element {
  const project = useEditor((s) => s.project);

  /*
   * The playhead travels the whole lane, not just the video.
   *
   * Music routinely outlasts the piece it scores, and deciding where to cut it
   * means being able to hear the part you are cutting. Confining the transport
   * to the video made every second of overhang unreachable — visible on the
   * timeline, editable by slider, and impossible to listen to.
   *
   * `videoMs` is still what renders and exports; only the transport is longer.
   * With no audio the two are identical, so nothing changes for Showcase or
   * for a silent project.
   */
  const duration = timelineSpanMs(project);

  // One media store, rig and clock for the preview. The export path will create
  // its own set, which is the whole point of D-001 — the two never share
  // scratch space.
  const media = useMemo(() => new MediaStore(), []);
  // Created empty on purpose: duration is owned by the effect below, so the
  // clock never needs rebuilding when the document's length changes.
  const clock = useMemo(() => new PreviewClock(0), []);
  /*
   * §12's watermark, on the preview as well as on the export.
   *
   * Showing it only at export would be a nasty surprise at exactly the wrong
   * moment. The rig asks the entitlements module each frame rather than being
   * handed a value, so the rig is built once and still follows a tier change
   * immediately — rebuilding it would throw away every cache over a toggle.
   */
  const rig = useMemo(
    () =>
      createRenderRig(media, () => {
        /*
         * Not on a capture or a fixture.
         *
         * `?thumb=` is the thumbnail job photographing a template for the
         * library, and `?scene=` is a render-core fixture. Neither is a
         * document somebody is making, so neither should carry a mark that
         * says a free user made it — a watermarked template thumbnail would
         * be advertising the limitation rather than the template.
         */
        const params = renderParams();
        if (params.thumbShortEdge !== null || params.scene !== null) return false;
        return watermarked();
      }),
    [media],
  );

  useEffect(() => { clock.setDuration(duration); }, [clock, duration]);

  /*
   * Publish the playhead, wherever the transport happens to be.
   *
   * This used to live in the Timeline, which only exists in Motion Ads — so in
   * Showcase the published playhead never moved off zero, and everything that
   * reads it was quietly wrong: a keyframe added at four seconds was recorded
   * at zero, and the canvas believed nothing had moved. The playhead is a
   * property of the application, not of one panel that happens to draw it.
   *
   * Every frame, not on a timer.
   *
   * It was 20Hz, on the reasoning that this only feeds chrome that displays the
   * time — which was true until the selection box started following a moving
   * element. The artboard draws that element at 60fps and the outline round it
   * was being placed 20 times a second, so during playback the picture moved
   * smoothly and its outline stepped along behind it. Reported exactly that
   * way: "the image moved fast and the outline moves slowly".
   *
   * Published only when it has actually changed, so a paused editor does no
   * work at all and nothing re-renders while nothing is happening.
   */
  const setPlayhead = useEditor((s) => s.setPlayhead);
  useEffect(() => {
    let handle = 0;
    let last = -1;

    const tick = (): void => {
      const now = clock.timeMs;
      if (now !== last) {
        last = now;
        setPlayhead(now);
      }
      handle = requestAnimationFrame(tick);
    };

    handle = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(handle); };
  }, [clock, setPlayhead]);



  /**
   * `?frozen=<ms>` parks the playhead at an exact time instead of playing.
   *
   * This is the deterministic render hook the visual tests need — a moving
   * frame cannot have a stable baseline — and it is the same hook M4 uses to
   * compare a preview frame against an exported one at identical times, which
   * is the only way "matches the preview" can actually be asserted.
   */
  useEffect(() => {
    if (renderParams().frozenMs === null) clock.play();
    // Mount only. Autoplay is a decision about how the editor *opens*, not a
    // rule to be re-imposed: re-running this on every duration change meant
    // that pausing the preview and then touching anything that alters the
    // timeline's length — adding music, dragging a music clip past the end of
    // the video, retiming or adding a scene — slammed the transport back into
    // play underneath the user. Making the lane span the whole track turned
    // that from occasional into constant, because now every music gesture
    // moves the duration.
  }, [clock]);

  useEffect(() => {
    const frozen = renderParams().frozenMs;
    if (frozen === null) return;
    /*
     * Re-seeks when the document's length changes, which it does once for
     * every Motion Ad: the project starts as a placeholder and only reaches
     * thirty seconds after the ad template has expanded. `seek` clamps to the
     * current duration, so freezing this once on mount parked every ad at the
     * ten-second placeholder length and quietly rendered the wrong frame.
     *
     * Only while the transport is still parked, though. Pressing play releases
     * the freeze, and an ad that finishes expanding after that used to re-park
     * the playhead and pause — mid-playback, from an effect, for a reason the
     * user could not see.
     */
    if (clock.playing) return;
    clock.seek(frozen);
    clock.pause();
  }, [clock, duration]);
  useEffect(() => () => { disposeRenderRig(rig); }, [rig]);

  /**
   * The registry is lazy (D-029), so the active scene's template has to be
   * fetched before the renderer can draw it. renderFrame reads it synchronously
   * from the cache and draws nothing until it lands — one blank frame, not an
   * error.
   */
  const selectedScene = useEditor((s) => s.selectedScene);
  const setLoadedTemplate = useEditor((s) => s.setLoadedTemplate);

  // Every scene's template, not just the selected one: an ad's playhead reaches
  // beat four without anyone having selected it, and a template that is not in
  // the cache by then costs a blank beat rather than a blank frame.
  const templateIds = project.scenes.map((scene) => scene.templateId).join(',');
  const activeTemplateId = project.scenes[selectedScene]?.templateId;

  useEffect(() => {
    const ids = [...new Set(templateIds.split(',').filter((id) => id.length > 0))]
      .filter((id) => id !== DEMO_TEMPLATE_ID && id !== PLACEHOLDER_TEMPLATE_ID);

    if (ids.length === 0) {
      setLoadedTemplate(null);
      return;
    }

    let cancelled = false;
    Promise.all(ids.map((id) => loadTemplate(id)))
      .then((templates) => {
        if (cancelled) return;
        // Clearing the layer cache forces a rebuild now that build() exists.
        rig.layerCache.clear();
        const active = templates.find((t) => t.id === activeTemplateId);
        setLoadedTemplate(active?.kind === 'scene' ? active : null);
      })
      .catch((error: unknown) => {
        // §16: a malformed or missing template is a build mistake, not
        // something to paper over with an empty artboard.
        console.error('Failed to load a scene template.', error);
      });
    return () => { cancelled = true; };
  }, [templateIds, activeTemplateId, rig, setLoadedTemplate]);

  /**
   * `?template=<ad-id>` opens straight into an expanded ad, which is what the
   * thumbnail job and the visual suite drive Motion Ads through.
   */
  const setTemplateById = useEditor((s) => s.setTemplate);
  useEffect(() => {
    const pending = pendingAdTemplateId();
    if (pending !== null) setTemplateById(pending, { asBaseline: true });
  }, [setTemplateById]);

  /**
   * Sample photographs, so a new project opens with something to look at
   * (§8.1) — but only the ones this document actually references.
   *
   * The set is real photography now and weighs 1.16MB (D-049). A fresh
   * Showcase project shows four of the eight, and an ad references all eight
   * once it expands; fetching the whole set up front would spend half a
   * megabyte on photographs nobody has asked to see. The effect re-runs when
   * the reference set changes, and loadSamples skips what is already in.
   */
  const neededSamples = useMemo(() => {
    const names = new Set<SampleName>();
    for (const scene of project.scenes) {
      for (const photo of scene.inputs.photos) {
        const name = sampleNameOf(photo.mediaId);
        if (name) names.add(name);
      }
    }
    for (const overlay of project.overlays) {
      if (overlay.content.kind === 'text') continue;
      const name = sampleNameOf(overlay.content.mediaId);
      if (name) names.add(name);
    }
    return [...names].sort();
  }, [project]);

  // Joined, so the effect compares by value rather than by array identity.
  const neededKey = neededSamples.join(',');

  useEffect(() => {
    if (neededKey.length === 0) return;
    let cancelled = false;

    /*
     * Note what this deliberately does *not* do: clear the layer cache.
     *
     * It used to, defensively, and that was dead work. `BuildContext` has no
     * access to the media store at all — a layer carries a `mediaId` and the
     * bitmap is looked up at draw time in image.ts — so a photograph finishing
     * its decode cannot change what `build()` produced. Clearing threw away a
     * valid cache and paid for a full rebuild to get an identical result.
     *
     * It was also a race. The clear fired whenever the decode happened to
     * land, so "rebuilds exactly once when the aspect changes" (§3B) passed or
     * failed depending on whether a fetch resolved inside the test's window —
     * invisible while the samples were 95KB gradients, intermittent once they
     * became real photographs (D-049).
     */
    loadSamples(media, {
      artboardLongestEdge: 1920,
      names: neededKey.split(',') as SampleName[],
    })
      .catch((error: unknown) => {
        if (!cancelled) console.error('Failed to load sample photographs.', error);
      });

    return () => { cancelled = true; };
  }, [neededKey, media]);

  // Dev-only handle so the visual suite can assert on the real renderer's
  // counters — in particular that build() is not running per frame (§16).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (globalThis as unknown as { __motionStudio?: unknown }).__motionStudio = {
      stats: rig.stats,
      /*
       * The document's own action pipeline, for tests that set up a state the
       * UI would take many clicks to reach — twenty effects on one scene, say.
       * Development builds only, like the rest of this handle.
       */
      editor: useEditor,
      actions: documentActions,
      textCacheSize: () => rig.textCache.size,
      /*
       * §10 budgets under one frame of drift across a sixty-second preview,
       * which is met by making the audio clock the only clock (D-054) rather
       * than by keeping two in step. `audioMastered` is how a test can tell
       * which of those is actually happening.
       */
      clock: {
        timeMs: () => clock.timeMs,
        /** Stops and jumps, for tests that need a particular frame. */
        seek: (ms: number) => { clock.pause(); clock.seek(ms); },
        playing: () => clock.playing,
        audioMastered: () => clock.audioMastered,
      },
      /** Where the music sits on the timeline, for the playback tests. */
      audio: {
        clipStartMs: (): number | null => project.audio[0]?.startMs ?? null,
      },
    };
  }, [rig, clock, project.audio]);

  /**
   * §10's synced preview. The engine masters the clock while it is sounding,
   * so the visual loop follows the audio device rather than the other way
   * round (D-054).
   */
  useAudioPlayback(clock, project.audio, media, duration);

  /*
   * §13. Reopen the last project, then keep saving it.
   *
   * Autosave waits for the restore: writing before reading would save the
   * blank project the store starts with straight over the one on disk, which
   * is the single worst thing a save can do.
   */
  const projectsOpen = useEditor((s) => s.projectsOpen);
  const setProjectsOpen = useEditor((s) => s.setProjectsOpen);
  const restore = useRestore(media);
  useAutosave(project, media, restore.phase === 'ready');

  const layout = useLayout();
  /** Which panel is open as a sheet, below desktop width. Never both. */
  const [sheet, setSheet] = useState<'library' | 'inspector' | null>(null);

  const exporting = useEditor((s) => s.exporting);
  const setExporting = useEditor((s) => s.setExporting);

  const onExport = useCallback(() => { setExporting(true); }, [setExporting]);
  const showToast = useEditor((s) => s.showToast);
  const onSaveNote = useCallback(() => { showToast('Your work saves automatically.'); }, [showToast]);
  useKeyboard(clock, { onExport, onSaveNote });

  return (
    <MediaProvider store={media}>
      <ClockProvider clock={clock}>
      <div className="flex h-full min-h-0 flex-1">
        {/*
          * §13. Below tablet width the two side columns stop being columns:
          * at 1100px an artboard with both of them open is down to about
          * 520px, which is the point the preview stops being the biggest
          * thing on screen. They become sheets you open when you need them.
          */}
        {layout === 'desktop' && <LibraryRail />}

        <main className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--c-stage)' }}>
          {layout !== 'desktop' && (
            <div className="flex shrink-0 items-center gap-1.5 border-b border-edge bg-panel px-2 py-1.5">
              <button
                type="button"
                onClick={() => { setSheet(sheet === 'library' ? null : 'library'); }}
                aria-expanded={sheet === 'library'}
                className="rounded-md border border-edge px-2 py-1 text-[11px] hover:bg-panel-alt"
              >
                Templates
              </button>
              <button
                type="button"
                onClick={() => { setSheet(sheet === 'inspector' ? null : 'inspector'); }}
                aria-expanded={sheet === 'inspector'}
                className="rounded-md border border-edge px-2 py-1 text-[11px] hover:bg-panel-alt"
              >
                Edit
              </button>
            </div>
          )}

          <div className="relative min-h-0 flex-1">
            <Artboard project={project} clock={clock} rig={rig} media={media} />
            <PerfOverlay rig={rig} />
          </div>
          {project.mode === 'motionAd' ? <Timeline clock={clock} /> : <ScrubBar clock={clock} />}
        </main>

        {layout === 'desktop' && <Inspector />}
      </div>

      {layout !== 'desktop' && (
        <>
          <Sheet
            open={sheet === 'library'}
            title="Templates"
            side="left"
            onClose={() => { setSheet(null); }}
          >
            <LibraryRail />
          </Sheet>
          <Sheet
            open={sheet === 'inspector'}
            title="Edit"
            side="right"
            onClose={() => { setSheet(null); }}
          >
            <Inspector />
          </Sheet>
        </>
      )}
      {exporting && <ExportDialog onClose={() => { setExporting(false); }} />}
      <Toast />
      <ContextMenu />
      <EffectPicker />
        {projectsOpen && <ProjectsDialog onClose={() => { setProjectsOpen(false); }} />}
      </ClockProvider>
    </MediaProvider>
  );
}
