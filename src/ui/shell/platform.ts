import { useSyncExternalStore } from 'react';

/**
 * Which keys this device has, and whether it has a keyboard at all (D-161).
 *
 * "The Help ? shows Macbook help, shortcuts, etc. This shouldn't be the case
 * on other devices … maybe hide it if you cannot replace it for the device
 * loading the page." Two questions, answered here once for every label in
 * the app — the shortcuts list, menu hints, toasts and the music panel:
 *
 *   Apple or not   ⌘ ⌥ ⇧ on a Mac, iPhone or iPad; Ctrl, Alt, Shift elsewhere.
 *   a keyboard?    yes where there is a mouse or trackpad, or once a real key
 *                  is pressed outside a text field (an iPad with a keyboard
 *                  and no trackpad); no on a phone or tablet used by touch,
 *                  which gets the touch gestures instead.
 *
 * The pure parts take a navigator-shaped value so they are tested in Node.
 */

type NavLike = {
  readonly platform?: string;
  readonly userAgent?: string;
  readonly maxTouchPoints?: number;
  readonly userAgentData?: { readonly platform?: string };
};

const currentNav = (): NavLike | undefined => (typeof navigator === 'undefined' ? undefined : navigator);

/**
 * A Mac, iPhone or iPad. The client hint first (Chromium), then
 * `navigator.platform` — still "MacIntel" on an iPad asking for the desktop
 * site — then the user agent. The user agent alone is not enough: a Windows
 * browser can say "like Mac OS X" in an embedded view.
 */
export function isApplePlatform(nav: NavLike | undefined = currentNav()): boolean {
  if (nav === undefined) return false;
  const hint = nav.userAgentData?.platform;
  if (hint !== undefined && hint.length > 0) return /^(macos|ios|ipados)$/i.test(hint);
  if (nav.platform !== undefined && nav.platform.length > 0) return /mac|iphone|ipad|ipod/i.test(nav.platform);
  return /macintosh|iphone|ipad|ipod/i.test(nav.userAgent ?? '');
}

/**
 * An iPhone or iPad, including an iPad that says it is a Mac. iOS greys out a
 * file extension it does not know (D-141), and saves files its own way.
 */
export function isAppleTouch(nav: NavLike | undefined = currentNav()): boolean {
  if (nav === undefined) return false;
  const agent = nav.userAgent ?? '';
  return /iphone|ipad|ipod/i.test(agent) || (/macintosh/i.test(agent) && (nav.maxTouchPoints ?? 0) > 1);
}

export type KeyNames = {
  readonly mod: string;
  readonly alt: string;
  readonly shift: string;
  /** What the key that deletes backwards is called. */
  readonly backspace: string;
  /** Between keys in a chord: Apple writes ⌘⇧Z, everyone else Ctrl+Shift+Z. */
  readonly join: string;
};

export function keysFor(apple: boolean): KeyNames {
  return apple
    ? { mod: '⌘', alt: '⌥', shift: '⇧', backspace: '⌫', join: '' }
    : { mod: 'Ctrl', alt: 'Alt', shift: 'Shift', backspace: 'Backspace', join: '+' };
}

/**
 * A key combination written the way this device writes it: `mod+shift+Z` is
 * ⌘⇧Z on a Mac and Ctrl+Shift+Z elsewhere. Single keys pass through ("Enter",
 * "]"), so a menu can name any key with one field.
 */
export function chord(spec: string, apple: boolean = isApplePlatform()): string {
  const keys = keysFor(apple);
  const parts = spec.split('+').filter((part) => part.length > 0);
  if (parts.length <= 1) return spec;
  return parts
    .map((part) => {
      switch (part.toLowerCase()) {
        case 'mod': return keys.mod;
        case 'alt': return keys.alt;
        case 'shift': return keys.shift;
        default: return part;
      }
    })
    .join(keys.join);
}

export type InputCaps = {
  /** A keyboard is here, or very likely: show keyboard help and shortcut hints. */
  readonly keyboard: boolean;
  /** Fingers only: show touch gestures instead, and say "tap" rather than "click". */
  readonly touchOnly: boolean;
  /** A touch screen as well (a touch laptop, an iPad with a trackpad): a long press works too. */
  readonly touchToo: boolean;
};

