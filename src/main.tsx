import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadFonts } from '@/fonts/registry';
import './styles/index.css';

const host = document.getElementById('root');
if (!host) throw new Error('Missing #root — index.html and main.tsx have diverged.');

const root = createRoot(host);

/**
 * §3E: fonts resolve before the first frame is drawn.
 *
 * The editor mounts only once the faces are usable, so the artboard never
 * renders a frame in a fallback face. That is a correctness rule, not a
 * cosmetic one — text measurements are cached, and a run measured against the
 * wrong face stays wrong for the life of the cache.
 *
 * The export worker loads its own copies at M4: faces added to the document's
 * FontFaceSet are not visible inside a worker.
 */
loadFonts(document.fonts)
  .then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    // §16: never swallow an error. A failed font load means every frame after
    // it would be silently wrong, so it is worth stopping for.
    console.error('Q Motion Studio: fonts failed to load.', error);
    host.innerHTML =
      '<div style="display:grid;place-items:center;height:100%;font:14px ui-sans-serif,system-ui,sans-serif;color:#6b6b76;text-align:center;padding:24px">' +
      '<div><strong style="display:block;margin-bottom:6px;color:#17171b">Fonts failed to load</strong>' +
      'The editor needs its typefaces before it can render accurately.<br>Check your connection and reload.</div></div>';
  });
