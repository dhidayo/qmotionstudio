/**
 * Pieces every clip on the timeline shares, so a clip looks — and is grabbed —
 * the same way on every row.
 */

/**
 * The grab strip at each end of a clip.
 *
 * Ten pixels wide, with a dotted bar drawn in it, always visible: "the
 * beginning and ending having some form of strong border (dotted) to show that
 * I can adjust them". An invisible eight-pixel strip worked for anyone who
 * already knew it was there, which is nobody new.
 *
 * A pointer's affordance, hidden from assistive technology: it is not a
 * control a keyboard can reach, and a name on a presentational element is
 * not allowed (axe's aria-prohibited-attr, D-172). The clip's title says the
 * dotted ends resize it.
 */
export function TrimHandle({
  side,
  onDown,
  onMove,
  onUp,
}: {
  side: 'start' | 'end';
  onDown: (event: React.PointerEvent<HTMLElement>) => void;
  onMove: (event: React.PointerEvent<HTMLElement>) => void;
  onUp: () => void;
}): React.JSX.Element {
  return (
    <span
      aria-hidden
      data-trim={side}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className="group/trim absolute inset-y-0 z-10 flex w-2.5 cursor-ew-resize items-center justify-center"
      style={{ [side === 'start' ? 'left' : 'right']: 0 }}
    >
      <span
        aria-hidden
        className="h-[70%] border-l-2 border-dotted opacity-70 transition-opacity group-hover/trim:opacity-100"
        style={{ borderColor: 'currentColor' }}
      />
    </span>
  );
}

/**
 * The "⋯" of a selected clip, beside the clip rather than inside it (D-172):
 * a clip is a button, and a button inside a button is lost to assistive
 * technology (axe's nested-interactive). Laid over the clip's own box, so it
 * sits where it always did, and after it in the tab order; only the button
 * itself takes the pointer.
 */
export function ClipMore({ box, color, label, onOpen }: {
  /** The clip's position and size, and its drag offset while dragged. */
  box: React.CSSProperties;
  color: string;
  label: string;
  onOpen: (x: number, y: number) => void;
}): React.JSX.Element {
  return (
    <span data-clip-more className="pointer-events-none absolute z-10 overflow-hidden" style={{ ...box, color }}>
      <MoreButton label={label} onOpen={onOpen} />
    </span>
  );
}

/**
 * "⋯" on a selected clip: the menu, for anyone who does not right-click — a
 * trackpad without a secondary click set up, a keyboard, a first-time user.
 */
function MoreButton({ label, onOpen }: { label: string; onOpen: (x: number, y: number) => void }): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title="More options"
      onPointerDown={(e) => { e.stopPropagation(); }}
      onClick={(e) => {
        e.stopPropagation();
        const box = e.currentTarget.getBoundingClientRect();
        onOpen(box.left, box.bottom + 2);
      }}
      className="pointer-events-auto absolute inset-y-0 right-3 z-10 my-auto grid h-4 w-5 place-items-center rounded-sm text-[11px] font-bold leading-none hover:bg-panel"
      style={{ color: 'currentColor' }}
    >
      ⋯
    </button>
  );
}

/** Where a pointer is on the time axis of the lane it is over, in milliseconds. */
export function laneTimeAt(clientX: number, element: Element, durationMs: number): number {
  const lane = element.closest('[data-lane]');
  if (!lane) return 0;
  const box = lane.getBoundingClientRect();
  if (box.width <= 0) return 0;
  return ((clientX - box.left) / box.width) * durationMs;
}
