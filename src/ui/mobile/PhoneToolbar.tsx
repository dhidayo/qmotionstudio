import * as actions from '@/document/actions';
import { totalDurationMs } from '@/document/select/timeline';
import { soundFor } from '@/audio/library';
import { useEditor } from '@/state/store';
import { useShallow } from 'zustand/react/shallow';
import { useOverlays } from '@/ui/shell/overlays';
import { MODE_COPY } from '@/ui/shell/modeLabels';
import { usePreviewClock } from '@/ui/shell/ClockProvider';
import {
  changeSticker, deleteSelection, deleteSlot, duplicateSelection, editElement, findEffect, overlayLabel, overlayThis, slotName,
} from '@/ui/editing/commands';
import { addMotionToSelection } from '@/ui/editing/motion';
import { editPart, selectedSceneLayers } from '@/ui/editing/parts';
import { parseSlotKey } from '@/core/render/slots';
import { partsIn } from '@/core/render/parts';
import { Icon, type IconName } from './Icon';

/**
 * The phone's bottom toolbar (D-109).
 *
 * With nothing selected it is the way into everything: designs, photos, text,
 * effects, style — and, for an ad, adding scenes and layers. Select something
 * and it becomes that thing's own tools, the way CapCut's does, ending in
 * "Done" to put it down again. One row, never scrolled.
 *
 * A scene is the exception (D-166): selecting one keeps these main tools, which
 * act on it, and adds a slim row of the scene's own actions above them.
 */

type Tool = {
  readonly label: string;
  readonly icon: IconName;
  readonly onSelect: () => void;
  readonly danger?: boolean;
  /** Where the quick start points (D-148): the designs, and adding photos. */
  readonly tour?: string;
};

