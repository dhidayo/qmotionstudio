import type { Aspect } from '@/core/types';
import { DEFAULT_PHOTO_COUNT, DEFAULT_SCENE_MS, DEFAULT_TEMPLATE_ID } from '@/document/defaults';
import { CATEGORIES, type TemplateSummary } from './manifest';
import {
  DESIGN_PURPOSES, VIDEO_PURPOSES, purposeOf,
  type DesignPurpose, type Purpose, type VideoPurpose,
} from './purpose';

/**
 * "Set up for" (D-149): the same library, arranged for the person using it.
 *
 * "There would be two types of users for the product; 1. Social users who
 * would use more of gallery for social posts … 2. business users who would use
 * it for ads and business posts … ask users one simple question on visit …
 * this will shape how the environment would be setup; user would be able to
 * switch mode anyway."
 *
 * A workspace never hides anything. It decides which groups come first, which
 * start open, a short "Start here" pick, the design a fresh project opens on,
 * and a few words of the quick start. `both` is the library exactly as it was
 * before, and is what anyone who skips the question gets.
 *
 * Pure data and pure functions: no storage, no DOM, so it is tested in Node.
 * The word "mode" belongs to Design and Video; on screen this is "Set up for".
 */

export const WORKSPACE_IDS = ['social', 'business', 'news', 'both'] as const;
export type WorkspaceId = (typeof WORKSPACE_IDS)[number];
export const DEFAULT_WORKSPACE: WorkspaceId = 'both';

/** The heading of the picked designs above the groups. Never a purpose or a category. */
export const START_HERE = 'Start here';

export type Workspace = {
  readonly id: WorkspaceId;
  /** On the question's card and in the change form. */
  readonly name: string;
  /** On the library switch and the menu hint. */
  readonly short: string;
  /** The line under the name. */
  readonly line: string;
  /** The design whose poster illustrates the choice; null for a plain row. */
  readonly poster: string | null;
  readonly designOrder: readonly DesignPurpose[];
  readonly videoOrder: readonly VideoPurpose[];
  /**
   * Inside a group, the designs to bring forward, in order: an id, or the
   * start of a family's ids ending in "-". Everything else keeps its place.
   */
  readonly leadIn: Readonly<Partial<Record<Purpose, readonly string[]>>>;
  readonly startHere: { readonly scene: readonly string[]; readonly ad: readonly string[] };
  /** Under the Start here heading. */
  readonly startHereCaption: string | null;
  /** Whether groups past the first start folded, so the first screen is the picked corner. */
  readonly foldOthers: boolean;
  /** What a fresh, untouched project opens on — the design at its own length, as picking it gives. */
  readonly opener: { readonly templateId: string; readonly aspect: Aspect; readonly photoCount: number; readonly durationMs: number };
  /** The quick start's words where this workspace says something different (null: the usual). */
  readonly tour: {
    readonly design: { readonly wide: string; readonly phone: string } | null;
    readonly photos: string | null;
    /** A workspace whose designs need no photographs leaves that step out. */
    readonly skipPhotos: boolean;
  };
  /** The toast after switching to it. */
  readonly toast: string;
};

