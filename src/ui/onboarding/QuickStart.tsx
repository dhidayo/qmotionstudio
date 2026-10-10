import { useEffect, useRef, useState } from 'react';
import { useEditor } from '@/state/store';
import { projectPhotos } from '@/document/select/media';
import { useLayout } from '@/ui/shell/useLayout';
import { closeQuickStart, useQuickStartOpen } from './quickStartState';

/**
 * The quick start, as a guided tour (D-148, replacing D-142's card).
 *
 * "I expected a popup on the element that you want the user to click as step
 * 1 … once that is done and selected, you popup 'add photos', then, export;
 * something that is interactive and not just series of information that block
 * screen." One small popup at a time, pointing at the real button with a ring
 * round it; the person presses that button, and the popup moves on by itself
 * once the step is done, however it was done. Nothing is dimmed or covered,
 * and it steps aside while a sheet or dialog is open. "Skip" closes it for
 * good; the menu brings it back.
 */
export function QuickStart(): React.JSX.Element | null {
  const open = useQuickStartOpen();
  if (!open) return null;
  return <Tour />;
}

type Step = { readonly target: string; readonly title: string; readonly body: string; readonly done: boolean };

function Tour(): React.JSX.Element | null {
  const phone = useLayout() === 'phone';
  // The design that was open when the tour began: a different one means step one is done.
  const startedOn = useRef(useEditor.getState().project.scenes[0]?.templateId ?? '');
  const designChosen = useEditor((s) => (s.project.scenes[0]?.templateId ?? '') !== startedOn.current || s.project.sourceAdTemplateId !== undefined);
  const photosAdded = useEditor((s) => projectPhotos(s.project).length > 0);
  const exporting = useEditor((s) => s.exporting);
  const [exported, setExported] = useState(false);
  if (exporting && !exported) setExported(true);

  const steps: readonly Step[] = [
    { target: 'design', title: 'Choose a design', body: `${phone ? 'Tap' : 'Click'} here and pick a look — a post, a product, a story told in words…`, done: designChosen },
    { target: 'photos', title: 'Add your photos', body: 'Choose photos or take one. They fill the design, and stay in Your photos for later.', done: photosAdded },
    { target: 'export', title: 'Export your video', body: `${phone ? 'Tap' : 'Click'} any words on the picture to make them yours, then export here.`, done: exported },
  ];
  const index = steps.findIndex((step) => !step.done);
  const step = steps[index];
  const rect = useTargetRect(step?.target ?? null);

  if (step === undefined) {
    // Every step done: a word of congratulation once the export window has closed.
    if (exporting) return null;
    return (
      <Bubble phone={phone} rect={null} label="Quick start">
        <p className="text-[13px] font-semibold">You made your first video</p>
        <p className="mt-0.5 text-[12px] text-ink-muted">Bring this tour back any time from the menu.</p>
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={closeQuickStart} className="rounded-md bg-accent px-3 py-1 text-[12px] font-semibold text-accent-ink hover:bg-accent-hover">Done</button>
        </div>
      </Bubble>
    );
  }
  // Out of the way while a sheet or dialog is open, or while the button is off screen.
  if (rect === null) return null;

  return (
    <>
      <div
        aria-hidden
        className="tour-ring pointer-events-none fixed z-40 rounded-xl"
        style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }}
      />
      <Bubble phone={phone} rect={rect} label="Quick start" step={index + 1}>
        <div className="flex items-start gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-bold text-accent-ink">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">{step.title}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{step.body}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-ink-faint">Step {index + 1} of {steps.length}</span>
          <button type="button" onClick={closeQuickStart} className="rounded-md px-2 py-1 text-[12px] font-semibold text-ink-muted hover:bg-panel-alt">Skip tour</button>
        </div>
      </Bubble>
    </>
  );
}

const BUBBLE_WIDTH = 280;
const GAP = 12;

/** The popup, beside the button it points at — below it if there is room, otherwise above. */
function Bubble({
  phone,
  rect,
  label,
  step,
  children,
}: {
  phone: boolean;
  rect: DOMRect | null;
  label: string;
  step?: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const box = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(110);
  useEffect(() => {
    const el = box.current;
    if (el === null) return;
    const watch = new ResizeObserver(() => { setHeight(el.offsetHeight); });
    watch.observe(el);
    return () => { watch.disconnect(); };
  }, []);

  const width = Math.min(BUBBLE_WIDTH, window.innerWidth - 24);
  let style: React.CSSProperties;
  let arrow: { left: number; above: boolean } | null = null;
  if (rect === null) {
    style = phone ? { left: 12, right: 12, bottom: 96 } : { right: 24, bottom: 24, width };
  } else {
    const below = rect.bottom + GAP + height <= window.innerHeight - 8;
    const centre = rect.left + rect.width / 2;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, centre - width / 2));
    style = { left, width, top: below ? rect.bottom + GAP : rect.top - GAP - height };
    arrow = { left: Math.max(14, Math.min(width - 14, centre - left)), above: !below };
  }

  return (
    <aside
      ref={box}
      aria-label={label}
      data-quick-start
      data-quick-step={step}
      className="fixed z-40 rounded-xl border border-edge bg-panel p-3 shadow-lg"
      style={style}
    >
      {arrow !== null && (
        <span
          aria-hidden
          className="absolute size-3 rotate-45 border-edge bg-panel"
          style={{
            left: arrow.left - 6,
            ...(arrow.above ? { bottom: -7, borderRightWidth: 1, borderBottomWidth: 1 } : { top: -7, borderLeftWidth: 1, borderTopWidth: 1 }),
          }}
        />
      )}
      {children}
    </aside>
  );
}

/**
 * Where the step's button is on screen, followed every frame so the popup
 * keeps up with scrolling, folding panels and rotation. Null while it cannot
 * be seen, or while another sheet or dialog is open — the tour waits rather
 * than sitting on top of what the person is doing.
 */
function useTargetRect(target: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (target === null) return;
    let frame = 0;
    let last = '';
    const tick = (): void => {
      const busy = document.querySelector('[role="dialog"]') !== null;
      const found = busy ? null : [...document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)]
        .map((el) => el.getBoundingClientRect())
        .find((r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight);
      const next = found ?? null;
      const key = next === null ? '' : `${next.left},${next.top},${next.width},${next.height}`;
      if (key !== last) { last = key; setRect(next); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); };
  }, [target]);
  return rect;
}
