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
 */
export function TrimHandle({
  side,
  onDown,
  onMove,
  onUp,
  label,
}: {
  side: 'start' | 'end';
  onDown: (event: React.PointerEvent<HTMLElement>) => void;
  onMove: (event: React.PointerEvent<HTMLElement>) => void;
  onUp: () => void;
  /** What the end is of, for assistive technology: "Snow". */
  label?: string;
}): React.JSX.Element {
  return (
    <span
      role="presentation"
      aria-label={`${side === 'start' ? 'Trim start' : 'Trim end'}${label === undefined ? '' : ` of ${label}`}`}
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
 * "⋯" on a selected clip: the menu, for anyone who does not right-click — a
 * trackpad without a secondary click set up, a keyboard, a first-time user.
 */
export function MoreButton({ label, onOpen }: { label: string; onOpen: (x: number, y: number) => void }): React.JSX.Element {
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
      className="absolute inset-y-0 right-3 z-10 my-auto grid h-4 w-5 place-items-center rounded-sm text-[11px] font-bold leading-none hover:bg-panel"
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
