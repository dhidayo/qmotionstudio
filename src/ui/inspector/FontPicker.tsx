import { useRef, useState } from 'react';
import { FONTS, SYSTEM_FONTS, familyOf, fontLabel, type FontId } from '@/fonts/registry';
import { FONT_ACCEPT, addFontFile, useUserFonts } from '@/fonts/userFonts';
import { useEditor } from '@/state/store';

/**
 * Choosing a font (D-144): the app's own two, your uploaded fonts, and the
 * ones every device has — each shown in itself, so choosing is looking. Upload
 * sits in the list, where a missing font is noticed.
 */
export function FontPicker({ value, onChange }: { value: FontId; onChange: (id: FontId) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const mine = useUserFonts();
  const showToast = useEditor((s) => s.showToast);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (id: FontId): void => { onChange(id); setOpen(false); };
  const app = (['headline', 'body'] as const).map((id) => ({ id, label: FONTS[id]?.label ?? id }));

  const option = (id: FontId, label: string, note?: string): React.JSX.Element => (
    <button
      key={id}
      type="button"
      role="option"
      aria-selected={id === value}
      data-font-option={id}
      onClick={() => { choose(id); }}
      className="flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-panel-alt"
      style={id === value ? { background: 'var(--c-accent-soft)', color: 'var(--c-accent)' } : undefined}
    >
      <span className="truncate text-[15px]" style={{ fontFamily: familyOf(id) }}>{label}</span>
      {note !== undefined && <span className="shrink-0 text-[10px] text-ink-faint">{note}</span>}
    </button>
  );

  return (
    <div className="mb-2.5" data-font-picker>
      <div className="mb-1 text-[11px] text-ink-muted">Font</div>
      <button
        type="button"
        onClick={() => { setOpen(!open); }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Font: ${fontLabel(value)}. Change`}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-edge bg-panel-alt px-2.5 py-1.5 text-left hover:border-accent"
      >
        <span className="truncate text-[15px]" style={{ fontFamily: familyOf(value) }}>{fontLabel(value)}</span>
        <span aria-hidden className="text-[10px] text-ink-faint">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div role="listbox" aria-label="Fonts" className="mt-1 max-h-72 overflow-y-auto rounded-md border border-edge bg-panel p-1 shadow-md">
          <div className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">In the app</div>
          {app.map((font) => option(font.id, font.label, font.id === 'headline' ? 'headlines' : 'body text'))}
          <div className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Your fonts</div>
          {mine.map((font) => option(font.id, font.label))}
          <button
            type="button"
            onClick={() => { input.current?.click(); }}
            disabled={busy}
            data-upload-font
            className="w-full rounded-md px-2 py-1.5 text-left text-[12px] font-semibold text-accent hover:bg-panel-alt"
          >
            {busy ? 'Reading the font…' : '+ Upload a font…'}
          </button>
          {error !== null && <p className="px-2 pb-1 text-[11px]" style={{ color: 'var(--c-danger)' }}>{error}</p>}
          <div className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">On every device</div>
          {SYSTEM_FONTS.map((font) => option(font.id, font.label))}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept={FONT_ACCEPT}
        hidden
        aria-label="Upload a font"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setBusy(true);
          setError(null);
          void addFontFile(file)
            .then((id) => {
              choose(id);
              showToast(`“${fontLabel(id)}” is added — it is kept on this device and goes into your exports.`);
            })
            .catch((reason: unknown) => {
              // §16: said where it happened, not swallowed.
              console.error('Could not add that font.', reason);
              setError(reason instanceof Error ? reason.message : 'That font could not be added.');
            })
            .finally(() => { setBusy(false); });
        }}
      />
    </div>
  );
}
