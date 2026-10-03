import { create } from 'zustand';
import type { Aspect } from '@/core/types';
import type { Project, ProjectMode, SlotKey } from '@/document/types';
import type { SaveState } from '@/ui/persist/saveState';
import {
  createProject, DEFAULT_PHOTO_COUNT, DEMO_TEMPLATE_ID, PLACEHOLDER_TEMPLATE_ID,
} from '@/document/defaults';
import { totalDurationMs } from '@/document/select/timeline';
import type { SceneTemplate } from '@/templates/schema';
import { loadTemplate } from '@/templates/registry';
import { expandAdTemplate } from '@/templates/ad';
import { userPhotoIds } from '@/document/select/media';
import { summaryFor } from '@/templates/manifest';
import { renderParams } from '@/dev/renderParams';
import * as actions from '@/document/actions';
import {
  canRedo, canUndo, commit, emptyHistory, redo, redoLabel,
  sealCoalescing, undo, undoLabel, type HistoryState,
} from './undo';

export type InspectorTab = 'photos' | 'text' | 'motion' | 'look';
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
  /** The timeline effect the inspector is editing (D-100), or null. */
  selectedEffect: string | null;
  /**
   * Whether the scene itself was the last thing picked on the timeline — so
   * Delete means "this scene" rather than whatever was selected before
   * (D-104). Every other selection clears it.
   */
  sceneClipSelected: boolean;
  /**
   * The layer (L1, L2, …) the person chose on the timeline — by clicking its
   * name or an empty stretch of it — where new elements go (D-103). Null lets
   * the timeline choose.
   */
  targetTrack: number | null;

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
  /** §13's autosave, surfaced so the top bar can say when it has failed. */
  saveState: SaveState;
  /**
   * Whether §13's project list is open.
   *
   * In the store because the button that opens it lives in the top bar and the
   * dialog itself has to render inside the media provider — it restores
   * photographs when it opens a project.
   */
  projectsOpen: boolean;
  /**
   * A short confirmation — "Saved", "Scene added" — that fades on its own.
   *
   * In the store because the things that raise one are all over the editor
   * (the top bar, the scene picker, the project list) and the one place that
   * draws it is the shell. `id` changes every time, so the same message twice
   * in a row still shows twice.
   */
  toast: { readonly id: number; readonly message: string } | null;

  selectScene: (index: number) => void;
  selectOverlay: (id: string | null) => void;
  selectAudio: (id: string | null) => void;
  selectLogo: (selected: boolean) => void;
  selectSlot: (key: SlotKey | null, tab?: InspectorTab, photoIndex?: number) => void;
  selectEffect: (id: string | null) => void;
  /** A scene clicked on the timeline: selects it, as the thing Delete would remove. */
  selectSceneClip: (index: number) => void;
  setTargetTrack: (track: number | null) => void;

  /**
   * Replaces the whole document (§13's project list).
   *
   * History is dropped rather than carried across. Undo is a property of a
   * session with *one* document — letting ⌘Z walk backwards out of the project
   * you just opened and into the one you left would be a genuinely alarming
   * thing for an editor to do.
   */
  openProject: (project: Project) => void;
  setLoadedTemplate: (template: SceneTemplate | null) => void;
  setExporting: (exporting: boolean) => void;
  setSaveState: (state: SaveState) => void;
  setProjectsOpen: (open: boolean) => void;
  showToast: (message: string) => void;
  clearToast: () => void;
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
  /**
   * Picks a template (§8). `asBaseline` marks the *opening* document rather
   * than an edit — see `sealHistory`.
   */
  setTemplate: (templateId: string, options?: { asBaseline?: boolean }) => void;

  /**
   * Makes the current document the earliest thing undo can reach.
   *
   * A project opens as a placeholder and only becomes an ad once the template
   * has been fetched and expanded, which happens through the ordinary
   * undoable pipeline. That left the expansion sitting in the history, so
   * enough presses of ⌘Z walked back *through* it and left the editor showing
   * the bare M0 test card — which reads, reasonably, as the application having
   * broken. Opening a document is not an edit to it.
   */
  sealHistory: () => void;
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
  selectedEffect: null,
  sceneClipSelected: false,
  targetTrack: null,
  playheadMs: 0,
  isPlaying: true,
  inspectorTab: 'photos',
  saveState: 'idle',
  projectsOpen: false,
  toast: null,
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
        && state.selectedEffect === null
        ? { sceneClipSelected: false }
        : {
            selectedScene: clamped,
            selectedOverlay: null,
            selectedAudio: null,
            selectedLogo: false,
            selectedSlot: null,
            selectedEffect: null,
            sceneClipSelected: false,
            selectedPhoto: 0,
            ...(clamped === state.selectedScene ? {} : { template: null }),
          };
    });
  },

  selectSceneClip: (index) => {
    get().selectScene(index);
    set({ sceneClipSelected: true });
  },

  selectOverlay: (selectedOverlay) => {
    set({
      selectedOverlay,
      selectedAudio: null,
      selectedLogo: false,
      selectedSlot: null,
      selectedEffect: null,
      sceneClipSelected: false,
    });
  },

  selectAudio: (selectedAudio) => {
    set({ selectedAudio, selectedOverlay: null, selectedLogo: false, selectedSlot: null, selectedEffect: null, sceneClipSelected: false });
  },

  selectEffect: (selectedEffect) => {
    set({
      selectedEffect,
      selectedOverlay: null,
      selectedAudio: null,
      selectedLogo: false,
      selectedSlot: null,
      sceneClipSelected: false,
    });
  },

  setTargetTrack: (targetTrack) => { set({ targetTrack }); },

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
            selectedEffect: null,
            sceneClipSelected: false,
            // The logo's settings live in Look now (D-105).
            inspectorTab: 'look' as const,
          }
        : { selectedLogo, selectedOverlay: null, selectedAudio: null, selectedEffect: null, sceneClipSelected: false },
    );
  },

  /**
   * Picking a template element on the canvas also opens the panel that edits
   * it, and for a photo selects that photo — so the controls on screen are
   * always the ones for the thing you just clicked.
   */
  openProject: (project) => {
    set({
      project,
      history: emptyHistory,
      selectedScene: 0,
      selectedOverlay: null,
      selectedAudio: null,
      selectedLogo: false,
      selectedSlot: null,
      selectedEffect: null,
      sceneClipSelected: false,
      targetTrack: null,
      selectedPhoto: 0,
      template: null,
      playheadMs: 0,
    });
  },

  selectSlot: (selectedSlot, tab, photoIndex) => {
    set({
      selectedSlot,
      selectedOverlay: null,
      selectedAudio: null,
      selectedLogo: false,
      selectedEffect: null,
      sceneClipSelected: false,
      ...(tab === undefined ? {} : { inspectorTab: tab }),
      ...(photoIndex === undefined ? {} : { selectedPhoto: photoIndex }),
    });
  },

  setLoadedTemplate: (template) => { set({ template }); },

  setExporting: (exporting) => { set({ exporting }); },

  setSaveState: (saveState) => { set({ saveState }); },

  setProjectsOpen: (projectsOpen) => { set({ projectsOpen }); },

  showToast: (message) => { set({ toast: { id: Date.now() + Math.random(), message } }); },

  clearToast: () => { set({ toast: null }); },

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

  sealHistory: () => { set({ history: emptyHistory }); },

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

  setTemplate: (templateId, options) => {
    // Cleared so the inspector does not show the previous template's controls
    // against the new one's document while the fetch is in flight.
    set({ selectedPhoto: 0, template: null, selectedOverlay: null });

    void loadTemplate(templateId)
      .then(async (template) => {
        if (template.kind === 'ad') {
          /*
           * Continuity (D-098): the ad is filled with the person's own photos
           * and logo when they have any, rather than starting over on the
           * samples. Undo still restores the scenes it replaces.
           */
          const current = get().project;
          const logo = current.scenes.find((scene) => scene.inputs.logo.mediaId !== null)?.inputs.logo;
          const scenes = await expandAdTemplate(template, {
            photoIds: userPhotoIds(current),
            ...(logo ? { logo } : {}),
          });
          get().dispatch(actions.applyAdTemplate(scenes, template.id));
          set({ selectedScene: 0 });
          if (options?.asBaseline === true) get().sealHistory();
          return;
        }
        get().dispatch(actions.setTemplate(templateId, {
          durationMs: template.defaultDurationMs,
          photoSlots: template.photoSlots,
        }));
        if (options?.asBaseline === true) get().sealHistory();
      })
      .catch((error: unknown) => {
        // §16: a template that will not load is a build mistake, and silently
        // leaving the old one selected would hide it.
        console.error(`Failed to load template "${templateId}".`, error);
      });
  },

  setMode: (mode) => {
    get().dispatch(actions.setMode(mode));
    set({ selectedOverlay: null, selectedEffect: null, sceneClipSelected: false, selectedScene: 0, template: null });
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