function useTools(): { tools: readonly Tool[]; context: string | null } {
  // Only what the toolbar shows: the playhead changes every frame, and a
  // toolbar re-rendered sixty times a second for nothing is a hot phone.
  const project = useEditor((st) => st.project);
  const selection = useEditor(useShallow((st) => ({
    overlay: st.selectedOverlay,
    slot: st.selectedSlot,
    logo: st.selectedLogo,
    effect: st.selectedEffect,
    audio: st.selectedAudio,
    sceneClip: st.sceneClipSelected,
    scene: st.selectedScene,
  })));
  const s = { ...useEditor.getState(), project, ...{
    selectedOverlay: selection.overlay,
    selectedSlot: selection.slot,
    selectedLogo: selection.logo,
    selectedEffect: selection.effect,
    selectedAudio: selection.audio,
    sceneClipSelected: selection.sceneClip,
    selectedScene: selection.scene,
  } };
  const o = useOverlays.getState();
  const clock = usePreviewClock();
  const done: Tool = {
    label: 'Done',
    icon: 'check',
    onSelect: () => {
      s.selectOverlay(null);
      s.selectSlot(null);
      s.selectLogo(false);
      s.selectEffect(null);
      s.selectAudio(null);
      s.selectScene(s.selectedScene);
    },
  };
  const del = (label = 'Delete'): Tool => ({ label, icon: 'trash', danger: true, onSelect: () => { deleteSelection(); } });

  if (s.selectedOverlay !== null) {
    const overlay = s.project.overlays.find((x) => x.id === s.selectedOverlay);
    if (overlay) {
      const target = { kind: 'element' as const, target: { kind: 'overlay' as const, id: overlay.id }, label: overlayThis(overlay) };
      const first: Tool[] = ((): Tool[] => {
        switch (overlay.content.kind) {
          case 'text': return [{ label: 'Edit text', icon: 'edit', onSelect: () => { o.openTextEdit(overlay.id); } }];
          case 'photo': return [{ label: 'Replace', icon: 'replace', onSelect: () => { o.openPhotoPicker({ kind: 'overlay', id: overlay.id }); } }];
          // Each element's own first tool (D-158): its settings, or another sticker.
          case 'shape': return [{ label: 'Style', icon: 'shape', onSelect: () => { editElement(overlay, 'phone'); } }];
          case 'sticker': return [{ label: 'Change', icon: 'replace', onSelect: () => { changeSticker(overlay); } }];
          case 'counter': return [{ label: 'Number', icon: 'number', onSelect: () => { editElement(overlay, 'phone'); } }];
          default: return [];
        }
      })();
      return {
        context: overlayLabel(overlay),
        tools: [
          ...first,
          {
            label: overlay.content.kind === 'text' ? 'Style' : 'Settings',
            icon: 'settings',
            // A sticker's first tool swaps it, so its settings open on its words and colours.
            onSelect: () => { o.openPhonePanel('element', overlay.content.kind === 'text' ? 'Content' : overlay.content.kind === 'sticker' ? 'Sticker' : 'Placement'); },
          },
          { label: 'Effects', icon: 'effects', onSelect: () => { o.openPicker({ target }); } },
          // The add bar's "+ Motion", for the thing in hand (D-153); one it already has opens its settings.
          { label: 'Motion', icon: 'motion', onSelect: () => { if (addMotionToSelection(clock) === 'exists') o.openPhonePanel('element', 'Motion path'); } },
          { label: 'Copy', icon: 'copy', onSelect: () => { s.dispatch(actions.duplicateOverlay(overlay.id, totalDurationMs(s.project))); } },
          del(),
          done,
        ],
      };
    }
  }

  if (s.selectedSlot !== null && parseSlotKey(s.selectedSlot)?.kind === 'shape') {
    // A design's own part (D-159): its colour first, as an added shape's style is.
    const key = s.selectedSlot;
    const name = slotName(key);
    const typed = partsIn(selectedSceneLayers() ?? []).find((p) => p.key === key)?.text !== undefined;
    const target = { kind: 'element' as const, target: { kind: 'slot' as const, key }, label: name };
    return {
      context: name.replace(/^the /, '').replace(/^./, (c) => c.toUpperCase()),
      tools: [
        ...(typed ? [{ label: 'Edit', icon: 'edit' as const, onSelect: () => { o.openTextEdit(key); } }] : []),
        { label: 'Colour', icon: 'shape', onSelect: () => { editPart(key, 'phone'); } },
        { label: 'Effects', icon: 'effects', onSelect: () => { o.openPicker({ target }); } },
        { label: 'Motion', icon: 'motion', onSelect: () => { if (addMotionToSelection(clock) === 'exists') o.openPhonePanel('effects', name); } },
        { label: 'Delete', icon: 'trash', danger: true, onSelect: () => { deleteSlot(key); } },
        done,
      ],
    };
  }

  if (s.selectedSlot !== null) {
    const key = s.selectedSlot;
    const photo = /^photo:(\d+)$/.exec(key);
    const label = photo?.[1] !== undefined ? `photo ${Number(photo[1]) + 1}` : 'this text';
    // The section the settings open on: this photo's own, or this text's (D-114).
    const textSlot = key.startsWith('text:') ? useEditor.getState().template?.textSlots.find((t) => `text:${t.id}` === key) : undefined;
    const sectionName = photo?.[1] !== undefined ? `Photo ${Number(photo[1]) + 1}` : textSlot?.label ?? '';
    const target = { kind: 'element' as const, target: { kind: 'slot' as const, key }, label };
    return {
      context: label.charAt(0).toUpperCase() + label.slice(1),
      tools: [
        photo?.[1] !== undefined
          ? { label: 'Replace', icon: 'replace', onSelect: () => { o.openPhotoPicker({ kind: 'slot', index: Number(photo[1]) }); } }
          : { label: 'Edit text', icon: 'edit', onSelect: () => { o.openTextEdit(key); } },
        { label: photo ? 'Crop' : 'Style', icon: 'settings', onSelect: () => { o.openPhonePanel('element', sectionName); } },
        { label: 'Effects', icon: 'effects', onSelect: () => { o.openPicker({ target }); } },
        // A motion added at once (D-153); one it already has opens its settings.
        { label: 'Motion', icon: 'motion', onSelect: () => { if (addMotionToSelection(clock) === 'exists') o.openPhonePanel('effects', sectionName); } },
        { label: photo ? 'Delete' : 'Remove', icon: 'trash', danger: true, onSelect: () => { deleteSlot(key); } },
        done,
      ],
    };
  }

  if (s.selectedLogo) {
    return {
      context: 'Logo',
      tools: [
        { label: 'Replace', icon: 'replace', onSelect: () => { o.openPhotoPicker({ kind: 'logo' }); } },
        { label: 'Effects', icon: 'effects', onSelect: () => { o.openPicker({ target: { kind: 'element', target: { kind: 'logo' }, label: 'the logo' } }); } },
        { label: 'Settings', icon: 'settings', onSelect: () => { o.openPhonePanel('style', 'Logo'); } },
        del('Remove'),
        done,
      ],
    };
  }

  if (s.selectedEffect !== null) {
    const found = findEffect(s.project, s.selectedEffect);
    return {
      context: found ? 'Effect' : null,
      tools: [
        { label: 'Settings', icon: 'settings', onSelect: () => { o.openPhonePanel('element'); } },
        { label: 'Copy', icon: 'copy', onSelect: () => { duplicateSelection(); } },
        del(),
        done,
      ],
    };
  }

  if (s.selectedAudio !== null) {
    const id = s.selectedAudio;
    // A library sound effect is a sound, not music (D-156).
    const effect = soundFor(s.project.audio.find((c) => c.id === id)?.mediaId ?? '')?.kind === 'effect';
    return {
      context: effect ? 'Sound' : 'Music',
      tools: [
        { label: 'Settings', icon: 'settings', onSelect: () => { o.openPhonePanel('element'); } },
        { label: 'Split', icon: 'split', onSelect: () => { s.dispatch(actions.splitAudio(id, useEditor.getState().playheadMs)); } },
        del(),
        done,
      ],
    };
  }

  /*
   * A selected scene keeps the main tools (D-166): "when I click on a scene,
   * the menu for image design is what should be displayed … users do not need
   * to be learning how to work in different modes." Each of them already acts
   * on the selected scene; the scene's own actions are in the row above
   * (SceneRow), so there is no second toolbar to leave with Done.
   */

  /*
   * Each action once (D-162). The row of big buttons above this toolbar —
   * Choose a design, Add a scene, Add your photos — repeated three of its
   * tools, so it went, and its height went to the picture: the designs are
   * the first tool, + Scene heads the Add sheet, and photos are added from
   * Photos, whose panel starts with + Add photos and Take photo and holds the
   * design's photo spots and the photos waiting under them — so the Add
   * sheet has no + Photos of its own. Backdrop was Style opened at its Background section; Style
   * is here, and so is a long press on the empty picture → Change background.
   */
  const designs: Tool = { label: MODE_COPY[project.mode].tool, icon: 'designs', tour: 'design', onSelect: () => { o.openPhonePanel('designs'); } };
  const add: Tool = { label: 'Add', icon: 'add', onSelect: () => { o.openPhonePanel('add'); } };
  const photos: Tool = { label: 'Photos', icon: 'photo', tour: 'photos', onSelect: () => { o.openPhonePanel('photos'); } };
  const text: Tool = { label: 'Text', icon: 'text', onSelect: () => { o.openPhonePanel('text'); } };
  const effects: Tool = { label: 'Effects', icon: 'effects', onSelect: () => { o.openPhonePanel('effects'); } };
  const style: Tool = { label: 'Style', icon: 'style', onSelect: () => { o.openPhonePanel('style'); } };
  return { context: null, tools: [designs, add, photos, text, effects, style] };
}

