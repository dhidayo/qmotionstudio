import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { OrientedBox } from '@/core/render/bounds';

/**
 * Editing on the canvas itself (D-107): typing into text where it sits, and a
 * toolbar of the things that can be done to what is selected, beside it.
 *
 * "It is easier for users to edit on canvas once the item is clicked" — the
 * panels stay, for the fine controls, but the common things no longer need a
 * trip to the side of the screen.
 */

/** Where a box sits on the artboard in CSS pixels, axis-aligned round its rotation. */
export function screenBounds(box: OrientedBox, scale: number): { left: number; top: number; right: number; bottom: number } {
  const radians = (box.rotation * Math.PI) / 180;
  const halfW = (Math.abs(box.w * Math.cos(radians)) + Math.abs(box.h * Math.sin(radians))) / 2;
  const halfH = (Math.abs(box.w * Math.sin(radians)) + Math.abs(box.h * Math.cos(radians))) / 2;
  return {
    left: (box.cx - halfW) * scale,
    top: (box.cy - halfH) * scale,
    right: (box.cx + halfW) * scale,
    bottom: (box.cy + halfH) * scale,
  };
}

/**
 * The text box that opens over a piece of text when it is double-clicked.
 *
 * Starts with everything selected, so typing replaces it — "clear texts and
 * retype". The frame updates behind it as you type. Enter keeps it (⇧Enter for
 * a new line), Escape puts back what was there, clicking away keeps it.
 */
export function InlineTextEditor({
  box,
  scale,
  font,
  align,
  initial,
  maxLength,
  onChange,
  onDone,
}: {
  box: OrientedBox;
  scale: number;
  /** A CSS font shorthand at screen size. */
  font: string;
  align: 'left' | 'center' | 'right';
  initial: string;
  maxLength: number | undefined;
  onChange: (text: string) => void;
  onDone: (keep: boolean) => void;
}): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(initial);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
  }, []);

  // Grows with what is typed, never scrolls inside itself.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const finish = (keep: boolean): void => {
    if (done.current) return;
    done.current = true;
    onDone(keep);
  };

  const width = Math.max(140, box.w * scale + 16);
  return (
    <textarea
      ref={ref}
      aria-label="Edit text on the canvas"
      data-inline-editor
      value={value}
      maxLength={maxLength}
      rows={1}
      spellCheck
      onChange={(event) => {
        setValue(event.target.value);
        onChange(event.target.value);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finish(true); }
        if (event.key === 'Escape') { event.preventDefault(); finish(false); }
      }}
      onBlur={() => { finish(true); }}
      onPointerDown={(event) => { event.stopPropagation(); }}
      className="absolute z-30 resize-none overflow-hidden rounded-md border-2 px-2 py-1 leading-tight shadow-xl focus:outline-none"
      style={{
        left: box.cx * scale - width / 2,
        top: (box.cy - box.h / 2) * scale - 6,
        width,
        font,
        textAlign: align,
        transform: `rotate(${box.rotation}deg)`,
        transformOrigin: 'center top',
        borderColor: 'var(--c-accent)',
        background: 'color-mix(in srgb, var(--c-panel) 90%, transparent)',
        color: 'var(--c-ink)',
      }}
    />
  );
}

const TOOLBAR_HEIGHT_PX = 32;
const TOOLBAR_GAP_PX = 36;
const TOOLBAR_GAP_BELOW_PX = 18;

export type ToolbarAction = {
  readonly label: string;
  readonly icon: string;
  readonly onSelect: (anchor: { x: number; y: number }) => void;
  readonly danger?: boolean;
};

/**
 * The few things most often done to what is selected, right beside it.
 *
 * Above the selection, or below it when it is near the top of the frame.
 * Every action is also in the right-click menu (the "⋯" here opens it), so the
 * toolbar is a shortcut, never the only way.
 */
export function SelectionToolbar({
  bounds,
  frameWidth,
  actions,
}: {
  bounds: { left: number; top: number; right: number; bottom: number };
  frameWidth: number;
  actions: readonly ToolbarAction[];
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) setWidth(ref.current.offsetWidth);
  }, [actions.length]);

  const centre = (bounds.left + bounds.right) / 2;
  const left = Math.max(4, Math.min(centre - width / 2, frameWidth - width - 4));
  /*
   * Clear of the handles: the rotate grip sits 22px above the box and the
   * resize edges are caught 13px either side of it, so a toolbar any closer
   * would take the press meant for them.
   */
  const above = bounds.top - TOOLBAR_GAP_PX - TOOLBAR_HEIGHT_PX;
  const top = above >= 4 ? above : bounds.bottom + TOOLBAR_GAP_BELOW_PX;

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Selected element"
      data-selection-toolbar
      onPointerDown={(event) => { event.stopPropagation(); }}
      onDoubleClick={(event) => { event.stopPropagation(); }}
      onContextMenu={(event) => { event.stopPropagation(); }}
      className="absolute z-20 flex items-center gap-0.5 rounded-lg border border-edge bg-panel p-0.5 shadow-lg"
      style={{ left, top, visibility: width === 0 ? 'hidden' : 'visible' }}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          title={action.label}
          aria-label={action.label}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            action.onSelect({ x: box.left, y: box.bottom + 4 });
          }}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] hover:bg-panel-alt"
          style={action.danger === true ? { color: 'var(--c-danger)' } : { color: 'var(--c-ink-muted)' }}
        >
          <span aria-hidden className="text-[12px] leading-none">{action.icon}</span>
          <span className="hidden md:inline">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
