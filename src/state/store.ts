import { create } from 'zustand';
import type { Aspect } from '@/core/types';
import type { Project, ProjectMode, SlotKey } from '@/document/types';
import {
  createProject, DEFAULT_PHOTO_COUNT, DEMO_TEMPLATE_ID, PLACEHOLDER_TEMPLATE_ID,
} from '@/document/defaults';
import { totalDurationMs } from '@/document/select/timeline';
import type { SceneTemplate } from '@/templates/schema';
import { loadTemplate } from '@/templates/registry';
import { expandAdTemplate } from '@/templates/ad';
import { summaryFor } from '@/templates/manifest';
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

  /**
   * Which scene the four inspector tabs edit.
   *
   * Editor state, not document state — it must not be undoable and it must not
   * be saved. Dispatch turns it into an ActionScope (D-045).
   */
  selectedScene: number;
  /**
   * The overlay the inspector is editing, or null for the scene.
   *
   * An overlay is not a scene (§3C), so it does not fit the four tabs; while
   * one is selected the inspector shows its own panel instead.
   */
  selectedOverlay: string | null;
  /** The music clip the inspector is editing, or null (§10). */
  selectedAudio: string | null;
  /**
   * Whether §8.3's logo is the thing selected on the canvas.
   *
   * A flag rather than a member of a selection union: `selectedOverlay` is
   * already wired through the timeline and the inspector, and collapsing the
   * two into one discriminated value would touch far more than it earns. The
   * three are kept mutually exclusive by their setters.
   */
  selectedLogo: boolean;
  /**
   * The template element selected on the canvas (B), by `slotKey()`.
   *
   * Editor state like the rest of the selection: it must not be undoable and
   * it must not be saved.
   */
  selectedSlot: SlotKey | null;

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
  exporting: boolean;

  selectScene: (index: number) => void;
  selectOverlay: (id: string | null) => void;
  selectAudio: (id: string | null) => void;
  selectLogo: (selected: boolean) => void;
  selectSlot: (key: SlotKey | null, tab?: InspectorTab, photoIndex?: number) => void;
  setLoadedTemplate: (template: SceneTemplate | null) => void;
  setExporting: (exporting: boolean) => void;
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
  /**
   * Picks a template from the library.
   *
   * Asynchronous because the registry is lazy (D-029) and because an *ad*
   * template has to be expanded into scenes before the document can hold it —
   * writing the ad's own id into a scene would leave the renderer with a scene
   * whose template has no `build()`, which is a throw, not a blank frame.
   * Nothing is dispatched until the template has resolved, so there is no
   * window in which the document is invalid.
   */
  setTemplate: (templateId: string) => void;
  setMode: (mode: ProjectMode) => void;
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

/**
 * `?template=` may name an *ad* template, which cannot go straight into a
 * scene: a scene whose templateId has no `build()` is a throw in the render
 * loop, not a blank frame. The project starts on the placeholder and AppShell
 * expands the ad as soon as it mounts.
 */
export function pendingAdTemplateId(): string | null {
  const wanted = renderParams().template;
  if (wanted === null) return null;
  return summaryFor(wanted)?.kind === 'ad' ? wanted : null;
}

/** See dev/renderParams for the full list of steering parameters. */
function initialProject(): Project {
  const params = renderParams();
  const pendingAd = pendingAdTemplateId();

  let templateId: string | undefined;
  if (params.scene === 'placeholder') templateId = PLACEHOLDER_TEMPLATE_ID;
  else if (params.scene === 'demo') templateId = DEMO_TEMPLATE_ID;
  else if (pendingAd !== null) templateId = PLACEHOLDER_TEMPLATE_ID;
  else if (params.template) templateId = params.template;

  /*
   * The eager manifest knows every template's slot range without loading its
   * code (D-029), so the opening scene is sized to the template it is actually
   * about to render rather than to a flat four.
   */
  const slots = templateId === undefined ? undefined : summaryFor(templateId)?.photoSlots;
  const photoCount = slots
    ? Math.max(slots.min, Math.min(DEFAULT_PHOTO_COUNT, slots.max))
    : undefined;

  const project = createProject({
    ...(templateId === undefined ? {} : { templateId }),
    ...(params.aspect === null ? {} : { aspect: params.aspect }),
    ...(photoCount === undefined ? {} : { photoCount }),
  });

  return pendingAd === null ? project : { ...project, mode: 'motionAd' };
}

