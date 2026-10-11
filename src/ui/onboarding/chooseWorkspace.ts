import { renderParams } from '@/dev/renderParams';
import { useEditor } from '@/state/store';
import { starterProject, untouchedStarterOf } from '@/state/starter';
import { readWorkspace, setWorkspace, storedWorkspace } from '@/state/workspace';
import { WORKSPACES, type WorkspaceId } from '@/templates/workspaces';
import { openTopGroups } from '@/ui/library/libraryFolds';
import { bumpStarterVersion, closeWorkspaceWindow, restoreSettled } from './workspaceQuestionState';

/**
 * Sets the device up for a workspace (D-149), from the first-visit question,
 * the library's switch or the menu.
 *
 * What the person has made is never touched. Only a project that is still
 * exactly the starter — reopened or not, nothing undoable done to it — is
 * swapped for the new workspace's opener, keeping its id and name so no
 * second "Untitled project" appears. The frame shape comes with the opener
 * unless a link chose one, or the person already changed it.
 */
export function chooseWorkspace(next: WorkspaceId, source: 'question' | 'switch' | 'menu'): void {
  const editor = useEditor.getState();

  if (next === readWorkspace()) {
    if (storedWorkspace() === null) setWorkspace(next);
    closeWorkspaceWindow();
    return;
  }

  let swapped = false;
  if (restoreSettled() && !editor.canUndo() && !editor.canRedo()) {
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
  closeWorkspaceWindow();
  if (source !== 'question') {
    editor.showToast(`${WORKSPACES[next].toast} ${swapped ? 'A matching design is now open.' : 'Your project has not changed.'}`);
  }
}