export function PhoneToolbar(): React.JSX.Element {
  const { tools, context } = useTools();
  return (
    <>
    {context === null && <SceneRow />}
    <nav
      aria-label={context === null ? 'Tools' : `${context} tools`}
      data-phone-toolbar={context === null ? 'main' : 'selection'}
      className="shrink-0 border-t border-edge bg-panel"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {context !== null && (
        <div className="px-3 pt-1.5 text-[11px] font-semibold text-accent">{context}</div>
      )}
      <div className="flex items-stretch justify-around px-1 py-1.5">
        {tools.map((tool) => (
          <button
            key={tool.label}
            type="button"
            data-tour={tool.tour}
            data-phone-tool={tool.label.toLowerCase()}
            onClick={tool.onSelect}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1 text-[11px] active:bg-panel-alt"
            style={{ color: tool.danger === true ? 'var(--c-danger)' : 'var(--c-ink)' }}
          >
            <Icon name={tool.icon} />
            <span className="truncate">{tool.label}</span>
          </button>
        ))}
      </div>
    </nav>
    </>
  );
}

/**
 * The selected scene's own actions, in a slim row above the main tools (D-166).
 *
 * "I should be able to select what to customize such as images, texts, etc."
 * and "toggle the menu when the timeline is clicked so that I do not have to
 * click on done to get the other menu; that way, I can have both context menu
 * and regular menu with a single tap." So a tapped scene shows this row and
 * leaves the main toolbar — Photos, Text, Effects, Style — where it was, acting
 * on that scene. The × at the end, tapping the scene again or tapping the empty
 * picture puts the row away; the scene stays the one being worked on.
 *
 * Only while no element is selected: an element's tools replace the main ones,
 * and the two are never on screen together. Scrolls sideways when it does not
 * fit, with the scene's name and the × always in view.
 */
