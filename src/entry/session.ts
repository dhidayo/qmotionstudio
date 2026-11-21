/**
 * Signing in, on this device (D-175).
 *
 * "If logged in, redirect to the designer view until signed out to come back
 * to landing page." There are no accounts yet (BUILD-SPEC §12), so being
 * signed in means this browser remembers that its person has gone into the
 * studio: Open Studio sets it, Sign out clears it, and the projects stay on
 * the device either way. `public/route-boot.js` reads the same key before the
 * page draws, which is what sends a signed-in visit to `/` straight on to
 * `/studio`.
 *
 * Stored as a small record rather than a bare flag so a real account can
 * take its place later — `kind: 'account'` with whatever it needs — without
 * a second key or a migration of the first.
 */

export const SESSION_KEY = 'ms.session';

/**
 * The tab's own mark that the studio has opened in it (D-168's Welcome back,
 * src/ui/persist/welcomeBack.ts). Going in from the landing page is coming
 * back, so it is cleared then; a reload of the studio is not, and keeps it.
 */
export const TAB_KEY = 'ms.tab';

export type Session = { readonly kind: 'device'; readonly since: number };

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<Session> | null;
    return { kind: 'device', since: typeof parsed?.since === 'number' ? parsed.since : 0 };
  } catch {
    return null;
  }
}

export function isSignedIn(): boolean {
  try {
    return localStorage.getItem(SESSION_KEY) !== null;
  } catch {
    return false;
  }
}

/** Open Studio and Sign in: on this device, for now. */
export function signIn(): void {
  try {
    if (localStorage.getItem(SESSION_KEY) === null) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ kind: 'device', since: Date.now() } satisfies Session));
    }
  } catch {
    // Storage refused (a private window): the studio still opens, and the next visit is a first one.
  }
  try {
    sessionStorage.removeItem(TAB_KEY);
  } catch {
    // Without it, Welcome back asks anyway (welcomeBack.ts).
  }
}

/** Sign out: the device forgets the session; the designs stay where they are. */
export function signOut(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

export type Route = 'landing' | 'studio';

/** What `route-boot.js` decided for this page; the editor where it did not run (a test harness). */
export function currentRoute(): Route {
  return document.documentElement.dataset['route'] === 'landing' ? 'landing' : 'studio';
}
