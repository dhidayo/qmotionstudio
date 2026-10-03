/**
 * The phone toolbar's icons (D-109): a handful of simple line drawings, drawn
 * here rather than taken from an icon kit (§16 rules out UI kits), at one
 * stroke weight so they read as a set.
 */

const PATHS = {
  designs: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  photo: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5a1.5 1.5 0 1 0 0-.01',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  effects: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z',
  style: 'M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.6 17 3 12 3zM7.5 12.5h.01M9.5 8h.01M14.5 8h.01',
  add: 'M12 5v14M5 12h14',
  replace: 'M4 8h13l-3-3M20 16H7l3 3',
  motion: 'M3 12c3-6 6-6 9 0s6 6 9 0',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  check: 'M5 12l5 5 9-10',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4',
  split: 'M12 3v18M7 8l-3 4 3 4M17 8l3 4-3 4',
  music: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  video: 'M4 6h12v12H4zM16 10l4-2v8l-4-2',
  scene: 'M4 6h16v12H4zM9 6v12M15 6v12',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  timeline: 'M4 6h16M4 12h10M4 18h13',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  menu: 'M4 7h16M4 12h16M4 17h16',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }): React.JSX.Element {
  const filled = name === 'play' || name === 'pause';
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
