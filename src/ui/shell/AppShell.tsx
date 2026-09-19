import { useEffect, useMemo } from 'react';
import { Artboard } from '@/ui/artboard/Artboard';
import { ScrubBar } from '@/ui/artboard/ScrubBar';
import { LibraryRail } from '@/ui/library/LibraryRail';
import { Inspector } from '@/ui/inspector/Inspector';
import { PerfOverlay } from '@/dev/PerfOverlay';
import { PreviewClock } from '@/core/time/clock';
import { createRenderRig, disposeRenderRig } from '@/core/render/rig';
import { useEditor } from '@/state/store';
import { totalDurationMs } from '@/document/select/timeline';
import { MediaStore } from '@/media/store';
import { loadSamples } from '@/media/samples';
import { loadTemplate } from '@/templates/registry';
import { DEMO_TEMPLATE_ID, PLACEHOLDER_TEMPLATE_ID } from '@/document/defaults';
import { renderParams } from '@/dev/renderParams';

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
  }, [clock]);
  useEffect(() => () => { disposeRenderRig(rig); }, [rig]);

  /**
   * The registry is lazy (D-029), so the active scene's template has to be
   * fetched before the renderer can draw it. renderFrame reads it synchronously
   * from the cache and draws nothing until it lands — one blank frame, not an
   * error.
   */
  const templateId = project.scenes[0]?.templateId;
  useEffect(() => {
    if (!templateId || templateId === DEMO_TEMPLATE_ID || templateId === PLACEHOLDER_TEMPLATE_ID) return;
    let cancelled = false;
    loadTemplate(templateId)
      .then(() => {
        // Clearing the layer cache forces a rebuild now that build() exists.
        if (!cancelled) rig.layerCache.clear();
      })
      .catch((error: unknown) => {
        // §16: a malformed or missing template is a build mistake, not
        // something to paper over with an empty artboard.
        console.error(`Failed to load template "${templateId}".`, error);
      });
    return () => { cancelled = true; };
  }, [templateId, rig]);

  /** Sample photos, so a new project opens with something to look at (§8.1). */
  useEffect(() => {
    let cancelled = false;
    loadSamples(media, { artboardLongestEdge: 1920 })
      .then(() => {
        if (!cancelled) rig.layerCache.clear();
      })
      .catch((error: unknown) => {
        console.error('Failed to load sample photos.', error);
      });
    return () => { cancelled = true; };
  }, [media, rig]);

  // Dev-only handle so the visual suite can assert on the real renderer's
  // counters — in particular that build() is not running per frame (§16).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (globalThis as unknown as { __motionStudio?: unknown }).__motionStudio = {
      stats: rig.stats,
      textCacheSize: () => rig.textCache.size,
    };
  }, [rig]);

  // §13: space toggles playback. Focus-scoped so it does not fight a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (typing) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (clock.playing) clock.pause();
        else clock.play();
      }
    };
    addEventListener('keydown', onKey);
    return () => { removeEventListener('keydown', onKey); };
  }, [clock]);

  return (
    <div className="flex h-full min-h-0 flex-1">
      <LibraryRail />
      <main className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--c-stage)' }}>
        <div className="relative min-h-0 flex-1">
          <Artboard project={project} clock={clock} rig={rig} />
          <PerfOverlay rig={rig} />
        </div>
        <ScrubBar clock={clock} />
      </main>
      <Inspector />
    </div>
  );
}
