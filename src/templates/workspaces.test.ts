import { describe, expect, it } from 'vitest';
import { ASPECTS } from '@/core/types';
import { STARTER_PHOTO_IDS } from '@/document/defaults';
import { CATEGORIES, summaryFor, templatesForMode } from './manifest';
import { DESIGN_PURPOSES, VIDEO_PURPOSES, purposeOf } from './purpose';
import {
  START_HERE, WORKSPACE_IDS, WORKSPACES, defaultFolded, effectiveFolded, foldedAfterSwitch,
  groupOrder, isWorkspaceId, libraryGroups, orderWithin, startHereFor, topGroups,
} from './workspaces';

/**
 * "Set up for" (D-149): the same library, arranged per workspace — never
 * smaller. These hold the arrangement to that.
 */

const sorted = (list: readonly string[]): string[] => [...list].sort();
const KINDS = ['scene', 'ad'] as const;

describe('workspaces (D-149)', () => {
  it('every workspace lists every purpose exactly once', () => {
    for (const id of WORKSPACE_IDS) {
      expect(sorted(groupOrder(id, 'scene')), id).toEqual(sorted(DESIGN_PURPOSES));
      expect(sorted(groupOrder(id, 'ad')), id).toEqual(sorted(VIDEO_PURPOSES));
    }
  });

  it('"everything" is the library as it was: usual order, nothing picked, nothing folded', () => {
    const both = WORKSPACES.both;
    expect(both.designOrder).toEqual(DESIGN_PURPOSES);
    expect(both.videoOrder).toEqual(VIDEO_PURPOSES);
    expect(both.startHere).toEqual({ scene: [], ad: [] });
    expect(both.leadIn).toEqual({});
    expect(defaultFolded('both')).toEqual([]);
    expect(both.opener).toEqual({ templateId: 'depth-parallax', aspect: '9:16', photoCount: 4, durationMs: 10_000 });
  });

  it('social opens on photo galleries, business on business posts, news on dates', () => {
    expect(groupOrder('social', 'scene')[0]).toBe('Photo galleries');
    expect(groupOrder('social', 'ad')[0]).toBe('Thanks & celebrations');
    expect(groupOrder('business', 'scene')[0]).toBe('Business posts');
    expect(groupOrder('business', 'ad')[0]).toBe('Product launches & offers');
    expect(groupOrder('news', 'scene')[0]).toBe('Events & dates');
    expect(groupOrder('news', 'ad')[0]).toBe('Announcements');
  });

  it('every pick is a real, listed, free design of the right kind, and a free-length film', () => {
    for (const id of WORKSPACE_IDS) {
      for (const kind of KINDS) {
        const picks = WORKSPACES[id].startHere[kind];
        expect(new Set(picks).size, `${id} ${kind} repeats`).toBe(picks.length);
        for (const pick of picks) {
          const summary = summaryFor(pick);
          expect(summary, pick).toBeDefined();
          expect(summary?.kind, pick).toBe(kind);
          expect(summary?.listed, pick).not.toBe(false);
          expect(summary?.tier, pick).toBe('free');
          if (kind === 'ad') expect(summary?.durationMs ?? 0, pick).toBeLessThanOrEqual(15_000);
        }
      }
      if (id !== 'both') {
        expect(WORKSPACES[id].startHere.scene.length).toBeGreaterThanOrEqual(4);
        expect(WORKSPACES[id].startHere.ad.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('each opener is a listed design that takes every frame shape and its photo count', () => {
    const openers = new Set<string>();
    for (const id of WORKSPACE_IDS) {
      const { templateId, aspect, photoCount } = WORKSPACES[id].opener;
      openers.add(templateId);
      const summary = summaryFor(templateId);
      expect(summary?.kind, templateId).toBe('scene');
      expect(summary?.listed, templateId).not.toBe(false);
      expect(ASPECTS).toContain(aspect);
      for (const shape of ASPECTS) expect(summary?.supportedAspects, `${templateId} ${shape}`).toContain(shape);
      expect(photoCount).toBeGreaterThanOrEqual(summary?.photoSlots.min ?? 0);
      expect(photoCount).toBeLessThanOrEqual(summary?.photoSlots.max ?? 0);
      expect(photoCount).toBeLessThanOrEqual(STARTER_PHOTO_IDS.length);
    }
    expect(openers.size, 'each workspace opens on its own design').toBe(WORKSPACE_IDS.length);
  });

  it('Start here is never a purpose or a category', () => {
    expect(DESIGN_PURPOSES as readonly string[]).not.toContain(START_HERE);
    expect(VIDEO_PURPOSES as readonly string[]).not.toContain(START_HERE);
    expect(CATEGORIES).not.toContain(START_HERE);
  });

  it('only known ids are workspaces', () => {
    expect(isWorkspaceId('social')).toBe(true);
    for (const bad of ['Social', '', 'everything', null, 42, undefined]) expect(isWorkspaceId(bad)).toBe(false);
  });

  it('social brings the coverflows, the soft pops and the parallax forward, and keeps the rest in order', () => {
    const galleries = templatesForMode('showcase').filter((t) => purposeOf(t) === 'Photo galleries');
    const ordered = orderWithin('social', 'Photo galleries', galleries);
    const flows = galleries.filter((t) => t.id.startsWith('flow-'));
    expect(ordered.slice(0, flows.length).map((t) => t.id)).toEqual(flows.map((t) => t.id));
    expect(ordered.slice(flows.length).map((t) => t.id)).toEqual(galleries.filter((t) => !t.id.startsWith('flow-')).map((t) => t.id));

    const moods = templatesForMode('showcase').filter((t) => purposeOf(t) === 'Moodboards');
    expect(orderWithin('social', 'Moodboards', moods).slice(0, 4).map((t) => t.id)).toEqual(['pop-flip', 'pop-scatter', 'pop-dream', 'pop-float']);

    const depth = templatesForMode('showcase').filter((t) => purposeOf(t) === '3D & depth');
    expect(orderWithin('social', '3D & depth', depth)[0]?.id).toBe('depth-parallax');

    for (const id of ['business', 'news', 'both'] as const) expect(orderWithin(id, 'Photo galleries', galleries)).toBe(galleries);
  });

  it('every design appears in exactly one group, whatever the workspace, grouping or filter', () => {
    for (const id of WORKSPACE_IDS) {
      for (const kind of KINDS) {
        const all = templatesForMode(kind === 'ad' ? 'motionAd' : 'showcase');
        const inputs = [all, all.filter((t) => t.tier === 'free')];
        for (const templates of inputs) {
          for (const groupBy of ['purpose', 'style'] as const) {
            for (const narrowed of [false, true]) {
              const layout = libraryGroups({ templates, workspace: id, kind, groupBy, narrowed });
              const listed = layout.groups.flatMap((g) => g.templates.map((t) => t.id));
              expect(sorted(listed), `${id} ${kind} ${groupBy}`).toEqual(sorted(templates.map((t) => t.id)));
              expect(layout.groups.every((g) => g.templates.length > 0)).toBe(true);
              const picks = layout.startHere.map((t) => t.id);
              expect(new Set(picks).size).toBe(picks.length);
              for (const pick of picks) expect(templates.map((t) => t.id)).toContain(pick);
              if (narrowed || id === 'both') expect(picks).toEqual([]);
            }
          }
        }
      }
    }
  });

  it('"everything" by purpose groups exactly as the library always has', () => {
    const all = templatesForMode('showcase');
    const layout = libraryGroups({ templates: all, workspace: 'both', kind: 'scene', groupBy: 'purpose', narrowed: false });
    const before = DESIGN_PURPOSES
      .map((purpose) => ({ name: purpose, ids: all.filter((t) => purposeOf(t) === purpose).map((t) => t.id) }))
      .filter((g) => g.ids.length > 0);
    expect(layout.groups.map((g) => ({ name: g.name, ids: g.templates.map((t) => t.id) }))).toEqual(before);
  });

  it('Start here keeps pick order and drops picks a filter has removed', () => {
    const all = templatesForMode('showcase');
    expect(startHereFor('social', 'scene', all).map((t) => t.id)).toEqual(WORKSPACES.social.startHere.scene);
    const without = all.filter((t) => t.id !== 'flow-coverflow');
    expect(startHereFor('social', 'scene', without).map((t) => t.id)).not.toContain('flow-coverflow');
  });

  it('folds: defaults until the person folds something, and a switch opens the top groups', () => {
    expect(effectiveFolded(null, 'social').has('Moodboards')).toBe(true);
    expect(effectiveFolded(null, 'social').has('Photo galleries')).toBe(false);
    expect(effectiveFolded(null, 'social').has(START_HERE)).toBe(false);
    expect(effectiveFolded([], 'social').size, 'an empty stored list wins').toBe(0);
    expect(topGroups('business')).toEqual([START_HERE, 'Business posts', 'Product launches & offers']);
    expect(foldedAfterSwitch([START_HERE, 'Business posts', 'Moodboards', 'Product launches & offers'], 'business')).toEqual(['Moodboards']);
    expect(foldedAfterSwitch(['Headlines & hooks'], 'both')).toEqual(['Headlines & hooks']);
  });

  it('never calls itself a mode, a workspace or an environment on screen', () => {
    for (const id of WORKSPACE_IDS) {
      const w = WORKSPACES[id];
      const words = [w.name, w.short, w.line, w.startHereCaption ?? '', w.toast, w.tour.design?.wide ?? '', w.tour.design?.phone ?? '', w.tour.photos ?? ''];
      for (const text of words) expect(text, text).not.toMatch(/\bmode\b|workspace|environment/i);
    }
  });
});
