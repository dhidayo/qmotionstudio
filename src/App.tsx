import { TopBar } from '@/ui/shell/TopBar';
import { AppShell } from '@/ui/shell/AppShell';
import { DurationUpsell } from '@/ui/shell/DurationUpsell';

export default function App(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <DurationUpsell />
      <AppShell />
      {/* A test release is open to anyone with the link, so it says what it is. */}
      <footer
        data-disclaimer
        className="shrink-0 border-t border-edge bg-panel px-3 py-1 text-center text-[10px] text-ink-faint"
      >
        Q Motion Studio is in development. Features may change and work may be lost — use at your own risk, and
        export anything you want to keep. Your photos stay on your device; nothing is uploaded.
      </footer>
    </div>
  );
}
