import { create } from 'zustand';
import type { ElementTarget } from '@/document/actions';
import type { ElementCategory, FrameCategory } from '@/core/effects/types';

/**
 * The editor's floating surfaces: the right-click menu and the effect picker.
 *
 * Kept apart from the document store because they are pure presentation —
 * nothing here is saved, undone or exported — and because they can be opened
 * from anywhere (the timeline, the canvas, the inspector) while being drawn in
 * exactly one place, the shell.
 */

export type MenuItem =
  | {
      readonly kind?: 'item';
      readonly label: string;
      /** A short line under the label: what it does, or the shortcut. */
      readonly hint?: string;
      readonly danger?: boolean;
      readonly disabled?: boolean;
      readonly onSelect: () => void;
    }
  | { readonly kind: 'separator' };

export type ContextMenuState = {
  readonly x: number;
  readonly y: number;
  readonly title: string;
  readonly items: readonly MenuItem[];
};

/** Where a picked effect goes. */
export type PickerTarget =
  | { readonly kind: 'scene' }
  | { readonly kind: 'timeline' }
  | { readonly kind: 'element'; readonly target: ElementTarget; readonly label: string };

export type PickerState = {
  readonly target: PickerTarget;
  /** Opens on one category — "Entrance…" from a menu opens on entrances. */
  readonly category?: FrameCategory | ElementCategory;
};

/** What a "Replace…" is replacing. */
export type PhotoTarget =
  | { readonly kind: 'slot'; readonly index: number }
  | { readonly kind: 'overlay'; readonly id: string }
  | { readonly kind: 'logo' }
  /** The scene's background picture (D-120). */
  | { readonly kind: 'background' };

/**
 * The phone layout's panels (D-109) — one open at a time, each a bottom sheet.
 * `element` edits whatever is selected; `timeline` is Corporate Ads' full
 * timeline, folded away the rest of the time.
 */
export type PhonePanel =
  | 'designs' | 'photos' | 'text' | 'motion' | 'effects' | 'style' | 'add'
  | 'project' | 'aspect' | 'element' | 'timeline' | 'scene';

/** Zoom and pan of the preview on a phone, from a pinch. 1 is fitted to the screen. */
export type ViewZoom = { readonly scale: number; readonly x: number; readonly y: number };

export const NO_ZOOM: ViewZoom = { scale: 1, x: 0, y: 0 };

type OverlayState = {
  phonePanel: PhonePanel | null;
  /** Which section the panel opens on, by the start of its title (D-114). */
  phoneSection: string | null;
  openPhonePanel: (panel: PhonePanel | null, section?: string) => void;
  viewZoom: ViewZoom;
  setViewZoom: (zoom: ViewZoom) => void;
  /** The canvas element whose text is being typed into, by its selection key (D-107). */
  textEdit: string | null;
  openTextEdit: (key: string | null) => void;
  /** The "Replace photo" chooser. */
  photoPicker: PhotoTarget | null;
  openPhotoPicker: (target: PhotoTarget | null) => void;
  /**
   * The inspector as a sheet, below desktop width, and the section to bring
   * into view in it (and beside the picture on a desktop) — "Background" from
   * the tool strip or the canvas menu (D-120).
   */
  inspectorSheet: boolean;
  setInspectorSheet: (open: boolean) => void;
  inspectorSection: string | null;
  focusInspectorSection: (section: string | null) => void;
  /** The list of keyboard shortcuts. */
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  menu: ContextMenuState | null;
  picker: PickerState | null;
  /** The scene-design picker (D-097): adding a scene, or changing one. */
  scenePicker: 'add' | 'replace' | null;
  openScenePicker: (mode: 'add' | 'replace' | null) => void;
  openMenu: (menu: ContextMenuState) => void;
  closeMenu: () => void;
  openPicker: (picker: PickerState) => void;
  closePicker: () => void;
};

export const useOverlays = create<OverlayState>((set) => ({
  menu: null,
  picker: null,
  phonePanel: null,
  phoneSection: null,
  openPhonePanel: (phonePanel, section) => { set({ phonePanel, phoneSection: section ?? null, menu: null }); },
  viewZoom: NO_ZOOM,
  setViewZoom: (viewZoom) => { set({ viewZoom }); },
  textEdit: null,
  openTextEdit: (textEdit) => { set({ textEdit, menu: null }); },
  photoPicker: null,
  openPhotoPicker: (photoPicker) => { set({ photoPicker, menu: null }); },
  inspectorSheet: false,
  setInspectorSheet: (inspectorSheet) => { set({ inspectorSheet, menu: null }); },
  inspectorSection: null,
  focusInspectorSection: (inspectorSection) => { set({ inspectorSection, menu: null }); },
  shortcutsOpen: false,
  setShortcutsOpen: (shortcutsOpen) => { set({ shortcutsOpen, menu: null }); },
  scenePicker: null,
  openScenePicker: (scenePicker) => { set({ scenePicker, menu: null }); },
  openMenu: (menu) => { set({ menu }); },
  closeMenu: () => { set({ menu: null }); },
  openPicker: (picker) => { set({ picker, menu: null }); },
  closePicker: () => { set({ picker: null }); },
}));
