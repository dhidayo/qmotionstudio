import type { ShapeKind } from '@/document/types';

/**
 * Small line drawings of the shapes (D-158), for the inspector's shape
 * buttons — where a live preview of each would be thirteen canvases for a
 * row of buttons.
 */
const PATHS: Readonly<Record<ShapeKind, string>> = {
  rect: 'M4 6h16v12H4z',
  roundedRect: 'M7.5 6h9A3.5 3.5 0 0 1 20 9.5v5a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 14.5v-5A3.5 3.5 0 0 1 7.5 6z',
  circle: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z',
  pill: 'M8 8h8a4 4 0 0 1 0 8H8a4 4 0 0 1 0-8z',
  triangle: 'M12 4l9 16H3z',
  diamond: 'M12 3l8 9-8 9-8-9z',
  hexagon: 'M7 4h10l5 8-5 8H7l-5-8z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  badge: 'M12 3l2 2.2 2.9-.6.9 2.8 2.8.9-.6 2.9L22 12l-2.2 2 .6 2.9-2.8.9-.9 2.8-2.9-.6L12 21l-2-2.2-2.9.6-.9-2.8-2.8-.9.6-2.9L2 12l2.2-2-.6-2.9 2.8-.9.9-2.8 2.9.6z',
  heart: 'M12 20s-8-5-8-11a4 4 0 0 1 8-1a4 4 0 0 1 8 1c0 6-8 11-8 11z',
  bubble: 'M5 5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-9l-4 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  arrow: 'M3 9h11V5l7 7-7 7v-4H3z',
  line: 'M3 12h18',
};

export function ShapeIcon({ shape, size = 20 }: { shape: ShapeKind; size?: number }): React.JSX.Element {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round">
      <path d={PATHS[shape]} />
    </svg>
  );
}
