import { create } from 'zustand';
import type { Aspect } from '@/core/types';
import type { Project } from '@/document/types';
import { createProject, PLACEHOLDER_TEMPLATE_ID } from '@/document/defaults';
import { totalDurationMs } from '@/document/select/timeline';

export type InspectorTab = 'photos' | 'text' | 'logo' | 'look';
export type Theme = 'light' | 'dark';

/**
 * Editor state.
 *
 * Two halves, deliberately separated:
 *   - `project` is the document. Every change to it goes through an action and
 *     is undoable (§8: "No inspector control may mutate the document directly").
 *     The undo middleware lands with the first real actions at M3.
 *   - everything else is ephemeral editor state — selection, playhead, which
 *     tab is open. Never undoable; nobody wants ⌘Z to reopen a panel.
 */
type EditorState = {
  project: Project;
  playheadMs: number;
  isPlaying: boolean;
  inspectorTab: InspectorTab;
  theme: Theme;

  setAspect: (aspect: Aspect) => void;
  setPlayhead: (ms: number) => void;
  togglePlay: () => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setTheme: (theme: Theme) => void;
  durationMs: () => number;
};

const THEME_KEY = 'ms.theme';

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

/**
 * `?scene=placeholder` renders the M0 aspect test card instead of the M1 demo
 * scene, so the M0 visual baselines stay meaningful as the renderer grows.
 */
function initialProject(): ReturnType<typeof createProject> {
  let templateId: string | undefined;
  try {
    if (new URLSearchParams(location.search).get('scene') === 'placeholder') {
      templateId = PLACEHOLDER_TEMPLATE_ID;
    }
  } catch {
    // No location (a test harness, a worker) — the demo scene is the default.
  }
  return createProject(templateId === undefined ? {} : { templateId });
}

export const useEditor = create<EditorState>((set, get) => ({
  project: initialProject(),
  playheadMs: 0,
  isPlaying: true,
  inspectorTab: 'photos',
  theme: readStoredTheme(),

  setAspect: (aspect) => {
    set((state) => ({ project: { ...state.project, aspect, updatedAt: Date.now() } }));
  },

  setPlayhead: (ms) => {
    set({ playheadMs: Math.max(0, ms) });
  },

  togglePlay: () => {
    set((state) => ({ isPlaying: !state.isPlaying }));
  },

  setInspectorTab: (inspectorTab) => {
    set({ inspectorTab });
  },

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },

  durationMs: () => totalDurationMs(get().project),
}));
