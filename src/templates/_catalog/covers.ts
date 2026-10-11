import type { SceneVariant } from '../catalog';

/**
 * Covers & Thumbnails (D-151): business post covers and video thumbnails,
 * all one composition — a bold ground, a brand mark, a heavy headline and a
 * framed photograph — with what sits under the headline changing by purpose.
 * "bp-" ids are business posts, "tn-" ids thumbnails; each group is a purpose
 * of its own in the library (D-143).
 */

const ONE_PHOTO = { min: 1, max: 1, default: 1 } as const;
const TWO_PHOTOS = { min: 2, max: 2, default: 2 } as const;

const cover = (
  id: string,
  name: string,
  blurb: string,
  look: string,
  params: SceneVariant['params'],
  photos: SceneVariant['photos'] = ONE_PHOTO,
  durationMs = 6_000,
): SceneVariant => ({
  id, name, category: 'Covers & Thumbnails', family: 'cover', blurb, params, photos, durationMs, isNew: true, look,
  // Every piece has arrived and settled by two seconds; the still is taken just after.
  posterAtMs: 2_400,
});

const BUSINESS_POSTS: readonly SceneVariant[] = [
  cover('bp-corporate-update', 'Corporate Update', 'Company news on a bold ground: the headline, a line under it and a photo framed in colour.', 'navy',
    { kind: 'update', frame: 'rounded', backing: 'block', dots: true, eyebrow: 'COMPANY NEWS', headline: 'Corporate Update', subline: 'Our plans, our people and our progress this year' }),
  cover('bp-brand-guidelines', 'Brand Guidelines', 'The cover of a brand book: the title, your colours as swatches and a photo in an arch.', 'cream',
    { kind: 'guide', frame: 'arch', backing: 'disc', dots: true, eyebrow: '2026 EDITION', headline: 'Brand Guidelines', subline: 'How we look, sound and show up' }),
  cover('bp-quarter-results', 'Q3 Report Highlights', 'Quarterly results: a big figure that counts up, and a chart card over the photo.', 'cobalt',
    { kind: 'report', frame: 'circle', backing: 'ring', dots: true, eyebrow: 'QUARTERLY RESULTS', headline: 'Q3 Report Highlights', figure: '+42%', figureNote: 'Revenue growth on last quarter' }),
  cover('bp-product-launch', 'Product Launch Info', 'A launch announcement with the date, a button and a NEW sticker on the product.', 'coral',
    { kind: 'launch', frame: 'rounded', backing: 'band', eyebrow: 'LAUNCHING 12 MAY', headline: 'Product Launch Info', subline: 'Everything you need to know before launch day', button: 'Learn more', sticker: 'NEW' }),
  cover('bp-weekly-agenda', 'Weekly Agenda', 'The week ahead, one day to a line, each ticked off as it appears.', 'paper',
    { kind: 'agenda', frame: 'circle', backing: 'disc', eyebrow: 'WEEK 23', headline: 'Weekly Agenda' }, ONE_PHOTO, 7_000),
  cover('bp-milestone', 'Milestone Celebrations', 'A milestone worth sharing: the number, what it means and confetti falling.', 'emerald',
    { kind: 'milestone', frame: 'circle', backing: 'ring', eyebrow: 'THANK YOU', headline: 'Milestone Celebrations', figure: '10K', figureNote: 'happy customers and counting' }),
  cover('bp-marketing-strategy', 'Marketing Strategy', 'Your plan in numbered pillars beside a photo in an arch.', 'sky',
    { kind: 'pillars', frame: 'arch', backing: 'block', dots: true, eyebrow: '2026 PLAN', headline: 'Marketing Strategy', pillars: 'Brand, Content, Social, Growth' }),
  cover('bp-pitch-deck', 'Annual Pitch Deck', 'The title slide of your deck: a strong title, one line and a photo filling one side.', 'midnight',
    { kind: 'deck', frame: 'bleed', backing: 'band', eyebrow: 'INVESTOR PRESENTATION', headline: 'Annual Pitch Deck', subline: 'Vision, traction and the road ahead', footer: 'Presented by Your Company · 2026' }),
];

const THUMBNAILS: readonly SceneVariant[] = [
  cover('tn-youtube-bold', 'YouTube Bold', 'A loud video thumbnail: huge words, a highlighted phrase and your photo in a frame.', 'sunshine',
    { kind: 'youtube', frame: 'rounded', backing: 'disc', dots: true, headline: 'Marketing Tips', highlight: 'That Work', brand: 'Your Channel' }),
  cover('tn-podcast-episode', 'Podcast Episode', 'An episode cover: host and guest in circles, the title and a sound wave that keeps moving.', 'orchid',
    { kind: 'podcast', frame: 'circle', backing: 'ring', eyebrow: 'EPISODE 24', headline: 'Building a Brand from Zero', guest: 'with Amaka Obi', brand: 'The Growth Show', footer: 'Listen on all podcast apps' }, TWO_PHOTOS),
  cover('tn-how-to', 'How-To Tutorial', 'A tutorial thumbnail: HOW TO, the skill and the steps, numbered in order.', 'cobalt',
    { kind: 'tutorial', frame: 'rounded', backing: 'block', dots: true, eyebrow: 'HOW TO', headline: 'Edit Videos Like a Pro', steps: 'Plan, Shoot, Edit', brand: 'Your Channel', footer: 'Full tutorial · 12 minutes' }),
  cover('tn-top-five', 'Top 5 List', 'A countdown cover: TOP 5, the topic and five numbered lines.', 'coral',
    { kind: 'top', frame: 'arch', backing: 'disc', eyebrow: 'TOP 5', headline: 'Habits of Productive Teams', brand: 'Your Channel' }, ONE_PHOTO, 7_000),
  cover('tn-versus', 'This vs That', 'Two photos face to face, VS stamped between them and the question above.', 'navy',
    { kind: 'versus', headline: 'Which One Wins?', first: 'Freelance', second: 'Agency', brand: 'Your Channel', footer: 'Watch the full comparison' }, TWO_PHOTOS),
  cover('tn-day-in-life', 'Day in the Life', 'A vlog cover: a print taped down at an angle and the day in big type.', 'linen',
    { kind: 'vlog', frame: 'tilt', backing: 'disc', dots: true, eyebrow: 'NEW VLOG', headline: 'A Day in the Life of a Founder', subline: 'Real routines and honest moments', brand: 'Your Channel', footer: 'New video every Sunday' }),
  cover('tn-course-cover', 'Course Cover', 'An online course cover: the title, what it includes and an enrol button.', 'emerald',
    { kind: 'course', frame: 'arch', backing: 'block', dots: true, eyebrow: 'ONLINE COURSE', headline: 'Master Digital Marketing', details: '12 lessons, 4 hours, Certificate', button: 'Enrol now', footer: 'yourcompany.com/courses' }),
  cover('tn-live-now', 'Live Now', 'A live-stream cover: a pulsing LIVE badge, the topic, the time and rings round the host.', 'midnight',
    { kind: 'live', frame: 'circle', backing: 'disc', headline: 'Ask Me Anything', subline: 'Bring your questions about growing a business', when: 'Today · 7 PM GMT', brand: 'Your Channel', footer: 'youtube.com/@yourchannel' }),
];

export const COVER_SCENES: readonly SceneVariant[] = [...BUSINESS_POSTS, ...THUMBNAILS];
