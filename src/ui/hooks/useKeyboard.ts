import { useEffect } from 'react';
import type { PreviewClock } from '@/core/time/clock';
import { useEditor } from '@/state/store';

/**
 * §13's keyboard map.
 *
 *   space        play/pause
 *   ⌘Z / ⌘⇧Z     undo / redo
 *   ← →          step one frame
 *   ⌘E           export
 *   ⌘S           no-op with a "saves automatically" note
 *
 * Every binding is suppressed while a text field has focus. Arrow keys in
 * particular would otherwise scrub the timeline while someone is editing a
 * headline, which is the sort of thing that makes an editor feel hostile.
 */
const FRAME_MS = 1000 / 30;

export function useKeyboard(clock: PreviewClock, options: { onExport: () => void; onSaveNote: () => void }): void {
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const { onExport, onSaveNote } = options;

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      /*
       * Something closer to the key already handled it — the selection box
       * nudging its element with an arrow, say. Acting as well made every
       * nudge also step the playhead, so on an element with motion each press
       * edited a pose at a different moment.
       */
      if (event.defaultPrevented) return;

      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

      const meta = event.metaKey || event.ctrlKey;

      // ⌘Z still works while typing — the browser's own field-level undo is
      // less useful here than the document's, and people expect one ⌘Z.
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if (meta && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        onExport();
        return;
      }

      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        onSaveNote();
        return;
      }

      if (typing) return;

      if (event.code === 'Space') {
        event.preventDefault();
        if (clock.playing) clock.pause();
        else clock.play();
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        clock.pause();
        clock.seek(clock.timeMs + (event.key === 'ArrowRight' ? FRAME_MS : -FRAME_MS));
      }
    };

    addEventListener('keydown', onKey);
    return () => { removeEventListener('keydown', onKey); };
  }, [clock, undo, redo, onExport, onSaveNote]);
}
