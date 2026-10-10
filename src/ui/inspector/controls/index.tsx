import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useEditor } from '@/state/store';

/**
 * Inspector control primitives (§8).
 *
 * Every control that can fire continuously — sliders, colour inputs — ends its
 * coalescing run on pointer-up, so a drag is one undo step rather than forty.
 * Doing that here means each tab cannot forget to.
 */

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }): React.JSX.Element {
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-ink-muted">{label}</span>
        {hint !== undefined && <span className="tabular text-[10px] text-ink-faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/*
 * Sections (D-131): every group of settings is a navy bar that folds.
 *
 * "Under Look, Motion and Photos, sections should be having the navy blue deep
 * bg for clear demarcation of features and functions… settings should find a
 * way to manage screen, where I can close item… and I can expand too." Each
 * titled section is a bar — its name, a chevron, and any actions it carries,
 * such as delete — that opens and closes its settings. On a computer each folds
 * on its own and stays as it was left. In a phone's sheet (`SectionTabs`, the
 * name kept from D-114's tabs) they behave as one accordion: opening one closes
 * the rest, so a long panel is never more than a screen.
 */
type Accordion = {
  isOpen: (title: string) => boolean;
  toggle: (title: string) => void;
  register: (title: string) => () => void;
};
const AccordionContext = createContext<Accordion | null>(null);

/**
 * Sections drawn on their own terms even inside a phone's accordion — for a
 * panel that organises itself another way, such as the Text tab's list (D-124).
 */
export function NoSectionTabs({ children }: { children: ReactNode }): React.JSX.Element {
  return <AccordionContext.Provider value={null}>{children}</AccordionContext.Provider>;
}

const CLOSED_KEY = 'ms.sections.closed';

/** A section's name without the count some carry, so "Photos (3)" is remembered as "Photos". */
function sectionKey(title: string): string {
  return title.replace(/\s*\(\d+\)$/, '');
}

const OPENED_KEY = 'ms.sections.opened';

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []);
  } catch {
    return new Set();
  }
}

