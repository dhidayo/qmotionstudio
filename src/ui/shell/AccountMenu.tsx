import { useEffect, useRef, useState } from 'react';
import { useEditor } from '@/state/store';
import { applyThemeChoice, readThemeChoice, type ThemeChoice } from '@/entry/theme';
import { readSession, signOut } from '@/entry/session';
import { TIER_SWITCHABLE, useEntitlements } from '@/entitlements';
import { TierSwitch } from './TierSwitch';
import { useOverlays } from './overlays';
import { readInputCaps } from './platform';
import { saveAndLeave } from './reload';
import { useDialogFocus } from './useDialogFocus';

/**
 * The account: a circle at the end of the top bar, and its menu (D-175).
 *
 * The owner: "the profile picture circle and when you click, I have your
 * accounts and subscription, preference, and sign out." There are no
 * accounts yet (BUILD-SPEC §12), so it says what is true today — signed in
 * on this device, the plan as the test switch has it, the storage this
 * device holds — and that accounts are coming. Laid out so a real account
 * fills the same places: a name and picture in the circle and the heading,
 * the plan from a subscription, Sign out from the account. It carries the
 * Free/Pro test switch and the theme, which used to sit loose in the bar.
 *
 * A small window, not a list of commands: it holds a switch and a choice of
 * three, so it is a dialog with its own focus (D-169), closed by Escape, by
 * a press outside, or by the circle again. On a phone it is the same window
 * from the phone's top bar, the width of the screen.
 */
export function AccountButton({ phone = false }: { phone?: boolean }): React.JSX.Element {
  /** Where the window opens: under the circle, wherever the bar puts it. Null while closed. */
  const [top, setTop] = useState<number | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const open = top !== null;
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="Account"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Your account, plan and preferences"
        data-account-button
        onClick={(event) => { setTop(open ? null : event.currentTarget.getBoundingClientRect().bottom + 6); }}
        // 44px to the finger on a phone (D-169); the circle itself stays small.
        className={`grid shrink-0 place-items-center rounded-full ${phone ? 'size-11' : 'size-9'}`}
      >
        <span className={CIRCLE + ' size-8'}>
          <PersonGlyph />
        </span>
      </button>
      {top !== null && <AccountWindow anchor={button} top={top} phone={phone} onClose={() => { setTop(null); }} />}
    </>
  );
}

/** The circle: a neutral person until accounts bring a picture or initials. */
const CIRCLE = 'grid place-items-center rounded-full border border-edge-strong bg-sunk text-ink';

function PersonGlyph(): React.JSX.Element {
  return (
    <svg aria-hidden width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.8 20c1.2-3.6 4-5.4 7.2-5.4s6 1.8 7.2 5.4" />
    </svg>
  );
}

