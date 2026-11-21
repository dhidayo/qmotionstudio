import { currentRoute } from '@/entry/session';
import { pageDidNotLoad } from '@/entry/failed';
import './styles/index.css';

/**
 * The page's entry (D-175): the landing page at `/`, the studio at `/studio`.
 *
 * Which one was decided before this script ran (`public/route-boot.js`), so a
 * signed-in visit never draws the landing page first. Each is a chunk of its
 * own, so the landing page is drawn without downloading the editor, and the
 * editor opens without the landing page; this file is only the choice, and
 * the styles both share.
 */
const host = document.getElementById('root');
if (!host) throw new Error('Missing #root — index.html and main.tsx have diverged.');

if (currentRoute() === 'studio') {
  import('@/studio/boot')
    .then(({ bootStudio }) => { bootStudio(host); })
    .catch((error: unknown) => { pageDidNotLoad(host, 'studio', error); });
} else {
  import('@/landing/boot')
    .then(({ bootLanding }) => { bootLanding(host); })
    .catch((error: unknown) => { pageDidNotLoad(host, 'landing', error); });
}
