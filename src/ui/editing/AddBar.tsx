import { useEditor } from '@/state/store';
import { Icon } from '@/ui/mobile/Icon';
import { MODE_COPY } from '@/ui/shell/modeLabels';
import { useOverlays } from '@/ui/shell/overlays';
import { SideScroll } from '@/ui/shell/SideScroll';
import { useLayout } from '@/ui/shell/useLayout';
import { continueAsVideo } from './commands';
import { useAddItems, type AddItem } from './useAddItems';

/**
 * The row of actions under the picture, and the phone's Add sheet (D-153,
 * D-162).
 *
 * "Please ensure same buttons are not shown or both items are not shown two
 * different times with different representations." Under the picture there
 * used to be three rows — big start buttons, a strip of tools, and an add bar
 * — and photos could be added from four places that each looked different.
 * Now there is one row, each action in it once: **Choose a design** (Image) or
 * **Templates** (Video) first, then **+ Photos** — the one way to add photos —
 * then everything else that can be added, a video's **+ Scene** among them,
 * and an image's **Make a video** last. The inspector's tabs are the way to
 * Photos, Text, Effects and Style, so the row has no tools of its own; where
 * the inspector is a sheet rather than a column (a tablet) the row ends with
 * the button that opens it.
 *
 * `bar` is that row, scrolled sideways when it does not fit — a mouse wheel
 * scrolls it, and its edges fade where there is more. `lead={false}` draws
 * only the add items, for the phone's timeline sheet, which has its own way to
 * the designs. `grid` is the phone's Add sheet: the same items, with an icon
 * and a line saying what each one does, + Scene first — and no + Photos, which
 * on a phone is the Photos tool's (see `gridItemIds`).
 *
 * Draw one per screen. It renders the hidden file inputs for photos, video
 * and music, and two of those would be two controls of the same name.
 */
export function AddBar({
  variant = 'bar',
  className = '',
  lead = true,
  onDone,
}: {
  variant?: 'bar' | 'grid';
  /** Sizing within the row it sits in. */
  className?: string;
  /** The bar's own first and last buttons — designs, Make a video — and a tablet's settings. */
  lead?: boolean;
  /** The sheet closing once something is added. */
  onDone?: (() => void) | undefined;
}): React.JSX.Element {
  const { items, inputs, note } = useAddItems({ order: variant, onPhotosAdded: variant === 'grid' ? onDone : undefined });
  const mode = useEditor((s) => s.project.mode);
  const tablet = useLayout() === 'tablet';

  if (variant === 'grid') {
    return (
      <div>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Add">
          {items.map((item) => (
            <Tile
              key={item.id}
              item={item}
              onClick={() => {
                // A file chooser's input lives in this sheet, so the sheet waits for it.
                if (!item.picksFile) onDone?.();
                item.run();
              }}
            />
          ))}
        </div>
        {note !== null && <div className="mt-2 flex flex-wrap gap-2">{note}</div>}
        {inputs}
      </div>
    );
  }

  const copy = MODE_COPY[mode];
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <SideScroll
        watch={items.length}
        className="items-center gap-1.5"
        rowProps={{ role: 'group', 'aria-label': 'Actions', 'data-add-bar': '' }}
      >
        {lead && (
          <button
            type="button"
            data-tour="design"
            data-choose-design={mode}
            onClick={() => { useOverlays.getState().openPhonePanel('designs'); }}
            title={copy.chooseHint}
            className={`${CHIP} flex items-center gap-1.5 border-edge-strong font-medium text-ink`}
          >
            <Icon name="designs" size={14} /> {copy.bar}
          </button>
        )}
        {items.map((item) => <Chip key={item.id} item={item} />)}
        {lead && mode === 'showcase' && (
          <button
            type="button"
            data-continue-video
            onClick={continueAsVideo}
            title="This image becomes scene 1 of a video, animated, and you pick what comes next"
            className={`${CHIP} font-semibold`}
            style={{ borderColor: 'var(--c-accent)', color: 'var(--c-accent)' }}
          >
            Make a video
          </button>
        )}
      </SideScroll>
      {note}
      {inputs}
      {lead && tablet && <SettingsToggle />}
    </div>
  );
}

const CHIP = 'shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-[12px] hover:bg-panel-alt disabled:opacity-40';

/** One action in the bar: "+ Text". + Photos, the main one, in the accent colour. */
function Chip({ item }: { item: AddItem }): React.JSX.Element {
  return (
    <button
      type="button"
      data-add={item.id}
      {...(item.id === 'photos' ? { 'data-tour': 'photos' } : {})}
      onClick={item.run}
      disabled={item.busy !== null}
      title={item.title}
      className={`${CHIP} ${item.primary ? 'border-transparent bg-accent font-semibold text-accent-ink hover:bg-accent-hover' : ''}`}
      style={item.primary ? undefined : {
        borderColor: item.ready ? 'var(--c-accent)' : 'var(--c-edge)',
        color: item.ready ? 'var(--c-accent)' : 'var(--c-ink-muted)',
      }}
    >
      {item.busy ?? `+ ${item.label}`}
      {item.pro && <ProBadge />}
    </button>
  );
}

/**
 * Photos, text, effects and style on a tablet, where the inspector is a sheet
 * rather than a column beside the picture (D-162). The strip of tools that
 * used to open it is gone; this is the one way in, beside the actions.
 */
function SettingsToggle(): React.JSX.Element {
  const open = useOverlays((o) => o.inspectorSheet);
  return (
    <button
      type="button"
      data-settings-toggle
      aria-expanded={open}
      onClick={() => { useOverlays.getState().setInspectorSheet(!open); }}
      title="Photos, text, effects and style — the settings for the design and whatever is selected"
      className="flex shrink-0 items-center gap-1 rounded-md border border-edge px-2 py-1 text-[12px] font-medium text-ink hover:bg-panel-alt"
    >
      <Icon name="settings" size={14} /> Settings
    </button>
  );
}

function Tile({ item, onClick }: { item: AddItem; onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      data-add={item.id}
      onClick={onClick}
      disabled={item.busy !== null}
      title={item.title}
      className="flex min-w-0 items-center gap-2.5 rounded-xl border border-edge px-2.5 py-2.5 text-left active:bg-panel-alt disabled:opacity-50"
    >
      <span
        className="grid size-9 shrink-0 place-items-center rounded-lg"
        style={item.primary
          ? { background: 'var(--c-accent)', color: 'var(--c-accent-ink)' }
          : { background: 'var(--c-accent-soft)', color: 'var(--c-accent)' }}
      >
        <Icon name={item.icon} size={20} />
      </span>
      <span className="min-w-0">
        <span className="flex items-center text-[14px] font-semibold">
          {item.label}
          {item.pro && <ProBadge />}
        </span>
        <span className="block text-[11px] leading-snug text-ink-muted">{item.busy ?? item.hint}</span>
      </span>
    </button>
  );
}

function ProBadge(): React.JSX.Element {
  return (
    <span
      className="ml-1 rounded-sm px-1 text-[8px] font-bold uppercase"
      style={{ background: 'var(--c-pro-soft)', color: 'var(--c-pro)' }}
    >
      Pro
    </span>
  );
}
