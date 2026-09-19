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
import { totalDurationMs } from '@/document/select/timeline';
import { MediaProvider } from '@/ui/media/MediaProvider';
import { MediaStore } from '@/media/store';
import { loadSamples, sampleNameOf, type SampleName } from '@/media/samples';
import { loadTemplate } from '@/templates/registry';
import { DEMO_TEMPLATE_ID, PLACEHOLDER_TEMPLATE_ID } from '@/document/defaults';
import { renderParams } from '@/dev/renderParams';
import { useKeyboard } from '@/ui/hooks/useKeyboard';
import { useAudioPlayback } from '@/ui/audio/useAudioPlayback';
import { Toast } from './Toast';
import { ExportDialog } from '@/ui/export/ExportDialog';

export function AppShell(): React.JSX.Element {
  const project = useEditor((s) => s.project);
  const duration = totalDurationMs(project);

  // One media store, rig and clock for the preview. The export path will create
  // its own set, which is the whole point of D-001 — the two never share
  // scratch space.
  const media = useMemo(() => new MediaStore(), []);
  // Created empty on purpose: duration is owned by the effect below, so the
  // clock never needs rebuilding when the document's length changes.
  const clock = useMemo(() => new PreviewClock(0), []);
  const rig = useMemo(() => createRenderRig(media), [media]);

  useEffect(() => { clock.setDuration(duration); }, [clock, duration]);

  /**
   * `?frozen=<ms>` parks the playhead at an exact time instead of playing.
   *
   * This is the deterministic render hook the visual tests need — a moving
   * frame cannot have a stable baseline — and it is the same hook M4 uses to
   * compare a preview frame against an exported one at identical times, which
   * is the only way "matches the preview" can actually be asserted.
   */
  useEffect(() => {
    const frozen = renderParams().frozenMs;
    if (frozen === null) {
      clock.play();
      return;
    }
    clock.seek(frozen);
    clock.pause();
    /*
     * Re-seeks when the document's length changes, which it does once for
     * every Motion Ad: the project starts as a placeholder and only reaches
     * thirty seconds after the ad template has expanded. `seek` clamps to the
     * current duration, so freezing this once on mount parked every ad at the
     * ten-second placeholder length and quietly rendered the wrong frame.
     */
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
    if (pending !== null) setTemplateById(pending);
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
      textCacheSize: () => rig.textCache.size,
      /*
       * §10 budgets under one frame of drift across a sixty-second preview,
       * which is met by making the audio clock the only clock (D-054) rather
       * than by keeping two in step. `audioMastered` is how a test can tell
       * which of those is actually happening.
       */
      clock: {
        timeMs: () => clock.timeMs,
        playing: () => clock.playing,
        audioMastered: () => clock.audioMastered,
      },
    };
  }, [rig, clock]);

  /**
   * §10's synced preview. The engine masters the clock while it is sounding,
   * so the visual loop follows the audio device rather than the other way
   * round (D-054).
   */
  useAudioPlayback(clock, project.audio, media, duration);

  const [toast, setToast] = useState<string | null>(null);
  const exporting = useEditor((s) => s.exporting);
  const setExporting = useEditor((s) => s.setExporting);

  const onExport = useCallback(() => { setExporting(true); }, [setExporting]);
  const onSaveNote = useCallback(() => { setToast('Saves automatically.'); }, []);
  useKeyboard(clock, { onExport, onSaveNote });

  return (
    <MediaProvider store={media}>
      <div className="flex h-full min-h-0 flex-1">
        <LibraryRail />
        <main className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--c-stage)' }}>
          <div className="relative min-h-0 flex-1">
            <Artboard project={project} clock={clock} rig={rig} media={media} />
            <PerfOverlay rig={rig} />
          </div>
          {project.mode === 'motionAd' ? <Timeline clock={clock} /> : <ScrubBar clock={clock} />}
        </main>
        <Inspector />
      </div>
      {exporting && <ExportDialog onClose={() => { setExporting(false); }} />}
      <Toast message={toast} onDone={() => { setToast(null); }} />
    </MediaProvider>
  );
}