function readClosed(): Set<string> {
  try {
    const raw = localStorage.getItem(CLOSED_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Remembered on this device: a viewer's convenience (browser storage),
 * forgotten in a private window. A section that starts folded (`defaultOpen`
 * false — Style's "More") remembers being opened instead.
 */
function useRememberedOpen(title: string, defaultOpen = true): [boolean, () => void] {
  const key = sectionKey(title);
  const storeKey = defaultOpen ? CLOSED_KEY : OPENED_KEY;
  const [open, setOpen] = useState(() => (defaultOpen ? !readClosed().has(key) : readSet(OPENED_KEY).has(key)));
  const toggle = useCallback(() => {
    setOpen((was) => {
      const marked = readSet(storeKey);
      // Marked when it is not in its default state.
      if (was === defaultOpen) marked.add(key);
      else marked.delete(key);
      try {
        localStorage.setItem(storeKey, JSON.stringify([...marked]));
      } catch {
        // Folding still works for this visit.
      }
      return !was;
    });
  }, [key, storeKey, defaultOpen]);
  return [open, toggle];
}

export function Section({
  title,
  children,
  actions,
  defaultOpen = true,
}: {
  title?: string;
  children: ReactNode;
  /** Buttons on the bar itself, such as a delete — beside the name, always in reach. */
  actions?: ReactNode;
  /** False for settings few people need, folded until asked for. */
  defaultOpen?: boolean;
}): React.JSX.Element {
  if (title === undefined) {
    return <section className="mb-3">{children}</section>;
  }
  return <TitledSection title={title} actions={actions} defaultOpen={defaultOpen}>{children}</TitledSection>;
}

function TitledSection({ title, children, actions, defaultOpen }: { title: string; children: ReactNode; actions?: ReactNode; defaultOpen: boolean }): React.JSX.Element {
  const accordion = useContext(AccordionContext);
  const [freeOpen, freeToggle] = useRememberedOpen(title, defaultOpen);
  // Before paint, so a sheet never flashes every section open.
  useLayoutEffect(() => (accordion === null ? undefined : accordion.register(title)), [accordion, title]);
  const open = accordion === null ? freeOpen : accordion.isOpen(title);
  const toggle = accordion === null ? freeToggle : () => { accordion.toggle(title); };
  const id = useId();

  return (
    <section className="mb-2" data-section={sectionKey(title)}>
      <div className={`brand-surface flex items-center gap-1 pr-1 ${open ? 'rounded-t-[8px]' : 'rounded-[8px]'}`}>
        <h3 className="min-w-0 flex-1">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={id}
            className="flex w-full items-center gap-2 px-2.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
          >
            <span aria-hidden className="inline-block w-3 text-center text-[13px] leading-none transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none', transitionDuration: 'var(--t-fast)' }}>›</span>
            <span className="min-w-0 flex-1 truncate">{title}</span>
          </button>
        </h3>
        {actions}
      </div>
      {open && (
        <div id={id} className="rounded-b-[8px] border border-t-0 border-edge px-2.5 pb-2.5 pt-3">
          {/* A section inside this one folds on its own; it does not close this one. */}
          <AccordionContext.Provider value={null}>{children}</AccordionContext.Provider>
        </div>
      )}
    </section>
  );
}

/** A delete on a section's bar (D-131): plain to see, one tap. */
export function BarDelete({ label, onDelete }: { label: string; onDelete: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onDelete}
      aria-label={label}
      title={label}
      className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-panel-alt"
    >
      <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />
      </svg>
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  suffix?: string;
  label: string;
}): React.JSX.Element {
  const endInteraction = useEditor((s) => s.endInteraction);
  return (
    // Fractional steps show their fraction: a 0.8s length must not read "1s".
    <Row label={label} hint={`${step < 1 ? value.toFixed(1) : Math.round(value)}${suffix ?? ''}`}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => { onChange(Number(e.target.value)); }}
        /*
         * Releasing seals the undo entry, so the next drag is a separate step.
         *
         * Blur rather than keyUp: a keyboard user pressing the arrow key ten
         * times is one adjustment, and sealing per keystroke would give them
         * ten undo steps where a mouse user gets one.
         */
        onPointerUp={endInteraction}
        onBlur={endInteraction}
        className="h-1 w-full accent-[var(--c-accent)]"
      />
    </Row>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
}): React.JSX.Element {
  const endInteraction = useEditor((s) => s.endInteraction);
  const step = (delta: number): void => {
    onChange(Math.max(min, Math.min(max, value + delta)));
    endInteraction();
  };

  return (
    <Row label={label}>
      <div className="flex items-center gap-1">
        <StepButton onClick={() => { step(-1); }} disabled={value <= min} label={`Decrease ${label}`}>−</StepButton>
        <span className="tabular min-w-8 text-center text-[13px] font-medium">{value}</span>
        <StepButton onClick={() => { step(1); }} disabled={value >= max} label={`Increase ${label}`}>+</StepButton>
        <span className="ml-1 text-[10px] text-ink-faint">of {max}</span>
      </div>
    </Row>
  );
}

function StepButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-6 place-items-center rounded-md border border-edge text-[13px] leading-none hover:bg-panel-alt disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  columns,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  columns?: number;
}): React.JSX.Element {
  return (
    <Row label={label}>
      <div
        role="group"
        aria-label={label}
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => { onChange(option.value); }}
              aria-pressed={active}
              className="truncate rounded-md border px-1.5 py-1 text-[11px] transition-colors"
              style={{
                borderColor: active ? 'var(--c-accent)' : 'var(--c-edge)',
                background: active ? 'var(--c-accent-soft)' : 'transparent',
                color: active ? 'var(--c-accent)' : 'var(--c-ink-muted)',
                fontWeight: active ? 600 : 400,
                transitionDuration: 'var(--t-fast)',
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </Row>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => { onChange(!checked); }}
      className="flex w-full items-center justify-between rounded-md border border-edge px-2 py-1.5 text-[11px] hover:bg-panel-alt"
    >
      <span style={{ color: checked ? 'var(--c-ink)' : 'var(--c-ink-muted)' }}>{label}</span>
      <span
        className="grid h-4 w-7 shrink-0 items-center rounded-full px-0.5 transition-colors"
        style={{
          background: checked ? 'var(--c-accent)' : 'var(--c-edge-strong)',
          transitionDuration: 'var(--t-fast)',
        }}
      >
        <span
          className="block size-3 rounded-full bg-white transition-transform"
          style={{
            transform: checked ? 'translateX(12px)' : 'translateX(0)',
            transitionDuration: 'var(--t-fast)',
          }}
        />
      </span>
    </button>
  );
}

