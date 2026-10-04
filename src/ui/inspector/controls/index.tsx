import { createContext, useCallback, useContext, useId, useLayoutEffect, useState, type ReactNode } from 'react';
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
 * Sections as tabs, on a phone (D-114).
 *
 * The inspector's panels are written as a column of titled sections, which is
 * right beside a canvas and wrong in a phone's bottom sheet: a caption's
 * settings ran to three screens, and the close button scrolled away with
 * them. Inside `SectionTabs` each titled section registers itself and only the
 * chosen one draws, under a row of tabs named after them — the same panels,
 * one screenful at a time. Outside it, nothing changes.
 */
type Registry = (title: string) => () => void;
const SectionRegistry = createContext<Registry | null>(null);
const ActiveSection = createContext<{ active: string | null; first: string | null } | null>(null);

export function Section({ title, children }: { title?: string; children: ReactNode }): React.JSX.Element | null {
  const register = useContext(SectionRegistry);
  const tabs = useContext(ActiveSection);
  // Before paint, so a sheet never flashes every section before its tabs appear.
  useLayoutEffect(() => {
    if (register === null || title === undefined) return;
    return register(title);
  }, [register, title]);
  if (tabs !== null && tabs.active !== null) {
    // An untitled section (a row of buttons, a drop zone) goes with the first tab.
    if (title === undefined ? tabs.active !== tabs.first : title !== tabs.active) return null;
  }
  return (
    <section className="mb-4 border-b border-edge pb-4 last:mb-0 last:border-0 last:pb-0">
      {title !== undefined && (
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{title}</h3>
      )}
      {children}
    </section>
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
 * Shows the sections inside it one at a time, chosen from a row of tabs
 * (D-114). `initial` picks the first tab to show by the start of its title —
 * "Photo 2" opens a photo's own settings rather than the list of photos.
 */
export function SectionTabs({ initial, children }: { initial?: string | null; children: ReactNode }): React.JSX.Element {
  const [titles, setTitles] = useState<readonly string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const register = useCallback<Registry>((title) => {
    setTitles((list) => (list.includes(title) ? list : [...list, title]));
    return () => { setTitles((list) => list.filter((t) => t !== title)); };
  }, []);

  const wanted = initial?.toLowerCase() ?? null;
  const fallback = (wanted === null ? undefined : titles.find((t) => t.toLowerCase().startsWith(wanted))) ?? titles[0] ?? null;
  const active = chosen !== null && titles.includes(chosen) ? chosen : fallback;
  const tabbed = titles.length > 1;

  return (
    <SectionRegistry.Provider value={register}>
      <ActiveSection.Provider value={tabbed ? { active, first: titles[0] ?? null } : null}>
        {tabbed && (
          <div
            role="tablist"
            aria-label="Sections"
            data-section-tabs
            className="sticky top-0 z-10 -mx-3 mb-3 flex gap-1.5 overflow-x-auto border-b border-edge bg-panel px-3 pb-2"
          >
            {titles.map((title) => {
              const on = title === active;
              return (
                <button
                  key={title}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => { setChosen(title); }}
                  className="shrink-0 rounded-full border px-3 py-1.5 text-[13px]"
                  style={{
                    borderColor: on ? 'var(--c-accent)' : 'var(--c-edge)',
                    background: on ? 'var(--c-accent-soft)' : 'transparent',
                    color: on ? 'var(--c-accent)' : 'var(--c-ink-muted)',
                    fontWeight: on ? 600 : 400,
                  }}
                >
                  {title}
                </button>
              );
            })}
          </div>
        )}
        {children}
      </ActiveSection.Provider>
    </SectionRegistry.Provider>
  );
}