export const useEditor = create<EditorState>((set, get) => ({
  project: initialProject(),
  history: emptyHistory,
  template: null,

  selectedScene: 0,
  selectedOverlay: null,
  selectedAudio: null,
  selectedLogo: false,
  selectedSlot: null,
  playheadMs: 0,
  isPlaying: true,
  inspectorTab: 'photos',
  theme: readStoredTheme(),
  selectedPhoto: 0,
  favourites: readFavourites(),
  librarySearch: '',
  libraryTierFilter: 'all',
  libraryShowFavourites: false,
  exporting: false,

  selectScene: (index) => {
    set((state) => {
      const clamped = Math.max(0, Math.min(index, state.project.scenes.length - 1));
      return clamped === state.selectedScene && state.selectedOverlay === null && state.selectedAudio === null
        ? {}
        : {
            selectedScene: clamped,
            selectedOverlay: null,
            selectedAudio: null,
            selectedLogo: false,
            selectedSlot: null,
            selectedPhoto: 0,
            template: null,
          };
    });
  },

  selectOverlay: (selectedOverlay) => {
    set({ selectedOverlay, selectedAudio: null, selectedLogo: false, selectedSlot: null });
  },

  selectAudio: (selectedAudio) => {
    set({ selectedAudio, selectedOverlay: null, selectedLogo: false, selectedSlot: null });
  },

  selectLogo: (selectedLogo) => {
    // Picking something up on the canvas opens its own controls. Selecting an
    // object and then having to go and find the panel that edits it is the
    // sort of step people should never have to be told about.
    set(
      selectedLogo
        ? {
            selectedLogo,
            selectedOverlay: null,
            selectedAudio: null,
            selectedSlot: null,
            inspectorTab: 'logo' as const,
          }
        : { selectedLogo, selectedOverlay: null, selectedAudio: null },
    );
  },

  /**
   * Picking a template element on the canvas also opens the panel that edits
   * it, and for a photo selects that photo — so the controls on screen are
   * always the ones for the thing you just clicked.
   */
  selectSlot: (selectedSlot, tab, photoIndex) => {
    set({
      selectedSlot,
      selectedOverlay: null,
      selectedAudio: null,
      selectedLogo: false,
      ...(tab === undefined ? {} : { inspectorTab: tab }),
      ...(photoIndex === undefined ? {} : { selectedPhoto: photoIndex }),
    });
  },

  setLoadedTemplate: (template) => { set({ template }); },

  setExporting: (exporting) => { set({ exporting }); },

  /**
   * The one way the document changes.
   *
   * Applying and recording are a single step so there is no window in which
   * the document has moved on but the history has not.
   */
  dispatch: (action) => {
    set((state) => {
      const scope: actions.ActionScope = { sceneIndex: state.selectedScene };
      const next = action.apply(state.project, scope);
      const result = commit(state.history, state.project, next, {
        label: action.label,
        // The key is scoped to the scene as well as to the control: dragging
        // the same slider on two different scenes is two undo steps, not one.
        ...(action.coalesceKey === undefined
          ? {}
          : { coalesceKey: `${action.coalesceKey}@${scope.sceneIndex}` }),
      });
      // A scene removal can leave the selection past the end of the list.
      const selectedScene = Math.max(0, Math.min(state.selectedScene, result.project.scenes.length - 1));
      return { project: result.project, history: result.history, selectedScene };
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
    // Cleared so the inspector does not show the previous template's controls
    // against the new one's document while the fetch is in flight.
    set({ selectedPhoto: 0, template: null, selectedOverlay: null });

    void loadTemplate(templateId)
      .then(async (template) => {
        if (template.kind === 'ad') {
          const scenes = await expandAdTemplate(template);
          get().dispatch(actions.applyAdTemplate(scenes, template.id));
          set({ selectedScene: 0 });
          return;
        }
        get().dispatch(actions.setTemplate(templateId, {
          durationMs: template.defaultDurationMs,
          photoSlots: template.photoSlots,
        }));
      })
      .catch((error: unknown) => {
        // §16: a template that will not load is a build mistake, and silently
        // leaving the old one selected would hide it.
        console.error(`Failed to load template "${templateId}".`, error);
      });
  },

  setMode: (mode) => {
    get().dispatch(actions.setMode(mode));
    set({ selectedOverlay: null, selectedScene: 0, template: null });
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

/** The scene the inspector is editing. Showcase always has exactly one. */
export function useScene(): Project['scenes'][number] | undefined {
  return useEditor((s) => s.project.scenes[s.selectedScene] ?? s.project.scenes[0]);
}

export function useSelectedAudio(): Project['audio'][number] | undefined {
  return useEditor((s) =>
    s.selectedAudio === null ? undefined : s.project.audio.find((c) => c.id === s.selectedAudio),
  );
}

export function useSelectedOverlay(): Project['overlays'][number] | undefined {
  return useEditor((s) =>
    s.selectedOverlay === null ? undefined : s.project.overlays.find((o) => o.id === s.selectedOverlay),
  );
}
