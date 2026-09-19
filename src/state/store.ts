import { create } from 'zustand';
import type { Aspect } from '@/core/types';
import type { Project } from '@/document/types';
import { createProject, DEMO_TEMPLATE_ID, PLACEHOLDER_TEMPLATE_ID } from '@/document/defaults';
import { totalDurationMs } from '@/document/select/timeline';
import type { SceneTemplate } from '@/templates/schema';
import { renderParams } from '@/dev/renderParams';
import * as actions from '@/document/actions';
import {
  canRedo, canUndo, commit, emptyHistory, redo, redoLabel,
  sealCoalescing, undo, undoLabel, type HistoryState,
} from './undo';

export type InspectorTab = 'photos' | 'text' | 'logo' | 'look';
export type Theme = 'light' | 'dark';

/**
 * Editor state.
 *
 * Two halves, deliberately separated:
 *   - `project` is the document. Every change goes through `dispatch`, which
 *     applies an action and records it in the history (§8: "No inspector
 *     control may mutate the document directly").
 *   - everything else is ephemeral editor state — selection, playhead, which
 *     tab is open, favourites. Never undoable; nobody wants ⌘Z to reopen a
 *     panel or un-favourite a template.
 */
type EditorState = {
  project: Project;
  history: HistoryState;
  /**
   * The active scene's template, once the lazy registry has resolved it
   * (D-029). Null while in flight — the inspector shows a loading note and the
   * renderer draws nothing rather than guessing.
   */
  template: SceneTemplate | null;

  playheadMs: number;
  isPlaying: boolean;
  inspectorTab: InspectorTab;
  theme: Theme;
  /** Index into the scene's photos, or null. Drives the Photos tab's controls. */
  selectedPhoto: number | null;
  favourites: readonly string[];
  librarySearch: string;
  libraryTierFilter: 'all' | 'free' | 'pro';
  libraryShowFavourites: boolean;

  setLoadedTemplate: (template: SceneTemplate | null) => void;
  dispatch: (action: actions.Action) => void;
  /** Ends a coalescing run — call on pointer-up after a drag. */
  endInteraction: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undoLabel: () => string | null;
  redoLabel: () => string | null;

  setAspect: (aspect: Aspect) => void;
  setTemplate: (templateId: string) => void;
  setPlayhead: (ms: number) => void;
  togglePlay: () => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setTheme: (theme: Theme) => void;
  selectPhoto: (index: number | null) => void;
  toggleFavourite: (templateId: string) => void;
  setLibrarySearch: (query: string) => void;
  setLibraryTierFilter: (filter: 'all' | 'free' | 'pro') => void;
  toggleLibraryFavourites: () => void;
  durationMs: () => number;
};

const THEME_KEY = 'ms.theme';
const FAVOURITES_KEY = 'ms.favourites';

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Private mode or blocked storage — fall through to the media query.
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Theme is a convenience; failing to persist it must never break the editor.
  }
}

function readFavourites(): readonly string[] {
  try {
    const raw = localStorage.getItem(FAVOURITES_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function persistFavourites(ids: readonly string[]): void {
  try {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(ids));
  } catch {
    // Favourites are a convenience, not document data (§13 keeps blobs out of
    // localStorage; this is a list of ids and is fine there).
  }
}

/** See dev/renderParams for the full list of steering parameters. */
function initialProject(): Project {
  const params = renderParams();

  let templateId: string | undefined;
  if (params.scene === 'placeholder') templateId = PLACEHOLDER_TEMPLATE_ID;
  else if (params.scene === 'demo') templateId = DEMO_TEMPLATE_ID;
  else if (params.template) templateId = params.template;

  return createProject({
    ...(templateId === undefined ? {} : { templateId }),
    ...(params.aspect === null ? {} : { aspect: params.aspect }),
  });
}

export const useEditor = create<EditorState>((set, get) => ({
  project: initialProject(),
  history: emptyHistory,
  template: null,

  playheadMs: 0,
  isPlaying: true,
  inspectorTab: 'photos',
  theme: readStoredTheme(),
  selectedPhoto: 0,
  favourites: readFavourites(),
  librarySearch: '',
  libraryTierFilter: 'all',
  libraryShowFavourites: false,

  setLoadedTemplate: (template) => { set({ template }); },

  /**
   * The one way the document changes.
   *
   * Applying and recording are a single step so there is no window in which
   * the document has moved on but the history has not.
   */
  dispatch: (action) => {
    set((state) => {
      const next = action.apply(state.project);
      const result = commit(state.history, state.project, next, {
        label: action.label,
        ...(action.coalesceKey === undefined ? {} : { coalesceKey: action.coalesceKey }),
      });
      return { project: result.project, history: result.history };
    });
  },

  endInteraction: () => {
    set((state) => ({ history: sealCoalescing(state.history) }));
  },

  undo: () => {
    set((state) => {
      const result = undo(state.history, state.project);
      return { project: result.project, history: result.history };
    });
  },

  redo: () => {
    set((state) => {
      const result = redo(state.history, state.project);
      return { project: result.project, history: result.history };
    });
  },

  canUndo: () => canUndo(get().history),
  canRedo: () => canRedo(get().history),
  undoLabel: () => undoLabel(get().history),
  redoLabel: () => redoLabel(get().history),

  setAspect: (aspect) => { get().dispatch(actions.setAspect(aspect)); },

  setTemplate: (templateId) => {
    get().dispatch(actions.setTemplate(templateId));
    // Cleared so the inspector does not show the previous template's controls
    // against the new one's document while the fetch is in flight.
    set({ selectedPhoto: 0, template: null });
  },

  setPlayhead: (ms) => { set({ playheadMs: Math.max(0, ms) }); },

  togglePlay: () => { set((state) => ({ isPlaying: !state.isPlaying })); },

  setInspectorTab: (inspectorTab) => { set({ inspectorTab }); },

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },

  selectPhoto: (selectedPhoto) => { set({ selectedPhoto }); },

  toggleFavourite: (templateId) => {
    set((state) => {
      const next = state.favourites.includes(templateId)
        ? state.favourites.filter((id) => id !== templateId)
        : [...state.favourites, templateId];
      persistFavourites(next);
      return { favourites: next };
    });
  },

  setLibrarySearch: (librarySearch) => { set({ librarySearch }); },
  setLibraryTierFilter: (libraryTierFilter) => { set({ libraryTierFilter }); },
  toggleLibraryFavourites: () => {
    set((state) => ({ libraryShowFavourites: !state.libraryShowFavourites }));
  },

  durationMs: () => totalDurationMs(get().project),
}));

/** The scene Showcase mode edits. M5 makes this an index. */
export function useScene(): Project['scenes'][number] | undefined {
  return useEditor((s) => s.project.scenes[0]);
}