export function capsFrom(input: { readonly finePointer: boolean; readonly coarsePointer: boolean; readonly sawKey: boolean }): InputCaps {
  const keyboard = input.finePointer || input.sawKey;
  return { keyboard, touchOnly: !keyboard, touchToo: input.coarsePointer };
}

// ── The live answer, for this device ────────────────────────────────────────

const KEY_FLAG = 'ms.keyboard';
const FINE = '(any-pointer: fine)';
const COARSE = '(any-pointer: coarse)';

const listeners = new Set<() => void>();
let sawKey = false;
try { sawKey = typeof localStorage !== 'undefined' && localStorage.getItem(KEY_FLAG) === '1'; } catch { /* not remembered */ }

function matches(query: string): boolean {
  return typeof matchMedia === 'function' && matchMedia(query).matches;
}

/**
 * A real key, pressed outside a text field, means a keyboard is attached. An
 * on-screen keyboard only types into fields, and Android's often reports
 * "Unidentified" or "Process" while composing, so neither counts. Capture
 * phase, so pressing "?" counts before the shortcut opens the list.
 */
function noticeKey(event: KeyboardEvent): void {
  if (sawKey || event.isComposing || event.key === 'Unidentified' || event.key === 'Process') return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
  sawKey = true;
  try { localStorage.setItem(KEY_FLAG, '1'); } catch { /* for this visit */ }
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') window.addEventListener('keydown', noticeKey, { capture: true });

/** One object per combination, so a snapshot keeps its identity while nothing changes. */
const snapshots = new Map<string, InputCaps>();

/** The device's input right now, for code outside React: menus, toasts. */
export function readInputCaps(): InputCaps {
  const finePointer = matches(FINE);
  const coarsePointer = matches(COARSE);
  const key = `${finePointer}${coarsePointer}${sawKey}`;
  let caps = snapshots.get(key);
  if (caps === undefined) {
    caps = capsFrom({ finePointer, coarsePointer, sawKey });
    snapshots.set(key, caps);
  }
  return caps;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // A mouse plugged into a tablet, or taken away, changes the answer.
  const queries = typeof matchMedia === 'function' ? [matchMedia(FINE), matchMedia(COARSE)] : [];
  for (const query of queries) query.addEventListener('change', listener);
  return () => {
    listeners.delete(listener);
    for (const query of queries) query.removeEventListener('change', listener);
  };
}

const SERVER_CAPS: InputCaps = { keyboard: true, touchOnly: false, touchToo: false };

/** The device's input, kept current. */
export function useInputCaps(): InputCaps {
  return useSyncExternalStore(subscribe, readInputCaps, () => SERVER_CAPS);
}

/**
 * How to undo on this device, for a sentence: "⌘Z" or "Ctrl+Z" with a
 * keyboard, the undo button (↶) on a touch screen — "Press ⌘Z to undo" on an
 * iPhone pointed at a key it does not have.
 */
export function undoKeys(caps: InputCaps = readInputCaps(), apple: boolean = isApplePlatform()): string {
  return caps.keyboard ? chord('mod+Z', apple) : 'Undo (↶)';
}

/** The whole "how to undo" sentence, for a toast after something is deleted or replaced. */
export function undoSentence(caps: InputCaps = readInputCaps(), apple: boolean = isApplePlatform()): string {
  return caps.keyboard ? `Press ${chord('mod+Z', apple)} to undo.` : 'Tap ↶ to undo.';
}

/**
 * A menu item's key or gesture, written the way this device writes it, or
 * nothing when the device has no such key (D-161). `keys` is device-neutral:
 * "mod+D", "Enter", "Delete", "]", or "double-click" for the gesture, which
 * a finger does as a double-tap.
 */
export function keyLabel(keys: string, caps: InputCaps, apple: boolean = isApplePlatform()): string | undefined {
  if (keys === 'double-click') return caps.touchOnly ? 'Double-tap' : 'Double-click';
  return caps.keyboard ? chord(keys, apple) : undefined;
}
