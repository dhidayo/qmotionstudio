/**
 * What the landing page fetches once it is up (D-175): the hero's renderer
 * and the showcase's table, as one chunk.
 *
 * One rather than two on purpose. Both share the studio's own modules (the
 * renderer, the template table), and the build gives each different set of
 * sharers a chunk of its own: two lazy chunks here split the studio's code
 * into three more pieces, three more requests on the studio's cold load —
 * about 0.7s of a phone on Fast 3G. One lazy chunk keeps it to one.
 */
export { startHero, type HeroDesign, type HeroPlayer } from './heroRender';
export { SHOWCASE_FILTERS, libraryCount, showcaseCards, type ShowcaseCard, type ShowcaseFilter } from './showcaseData';
