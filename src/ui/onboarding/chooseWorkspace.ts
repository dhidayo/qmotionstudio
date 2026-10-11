import { renderParams } from '@/dev/renderParams';
import { useEditor } from '@/state/store';
import { starterProject, untouchedStarterOf } from '@/state/starter';
import { readWorkspace, setWorkspace, storedWorkspace } from '@/state/workspace';
import { WORKSPACES, type WorkspaceId } from '@/templates/workspaces';
import { openTopGroups } from '@/ui/library/libraryFolds';
import { bumpStarterVersion, restoreSettled } from './purposeState';

/**
 * Sets the purpose (D-149, D-150), from the Purpose bar above the picture.
 *
 * What the person has made is never touched. Only a project that is still
 * exactly the starter — reopened or not, apart from its frame shape — is
 * swapped for the new workspace's opener, keeping its id and name so no
 * second "Untitled project" appears. The frame shape comes with the opener
 * unless a link chose one, or the person already changed it.
 */
export function chooseWorkspace(next: WorkspaceId): void {
  const editor = useEditor.getState();

  if (next === readWorkspace()) {
    // Choosing the one already on still counts as choosing it (the quick start's first step).
    if (storedWorkspace() === null) setWorkspace(next);
    return;
  }

  let swapped = false;
  /*
   * Swapped only while the project is still exactly a starting design. A
   * changed frame shape does not count as work (D-150) — the frame is kept —
   * but anything that could be redone does, so nothing undone is lost.
   */
  if (restoreSettled() && !editor.canRedo()) {
    const project = editor.project;
    const from = untouchedStarterOf(project);
    if (from !== null && from !== next) {
      const keepFrame = renderParams().aspect !== null || project.aspect !== WORKSPACES[from].opener.aspect;
      const fresh = starterProject(next, { aspect: keepFrame ? project.aspect : WORKSPACES[next].opener.aspect });
      editor.openProject({ ...fresh, id: project.id, name: project.name, createdAt: project.createdAt });
      bumpStarterVersion();
      swapped = true;
    }
  }

  setWorkspace(next);
  openTopGroups(next);
  editor.showToast(`${WORKSPACES[next].toast} ${swapped ? 'A matching design is now open.' : 'Your project has not changed.'}`);
}
