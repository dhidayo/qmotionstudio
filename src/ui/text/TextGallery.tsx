import { familyOf } from '@/fonts/registry';
import { onAccent } from '@/core/render/paint';
import * as actions from '@/document/actions';
import { useEditor } from '@/state/store';
import { addLayer } from '@/ui/editing/addLayer';
import { TEXT_PRESETS, type TextPreset } from './textPresets';

const EFFECT_NOTE: Readonly<Record<string, string>> = {
  'glow-el': 'Glows',
  shine: 'Shines',
  'sparkle-burst': 'Sparkles',
  pulse: 'Pulses',
  'pop-in': 'Pops in',
  'spin-in': 'Spins in',
  'glitch-in': 'Glitches in',
};

/**
 * The text gallery (D-145): every ready-made style, drawn in the design's own
 * colours so it looks here as it will there. A tap puts it on the canvas.
 */
export function TextGallery({ onAdded }: { onAdded: (id: string) => void }): React.JSX.Element {
  const palette = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.look.palette);
  const bg = palette?.bg ?? '#101014';
  const ink = palette?.ink ?? '#f4f4f6';
  const accent = palette?.accent ?? '#2546c4';

  const add = (preset: TextPreset): void => {
    const effects = preset.effects?.map((e) => actions.makeElementEffect(e.effectId, e.phase, e.durationMs, e.intensity));
    const id = addLayer(
      { kind: 'text', text: preset.text, style: preset.style },
      { x: 0.5, y: 0.78 },
      { ...(preset.enter === undefined ? {} : { enterAnim: preset.enter }), ...(effects === undefined ? {} : { effects }) },
    );
    onAdded(id);
  };

  return (
    <div className="mb-3 grid grid-cols-2 gap-1.5" role="list" aria-label="Text styles" data-text-gallery>
      {TEXT_PRESETS.map((preset) => {
        const s = preset.style;
        const color = s.color.length > 0 ? s.color : ink;
        const glow = preset.effects?.some((e) => e.effectId === 'glow-el') === true;
        const note = preset.effects?.map((e) => EFFECT_NOTE[e.effectId]).find((n) => n !== undefined) ?? (preset.enter === 'wipeIn' ? 'Types in' : undefined);
        return (
          <button
            key={preset.id}
            type="button"
            role="listitem"
            data-text-preset={preset.id}
            onClick={() => { add(preset); }}
            aria-label={`${preset.name} — add to the canvas`}
            className="overflow-hidden rounded-md border border-edge text-left hover:border-accent"
          >
            <span className="relative grid h-16 place-items-center overflow-hidden px-1.5" style={{ background: bg }}>
              <span
                className="max-w-full truncate leading-tight"
                style={{
                  fontFamily: familyOf(s.fontId),
                  fontWeight: s.weight,
                  fontSize: `${Math.max(10, Math.min(22, 14 * (s.sizePct / 100)))}px`,
                  letterSpacing: `${s.letterSpacingPct / 100}em`,
                  color: s.pill ? onAccent(accent) : color,
                  ...(s.pill ? { background: accent, padding: '2px 8px', borderRadius: 999 } : {}),
                  ...(s.outline ? { WebkitTextStroke: `3px ${bg}`, paintOrder: 'stroke fill' } : {}),
                  ...(s.shadow ? { textShadow: '0 2px 6px rgba(0,0,0,0.5)' } : {}),
                  ...(glow ? { textShadow: `0 0 6px ${color}, 0 0 14px ${color}` } : {}),
                }}
              >
                {preset.text}
              </span>
              {note !== undefined && (
                <span className="absolute right-1 top-1 rounded-full px-1.5 text-[9px] font-semibold" style={{ background: 'rgb(0 0 0 / 0.45)', color: '#fff' }}>{note}</span>
              )}
            </span>
            <span className="block truncate px-1.5 py-1 text-[11px]">{preset.name}</span>
          </button>
        );
      })}
    </div>
  );
}
