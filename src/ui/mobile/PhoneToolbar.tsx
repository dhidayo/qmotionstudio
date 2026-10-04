import * as actions from '@/document/actions';
import { totalDurationMs } from '@/document/select/timeline';
import { useEditor } from '@/state/store';
import { useShallow } from 'zustand/react/shallow';
import { useOverlays } from '@/ui/shell/overlays';
import { deleteSelection, deleteSlot, duplicateSelection, findEffect, overlayLabel } from '@/ui/editing/commands';
import { Icon, type IconName } from './Icon';

/**
 * The phone's bottom toolbar (D-109).
 *
 * With nothing selected it is the way into everything: designs, photos, text,
 * effects, style — and, for an ad, adding scenes and layers. Select something
 * and it becomes that thing's own tools, the way CapCut's does, ending in
 * "Done" to put it down again. One row, never scrolled.
 */

type Tool = {
  readonly label: string;
  readonly icon: IconName;
  readonly onSelect: () => void;
  readonly danger?: boolean;
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
  const corporate = project.mode === 'motionAd';
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
      const target = { kind: 'element' as const, target: { kind: 'overlay' as const, id: overlay.id }, label: overlay.kind === 'text' ? 'this caption' : 'this layer' };
      const first: Tool[] = overlay.content.kind === 'text'
        ? [{ label: 'Edit text', icon: 'edit', onSelect: () => { o.openTextEdit(overlay.id); } }]
        : overlay.content.kind === 'photo'
          ? [{ label: 'Replace', icon: 'replace', onSelect: () => { o.openPhotoPicker({ kind: 'overlay', id: overlay.id }); } }]
          : [];
      return {
        context: overlayLabel(overlay),
        tools: [
          ...first,
          { label: overlay.content.kind === 'text' ? 'Style' : 'Settings', icon: 'settings', onSelect: () => { o.openPhonePanel('element', overlay.content.kind === 'text' ? 'Content' : 'Placement'); } },
          { label: 'Effects', icon: 'effects', onSelect: () => { o.openPicker({ target }); } },
          { label: 'Copy', icon: 'copy', onSelect: () => { s.dispatch(actions.duplicateOverlay(overlay.id, totalDurationMs(s.project))); } },
          del(),
          done,
        ],
      };
    }
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
        { label: 'Motion', icon: 'motion', onSelect: () => { o.openPhonePanel('effects', sectionName); } },
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
    return {
      context: 'Music',
      tools: [
        { label: 'Settings', icon: 'settings', onSelect: () => { o.openPhonePanel('element'); } },
        { label: 'Split', icon: 'split', onSelect: () => { s.dispatch(actions.splitAudio(id, useEditor.getState().playheadMs)); } },
        del(),
        done,
      ],
    };
  }

  if (s.sceneClipSelected && corporate) {
    return {
      context: `Scene ${s.selectedScene + 1}`,
      tools: [
        { label: 'Design', icon: 'designs', onSelect: () => { o.openScenePicker('replace'); } },
        { label: 'Effects', icon: 'effects', onSelect: () => { o.openPicker({ target: { kind: 'scene' } }); } },
        { label: 'Copy', icon: 'copy', onSelect: () => { duplicateSelection(); } },
        del(),
        done,
      ],
    };
  }

  const designs: Tool = { label: 'Designs', icon: 'designs', onSelect: () => { o.openPhonePanel('designs'); } };
  const photos: Tool = { label: 'Photos', icon: 'photo', onSelect: () => { o.openPhonePanel('photos'); } };
  const text: Tool = { label: 'Text', icon: 'text', onSelect: () => { o.openPhonePanel('text'); } };
  const effects: Tool = { label: 'Effects', icon: 'effects', onSelect: () => { o.openPhonePanel('effects'); } };
  const style: Tool = { label: 'Style', icon: 'style', onSelect: () => { o.openPhonePanel('style'); } };
  const add: Tool = { label: 'Add', icon: 'add', onSelect: () => { o.openPhonePanel('add'); } };
  return { context: null, tools: corporate ? [designs, add, photos, text, effects, style] : [designs, photos, text, effects, style] };
}

export function PhoneToolbar(): React.JSX.Element {
  const { tools, context } = useTools();
  return (
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
  );
}
