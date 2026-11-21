/**
 * The two layouts' code, named in the page for the device that will draw it
 * (D-173).
 *
 * The phone's layout and the wide one are chunks of their own
 * (src/ui/shell/layouts.ts), and which one a device draws is only known once
 * the editor's script has run — one more round trip at the end of a slow
 * phone's start-up. The build names each as a `modulepreload` behind a media
 * query that matches `useLayout`'s breaks, so the browser fetches the right
 * one alongside the editor and leaves the other alone.
 *
 * The queries say what `read()` in src/ui/shell/useLayout.ts says: a phone is
 * at most 760px wide, or a touch screen at most 500px tall (a phone on its
 * side). `src/ui/shell/useLayout.test.ts` fails if the two drift apart.
 *
 * Plain values with no imports, because vite.config.ts reads this file.
 */
export const LAYOUT_MODULES = {
  phone: 'src/ui/mobile/PhoneLayout.tsx',
  wide: 'src/ui/shell/WideLayout.tsx',
} as const;

export const LAYOUT_MEDIA = {
  phone: '(max-width: 760px), (pointer: coarse) and (max-height: 500px)',
  wide: '(min-width: 761px) and (pointer: fine), (min-width: 761px) and (pointer: none), (min-width: 761px) and (min-height: 501px)',
} as const;
