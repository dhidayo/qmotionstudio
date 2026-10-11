import { useEffect, useRef, useState } from 'react';

/**
 * Side panels you can widen or narrow (D-150): "The left pane and right pane
 * should be adjustable like in most apps."
 *
 * A thin handle on each panel's inner edge. Drag it, or focus it and use the
 * arrow keys; a double-click puts the panel back to its usual width. The width
 * is a CSS variable every part of the panel already reads (--w-library,
 * --w-inspector), so nothing inside has to know, and it is remembered on this
 * device. The picture always keeps a sensible share of the screen.
 */

type Pane = 'library' | 'inspector';

const SPEC: Readonly<Record<Pane, { readonly variable: string; readonly key: string; readonly fallback: number; readonly min: number; readonly max: number; readonly label: string }>> = {
  library: { variable: '--w-library', key: 'ms.pane.library', fallback: 264, min: 208, max: 460, label: 'Resize the design library' },
  inspector: { variable: '--w-inspector', key: 'ms.pane.inspector', fallback: 312, min: 268, max: 520, label: 'Resize the settings panel' },
};

/** What the picture keeps, at least, between the two panels. */
const STAGE_MIN = 420;

function current(pane: Pane): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(SPEC[pane].variable).trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : SPEC[pane].fallback;
}

function clampWidth(pane: Pane, width: number): number {
  const other = current(pane === 'library' ? 'inspector' : 'library');
  const room = Math.max(SPEC[pane].min, window.innerWidth - other - STAGE_MIN);
  return Math.round(Math.min(SPEC[pane].max, room, Math.max(SPEC[pane].min, width)));
}

function apply(pane: Pane, width: number | null): void {
  const style = document.documentElement.style;
  if (width === null) style.removeProperty(SPEC[pane].variable);
  else style.setProperty(SPEC[pane].variable, `${width}px`);
}

function remember(pane: Pane, width: number | null): void {
  try {
    if (width === null) localStorage.removeItem(SPEC[pane].key);
    else localStorage.setItem(SPEC[pane].key, String(width));
  } catch { /* remembered for this visit only */ }
}

/** Puts back the widths chosen on an earlier visit. Called once when the editor mounts. */
export function restorePaneWidths(): void {
  for (const pane of ['library', 'inspector'] as const) {
    try {
      const stored = Number(localStorage.getItem(SPEC[pane].key));
      if (stored > 0) apply(pane, clampWidth(pane, stored));
    } catch { /* no storage: the usual widths */ }
  }
}

export function PaneResizer({ pane }: { pane: Pane }): React.JSX.Element {
  const spec = SPEC[pane];
  const start = useRef<{ x: number; width: number } | null>(null);
  const [width, setWidth] = useState(() => current(pane));
  const [dragging, setDragging] = useState(false);
  // The inspector grows to the left, the library to the right.
  const direction = pane === 'library' ? 1 : -1;

  const set = (next: number): void => {
    const clamped = clampWidth(pane, next);
    apply(pane, clamped);
    remember(pane, clamped);
    setWidth(clamped);
  };

  useEffect(() => {
    // A smaller window can leave a remembered width too wide for the picture.
    const onResize = (): void => { set(current(pane)); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `set` reads only module state and this pane
  }, [pane]);

  return (
    <div className="relative z-20 w-0 shrink-0">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={spec.label}
        aria-valuemin={spec.min}
        aria-valuemax={spec.max}
        aria-valuenow={width}
        tabIndex={0}
        data-pane-resizer={pane}
        title={`${spec.label}. Double-click for the usual width.`}
        className="group absolute inset-y-0 -left-[4px] w-[8px] cursor-col-resize touch-none focus:outline-none"
        onPointerDown={(event) => {
          start.current = { x: event.clientX, width: current(pane) };
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          if (start.current === null) return;
          set(start.current.width + (event.clientX - start.current.x) * direction);
        }}
        onPointerUp={() => { start.current = null; setDragging(false); }}
        onPointerCancel={() => { start.current = null; setDragging(false); }}
        onDoubleClick={() => {
          apply(pane, null);
          remember(pane, null);
          setWidth(current(pane));
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 48 : 16;
          if (event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); set(current(pane) - step * direction); }
          if (event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); set(current(pane) + step * direction); }
          if (event.key === 'Home') { event.preventDefault(); set(spec.min); }
          if (event.key === 'End') { event.preventDefault(); set(spec.max); }
        }}
      >
        <span
          aria-hidden
          className={`absolute inset-y-0 left-[3px] w-[2px] transition-colors ${dragging ? 'bg-accent' : 'bg-transparent group-hover:bg-accent group-focus-visible:bg-accent'}`}
          style={{ transitionDuration: 'var(--t-fast)' }}
        />
      </div>
    </div>
  );
}
