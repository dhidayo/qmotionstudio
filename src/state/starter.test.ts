import { describe, expect, it } from 'vitest';
import { ASPECTS } from '@/core/types';
import { createProject, DEFAULT_TEMPLATE_ID } from '@/document/defaults';
import { migrate } from '@/document/migrate';
import * as actions from '@/document/actions';
import { designLook } from '@/templates/looks';
import { WORKSPACE_IDS } from '@/templates/workspaces';
import { sameContent, starterProject, untouchedStarterOf } from './starter';

/** D-149: only a project nobody has touched is ever swapped for a workspace's opener. */

const here = { sceneIndex: 0 };

describe('starter projects (D-149)', () => {
  it('"everything" opens exactly the project a new visit always opened', () => {
    expect(sameContent(starterProject('both'), createProject({ look: designLook(DEFAULT_TEMPLATE_ID) }))).toBe(true);
  });

  it('createProject on its own is unchanged', () => {
    const plain = createProject();
    expect(plain.scenes[0]?.templateId).toBe('depth-parallax');
    expect(plain.aspect).toBe('9:16');
    expect(plain.mode).toBe('showcase');
    expect(plain.name).toBe('Untitled project');
    expect(plain.scenes[0]?.inputs.photos).toHaveLength(4);
  });

  it('social opens the polaroid gallery at 4:5 with seven photos, or the frame asked for', () => {
    const social = starterProject('social');
    expect(social.scenes[0]?.templateId).toBe('flow-polaroid-pass');
    expect(social.aspect).toBe('4:5');
    expect(social.scenes[0]?.inputs.photos).toHaveLength(7);
    expect(starterProject('social', { aspect: '1:1' }).aspect).toBe('1:1');
    expect(starterProject('news').scenes[0]?.inputs.photos).toHaveLength(0);
  });

  it('recognises each starter, in any frame, after a save and reopen', () => {
    for (const id of WORKSPACE_IDS) {
      for (const aspect of ASPECTS) {
        const project = starterProject(id, { aspect });
        expect(untouchedStarterOf(project), `${id} ${aspect}`).toBe(id);
        const reopened = migrate(JSON.parse(JSON.stringify(project)));
        expect(reopened.ok).toBe(true);
        if (reopened.ok) expect(untouchedStarterOf(reopened.project), `${id} ${aspect} reopened`).toBe(id);
      }
    }
  });

  it('a frame-only change still reads as the starter (the empty-history rule guards it)', () => {
    const project = actions.setAspect('16:9').apply(starterProject('social'), here);
    expect(untouchedStarterOf(project)).toBe('social');
  });

  it('anything the person did makes it theirs', () => {
    const start = starterProject('social');
    const edits = [
      actions.renameProject('My trip'),
      actions.setText('headline', 'Our summer'),
      actions.setMode('motionAd'),
      actions.addToLibrary(['upload:1']),
      actions.replacePhoto(0, 'upload:2'),
    ];
    for (const edit of edits) {
      expect(untouchedStarterOf(edit.apply(start, here)), edit.label).toBeNull();
    }
  });
});
