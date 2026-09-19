import { create } from 'zustand';
import type { Aspect } from '@/core/types';
import type { Project } from '@/document/types';
import { createProject, DEMO_TEMPLATE_ID, PLACEHOLDER_TEMPLATE_ID } from '@/document/defaults';
import { renderParams } from '@/dev/renderParams';
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
  setTemplate: (templateId: string) => void;
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

/** See dev/renderParams for the full list of steering parameters. */
function initialProject(): ReturnType<typeof createProject> {
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
  playheadMs: 0,
  isPlaying: true,
  inspectorTab: 'photos',
  theme: readStoredTheme(),

  setAspect: (aspect) => {
    set((state) => ({ project: { ...state.project, aspect, updatedAt: Date.now() } }));
  },

  setTemplate: (templateId) => {
    set((state) => {
      const [scene, ...rest] = state.project.scenes;
      if (!scene || scene.templateId === templateId) return {};
      return {
        project: {
          ...state.project,
          scenes: [{ ...scene, templateId }, ...rest],
          updatedAt: Date.now(),
        },
      };
    });
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
