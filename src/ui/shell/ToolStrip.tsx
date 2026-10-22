import { useEditor, type InspectorTab } from '@/state/store';
import { StartActions } from '@/ui/editing/StartActions';
import { Icon, type IconName } from '@/ui/mobile/Icon';
import { useOverlays } from './overlays';
import { MODE_COPY } from './modeLabels';
import { SideScroll } from './SideScroll';
import { useLayout } from './useLayout';
import { showBackgroundSettings } from '@/ui/editing/commands';

/**
 * The phone's way in, on a computer too (D-116).
 *
 * "On Desktop, the Designs, Photos, Text, Effects, and Style icon, I would love
 * them to be shown too, maybe below as it seems to me as an easier way for
 * visitors to approach the product." The same two buttons and the same
 * labelled tools as the phone's toolbar, under the picture: the side panels
 * are still there for people who know where things are, and this is the
 * front door for everyone else.
 *
 * Photos, Text, Effects and Style open those pages of the inspector — beside
 * the picture on a wide screen, as a sheet on a narrower one (`onOpenPanel`).
 * Designs opens its own window. Adding things is the add bar's, beside the
 * scrubber or in the timeline (D-153), so this has no Add of its own; and it
 * is one row that scrolls sideways rather than two, so the picture keeps the
 * height a second row took.
 */
type Tool = {
  readonly label: string;
  readonly icon: IconName;
  readonly tab?: InspectorTab;
  readonly panel?: 'designs';
  /** Style's Background section, wherever Style is on this screen (D-120). */
  readonly background?: true;
};

const TOOLS: readonly Tool[] = [
  { label: 'Designs', icon: 'designs', panel: 'designs' },
  { label: 'Photos', icon: 'photo', tab: 'photos' },
  { label: 'Text', icon: 'text', tab: 'text' },
  { label: 'Effects', icon: 'effects', tab: 'motion' },
  { label: 'Style', icon: 'style', tab: 'look' },
  { label: 'Background', icon: 'background', background: true },
];

export function ToolStrip({ onOpenPanel }: { onOpenPanel?: (() => void) | undefined }): React.JSX.Element {
  const tab = useEditor((s) => s.inspectorTab);
  // The inspector shows the selection's own settings while something is selected.
  const elementSelected = useEditor((s) =>
    s.selectedOverlay !== null || s.selectedAudio !== null || s.selectedEffect !== null,
  );
  const openPanel = useOverlays((o) => o.openPhonePanel);
  const layout = useLayout();
  const mode = useEditor((s) => s.project.mode);

  const show = (tool: Tool): void => {
    if (tool.background) {
      showBackgroundSettings(layout);
      return;
    }
    if (tool.panel) {
      openPanel(tool.panel);
      return;
    }
    if (!tool.tab) return;
    const s = useEditor.getState();
    // Put down a layer, music or effect, so the page asked for is what shows.
    s.selectOverlay(null);
    s.selectAudio(null);
    s.selectEffect(null);
    s.setInspectorTab(tool.tab);
    onOpenPanel?.();
  };

  return (
    <div data-tool-strip className="flex shrink-0 flex-col border-t border-edge bg-panel px-3 py-2">
      <SideScroll className="flex-1">
        {/* Centred while it fits; `mx-auto` rather than centring the row, which would cut off its start once it scrolls.
            Spaced to fit whole beside both side panels on a 1366px laptop. */}
        <div className="mx-auto flex w-max shrink-0 items-center gap-x-4">
          <StartActions variant="wide" onChooseDesign={() => { openPanel('designs'); }} />
          <nav aria-label="Tools" className="flex items-stretch gap-1">
            {TOOLS.map((tool) => {
              // Lit only where the inspector is on screen beside the picture.
              const on = onOpenPanel === undefined && tool.tab !== undefined && tool.tab === tab && !elementSelected;
              return (
                <button
                  key={tool.label}
                  type="button"
                  onClick={() => { show(tool); }}
                  aria-pressed={tool.tab === undefined ? undefined : on}
                  title={tool.background ? 'Change the background: a colour, a gradient or a picture of your own' : tool.tab === undefined ? undefined : `Show ${tool.label.toLowerCase()} settings`}
                  className="flex min-w-16 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[11px] hover:bg-panel-alt"
                  style={{ color: on ? 'var(--c-accent)' : 'var(--c-ink)' }}
                >
                  <Icon name={tool.icon} size={20} />
                  <span>{tool.panel === 'designs' ? MODE_COPY[mode].tool : tool.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </SideScroll>
    </div>
  );
}