export const WORKSPACES: Readonly<Record<WorkspaceId, Workspace>> = {
  social: {
    id: 'social',
    name: 'Social posts',
    short: 'Social',
    line: 'Photo galleries and stories for Instagram, LinkedIn and TikTok.',
    poster: 'flow-polaroid-pass',
    designOrder: [
      'Photo galleries', 'Photo stacks', 'Moodboards', 'Photo stories', 'Hero photos', '3D & depth',
      'Timelines & journeys', 'Before & after', 'Headlines & hooks', 'Quotes & reviews', 'Events & dates',
      'People & teams', 'Lists & how it works', 'Numbers & results', 'Calls to action', 'Products',
      'Sales & prices', 'Business & apps',
    ],
    videoOrder: [
      'Thanks & celebrations', 'Announcements', 'Events & webinars', 'Product launches & offers',
      'Brand & company', 'Customer stories & results', 'Hiring',
    ],
    leadIn: {
      'Photo galleries': ['flow-'],
      Moodboards: ['pop-flip', 'pop-scatter', 'pop-dream', 'pop-float', 'pop-'],
      '3D & depth': ['depth-parallax'],
    },
    startHere: {
      scene: ['flow-polaroid-pass', 'flow-coverflow', 'deck-scrapbook', 'pop-dream', 'ring-wide', 'kinetic-statement'],
      ad: ['film-lookbook', 'quick-pitch', 'story-thank-you', 'story-big-news'],
    },
    startHereCaption: 'Picked for social posts',
    foldOthers: true,
    opener: { templateId: 'flow-polaroid-pass', aspect: '4:5', photoCount: 7, durationMs: 12_000 },
    tour: {
      design: {
        wide: 'Click here and pick a look — a gallery, a moodboard, a story in photos…',
        phone: 'Tap here and pick a look — a gallery, a moodboard, a story in photos…',
      },
      photos: null,
      skipPhotos: false,
    },
    toast: 'Set up for social posts. Photo designs now come first.',
  },
  business: {
    id: 'business',
    name: 'Business ads',
    short: 'Business',
    line: 'Products, offers, news and hiring for your business or clients.',
    poster: 'pd-new-arrival',
    designOrder: [
      'Products', 'Sales & prices', 'Headlines & hooks', 'Calls to action', 'Quotes & reviews',
      'Numbers & results', 'People & teams', 'Business & apps', 'Events & dates', 'Lists & how it works',
      'Before & after', 'Hero photos', '3D & depth', 'Timelines & journeys', 'Photo galleries',
      'Photo stacks', 'Photo stories', 'Moodboards',
    ],
    videoOrder: [
      'Product launches & offers', 'Brand & company', 'Customer stories & results', 'Announcements',
      'Events & webinars', 'Hiring', 'Thanks & celebrations',
    ],
    leadIn: {},
    startHere: {
      scene: ['pd-new-arrival', 'pd-price-reveal', 'split-band', 'type-question-answer', 'el-cta-button', 'biz-testimonials'],
      ad: ['social-post', 'story-sale', 'story-customer', 'promo-hiring'],
    },
    startHereCaption: 'Picked for business ads',
    foldOthers: true,
    opener: { templateId: 'pd-new-arrival', aspect: '4:5', photoCount: 1, durationMs: 5_000 },
    tour: {
      design: {
        wide: 'Click here and pick a look — a product, an offer, a headline… For an advert film, switch to Video at the top.',
        phone: 'Tap here and pick a look — a product, an offer, a headline… For an advert film, choose Video in the menu.',
      },
      photos: 'Add a photo of your product or team. It takes the place of a sample photo, and stays in Your photos for later.',
      skipPhotos: false,
    },
    toast: 'Set up for business ads. Products and offers now come first.',
  },
  news: {
    id: 'news',
    name: 'News & events',
    short: 'News',
    line: 'Announcements, dates, quotes and milestones. No photos needed.',
    poster: 'el-eyebrow-title',
    designOrder: [
      'Events & dates', 'Headlines & hooks', 'Quotes & reviews', 'Numbers & results', 'Lists & how it works',
      'People & teams', 'Calls to action', 'Timelines & journeys', 'Sales & prices', 'Business & apps',
      'Products', 'Hero photos', 'Photo stories', 'Before & after', 'Photo galleries', 'Photo stacks',
      'Moodboards', '3D & depth',
    ],
    videoOrder: [
      'Announcements', 'Events & webinars', 'Thanks & celebrations', 'Customer stories & results',
      'Hiring', 'Brand & company', 'Product launches & offers',
    ],
    leadIn: {},
    startHere: {
      scene: ['el-eyebrow-title', 'el-date-card', 'type-quote', 'type-big-number', 'el-countdown', 'el-checklist'],
      ad: ['story-big-news', 'story-event', 'story-thank-you', 'story-impact'],
    },
    startHereCaption: 'Picked for news and events',
    foldOthers: true,
    opener: { templateId: 'el-eyebrow-title', aspect: '4:5', photoCount: 0, durationMs: 4_500 },
    tour: {
      design: {
        wide: 'Click here and pick a look — an announcement, a date, a quote…',
        phone: 'Tap here and pick a look — an announcement, a date, a quote…',
      },
      photos: null,
      skipPhotos: true,
    },
    toast: 'Set up for news and events. Announcements and dates now come first.',
  },
  both: {
    id: 'both',
    name: 'A bit of everything',
    short: 'All',
    line: 'Every design, in the usual order.',
    poster: null,
    designOrder: DESIGN_PURPOSES,
    videoOrder: VIDEO_PURPOSES,
    leadIn: {},
    startHere: { scene: [], ad: [] },
    startHereCaption: null,
    foldOthers: false,
    opener: { templateId: DEFAULT_TEMPLATE_ID, aspect: '9:16', photoCount: DEFAULT_PHOTO_COUNT, durationMs: DEFAULT_SCENE_MS },
    tour: { design: null, photos: null, skipPhotos: false },
    toast: 'Set up for everything. All designs are in the usual order.',
  },
};

