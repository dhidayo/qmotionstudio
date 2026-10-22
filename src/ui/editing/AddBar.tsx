import { Icon } from '@/ui/mobile/Icon';
import { SideScroll } from '@/ui/shell/SideScroll';
import { useAddItems, type AddItem } from './useAddItems';

/**
 * "+ Text", "+ Photo" … "+ Motion" … "+ Music": everything that can be added,
 * in one place (D-153).
 *
 * `bar` is one row that scrolls sideways when it does not fit — in the
 * timeline's header for a video, beside the scrubber for a design. A mouse
 * wheel scrolls it sideways, and its edges fade where there is more, so a
 * row cut short reads as "there is more this way" rather than as the end.
 * `grid` is the phone's Add sheet: the same items, with an icon and a line
 * saying what each one does.
 *
 * Draw one per screen. It renders the hidden file inputs for video and music,
 * and two of those would be two controls of the same name.
 */
export function AddBar({
  variant = 'bar',
  className = '',
  onScene,
  onDone,
}: {
  variant?: 'bar' | 'grid';
  /** Sizing within the row it sits in. */
  className?: string;
  /** The sheet's first item in a video: a scene, which a computer adds from the timeline's scene bar. */
  onScene?: (() => void) | undefined;
  /** The sheet closing once something is added — not for a file chooser, whose input it holds. */
  onDone?: (() => void) | undefined;
}): React.JSX.Element {
  const { items, inputs, note } = useAddItems();
  if (variant === 'grid') {
    return (
      <div>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Add">
          {onScene !== undefined && (
            <Tile
              icon="scene"
              label="Scene"
              hint="A new scene after this one, in any design"
              onClick={() => { onDone?.(); onScene(); }}
            />
          )}
          {items.map((item) => (
            <Tile
              key={item.id}
              id={item.id}
              icon={item.icon}
              label={item.label}
              hint={item.busy ?? item.hint}
              pro={item.pro}
              disabled={item.busy !== null}
              onClick={() => {
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
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <ChipRow items={items} />
      {note}
      {inputs}
    </div>
  );
}

/** The bar's row of chips: one line, scrolled sideways when it does not fit. */
function ChipRow({ items }: { items: readonly AddItem[] }): React.JSX.Element {
  return (
    <SideScroll
      watch={items.length}
      className="items-center gap-1"
      rowProps={{ role: 'group', 'aria-label': 'Add', 'data-add-bar': '' }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          data-add={item.id}
          onClick={item.run}
          disabled={item.busy !== null}
          title={item.title}
          className="shrink-0 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] hover:bg-panel-alt disabled:opacity-40"
          style={{
            borderColor: item.ready ? 'var(--c-accent)' : 'var(--c-edge)',
            color: item.ready ? 'var(--c-accent)' : 'var(--c-ink-muted)',
          }}
        >
          {item.busy ?? `+ ${item.label}`}
          {item.pro && <ProBadge />}
        </button>
      ))}
    </SideScroll>
  );
}

function Tile({
  id,
  icon,
  label,
  hint,
  pro = false,
  disabled = false,
  onClick,
}: {
  id?: string;
  icon: AddItem['icon'];
  label: string;
  hint: string;
  pro?: boolean;
  disabled?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      data-add={id ?? 'scene'}
      onClick={onClick}
      disabled={disabled}
      className="flex min-w-0 items-center gap-2.5 rounded-xl border border-edge px-2.5 py-2.5 text-left active:bg-panel-alt disabled:opacity-50"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--c-accent-soft)', color: 'var(--c-accent)' }}>
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0">
        <span className="flex items-center text-[14px] font-semibold">
          {label}
          {pro && <ProBadge />}
        </span>
        <span className="block text-[11px] leading-snug text-ink-muted">{hint}</span>
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
