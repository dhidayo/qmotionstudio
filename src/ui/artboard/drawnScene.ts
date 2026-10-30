import { create } from 'zustand';
import type { DrawnScene } from '@/core/render/rig';

/**
 * What the preview last drew, for the panels (D-159).
 *
 * The canvas has always had it — it is how the selection boxes find the
 * design's elements — but the inspector could not see it, and "the shapes in
 * this design" have to come from what the design actually built. Replaced
 * only when the scene or its layers change, never once a frame (`rig.drawn`'s
 * identity is that signal), so nothing re-renders while it plays.
 */
export const useDrawnScene = create<{ drawn: DrawnScene | null; setDrawn: (drawn: DrawnScene | null) => void }>((set) => ({
  drawn: null,
  setDrawn: (drawn) => { set({ drawn }); },
}));
