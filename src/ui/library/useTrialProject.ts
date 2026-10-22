import { useEffect, useState } from 'react';
import type { Project } from '@/document/types';
import { loadSamples, sampleNamesIn } from '@/media/samples';
import { useEditor } from '@/state/store';
import { prepareTemplateChange } from '@/state/templateChange';
import { loadSceneTemplate } from '@/templates/registry';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { sceneTrialProject, trialProject } from './trialProject';

/** Where a live preview has got to: still working it out, ready to play, or given up. */
export type Trial =
  | { readonly status: 'preparing' }
  | { readonly status: 'ready'; readonly project: Project }
  | { readonly status: 'failed' };

const PREPARING: Trial = { status: 'preparing' };

/**
 * The editor's project with a library design picked (D-160): what the large
 * preview and a hovered card play. Read from the editor at the moment it is
 * asked for — the library is open over the canvas, so nothing changes under it.
 */
export async function libraryTrial(templateId: string): Promise<Project> {
  const { project, selectedScene } = useEditor.getState();
  const change = await prepareTemplateChange(project, templateId);
  return trialProject(project, change, selectedScene);
}

/** A new scene from a design, alone, as the scene picker would add it (D-160). */
export async function sceneAddTrial(templateId: string): Promise<Project> {
  const template = await loadSceneTemplate(templateId);
  const { project, selectedScene } = useEditor.getState();
  return sceneTrialProject(project, selectedScene, template, 'add');
}

/** The selected scene alone, switched to a design as the scene picker would switch it (D-160). */
export async function sceneReplaceTrial(templateId: string): Promise<Project> {
  const template = await loadSceneTemplate(templateId);
  const { project, selectedScene } = useEditor.getState();
  return sceneTrialProject(project, selectedScene, template, 'replace');
}

/**
 * Works out a trial project while `key` is set, and fetches the sample photos
 * it shows (D-160).
 *
 * `key` names what is being previewed (a design's id); null prepares nothing.
 * `prepare` should keep its identity between renders — a module-level
 * function such as `libraryTrial` — or each render would start over.
 * A sample that will not arrive is not a reason to show nothing: the design
 * draws its placeholder there, as the editor does. A design whose code will
 * not load is, and the caller falls back to the recorded loop.
 */
export function useTrialProject(key: string | null, prepare: (key: string) => Promise<Project>): Trial {
  const media = useMediaStore();
  const [settled, setSettled] = useState<{ readonly key: string; readonly trial: Trial } | null>(null);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    prepare(key)
      .then(async (project) => {
        await loadSamples(media, { artboardLongestEdge: 1920, names: sampleNamesIn(project) })
          .catch((error: unknown) => { console.warn('A preview could not fetch every sample photo.', error); });
        if (!cancelled) setSettled({ key, trial: { status: 'ready', project } });
      })
      .catch((error: unknown) => {
        // §16: said, not swallowed — but the preview still shows the loop.
        console.error(`Could not preview the "${key}" design.`, error);
        if (!cancelled) setSettled({ key, trial: { status: 'failed' } });
      });
    return () => { cancelled = true; };
  }, [key, prepare, media]);

  return key !== null && settled?.key === key ? settled.trial : PREPARING;
}