/** "12.4 MB", for the storage this device holds. */
function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function useStorageUsed(): string | null {
  const [used, setUsed] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!('storage' in navigator) || typeof navigator.storage.estimate !== 'function') return undefined;
    navigator.storage.estimate()
      .then((estimate) => { if (alive && typeof estimate.usage === 'number') setUsed(bytes(estimate.usage)); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return used;
}

const THEMES: readonly { readonly id: ThemeChoice; readonly label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

function AccountWindow({ anchor, top, phone, onClose }: {
  anchor: React.RefObject<HTMLButtonElement>;
  top: number;
  phone: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(readThemeChoice);
  const { tier } = useEntitlements();
  const used = useStorageUsed();
  const session = readSession();
  const keyboard = readInputCaps().keyboard;

  useDialogFocus(box, { onEscape: onClose });

  // A press anywhere else closes it, and goes on to do what it was for.
  useEffect(() => {
    const away = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target && (box.current?.contains(target) || anchor.current?.contains(target))) return;
      onClose();
    };
    document.addEventListener('pointerdown', away, true);
    return () => { document.removeEventListener('pointerdown', away, true); };
  }, [anchor, onClose]);

  const choose = (choice: ThemeChoice): void => {
    setTheme(choice);
    if (choice === 'system') {
      useEditor.setState({ theme: applyThemeChoice('system') });
    } else {
      useEditor.getState().setTheme(choice);
    }
  };

  const leave = (): void => {
    signOut();
    // Saved first, as a reload is (D-171); the projects stay on this device.
    saveAndLeave(useEditor.getState().project, '/');
  };

  const since = session && session.since > 0
    ? new Date(session.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="Account"
      data-account-menu
      className={`glass ui-menu fixed z-50 flex flex-col overflow-y-auto p-2 text-[13px] ${phone ? 'inset-x-2' : 'right-3 w-[320px]'}`}
      style={{ top, maxHeight: `calc(100dvh - ${top + 12}px)`, boxShadow: 'var(--shadow-lip), var(--shadow-lg)' }}
    >
      <div className="flex items-center gap-3 px-2 pb-3 pt-2">
        <span className={CIRCLE + ' size-10'}><PersonGlyph /></span>
        <div className="min-w-0">
          <p className="font-headline m-0 text-[15px] font-semibold">On this device</p>
          <p className="m-0 text-[12px] text-ink-muted">
            {since ? `Signed in here since ${since}` : 'Signed in on this device'}
          </p>
        </div>
      </div>

      <Section title="Your account and plan">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <span>Plan</span>
          {TIER_SWITCHABLE ? <TierSwitch size="large" tall={phone} /> : <span className="font-semibold capitalize">{tier}</span>}
        </div>
        {TIER_SWITCHABLE && (
          <p className="m-0 text-[12px] text-ink-muted">A test switch while the app is in its test release: try it as Free or as Pro.</p>
        )}
        <div className="flex min-h-9 items-center justify-between gap-3">
          <span>Stored on this device</span>
          <span className="tabular text-ink-muted" data-storage-used>{used ?? '…'}</span>
        </div>
        <p className="m-0 rounded-md bg-sunk px-2.5 py-2 text-[12px] text-ink-muted">
          Accounts are coming: sign in anywhere, keep your designs online and work on them with others.
          Today your projects are kept in this browser.
        </p>
      </Section>

      <Section title="Preferences">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <span id="account-theme">Theme</span>
          <div className="ui-seg" role="group" aria-labelledby="account-theme">
            {THEMES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={theme === option.id}
                onClick={() => { choose(option.id); }}
                className={`ui-seg-opt px-2.5 text-[12px] ${phone ? 'min-h-11' : 'min-h-7'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="m-0 text-[12px] text-ink-muted">
          Motion follows your device: with Reduce motion on, the studio&apos;s own panels stop moving. Your designs still play.
        </p>
      </Section>

      <Section title="Help">
        <button
          type="button"
          onClick={() => { onClose(); useOverlays.getState().setShortcutsOpen(true); }}
          className="ui-menu-item flex min-h-11 w-full items-center justify-between rounded-md px-2 text-left hover:bg-sunk"
        >
          <span>Help and shortcuts</span>
          <span className="text-[12px] text-ink-faint">{keyboard ? '?' : 'Gestures'}</span>
        </button>
      </Section>

      <div className="mt-1 border-t border-edge px-1 pt-2">
        {confirming ? (
          <div role="group" aria-label="Sign out" className="flex flex-col gap-2 p-1">
            <p className="m-0 text-[13px]">Sign out? Your designs stay on this device.</p>
            <div className="flex gap-2">
              <button type="button" data-sign-out-confirm onClick={leave} className={`ui-btn ui-btn--danger flex-1 ${phone ? 'min-h-11' : ''}`}>Sign out</button>
              <button type="button" onClick={() => { setConfirming(false); }} className={`ui-btn ui-btn--secondary flex-1 ${phone ? 'min-h-11' : ''}`}>Cancel</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            data-sign-out
            onClick={() => { setConfirming(true); }}
            className="ui-menu-item flex min-h-11 w-full items-center rounded-md px-2 text-left hover:bg-sunk"
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="flex flex-col gap-1.5 border-t border-edge px-2 py-2.5" aria-label={title}>
      <h2 className="m-0 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>
      {children}
    </section>
  );
}
