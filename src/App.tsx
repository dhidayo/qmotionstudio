import { AppShell } from '@/ui/shell/AppShell';
import { DurationUpsell } from '@/ui/shell/DurationUpsell';
import { useShownLayout, WIDE_TOP_BAR } from '@/ui/shell/layouts';
import { BootScreen } from '@/ui/shell/BootScreen';
import { PartBoundary } from '@/ui/shell/Boundaries';
import { Suspense, useMemo } from 'react';
import { MediaStore } from '@/media/store';
import { MediaProvider } from '@/ui/media/MediaProvider';

export default function App(): React.JSX.Element {
  // A phone has its own top bar and its own one-line notice (D-109), and its own chunk (D-173).
  const layout = useShownLayout();
  const phone = layout === 'phone';
  // The editor's photos, videos and sounds, for the editor and for the top
  // bar's menu alike (D-141).
  const media = useMemo(() => new MediaStore(), []);
  return (
    <MediaProvider store={media}>
    {/*
      * Until this device's layout has arrived, the start-up screen the page
      * opened with stays (D-112, D-173): the editor appears whole, as it did
      * when it was all one script, never a top bar first and its panels after.
      * A layout that did not download says so, with Reload (D-171).
      */}
    <PartBoundary whole>
    <Suspense fallback={<BootScreen />}>
    <div className="flex h-full flex-col">
      {!phone && <WIDE_TOP_BAR.Component />}
      <DurationUpsell />
      <AppShell media={media} layout={layout} />
      {/* A test release is open to anyone with the link, so it says what it is. */}
      {!phone && <footer
        data-disclaimer
        className="shrink-0 border-t border-edge bg-panel px-3 py-1 text-center text-[10px] text-ink-faint"
      >
        Q Motion Studio is in development. Features may change and work may be lost — use at your own risk, and
        export anything you want to keep. Your photos stay on your device; nothing is uploaded.
      </footer>}
    </div>
    </Suspense>
    </PartBoundary>
    </MediaProvider>
  );
}
