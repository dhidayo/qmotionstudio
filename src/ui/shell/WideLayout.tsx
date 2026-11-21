import { Suspense, useEffect } from 'react';
import { Artboard } from '@/ui/artboard/Artboard';
import { ScrubBar } from '@/ui/artboard/ScrubBar';
import { LibraryRail } from '@/ui/library/LibraryRail';
import { Inspector } from '@/ui/inspector/Inspector';
import { PerfOverlay } from '@/dev/PerfOverlay';
import { renderParams } from '@/dev/renderParams';
import { PhonePanelsPart } from '@/ui/mobile/phonePanelsPart';
import { PartBoundary } from './Boundaries';
import { Sheet } from './Sheet';
import { useOverlays } from './overlays';
import { PurposeBar } from './PurposeBar';
import { PaneResizer, restorePaneWidths } from './PaneResizer';
import { PartLoading } from './PartLoading';
import { TIMELINE } from './parts';
import type { LayoutProps } from './layouts';

/** The wide layout's top bar travels in its chunk (src/ui/shell/layouts.ts). */
export { TopBar } from './TopBar';

/**
 * The editor on a computer or a tablet: the library, the picture and the
 * inspector side by side, or the side columns as sheets below desktop width.
 * A chunk of its own, so a phone never downloads it (D-173).
 */
export function WideLayout({ project, clock, rig, media, layout }: LayoutProps & { layout: 'desktop' | 'tablet' }): React.JSX.Element {
  /** The inspector as a sheet, below desktop width. */
  const sheet = useOverlays((o) => o.inspectorSheet);
  const setSheet = useOverlays((o) => o.setInspectorSheet);
  // The panel widths chosen on an earlier visit (D-150).
  useEffect(() => { if (layout === 'desktop') restorePaneWidths(); }, [layout]);
  return (
    <>
      <div className="flex h-full min-h-0 flex-1">
        {/*
          * §13. Below tablet width the two side columns stop being columns:
          * at 1100px an artboard with both of them open is down to about
          * 520px, which is the point the preview stops being the biggest
          * thing on screen. They become sheets you open when you need them.
          */}
        {layout === 'desktop' && <><LibraryRail /><PaneResizer pane="library" /></>}

        <main className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--c-stage)' }}>
          <PurposeBar variant="wide" />
          <div className="relative min-h-0 flex-1">
            <Artboard project={project} clock={clock} rig={rig} media={media} />
            {(import.meta.env.DEV || renderParams().perf) && <PerfOverlay rig={rig} />}
          </div>
          {/*
            * One row of actions under the picture, in the timeline's header or
            * above the slider (D-162) — no strip of tools: the inspector's tabs
            * are the way to Photos, Text, Effects and Style. The timeline is
            * fetched for a video only; an image never needs it (D-173).
            */}
          {project.mode === 'motionAd'
            ? <PartBoundary><Suspense fallback={<PartLoading inline />}><TIMELINE.Component clock={clock} /></Suspense></PartBoundary>
            : <ScrubBar clock={clock} />}
        </main>

        {layout === 'desktop' && <><PaneResizer pane="inspector" /><Inspector /></>}
      </div>

      {layout !== 'desktop' && (
        <Sheet
          open={sheet}
          title="Photos, text and style"
          side="right"
          onClose={() => { setSheet(false); }}
        >
          <Inspector />
        </Sheet>
      )}
      {/* Designs, opened from the row of actions, and a scene's timing, as windows (D-116, D-162). */}
      <PhonePanelsPart clock={clock} scenePicker={false} />
    </>
  );
}