export function ColorField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}): React.JSX.Element {
  const id = useId();
  const endInteraction = useEditor((s) => s.endInteraction);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="flex-1 truncate text-[11px] text-ink-muted">
        {label}
      </label>
      <span className="tabular text-[10px] uppercase text-ink-faint">{value}</span>
      <input
        id={id}
        type="color"
        value={normaliseHex(value)}
        onChange={(e) => { onChange(e.target.value); }}
        onBlur={endInteraction}
        className="size-6 shrink-0 cursor-pointer rounded-md border border-edge bg-transparent p-0.5"
      />
    </div>
  );
}

/** <input type="color"> only accepts #rrggbb; anything else makes it fall back to black. */
function normaliseHex(value: string): string {
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    const [r, g, b] = [hex[1], hex[2], hex[3]];
    return `#${r ?? '0'}${r ?? '0'}${g ?? '0'}${g ?? '0'}${b ?? '0'}${b ?? '0'}`;
  }
  if (/^#[0-9a-f]{8}$/i.test(hex)) return hex.slice(0, 7);
  return '#000000';
}

export function TextInput({
  value,
  onChange,
  placeholder,
  maxLength,
  label,
  multiline,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  label: string;
  multiline?: boolean;
}): React.JSX.Element {
  const endInteraction = useEditor((s) => s.endInteraction);
  const shared = {
    value,
    placeholder,
    maxLength,
    'aria-label': label,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { onChange(e.target.value); },
    // Leaving the field seals the undo entry, so a subsequent edit is separate.
    onBlur: endInteraction,
    className:
      'w-full rounded-md border border-edge bg-panel-alt px-2 py-1.5 text-[12px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none',
  };

  return multiline === true ? <textarea {...shared} rows={2} /> : <input type="text" {...shared} />;
}

export function Button({
  onClick,
  children,
  variant = 'default',
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  variant?: 'default' | 'danger' | 'accent';
  disabled?: boolean;
}): React.JSX.Element {
  const styles: Record<string, React.CSSProperties> = {
    default: { borderColor: 'var(--c-edge)', color: 'var(--c-ink-muted)' },
    danger: { borderColor: 'var(--c-edge)', color: 'var(--c-danger)' },
    accent: { borderColor: 'var(--c-accent)', background: 'var(--c-accent-soft)', color: 'var(--c-accent)' },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 rounded-md border px-2 py-1.5 text-[11px] transition-colors hover:bg-panel-alt disabled:opacity-40"
      style={{ ...styles[variant], transitionDuration: 'var(--t-fast)' }}
    >
      {children}
    </button>
  );
}

export function EmptyNote({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="py-1 text-[11px] leading-relaxed text-ink-faint">{children}</p>;
}

/**
 * A phone sheet's sections as an accordion (D-131; D-114's tabs before it):
 * one open at a time. `initial` opens a section by the start of its title —
 * "Photo 2" opens that photo's own settings rather than the list of photos —
 * and otherwise the first one is open.
 */
export function SectionTabs({ initial, children }: { initial?: string | null; children: ReactNode }): React.JSX.Element {
  const [titles, setTitles] = useState<readonly string[]>([]);
  // `undefined`: nothing chosen yet, so the initial (or first) is open; `null`: all closed.
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const register = useCallback((title: string) => {
    setTitles((list) => (list.includes(title) ? list : [...list, title]));
    return () => { setTitles((list) => list.filter((t) => t !== title)); };
  }, []);

  const wanted = initial?.toLowerCase() ?? null;
  const fallback = (wanted === null ? undefined : titles.find((t) => t.toLowerCase().startsWith(wanted))) ?? titles[0] ?? null;
  const openTitle = chosen === undefined ? fallback : chosen;

  const accordion = useMemo<Accordion>(() => ({
    isOpen: (title) => title === openTitle,
    toggle: (title) => { setChosen(title === openTitle ? null : title); },
    register,
  }), [openTitle, register]);

  return <AccordionContext.Provider value={accordion}>{children}</AccordionContext.Provider>;
}
