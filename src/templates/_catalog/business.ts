import type { SceneVariant } from '../catalog';

/**
 * Business (D-119): what an organisation shows — its app, its product in a
 * browser, its prices, its clients, what customers say, its people, how the
 * work gets done, its events, its feed.
 */

const business = (
  id: string,
  name: string,
  blurb: string,
  params: SceneVariant['params'],
  photos: SceneVariant['photos'],
  durationMs = 8_000,
): SceneVariant => ({ id, name, category: 'Business', family: 'business', blurb, params, photos, durationMs, isNew: true });

const NONE = { min: 0, max: 0, default: 0 } as const;

export const BUSINESS_SCENES: readonly SceneVariant[] = [
  business('biz-app-showcase', 'App Showcase', 'Your app\'s screens on phones gliding past, the middle one forward.',
    { kind: 'apps', headline: 'Everything in one app' }, { min: 3, max: 6, default: 5 }, 9_000),
  business('biz-dashboard-parade', 'Dashboard Parade', 'Browser windows of your product turn past like a coverflow.',
    { kind: 'dashboard', headline: 'See it all at a glance' }, { min: 3, max: 5, default: 4 }, 9_000),
  business('biz-case-studies', 'Case Study Windows', 'Browser windows step forward one after another over the last.',
    { kind: 'browser', headline: 'Work we are proud of' }, { min: 3, max: 5, default: 4 }, 8_000),
  business('biz-pricing', 'Pricing Plans', 'Three plans rise into place, the featured one lifted, prices counting up.',
    { kind: 'pricing', headline: 'Simple, honest pricing' }, NONE, 6_000),
  business('biz-logo-wall', 'Client Logo Wall', 'Your clients\' logos pop onto white tiles, a highlight passing over them.',
    { kind: 'logos', headline: 'Trusted by teams everywhere' }, { min: 4, max: 12, default: 8 }, 7_000),
  business('biz-testimonials', 'Testimonial Rail', 'Customer quotes slide past on cards, each with a name and photo.',
    { kind: 'testimonials', headline: 'What our customers say' }, { min: 0, max: 3, default: 3 }, 9_000),
  business('biz-team', 'Meet the Team', 'Round portraits pop into a grid, a name under each.',
    { kind: 'team', headline: 'Meet the team' }, { min: 3, max: 9, default: 6 }, 7_000),
  business('biz-speakers', 'Event Speakers', 'Your speakers, one after another, for an event or panel.',
    { kind: 'team', headline: 'Meet our speakers', names: 'Dr. Amaka Obi, James Park, Laura King, Musa Bello' }, { min: 3, max: 9, default: 4 }, 7_000),
  business('biz-hiring', 'We Are Hiring', 'The roles you are hiring for, with the faces of the team they join.',
    { kind: 'team', headline: 'We are hiring', names: 'Designer, Engineer, Sales lead, Support, Marketing, Analyst' }, { min: 3, max: 9, default: 6 }, 7_000),
  business('biz-how-it-works', 'How It Works', 'Your process step by step, each lighting up as the line reaches it.',
    { kind: 'workflow', headline: 'How it works', steps: 'Book a call, Get a plan, We build it, You launch' }, { min: 0, max: 6, default: 0 }, 8_000),
  business('biz-process-photos', 'Our Process', 'Each step of the work with a photo of it, lit in turn.',
    { kind: 'workflow', headline: 'From idea to launch', steps: 'Brief, Design, Build, Test, Launch' }, { min: 3, max: 6, default: 5 }, 8_000),
  business('biz-project-board', 'Project Board', 'Cards move across a board from To do to Done.',
    { kind: 'kanban', headline: 'Work, organised' }, { min: 4, max: 6, default: 5 }, 9_000),
  business('biz-webinar', 'Webinar Invite', 'The speaker, the slides, a LIVE badge and the date.',
    { kind: 'webinar', headline: 'Join our free webinar' }, { min: 2, max: 2, default: 2 }, 7_000),
  business('biz-social-feed', 'Social Feed', 'Your posts scroll up a feed, each with its likes.',
    { kind: 'social', headline: 'Follow along' }, { min: 3, max: 6, default: 4 }, 8_000),
  business('biz-org-chart', 'Org Chart', 'Your organisation, top to bottom, the lines drawing between people.',
    { kind: 'org', headline: 'Who does what' }, { min: 3, max: 6, default: 6 }, 7_000),
];
