import { TopBar } from '@/ui/shell/TopBar';
import { AppShell } from '@/ui/shell/AppShell';
import { DurationUpsell } from '@/ui/shell/DurationUpsell';
import { useLayout } from '@/ui/shell/useLayout';
import { useMemo } from 'react';
import { MediaStore } from '@/media/store';
import { MediaProvider } from '@/ui/media/MediaProvider';

export default function App(): React.JSX.Element {
  // A phone has its own top bar and its own one-line notice (D-109).
  const phone = useLayout() === 'phone';
  // The editor's photos, videos and sounds, for the editor and for the top
  // bar's menu alike (D-141).
  const media = useMemo(() => new MediaStore(), []);
  return (
    <MediaProvider store={media}>
    <div className="flex h-full flex-col">
      {!phone && <TopBar />}
      <DurationUpsell />
      <AppShell media={media} />
      {/* A test release is open to anyone with the link, so it says what it is. */}
      {!phone && <footer
        data-disclaimer
        className="shrink-0 border-t border-edge bg-panel px-3 py-1 text-center text-[10px] text-ink-faint"
      >
        Q Motion Studio is in development. Features may change and work may be lost — use at your own risk, and
        export anything you want to keep. Your photos stay on your device; nothing is uploaded.
      </footer>}
    </div>
    </MediaProvider>
  );
}
