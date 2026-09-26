import { TopBar } from '@/ui/shell/TopBar';
import { AppShell } from '@/ui/shell/AppShell';
import { DurationUpsell } from '@/ui/shell/DurationUpsell';

export default function App(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <DurationUpsell />
      <AppShell />
    </div>
  );
}
