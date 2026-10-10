import { useCallback } from 'react';
import * as actions from '@/document/actions';
import { createProject, DEFAULT_TEMPLATE_ID } from '@/document/defaults';
import { designLook } from '@/templates/looks';
import { SCHEMA_VERSION, type Project } from '@/document/types';
import { writeLastOpened, writeProject } from '@/persist/db';
import { useEditor } from '@/state/store';

/**
 * Everything that saves, copies, renames or starts a project (D-099).
 *
 * One hook for the title bar and the project list, so "Make a copy" and
 * "Save as" mean the same thing wherever they are pressed. They had already
 * drifted once: the list's Duplicate opened the copy, which is what "Save as"
 * should do, and there was no Save as at all.
 *
 * Every change of document is preceded by a write of the one being left.
 * Autosave is debounced, so whatever happened in the last fraction of a second
 * — a rename typed a moment ago, most obviously — has not reached disk yet,
 * and leaving without writing it would silently lose it.
 *
 * Each action confirms itself with a toast, and only once the write has
 * actually finished: a "Saved" that appears before the save is a promise, not
 * a confirmation.
 */

export const MAX_NAME = 80;

/** Trimmed, bounded, and never empty — a nameless project cannot be found again. */
export function cleanName(name: string, fallback = 'Untitled project'): string {
  const trimmed = name.trim().slice(0, MAX_NAME);
  return trimmed.length > 0 ? trimmed : fallback;
}

export function useProjectActions(): {
  rename: (name: string) => Promise<void>;
  saveAs: (name: string) => Promise<void>;
  makeCopy: (source?: Project) => Promise<Project | null>;
  startNew: (kind: 'template' | 'blank') => Promise<void>;
  flush: () => Promise<void>;
} {
  const dispatch = useEditor((s) => s.dispatch);
  const openProject = useEditor((s) => s.openProject);
  const showToast = useEditor((s) => s.showToast);
  const setSaveState = useEditor((s) => s.setSaveState);

  const write = useCallback(async (project: Project): Promise<void> => {
    await writeProject({ schemaVersion: SCHEMA_VERSION, project });
  }, []);

  /** Writes the open project now, rather than when autosave gets round to it. */
  const flush = useCallback(async (): Promise<void> => {
    await write(useEditor.getState().project);
  }, [write]);

  const fail = useCallback((what: string, error: unknown): void => {
    // §16: never silently. The badge says "Not saved"; the toast says why.
    console.error(`Could not ${what}.`, error);
    setSaveState('failed');
    showToast(`Could not ${what}. Your device may be out of space.`);
  }, [setSaveState, showToast]);

  const rename = useCallback(async (name: string): Promise<void> => {
    const current = useEditor.getState().project;
    const next = cleanName(name, current.name);
    if (next === current.name) return;
    dispatch(actions.renameProject(next));
    try {
      await flush();
      setSaveState('saved');
      showToast(`“${next}” saved.`);
    } catch (error: unknown) {
      fail('save the new name', error);
    }
  }, [dispatch, flush, setSaveState, showToast, fail]);

  const saveAs = useCallback(async (name: string): Promise<void> => {
    const current = useEditor.getState().project;
    const copy: Project = { ...actions.duplicateProject(current), name: cleanName(name, `${current.name} copy`) };
    try {
      await flush();
      await write(copy);
      await writeLastOpened(copy.id);
      openProject(copy);
      showToast(`Saved as “${copy.name}”. You’re now working on it.`);
    } catch (error: unknown) {
      fail('save a copy', error);
    }
  }, [flush, write, openProject, showToast, fail]);

  const makeCopy = useCallback(async (source?: Project): Promise<Project | null> => {
    const original = source ?? useEditor.getState().project;
    const copy = actions.duplicateProject(original);
    try {
      await write(copy);
      showToast(`Copy saved as “${copy.name}”. Open it from Switch project.`);
      return copy;
    } catch (error: unknown) {
      fail('make a copy', error);
      return null;
    }
  }, [write, showToast, fail]);

  const startNew = useCallback(async (kind: 'template' | 'blank'): Promise<void> => {
    const { aspect } = useEditor.getState().project;
    const project = kind === 'blank'
      // A blank canvas is built with the timeline's own tools — photos, text and
      // video as layers — which live in Motion Ads, so that is where it opens.
      ? createProject({ name: 'Untitled canvas', aspect, mode: 'motionAd', templateId: 'blank', photoCount: 0 })
      : createProject({ aspect, look: designLook(DEFAULT_TEMPLATE_ID) });
    try {
      await flush();
      await write(project);
      await writeLastOpened(project.id);
      openProject(project);
      showToast(kind === 'blank' ? 'New blank canvas. Add photos, text and video from the timeline.' : 'New project started.');
    } catch (error: unknown) {
      fail('start a new project', error);
    }
  }, [flush, write, openProject, showToast, fail]);

  return { rename, saveAs, makeCopy, startNew, flush };
}