export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return typeof value === 'string' && (WORKSPACE_IDS as readonly string[]).includes(value);
}

/** The purpose groups in the order this workspace shows them. */
export function groupOrder(id: WorkspaceId, kind: 'scene' | 'ad'): readonly Purpose[] {
  return kind === 'ad' ? WORKSPACES[id].videoOrder : WORKSPACES[id].designOrder;
}

function leadRank(templateId: string, patterns: readonly string[]): number {
  const index = patterns.findIndex((p) => (p.endsWith('-') ? templateId.startsWith(p) : templateId === p));
  return index === -1 ? patterns.length : index;
}

/** A group's designs, the workspace's lead-ins first; otherwise in their usual order. */
export function orderWithin(id: WorkspaceId, purpose: Purpose, list: readonly TemplateSummary[]): readonly TemplateSummary[] {
  const patterns = WORKSPACES[id].leadIn[purpose];
  if (patterns === undefined || patterns.length === 0) return list;
  return list
    .map((template, index) => ({ template, index, rank: leadRank(template.id, patterns) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.template);
}

/** The picked designs that are among `available`, in pick order. */
export function startHereFor(id: WorkspaceId, kind: 'scene' | 'ad', available: readonly TemplateSummary[]): readonly TemplateSummary[] {
  const byId = new Map(available.map((t) => [t.id, t]));
  return WORKSPACES[id].startHere[kind].flatMap((pick) => {
    const found = byId.get(pick);
    return found === undefined ? [] : [found];
  });
}

/** The groups that open first in a workspace: Start here, and the first Design and Video group. */
export function topGroups(id: WorkspaceId): readonly string[] {
  const { designOrder, videoOrder } = WORKSPACES[id];
  return [START_HERE, designOrder[0] ?? '', videoOrder[0] ?? ''].filter((name) => name.length > 0);
}

/**
 * The groups folded until the person folds or opens one themselves: in a
 * workspace that folds the rest, every purpose group but its first two.
 */
export function defaultFolded(id: WorkspaceId): readonly string[] {
  const workspace = WORKSPACES[id];
  if (!workspace.foldOthers) return [];
  const open = new Set(topGroups(id));
  return [...workspace.designOrder, ...workspace.videoOrder].filter((name) => !open.has(name));
}

/** What is folded: what the person last left folded in this workspace, or its defaults. */
export function effectiveFolded(stored: readonly string[] | null, id: WorkspaceId): ReadonlySet<string> {
  return new Set(stored ?? defaultFolded(id));
}

/**
 * Switching to a workspace opens its top groups — the point of switching —
 * and keeps every other fold the person made there. `both` is left exactly
 * as it was.
 */
export function foldedAfterSwitch(stored: readonly string[], id: WorkspaceId): readonly string[] {
  if (!WORKSPACES[id].foldOthers) return stored;
  const open = new Set(topGroups(id));
  return stored.filter((name) => !open.has(name));
}

export type LibraryGroup = { readonly name: string; readonly templates: readonly TemplateSummary[] };
export type LibraryLayout = { readonly startHere: readonly TemplateSummary[]; readonly groups: readonly LibraryGroup[] };

/**
 * The library's sections for a workspace (D-149).
 *
 * `templates` are those already left by the search, the Free/Pro filter and
 * favourites. `narrowed` says one of those is in use: then the picks step
 * aside, because a search shows what it found and nothing else.
 */
export function libraryGroups(input: {
  readonly templates: readonly TemplateSummary[];
  readonly workspace: WorkspaceId;
  readonly kind: 'scene' | 'ad';
  readonly groupBy: 'purpose' | 'style';
  readonly narrowed: boolean;
}): LibraryLayout {
  const { templates, workspace, kind, groupBy, narrowed } = input;
  const groups: LibraryGroup[] = [];
  if (groupBy === 'purpose') {
    for (const purpose of groupOrder(workspace, kind)) {
      const inGroup = templates.filter((t) => purposeOf(t) === purpose);
      if (inGroup.length > 0) groups.push({ name: purpose, templates: orderWithin(workspace, purpose, inGroup) });
    }
  } else {
    for (const category of CATEGORIES) {
      const inGroup = templates.filter((t) => t.category === category);
      if (inGroup.length > 0) groups.push({ name: category, templates: inGroup });
    }
  }
  return { startHere: narrowed ? [] : startHereFor(workspace, kind, templates), groups };
}
