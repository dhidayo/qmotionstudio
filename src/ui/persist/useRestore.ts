import { useEffect, useState } from 'react';
import { migrate } from '@/document/migrate';
import { referencedMedia } from '@/document/select/media';
import type { MediaStore } from '@/media/store';
import { readLastOpened, readProject } from '@/persist/db';
import { restoreMedia } from '@/persist/media';
import { renderParams } from '@/dev/renderParams';
import { useEditor } from '@/state/store';

/**
 * Reopening the last project on load (§13).
 *
 * A deep link wins. `?template=` and `?scene=` mean "show me this", and they
 * are how `npm run thumbs` and the whole visual suite drive the app — so a URL
 * that names something always starts fresh from it, and only a plain visit
 * reopens what was last worked on. That also matches what a link is *for*:
 * sending someone a template and having it open their own half-finished ad
 * instead would be worse than useless.
 */

export type RestoreState =
  | { readonly phase: 'starting' }
  | { readonly phase: 'ready'; readonly missing: readonly string[] };

function deepLinked(): boolean {
  const params = renderParams();
  return params.template !== null || params.scene !== null;
}

export function useRestore(media: MediaStore): RestoreState {
  const openProject = useEditor((s) => s.openProject);
  /*
   * A deep link is known before the first render, so it is the initial state
   * rather than something an effect corrects a moment later — which would be
   * a second render for a fact that never changes.
   */
  const [state, setState] = useState<RestoreState>(() =>
    deepLinked() ? { phase: 'ready', missing: [] } : { phase: 'starting' },
  );

  useEffect(() => {
    if (deepLinked()) return;

    /*
     * Read through a function, not as a variable.
     *
     * A plain flag assigned only inside the cleanup closure gets narrowed to a
     * literal, and every check against it after the first then looks like dead
     * code. A call cannot be narrowed, which is the honest description anyway:
     * whether this effect is still wanted is not knowable until it is asked.
     */
    const alive = { current: true };
    const stillWanted = (): boolean => alive.current;

    void (async () => {
      try {
        const id = await readLastOpened();
        const stored = id === null ? null : await readProject(id);
        if (!stillWanted()) return;

        if (!stored) {
          setState({ phase: 'ready', missing: [] });
          return;
        }

        const result = migrate({ ...stored.project, schemaVersion: stored.schemaVersion });
        if (!result.ok) {
          // §16: say so rather than opening something half-understood.
          console.error(`Could not open the last project: ${result.reason}`);
          setState({ phase: 'ready', missing: [] });
          return;
        }

        /*
         * Media first, then the document.
         *
         * The other way round paints one frame of a project whose photographs
         * have not arrived, which reads as the save having lost them.
         */
        const { missing } = await restoreMedia(media, referencedMedia(result.project));
        if (!stillWanted()) return;

        openProject(result.project);
        setState({ phase: 'ready', missing });
      } catch (error) {
        if (!stillWanted()) return;
        console.error('Could not read saved work.', error);
        setState({ phase: 'ready', missing: [] });
      }
    })();

    return () => { alive.current = false; };
  }, [media, openProject]);

  return state;
}
