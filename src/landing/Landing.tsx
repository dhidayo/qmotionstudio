import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { TIER_SWITCHABLE, getLimits } from '@/entitlements';
import { applyThemeChoice, followSystemTheme, readThemeChoice, resolveTheme, type Theme } from '@/entry/theme';
import { openStudio, prefetchStudio, whenSettled } from './enter';
import type { HeroPlayer } from './lazy';
import type * as Lazy from './lazy';
import type { ShowcaseCard, ShowcaseFilter } from './lazy';
import './landing.css';

/**
 * The landing page (D-175), in Soft editorial · Clay at full warmth (D-174).
 *
 * The owner: "This app should normally have a landing page which will market
 * the app … I should be able to click on Open Studio, or some CTA on the
 * header section to begin design." It is for the person deciding whether to
 * make something here, and it shows rather than lists: the hero is the app's
 * own renderer playing two real designs, and every design on the page opens
 * in the studio. Every sentence is something the product does today; what is
 * coming says so. Privacy is said as how it works today, not as a promise,
 * because accounts and shared storage are planned (D-174).
 *
 * Built for the phones it will be read on: no animation library, the stills
 * first and the moving picture once the page is up, the library's table only
 * as the designs come near, and every motion still for "reduce motion".
 */

const THUMB = (id: string, aspect: string): string => `/thumbs/${id}.${aspect.replace(':', 'x')}.webp?v=4`;

export function Landing(): React.JSX.Element {
  // The studio's code, fetched once this page is drawn and settled, so Open Studio opens at once.
  useEffect(() => prefetchStudio(), []);
  return (
    <div className="lp">
      <a href="#main" className="lp-skip">Skip to content</a>
      <Header />
      <main id="main" tabIndex={-1}>
        <Hero />
        <HowItWorks />
        <Showcase />
        <Modes />
        <Features />
        <Today />
        <Pricing />
        <LastCall />
      </main>
      <Footer />
    </div>
  );
}

/* ── Small shared pieces ─────────────────────────────────────────────────── */

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = (): void => { setReduced(query.matches); };
    query.addEventListener('change', changed);
    return () => { query.removeEventListener('change', changed); };
  }, []);
  return reduced;
}

/** Whether the element is on screen, for starting and stopping what moves. */
function useOnScreen<T extends Element>(margin = '0px'): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') { setOn(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => { setOn(entry?.isIntersecting === true); }, { rootMargin: margin });
    observer.observe(el);
    return () => { observer.disconnect(); };
  }, [margin]);
  return [ref, on];
}

/**
 * A section rises into place the first time it comes on screen: the order
 * the page is read in, said once. With an observer, not a scroll listener,
 * and not at all under reduced motion (landing.css).
 */
function Reveal({ children, className = '', as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'li' }): React.JSX.Element {
  const ref = useRef<HTMLDivElement & HTMLLIElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') { setShown(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting !== true) return;
      setShown(true);
      observer.disconnect();
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    observer.observe(el);
    return () => { observer.disconnect(); };
  }, []);
  const Tag = as;
  return <Tag ref={ref} className={`lp-reveal ${shown ? 'is-in' : ''} ${className}`}>{children}</Tag>;
}

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(readThemeChoice()));
  useEffect(() => followSystemTheme(setTheme), []);
  const toggle = useCallback(() => { setTheme(applyThemeChoice(theme === 'dark' ? 'light' : 'dark')); }, [theme]);
  return [theme, toggle];
}

function ThemeButton({ className = '' }: { className?: string }): React.JSX.Element {
  const [theme, toggle] = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} className={`lp-iconbtn ${className}`}>
      {theme === 'dark' ? (
        <svg aria-hidden width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
        </svg>
      ) : (
        <svg aria-hidden width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  );
}

