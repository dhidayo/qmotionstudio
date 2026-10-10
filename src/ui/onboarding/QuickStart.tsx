import { useRef, useState } from 'react';
import { useEditor } from '@/state/store';
import { userPhotoIds } from '@/document/select/media';
import { useOverlays } from '@/ui/shell/overlays';
import { useLayout } from '@/ui/shell/useLayout';
import { useAddYourPhotos } from '@/ui/editing/StartActions';
import { closeQuickStart, useQuickStartOpen } from './quickStartState';

/**
 * The quick start (D-142): "help me with the first run guidance."
 *
 * Three steps from an empty visit to a finished video, each with the button
 * that does it, each ticked off when it has been done however it was done —
 * from here, from the toolbar, from the library. A card, not a tour: it does
 * not cover the picture or hold the editor hostage, and "Got it" closes it
 * for good (the menu brings it back).
 */
export function QuickStart(): React.JSX.Element | null {
  const open = useQuickStartOpen();
  if (!open) return null;
  return <Card />;
}

function Card(): React.JSX.Element {
  const phone = useLayout() === 'phone';
  const openPanel = useOverlays((o) => o.openPhonePanel);
  const setExporting = useEditor((s) => s.setExporting);
  const add = useAddYourPhotos();
  // The design that was open when the card appeared: a different one means step one is done.
  const startedOn = useRef(useEditor.getState().project.scenes[0]?.templateId ?? '');
  const designChosen = useEditor((s) => (s.project.scenes[0]?.templateId ?? '') !== startedOn.current || s.project.sourceAdTemplateId !== undefined);
  const photosAdded = useEditor((s) => userPhotoIds(s.project).length > 0);
  const [exported, setExported] = useState(false);
  const exporting = useEditor((s) => s.exporting);
  if (exporting && !exported) setExported(true);

  const steps = [
    { done: designChosen, title: 'Choose a design', hint: 'A post, a story, a product, a hiring video…', action: 'Choose', run: () => { openPanel('designs'); } },
    { done: photosAdded, title: 'Add your photos', hint: 'They drop into the design. Nothing is uploaded.', action: add.busy ? 'Reading…' : 'Add', run: add.pick },
    { done: exported, title: 'Export your video', hint: 'Tap any words on the picture first to make them yours.', action: 'Export', run: () => { setExporting(true); } },
  ];
  const finished = steps.every((step) => step.done);

  return (
    <aside
      aria-label="Quick start"
      data-quick-start
      className={`fixed z-30 overflow-hidden rounded-xl border border-edge bg-panel shadow-lg ${phone ? 'inset-x-3 top-[60px]' : 'right-[calc(var(--w-inspector)+16px)] top-[64px] w-[330px]'}`}
    >
      <div className="brand-surface flex items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1 text-[13px] font-semibold">{finished ? 'You made your first video' : 'Make your first video in 3 steps'}</span>
        <button type="button" onClick={closeQuickStart} aria-label="Close the quick start" className="grid size-7 place-items-center rounded-md hover:bg-panel-alt">✕</button>
      </div>
      <ol className="px-3 py-2">
        {steps.map((step, i) => (
          <li key={step.title} className="flex items-center gap-2.5 py-1.5" data-quick-step={i + 1} data-done={step.done}>
            <span
              aria-hidden
              className="grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold"
              style={step.done ? { background: 'var(--c-accent)', color: 'var(--c-accent-ink)' } : { background: 'var(--c-panel-alt)', color: 'var(--c-ink)', boxShadow: 'inset 0 0 0 1px var(--c-edge-strong)' }}
            >
              {step.done ? '✓' : i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[13px] font-semibold ${step.done ? 'text-ink-muted line-through' : ''}`}>{step.title}</span>
              {!phone && <span className="block text-[11px] text-ink-faint">{step.hint}</span>}
            </span>
            {!step.done && (
              <button type="button" onClick={step.run} className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-[12px] font-semibold text-accent-ink hover:bg-accent-hover">
                {step.action}
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between gap-2 border-t border-edge px-3 py-2">
        <span className="text-[11px] text-ink-faint">Bring this back from the menu.</span>
        <button type="button" onClick={closeQuickStart} className="rounded-md border border-edge px-2.5 py-1 text-[12px] font-semibold hover:bg-panel-alt">Got it</button>
      </div>
      {add.input}
    </aside>
  );
}
