import * as actions from '@/document/actions';
import { totalDurationMs } from '@/document/select/timeline';
import { soundFor } from '@/audio/library';
import { useEditor } from '@/state/store';
import { useShallow } from 'zustand/react/shallow';
import { useOverlays } from '@/ui/shell/overlays';
import { MODE_COPY } from '@/ui/shell/modeLabels';
import { usePreviewClock } from '@/ui/shell/ClockProvider';
import {
  changeSticker, deleteSelection, deleteSlot, duplicateSelection, editElement, elementName, findEffect, overlayName, overlayThis, slotName,
} from '@/ui/editing/commands';
import { addMotionToSelection } from '@/ui/editing/motion';
import { editPart, selectedSceneLayers } from '@/ui/editing/parts';
import { parseSlotKey } from '@/core/render/slots';
import { partsIn } from '@/core/render/parts';
import { frameEffect } from '@/core/effects/catalog';
import type { Overlay } from '@/document/types';
import { Icon, type IconName } from './Icon';

/**
 * The phone's bottom toolbar (D-109).
 *
 * The way into everything: designs, adding, photos, text, effects, style. It
 * stays on screen whatever is selected (D-169): "Can you toggle the menu … so
 * that I do not have to click on done to get the other menu; that way, I can
 * have both context menu and regular menu with a single tap … than the Done
 * which I never knew it was there." What D-166 did for a scene, every
 * selection now does: the thing in hand — a photo or text of the design, a
 * part, a layer, the logo, an effect, a sound — has its own tools in a slim
 * labelled row above this one ("Text · Headline", "Sticker · Subscribe"), with
 * a quiet × that puts it down. There is no Done anywhere on a phone.
 */

type Tool = {
  readonly label: string;
  readonly icon: IconName;
  readonly onSelect: () => void;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly title?: string;
  /** Where the quick start points (D-148): the designs, and adding photos. */
  readonly tour?: string;
};

/** The selection's row: what it is, and its own tools. */
type SelectionTools = { readonly name: string; readonly tools: readonly Tool[] };

/** What a layer is called at the head of its row: "Text · “Summer sale”", "Sticker · Subscribe". */
function layerName(overlay: Overlay): string {
  const { content } = overlay;
  switch (content.kind) {
    case 'text': {
      const words = content.text.trim().replace(/\s+/g, ' ');
      return words.length === 0 ? 'Text' : `Text · “${words.length > 18 ? `${words.slice(0, 18)}…` : words}”`;
    }
    case 'photo': return 'Photo';
    case 'customMedia': return 'Video clip';
    case 'counter': return `Number · ${elementName(content)}`;
    case 'shape':
    case 'sticker': return overlayName(overlay);
  }
}