function SceneRow(): React.JSX.Element | null {
  const shown = useEditor((st) => st.sceneClipSelected && st.project.mode === 'motionAd');
  const index = useEditor((st) => st.selectedScene);
  const count = useEditor((st) => st.project.scenes.length);
  if (!shown) return null;
  const o = useOverlays.getState();
  const name = `Scene ${index + 1}`;
  const sceneTools: readonly Tool[] = [
    { label: 'Change design', icon: 'designs', onSelect: () => { o.openScenePicker('replace'); } },
    // Its length and how it arrives (D-133) — on a computer, the scene menu's Length and transition (D-162).
    { label: 'Timing', icon: 'scene', onSelect: () => { o.openPhonePanel('scene'); } },
    { label: 'Effects', icon: 'effects', onSelect: () => { o.openPicker({ target: { kind: 'scene' } }); } },
    { label: 'Duplicate', icon: 'copy', onSelect: () => { duplicateSelection(); } },
  ];
  const chip = 'flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium active:bg-panel-alt';
  return (
    <div
      role="toolbar"
      aria-label={`${name} actions`}
      data-phone-scene-row={index}
      className="flex shrink-0 items-center border-t border-edge bg-panel pl-3"
    >
      <span className="shrink-0 pr-1.5 text-[12px] font-semibold text-accent">{name}</span>
      {/* Fades at its right edge, so a row wider than the phone reads as one to scroll; a spacer at its end lets Delete clear the fade. */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)] [scrollbar-width:none]">
        {sceneTools.map((tool) => (
          <button key={tool.label} type="button" data-scene-action={tool.label.toLowerCase()} onClick={tool.onSelect} className={chip} style={{ color: 'var(--c-ink)' }}>
            <Icon name={tool.icon} size={18} />
            <span className="whitespace-nowrap">{tool.label}</span>
          </button>
        ))}
        {/* Apart from the others, and last: the one that takes something away. */}
        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-edge" />
        <button
          type="button"
          data-scene-action="delete"
          onClick={() => { deleteSelection(); }}
          disabled={count <= 1}
          title={count <= 1 ? 'A video needs at least one scene' : undefined}
          className={`${chip} disabled:opacity-40`}
          style={{ color: 'var(--c-danger)' }}
        >
          <Icon name="trash" size={18} />
          <span className="whitespace-nowrap">Delete</span>
        </button>
        <span aria-hidden className="w-5 shrink-0" />
      </div>
      {/* A quiet ×: the row goes, the scene stays the one the tools act on. */}
      <button
        type="button"
        onClick={() => { useEditor.getState().selectScene(index); }}
        aria-label={`Hide ${name} actions`}
        className="grid size-11 shrink-0 place-items-center text-ink-muted"
      >
        <svg aria-hidden width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </svg>
      </button>
    </div>
  );
}
