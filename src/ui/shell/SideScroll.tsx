import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/ui/mobile/Icon';

/**
 * A row that scrolls sideways when it does not fit, and shows that it does
 * (D-153): the row of actions under the picture (D-162).
 *
 * "We may be having more elements, which mean that we may be having scroll of
 * applicable elements on smaller screen." A row that is simply cut off reads
 * as the end of the row, so an edge with more beyond it fades out and carries
 * an arrow that brings the rest into view — the way a row of chips on a video
 * site works. A mouse wheel turned over the row scrolls it sideways too: most
 * mice have only the one wheel, and a row that needs a trackpad or a shift key
 * to see its end hides things from the people it is for.
 *
 * The arrows are for the pointer only. The keyboard reaches everything in the
 * row, and focusing a control scrolls it into view.
 */
export function SideScroll({
  children,
  watch,
  className = '',
  rowProps,
}: {
  children: React.ReactNode;
  /** Changes when what is in the row changes, so the row is measured again. */
  watch?: unknown;
  /** The scrolling row's own layout: gaps, alignment. */
  className?: string;
  /** Anything else the row carries: a role, a label, data attributes. */
  rowProps?: React.HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>;
}): React.JSX.Element {
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = row.current;
    if (!el) return undefined;
    const measure = (): void => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((now) => (now.start === start && now.end === end ? now : { start, end }));
    };
    // Registered by hand because React's wheel listener cannot cancel the page's own scroll.
    const onWheel = (event: WheelEvent): void => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const before = el.scrollLeft;
      el.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      if (el.scrollLeft !== before) event.preventDefault();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    el.addEventListener('scroll', measure, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', measure);
      el.removeEventListener('wheel', onWheel);
    };
  }, [watch]);

  const page = (direction: 1 | -1): void => {
    const el = row.current;
    if (!el) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * Math.max(80, el.clientWidth * 0.7), behavior: smooth ? 'smooth' : 'auto' });
  };

  const FADE = 36;
  return (
    <div className="relative flex min-w-0 items-center">
      <div
        ref={row}
        {...rowProps}
        data-overflowing={edges.start || edges.end ? 'true' : undefined}
        className={`flex min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
        style={edges.start || edges.end ? {
          maskImage: `linear-gradient(to right, ${edges.start ? 'transparent' : '#000'} 0, #000 ${FADE}px, #000 calc(100% - ${FADE}px), ${edges.end ? 'transparent' : '#000'} 100%)`,
        } : undefined}
      >
        {children}
      </div>
      {edges.start && <EdgeArrow side="start" onPress={() => { page(-1); }} />}
      {edges.end && <EdgeArrow side="end" onPress={() => { page(1); }} />}
    </div>
  );
}

function EdgeArrow({ side, onPress }: { side: 'start' | 'end'; onPress: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      data-side-scroll={side}
      title={side === 'end' ? 'Show more' : 'Back to the start'}
      onClick={onPress}
      className={`absolute top-1/2 ${side === 'start' ? 'left-0' : 'right-0'} grid size-6 -translate-y-1/2 place-items-center rounded-full border border-edge bg-panel text-ink-muted shadow-sm hover:bg-panel-alt hover:text-ink`}
    >
      <Icon name={side === 'start' ? 'left' : 'right'} size={14} />
    </button>
  );
}