function useSelectionTools(): SelectionTools | null {
  // Only what the row shows: the playhead changes every frame, and a
  // toolbar re-rendered sixty times a second for nothing is a hot phone.
  const project = useEditor((st) => st.project);
  const selection = useEditor(useShallow((st) => ({
    overlay: st.selectedOverlay,
    slot: st.selectedSlot,
    logo: st.selectedLogo,
    effect: st.selectedEffect,
    audio: st.selectedAudio,
  })));
  const s = useEditor.getState();
  const o = useOverlays.getState();
  const clock = usePreviewClock();
  const del = (label = 'Delete'): Tool => ({ label, icon: 'trash', danger: true, onSelect: () => { deleteSelection(); } });

  if (selection.overlay !== null) {
    const overlay = project.overlays.find((x) => x.id === selection.overlay);
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
        name: layerName(overlay),
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
          { label: 'Copy', icon: 'copy', onSelect: () => { s.dispatch(actions.duplicateOverlay(overlay.id, totalDurationMs(project))); } },
          del(),
        ],
      };
    }
  }

  if (selection.slot !== null && parseSlotKey(selection.slot)?.kind === 'shape') {
    // A design's own part (D-159): its colour first, as an added shape's style is.
    const key = selection.slot;
    const name = slotName(key);
    const typed = partsIn(selectedSceneLayers() ?? []).find((p) => p.key === key)?.text !== undefined;
    const target = { kind: 'element' as const, target: { kind: 'slot' as const, key }, label: name };
    return {
      name: `Part · ${name.replace(/^the /, '').replace(/^./, (c) => c.toUpperCase())}`,
      tools: [
        ...(typed ? [{ label: 'Edit', icon: 'edit' as const, onSelect: () => { o.openTextEdit(key); } }] : []),
        { label: 'Colour', icon: 'shape', onSelect: () => { editPart(key, 'phone'); } },
        { label: 'Effects', icon: 'effects', onSelect: () => { o.openPicker({ target }); } },
        { label: 'Motion', icon: 'motion', onSelect: () => { if (addMotionToSelection(clock) === 'exists') o.openPhonePanel('effects', name); } },
        { label: 'Delete', icon: 'trash', danger: true, onSelect: () => { deleteSlot(key); } },
      ],
    };
  }

  if (selection.slot !== null) {
    const key = selection.slot;
    const photo = /^photo:(\d+)$/.exec(key);
    const label = photo?.[1] !== undefined ? `photo ${Number(photo[1]) + 1}` : 'this text';
    // The section the settings open on: this photo's own, or this text's (D-114).
    const textSlot = key.startsWith('text:') ? s.template?.textSlots.find((t) => `text:${t.id}` === key) : undefined;
    const sectionName = photo?.[1] !== undefined ? `Photo ${Number(photo[1]) + 1}` : textSlot?.label ?? '';
    const target = { kind: 'element' as const, target: { kind: 'slot' as const, key }, label };
    return {
      name: photo?.[1] !== undefined ? sectionName : textSlot ? `Text · ${textSlot.label}` : 'Text',
      tools: [
        photo?.[1] !== undefined
          ? { label: 'Replace', icon: 'replace', onSelect: () => { o.openPhotoPicker({ kind: 'slot', index: Number(photo[1]) }); } }
          : { label: 'Edit text', icon: 'edit', onSelect: () => { o.openTextEdit(key); } },
        { label: photo ? 'Crop' : 'Style', icon: 'settings', onSelect: () => { o.openPhonePanel('element', sectionName); } },
        { label: 'Effects', icon: 'effects', onSelect: () => { o.openPicker({ target }); } },
        // A motion added at once (D-153); one it already has opens its settings.
        { label: 'Motion', icon: 'motion', onSelect: () => { if (addMotionToSelection(clock) === 'exists') o.openPhonePanel('effects', sectionName); } },
        { label: photo ? 'Delete' : 'Remove', icon: 'trash', danger: true, onSelect: () => { deleteSlot(key); } },
      ],
    };
  }

  if (selection.logo) {
    return {
      name: 'Logo',
      tools: [
        { label: 'Replace', icon: 'replace', onSelect: () => { o.openPhotoPicker({ kind: 'logo' }); } },
        { label: 'Effects', icon: 'effects', onSelect: () => { o.openPicker({ target: { kind: 'element', target: { kind: 'logo' }, label: 'the logo' } }); } },
        { label: 'Settings', icon: 'settings', onSelect: () => { o.openPhonePanel('style', 'Logo'); } },
        del('Remove'),
      ],
    };
  }

  if (selection.effect !== null) {
    const found = findEffect(project, selection.effect);
    const effectName = found ? frameEffect(found.clip.effectId)?.name : undefined;
    return {
      name: effectName === undefined ? 'Effect' : `Effect · ${effectName}`,
      tools: [
        { label: 'Settings', icon: 'settings', onSelect: () => { o.openPhonePanel('element'); } },
        { label: 'Copy', icon: 'copy', onSelect: () => { duplicateSelection(); } },
        del(),
      ],
    };
  }

  if (selection.audio !== null) {
    const id = selection.audio;
    // A library sound effect is a sound, not music (D-156).
    const sound = soundFor(project.audio.find((c) => c.id === id)?.mediaId ?? '');
    const kind = sound?.kind === 'effect' ? 'Sound' : 'Music';
    return {
      name: sound ? `${kind} · ${sound.name}` : kind,
      tools: [
        { label: 'Settings', icon: 'settings', onSelect: () => { o.openPhonePanel('element'); } },
        { label: 'Split', icon: 'split', onSelect: () => { s.dispatch(actions.splitAudio(id, useEditor.getState().playheadMs)); } },
        del(),
      ],
    };
  }

  return null;
}

/** Puts down whatever is in hand; the scene stays the one the main tools act on. */
function putDown(): void {
  const s = useEditor.getState();
  s.selectOverlay(null);
  s.selectSlot(null);
  s.selectLogo(false);
  s.selectEffect(null);
  s.selectAudio(null);
  s.selectScene(s.selectedScene);
}

function useMainTools(): readonly Tool[] {
  const mode = useEditor((st) => st.project.mode);
  const o = useOverlays.getState();
  /*
   * Each action once (D-162). The row of big buttons above this toolbar —
   * Choose a design, Add a scene, Add your photos — repeated three of its
   * tools, so it went, and its height went to the picture: the designs are
   * the first tool, + Scene heads the Add sheet, and photos are added from
   * Photos, whose panel starts with + Add photos and Take photo and holds the
   * design's photo spots and the photos waiting under them — so the Add
   * sheet has no + Photos of its own. Backdrop was Style opened at its Background section; Style
   * is here, and so is a long press on the empty picture → Change background.
   *
   * A selected scene keeps these tools (D-166), and so does every other
   * selection (D-169); each of them acts on the selected scene.
   */
  return [
    { label: MODE_COPY[mode].tool, icon: 'designs', tour: 'design', onSelect: () => { o.openPhonePanel('designs'); } },
    { label: 'Add', icon: 'add', onSelect: () => { o.openPhonePanel('add'); } },
    { label: 'Photos', icon: 'photo', tour: 'photos', onSelect: () => { o.openPhonePanel('photos'); } },
    { label: 'Text', icon: 'text', onSelect: () => { o.openPhonePanel('text'); } },
    { label: 'Effects', icon: 'effects', onSelect: () => { o.openPhonePanel('effects'); } },
    { label: 'Style', icon: 'style', onSelect: () => { o.openPhonePanel('style'); } },
  ];
}

