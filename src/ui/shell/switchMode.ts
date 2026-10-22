import type { ProjectMode } from '@/document/types';
import { useEditor } from '@/state/store';
import { undoHint } from '@/ui/editing/commands';
import { MODE_LABEL } from './modeLabels';

/**
 * Switches between Image and Video, from the top bar or the phone menu, and
 * says what happened (D-098, D-155).
 *
 * Into Video nothing is lost: the image becomes scene 1. Back to Image keeps
 * the selected scene and the layers over it, moved to its start; the other
 * scenes, the layers over them and the music are set aside — said at the
 * moment it happens, with the way back, rather than only in a tooltip.
 */
export function switchMode(next: ProjectMode): void {
  const s = useEditor.getState();
  const before = s.project;
  if (before.mode === next) return;
  // The scene setMode keeps: the selected one, or the first.
  const scene = before.scenes[s.selectedScene] ? s.selectedScene : 0;
  s.setMode(next);
  if (next !== 'showcase') return;

  const after = useEditor.getState().project;
  const scenesLeft = before.scenes.length - after.scenes.length;
  const layersLeft = before.overlays.length - after.overlays.length;
  const music = before.audio.length > 0;
  if (scenesLeft === 0 && layersLeft === 0 && !music) return;

  const kept = before.scenes.length > 1 ? `scene ${scene + 1}` : 'this scene';
  const layers = after.overlays.length > 0 ? ' and the layers over it' : '';
  const aside = [
    ...(scenesLeft > 0 ? [`the other ${scenesLeft === 1 ? 'scene' : `${scenesLeft} scenes`}`] : []),
    // Layers only beyond a lone scene's end are the one loss not named by a scene.
    ...(scenesLeft === 0 && layersLeft > 0 ? ['the layers after it'] : []),
    ...(music ? ['the music'] : []),
  ];
  const rest = aside.length > 0 ? `, and sets ${aside.join(' and ')} aside` : '';
  s.showToast(`${MODE_LABEL.showcase} keeps ${kept}${layers}${rest}. ${undoHint()}`);
}
