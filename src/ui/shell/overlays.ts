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
  | { readonly kind: 'logo' };

type OverlayState = {
  /** The canvas element whose text is being typed into, by its selection key (D-107). */
  textEdit: string | null;
  openTextEdit: (key: string | null) => void;
  /** The "Replace photo" chooser. */
  photoPicker: PhotoTarget | null;
  openPhotoPicker: (target: PhotoTarget | null) => void;
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
  textEdit: null,
  openTextEdit: (textEdit) => { set({ textEdit, menu: null }); },
  photoPicker: null,
  openPhotoPicker: (photoPicker) => { set({ photoPicker, menu: null }); },
  shortcutsOpen: false,
  setShortcutsOpen: (shortcutsOpen) => { set({ shortcutsOpen, menu: null }); },
  scenePicker: null,
  openScenePicker: (scenePicker) => { set({ scenePicker, menu: null }); },
  openMenu: (menu) => { set({ menu }); },
  closeMenu: () => { set({ menu: null }); },
  openPicker: (picker) => { set({ picker, menu: null }); },
  closePicker: () => { set({ picker: null }); },
}));
