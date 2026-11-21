import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Landing } from './Landing';
import { setLeave } from './enter';
import { loadFonts } from '@/fonts/registry';

/**
 * The landing page (D-175): a chunk of its own, drawn without the editor.
 *
 * It does not wait for the fonts as the editor must (§3E): words in a
 * fallback face for a moment are fine on a page that is only read. It waits
 * a little, so a fast connection never shows the swap, and no longer.
 */
const FONT_WAIT_MS = 400;

export function bootLanding(host: HTMLElement): void {
  // The start-up screen, kept to put back while the studio loads after Open Studio.
  const bootScreen = host.innerHTML;
  const root = createRoot(host);
  setLeave(() => {
    root.unmount();
    host.innerHTML = bootScreen;
  });

  // The same two faces the editor uses, already preloaded by the page.
  const ready = Promise.race([loadFonts(document.fonts), wait(FONT_WAIT_MS)]);
  void ready.catch(() => undefined).then(() => {
    root.render(
      <StrictMode>
        <Landing />
      </StrictMode>,
    );
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}
