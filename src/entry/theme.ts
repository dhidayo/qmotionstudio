/**
 * Light, dark or the device's own (D-175): the preference the account menu
 * and the landing page share.
 *
 * Light stays the default (D-109); dark is a choice, and now so is "System",
 * which follows the device and changes with it. The choice is stored under
 * the key the editor always used, `ms.theme`, so a person who picked dark
 * before keeps it; `public/theme-boot.js` reads it before the first paint.
 *
 * No React and no store, so the landing page can use it without the editor.
 */

export type Theme = 'light' | 'dark';
export type ThemeChoice = Theme | 'system';

export const THEME_KEY = 'ms.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Private mode or blocked storage: the default.
  }
  return 'light';
}

function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function resolveTheme(choice: ThemeChoice): Theme {
  return choice === 'system' ? systemTheme() : choice;
}

/** Stores the choice and shows it; returns the theme now on screen. */
export function applyThemeChoice(choice: ThemeChoice): Theme {
  const theme = resolveTheme(choice);
  document.documentElement.dataset['theme'] = theme;
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    // A convenience; failing to keep it must never break the page.
  }
  return theme;
}

/**
 * While the choice is "System", follows the device as it changes (a phone
 * going dark at sunset). Returns the way to stop listening.
 */
export function followSystemTheme(onChange: (theme: Theme) => void): () => void {
  if (typeof matchMedia !== 'function') return () => undefined;
  const query = matchMedia(DARK_QUERY);
  const changed = (): void => {
    if (readThemeChoice() !== 'system') return;
    const theme = systemTheme();
    document.documentElement.dataset['theme'] = theme;
    onChange(theme);
  };
  query.addEventListener('change', changed);
  return () => { query.removeEventListener('change', changed); };
}