function Arrow(): React.JSX.Element {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="lp-arrow">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Open Studio: in the header, the hero and the last call alike. */
function OpenStudio({ tone = 'accent', className = '' }: { tone?: 'accent' | 'ink'; className?: string }): React.JSX.Element {
  return (
    <button
      type="button"
      data-open-studio
      onClick={() => { openStudio(); }}
      className={`ui-btn lp-cta ${tone === 'ink' ? 'lp-cta--ink' : 'ui-btn--primary'} ${className}`}
    >
      Open Studio
      {tone === 'accent' && <Arrow />}
    </button>
  );
}

function Mark({ size = 28 }: { size?: number }): React.JSX.Element {
  return <img src="/favicon.svg" alt="" width={size} height={size} className="lp-mark" />;
}

/* ── Header ──────────────────────────────────────────────────────────────── */

function Header(): React.JSX.Element {
  return (
    <header className="lp-header">
      <nav className="lp-nav glass" aria-label="Main">
        <a href="#main" className="lp-brand" aria-label="Q Motion Studio, top of the page">
          <Mark />
          <span>Q Motion Studio</span>
        </a>
        <ul className="lp-links">
          <li><a href="#designs">Templates</a></li>
          <li><a href="#how">How it works</a></li>
          <li><a href="#pricing">Pricing</a></li>
        </ul>
        <div className="lp-nav-end">
          <ThemeButton className="lp-hide-sm" />
          <button type="button" data-sign-in onClick={() => { openStudio(); }} className="ui-btn ui-btn--quiet lp-signin">
            Sign in
          </button>
          <OpenStudio tone="ink" />
        </div>
      </nav>
    </header>
  );
}

/* ── Hero ────────────────────────────────────────────────────────────────── */

const HERO_DESIGNS = [
  { templateId: 'flow-polaroid-pass', aspect: '9:16' },
  { templateId: 'tn-youtube-bold', aspect: '1:1' },
] as const;

const STRIP = ['pd-spotlight', 'halo-breathe', 'quick-pitch', 'tile-pulse', 'bp-brand-guidelines'] as const;

type NetworkInformation = { readonly saveData?: boolean; readonly effectiveType?: string };

/** The moving picture is worth its download on most connections, not on one the person asked to spare. */
function canAnimate(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  return connection?.saveData !== true && !['slow-2g', '2g'].includes(connection?.effectiveType ?? '4g');
}

function Hero(): React.JSX.Element {
  return (
    <section className="lp-hero lp-wrap" aria-labelledby="hero-title">
      <div className="lp-hero-copy">
        <p className="lp-eyebrow">Photo to motion, in your browser</p>
        <h1 id="hero-title" className="lp-display">
          Your photos, <em>moving</em> in minutes.
        </h1>
        <p className="lp-lede">
          Pick a design, add your photos and export a post or a video that moves. No editing skills needed.
        </p>
        <div className="lp-actions">
          <OpenStudio />
          <a href="#designs" className="ui-btn ui-btn--secondary lp-cta">Browse designs</a>
        </div>
      </div>
      <HeroStage />
    </section>
  );
}

function HeroStage(): React.JSX.Element {
  const reduced = useReducedMotion();
  const [stage, onScreen] = useOnScreen<HTMLDivElement>();
  const tall = useRef<HTMLCanvasElement>(null);
  const square = useRef<HTMLCanvasElement>(null);
  const [player, setPlayer] = useState<HeroPlayer | null>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');

  useEffect(() => {
    const changed = (): void => { setVisible(document.visibilityState === 'visible'); };
    document.addEventListener('visibilitychange', changed);
    return () => { document.removeEventListener('visibilitychange', changed); };
  }, []);

  // The renderer once the page has loaded: the stills are already showing.
  useEffect(() => {
    if (!canAnimate()) return undefined;
    let alive = true;
    let made: HeroPlayer | null = null;
    const start = (): void => {
      const canvases = [tall.current, square.current].filter((c): c is HTMLCanvasElement => c !== null);
      import('./lazy')
        .then(({ startHero }) => startHero(canvases, HERO_DESIGNS))
        .then((p) => {
          made = p;
          if (alive) setPlayer(p);
          else p.dispose();
        })
        .catch((error: unknown) => {
          // The stills stay: the page is whole without the moving picture.
          console.warn('Q Motion Studio: the landing picture stayed still.', error);
        });
    };
    const cancel = whenSettled(start, 1_500);
    return () => {
      alive = false;
      cancel();
      made?.dispose();
    };
  }, []);

  const playing = player !== null && !reduced && !paused && onScreen && visible;
  useEffect(() => { player?.setPlaying(playing); }, [player, playing]);

  const drawn = player !== null;
  return (
    <div ref={stage} className="lp-stage" data-hero data-hero-playing={playing ? 'true' : 'false'}>
      <figure className="lp-frame lp-frame--tall" aria-label="A gallery design for a phone, made in Q Motion Studio">
        <img src={THUMB('flow-polaroid-pass', '9:16')} alt="" width={270} height={480} />
        <canvas ref={tall} aria-hidden data-hero-canvas className={drawn ? 'is-drawn' : ''} />
      </figure>
      <figure className="lp-frame lp-frame--square" aria-label="A video thumbnail design, made in Q Motion Studio">
        <img src={THUMB('tn-youtube-bold', '1:1')} alt="" width={240} height={240} />
        <canvas ref={square} aria-hidden data-hero-canvas className={drawn ? 'is-drawn' : ''} />
      </figure>
      <p className="lp-float lp-float--a glass" aria-hidden>
        <span className="lp-dot" /> <b>Exported</b> 1080p MP4
      </p>
      <p className="lp-float lp-float--b glass" aria-hidden>Stickers, sounds and text</p>
      <div className="lp-strip glass" aria-hidden>
        {STRIP.map((id) => <img key={id} src={THUMB(id, '1:1')} alt="" width={64} height={64} loading="lazy" decoding="async" />)}
      </div>
      {drawn && !reduced && (
        <button
          type="button"
          className="lp-pause"
          data-hero-pause
          aria-pressed={paused}
          onClick={() => { setPaused((p) => !p); }}
        >
          <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
            {paused ? <path d="M8 5.5v13l10.5-6.5z" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />}
          </svg>
          {paused ? 'Play' : 'Pause'}
          <span className="sr-only"> the moving designs</span>
        </button>
      )}
    </div>
  );
}

/* ── How it works ────────────────────────────────────────────────────────── */

function HowItWorks(): React.JSX.Element {
  return (
    <section id="how" className="lp-section lp-wrap" aria-labelledby="how-title">
      <Reveal>
        <h2 id="how-title" className="lp-h2">Three steps from photo to post.</h2>
      </Reveal>
      <ol className="lp-steps">
        <Reveal as="li" className="lp-step">
          <div className="lp-step-art lp-fan" aria-hidden>
            {(['bp-brand-guidelines', 'pd-spotlight', 'flow-polaroid-pass'] as const).map((id) => (
              <img key={id} src={THUMB(id, '4:5')} alt="" width={96} height={120} loading="lazy" decoding="async" />
            ))}
          </div>
          <h3>Pick a design</h3>
          <p>Start from one made for what you need to say: a sale, a new hire, a product, a set of photos.</p>
        </Reveal>
        <Reveal as="li" className="lp-step">
          <div className="lp-step-art lp-photos" aria-hidden>
            {(['bloom', 'dusk', 'ember'] as const).map((name) => (
              <img key={name} src={`/samples/${name}.webp`} alt="" width={84} height={84} loading="lazy" decoding="async" />
            ))}
          </div>
          <h3>Add your photos</h3>
          <p>Drop them in. The design places, crops and moves them. Change any word, colour or photo.</p>
        </Reveal>
        <Reveal as="li" className="lp-step">
          <div className="lp-step-art lp-export" aria-hidden>
            <img src={THUMB('quick-pitch', '9:16')} alt="" width={68} height={120} loading="lazy" decoding="async" />
            <span className="lp-file"><b>MP4</b> 1080 × 1920</span>
            <span className="lp-file"><b>PNG</b> 1080 × 1350</span>
          </div>
          <h3>Export</h3>
          <p>Save a picture for a post or a thumbnail, or a video for Reels, TikTok and Stories.</p>
        </Reveal>
      </ol>
    </section>
  );
}

/* ── The designs ─────────────────────────────────────────────────────────── */

type ShowcaseModule = typeof Lazy;

function Showcase(): React.JSX.Element {
  const [near, setNear] = useState(false);
  const [box, on] = useOnScreen<HTMLElement>('600px 0px');
  const [data, setData] = useState<ShowcaseModule | null>(null);
  const [filter, setFilter] = useState('all');
  const [failed, setFailed] = useState(false);

  useEffect(() => { if (on) setNear(true); }, [on]);
  useEffect(() => {
    if (!near || data !== null) return;
    import('./lazy').then(setData).catch(() => { setFailed(true); });
  }, [near, data]);

  const filters: readonly ShowcaseFilter[] = data?.SHOWCASE_FILTERS ?? [];
  const cards: readonly ShowcaseCard[] = data?.showcaseCards(filter) ?? [];

  return (
    <section id="designs" ref={box} className="lp-section lp-wrap" aria-labelledby="designs-title">
      <Reveal>
        <h2 id="designs-title" className="lp-h2">Designs for what you need to say.</h2>
        <p className="lp-sub">
          {data ? `${data.libraryCount()} designs and videos, ` : 'Designs and videos, '}
          grouped by what they are for. Open any of them in the studio.
        </p>
      </Reveal>
      <div className="lp-filters" role="group" aria-label="Show designs for">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => { setFilter(f.id); }}
            className={`ui-chip lp-filter ${filter === f.id ? 'chip-on' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {failed ? (
        <p className="lp-sub" role="status">The designs did not load. They are all in the studio.</p>
      ) : (
        <ul className="lp-grid" aria-busy={data === null} data-showcase>
          {data === null
            ? Array.from({ length: 8 }, (_, i) => <li key={i} className="lp-card lp-card--wait" aria-hidden />)
            : cards.map((c) => <DesignCard key={c.id} card={c} />)}
        </ul>
      )}
    </section>
  );
}

function DesignCard({ card }: { card: ShowcaseCard }): React.JSX.Element {
  const search = `?template=${encodeURIComponent(card.id)}&aspect=${encodeURIComponent(card.aspect)}`;
  return (
    <li className="lp-card">
      <a
        href={`/studio${search}`}
        data-design-link={card.id}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          openStudio(search);
        }}
      >
        <span className={`lp-card-pic ${card.video ? 'is-tall' : ''}`}>
          <img src={card.still} alt="" loading="lazy" decoding="async" />
          {card.pro && <span className="lp-pro">Pro</span>}
        </span>
        <span className="lp-card-name">{card.name}</span>
        <span className="lp-card-purpose">{card.video ? 'Video' : card.purpose.replace(/&/g, 'and')}</span>
        <span className="sr-only">, open in the studio</span>
      </a>
    </li>
  );
}

/* ── Image and Video ─────────────────────────────────────────────────────── */

function Modes(): React.JSX.Element {
  return (
    <section className="lp-section lp-wrap" aria-labelledby="modes-title">
      <Reveal>
        <h2 id="modes-title" className="lp-h2">An image or a video. You choose.</h2>
      </Reveal>
      <div className="lp-modes">
        <Reveal className="lp-mode lp-mode--image">
          <div className="lp-mode-copy">
            <h3>Image</h3>
            <p>One design that plays once and rests on its picture. Save it as a PNG or JPEG, sized for a post, a thumbnail or a cover.</p>
            <p className="lp-mode-foot">Posts, thumbnails and covers</p>
          </div>
          <img src={THUMB('bp-milestone', '4:5')} alt="An image design: a business post" width={240} height={300} loading="lazy" decoding="async" />
        </Reveal>
        <Reveal className="lp-mode lp-mode--video">
          <div className="lp-mode-copy">
            <h3>Video</h3>
            <p>Scenes in order, with sound and transitions between them. Export an MP4 up to 1080p for any feed.</p>
            <p className="lp-mode-foot">Reels, TikTok, Stories and ads</p>
          </div>
          <img src={THUMB('story-big-news', '9:16')} alt="A video design: a news announcement" width={180} height={320} loading="lazy" decoding="async" />
        </Reveal>
      </div>
    </section>
  );
}

/* ── What is in the studio ───────────────────────────────────────────────── */

function Features(): React.JSX.Element {
  return (
    <section className="lp-section lp-wrap" aria-labelledby="features-title">
      <Reveal>
        <h2 id="features-title" className="lp-h2">What is in the studio.</h2>
      </Reveal>
      <div className="lp-bento">
        <Reveal className="lp-tile lp-tile--wide lp-tile--picture">
          <div>
            <h3>Stickers and elements</h3>
            <p>Shapes, arrows, badges and stickers to drop on any design, each with its own way in and out.</p>
          </div>
          <img src={THUMB('el-eyebrow-title', '1:1')} alt="" width={200} height={200} loading="lazy" decoding="async" />
        </Reveal>
        <Reveal className="lp-tile lp-tile--warm">
          <h3>Sounds</h3>
          <p>A library of sounds made for short videos, or your own, trimmed to fit.</p>
          <span className="lp-wave" aria-hidden>{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ height: `${28 + Math.round(60 * Math.abs(Math.sin(i * 1.7)))}%` }} />)}</span>
        </Reveal>
        <Reveal className="lp-tile">
          <h3>Every part editable</h3>
          <p>Each word, colour and photo in a design is yours to move, resize and restyle.</p>
        </Reveal>
        <Reveal className="lp-tile">
          <h3>Works offline</h3>
          <p>Once it has opened, the studio keeps working without a connection, and saves as you go. Install it like an app.</p>
        </Reveal>
        <Reveal className="lp-tile lp-tile--ink">
          <h3>Made for everyone</h3>
          <p>Keyboard shortcuts, screen reader labels, clear contrast in light and dark, and less motion when you ask for it.</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ── How it works today ──────────────────────────────────────────────────── */

function Today(): React.JSX.Element {
  return (
    <section className="lp-section lp-wrap" aria-labelledby="today-title">
      <Reveal className="lp-today">
        <h2 id="today-title" className="lp-h2">How it works today.</h2>
        <p>
          Everything happens in your browser. Your photos and designs are kept on this device, and nothing is uploaded
          to make or export them.
        </p>
        <p>
          Accounts are on the way, with storage to keep designs online and work on them with others. When they arrive,
          you will choose what goes online.
        </p>
      </Reveal>
    </section>
  );
}

/* ── Pricing ─────────────────────────────────────────────────────────────── */

function Pricing(): React.JSX.Element {
  // From the plans themselves (src/entitlements), so the page and the studio never disagree.
  const free = getLimits('free', 'motionAd');
  const pro = getLimits('pro', 'motionAd');
  const seconds = (ms: number): string => (ms >= 60_000 ? `${ms / 60_000} minute${ms === 60_000 ? '' : 's'}` : `${ms / 1_000} seconds`);
  return (
    <section id="pricing" className="lp-section lp-wrap" aria-labelledby="pricing-title">
      <Reveal>
        <h2 id="pricing-title" className="lp-h2">Pricing.</h2>
        <p className="lp-sub">Free while Q Motion Studio is in its test release. Pro is coming.</p>
      </Reveal>
      <div className="lp-plans">
        <Reveal className="lp-plan lp-plan--free">
          <h3>Free</h3>
          <p className="lp-price">Everything, for now</p>
          <ul>
            <li>Every free design, in Image and Video</li>
            <li>Images up to {free.maxImageShortEdge} pixels on the short side</li>
            <li>Videos up to {seconds(free.maxDurationMs)}</li>
            <li>A small mark on what you export</li>
            {/* Only while the plan can be switched (D-122): then it is true. */}
            {TIER_SWITCHABLE && <li>While the test release lasts, switch Pro on from your account menu to try all of it</li>}
          </ul>
          <OpenStudio />
        </Reveal>
        <Reveal className="lp-plan lp-plan--pro">
          <h3>Pro</h3>
          <p className="lp-price">Coming</p>
          <ul>
            <li>Pro designs</li>
            <li>Your own video clips in a design</li>
            <li>Images up to {pro.maxImageShortEdge} pixels, for 4K and print</li>
            <li>Videos up to {seconds(pro.maxDurationMs)}</li>
            <li>No mark on what you export</li>
          </ul>
          <p className="lp-plan-note">Prices when Pro arrives.</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Last call and footer ────────────────────────────────────────────────── */

function LastCall(): React.JSX.Element {
  return (
    <section className="lp-section lp-wrap" aria-labelledby="last-title">
      <Reveal className="lp-last">
        <h2 id="last-title" className="lp-display lp-display--sm">Make your first one now.</h2>
        <p>It opens in your browser. Nothing to install.</p>
        <OpenStudio />
      </Reveal>
    </section>
  );
}

function Footer(): React.JSX.Element {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-row">
        <div className="lp-brand lp-brand--static">
          <Mark size={24} />
          <span>Q Motion Studio</span>
        </div>
        <nav aria-label="Footer">
          <ul className="lp-footer-links">
            <li><a href="#designs">Templates</a></li>
            <li><a href="#how">How it works</a></li>
            <li><a href="#pricing">Pricing</a></li>
          </ul>
        </nav>
        <ThemeButton />
      </div>
      <p className="lp-wrap lp-small">
        Q Motion Studio is in development. Features may change, so export anything you want to keep.
      </p>
    </footer>
  );
}