export function PhoneToolbar(): React.JSX.Element {
  const selection = useSelectionTools();
  const tools = useMainTools();
  return (
    <>
    {selection !== null ? (
      <ActionRow
        name={selection.name}
        tools={selection.tools}
        onClose={putDown}
        closeLabel="Deselect"
        attrs={{ 'data-phone-toolbar': 'selection' }}
        actionAttr="data-phone-tool"
      />
    ) : <SceneRow />}
    <nav
      aria-label="Tools"
      data-phone-toolbar="main"
      className="shrink-0 border-t border-edge bg-panel"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-stretch justify-around px-1 py-1">
        {tools.map((tool) => (
          <button
            key={tool.label}
            type="button"
            data-tour={tool.tour}
            data-phone-tool={tool.label.toLowerCase()}
            onClick={tool.onSelect}
            className="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[11px] active:bg-panel-alt"
            style={{ color: 'var(--c-ink)' }}
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
 * A slim row of one thing's own actions, above the main tools (D-166, D-169):
 * its name, its tools, the one that takes something away apart and last, and a
 * quiet × that puts the row away. A labelled toolbar ("Scene 2 actions",
 * "Sticker · Subscribe actions") that scrolls sideways when it does not fit,
 * with the name and the × always in view; every target is 44px tall.
 */
function ActionRow({ name, tools, onClose, closeLabel, attrs, actionAttr }: {
  name: string;
  tools: readonly Tool[];
  onClose: () => void;
  closeLabel: string;
  attrs: Readonly<Record<`data-${string}`, string | number>>;
  /** What each action is found by, after its label: the tests and the quick start use it. */
  actionAttr: 'data-scene-action' | 'data-phone-tool';
}): React.JSX.Element {
  const kept = tools.filter((tool) => tool.danger !== true);
  const away = tools.filter((tool) => tool.danger === true);
  const chip = 'flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium active:bg-panel-alt disabled:opacity-40';
  const button = (tool: Tool): React.JSX.Element => (
    <button
      key={tool.label}
      type="button"
      {...{ [actionAttr]: tool.label.toLowerCase() }}
      onClick={tool.onSelect}
      disabled={tool.disabled}
      title={tool.title}
      className={chip}
      style={{ color: tool.danger === true ? 'var(--c-danger)' : 'var(--c-ink)' }}
    >
      <Icon name={tool.icon} size={18} />
      <span className="whitespace-nowrap">{tool.label}</span>
    </button>
  );
  return (
    <div
      role="toolbar"
      aria-label={`${name} actions`}
      {...attrs}
      className="flex shrink-0 items-center border-t border-edge bg-panel pl-3"
    >
      <span className="max-w-[42%] shrink-0 truncate pr-1.5 text-[12px] font-semibold text-accent">{name}</span>
      {/* Fades at its right edge, so a row wider than the phone reads as one to scroll; a spacer at its end lets Delete clear the fade. */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)] [scrollbar-width:none]">
        {kept.map(button)}
        {/* Apart from the others, and last: the one that takes something away. */}
        {away.length > 0 && <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-edge" />}
        {away.map(button)}
        <span aria-hidden className="w-5 shrink-0" />
      </div>
      {/* A quiet ×; tapping the thing again, or the empty picture, does the same. */}
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="grid size-11 shrink-0 place-items-center text-ink-muted"
      >
        <svg aria-hidden width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </svg>
      </button>
    </div>
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
 * Only while nothing in it is selected: an element has its own row in this
 * place (D-169), and the two are never on screen together. Elements, which
 * D-167 put first here, is beside Play now in a video as in an image, so it is
 * one tap away whatever is selected (D-169).
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
    {
      label: 'Delete',
      icon: 'trash',
      danger: true,
      disabled: count <= 1,
      ...(count <= 1 ? { title: 'A video needs at least one scene' } : {}),
      onSelect: () => { deleteSelection(); },
    },
  ];
  return (
    <ActionRow
      name={name}
      tools={sceneTools}
      onClose={() => { useEditor.getState().selectScene(index); }}
      closeLabel={`Hide ${name} actions`}
      attrs={{ 'data-phone-scene-row': index }}
      actionAttr="data-scene-action"
    />
  );
}
