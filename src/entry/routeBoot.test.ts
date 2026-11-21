import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { SESSION_KEY } from './session';
import { PAGE_PATHS, cloudflareHeaders, cloudflareRedirects, apacheHtaccess, headersFor } from '../../deploy/headers';

/**
 * `public/route-boot.js` decides, before anything draws, whether an address
 * is the landing page or the studio (D-175). A plain script, so it is run
 * here as the page runs it, with a pretend location, storage and history.
 */

const SOURCE = readFileSync(new URL('../../public/route-boot.js', import.meta.url), 'utf8');

type Run = { route: string | undefined; url: string; stored: Map<string, string> };

function run(url: string, stored: Record<string, string> = {}): Run {
  const parsed = new URL(url, 'https://example.test');
  const store = new Map(Object.entries(stored));
  let current = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  const dataset: Record<string, string> = {};
  const fake = {
    location: { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    },
    history: { state: null, replaceState: (_s: unknown, _t: string, next: string) => { current = next; } },
    document: { documentElement: { dataset }, getElementById: () => null, head: { appendChild: () => undefined } },
    URLSearchParams,
    JSON,
    Date,
  };
  runInNewContext(SOURCE, fake);
  return { route: dataset['route'], url: current, stored: store };
}

const SIGNED_IN = { [SESSION_KEY]: '{"kind":"device","since":1}' };

describe('the address decides the page (D-175)', () => {
  it('shows the landing page at / to someone not signed in', () => {
    expect(run('/')).toMatchObject({ route: 'landing', url: '/' });
  });

  it('sends a signed-in visit to / straight on to the studio', () => {
    expect(run('/', SIGNED_IN)).toMatchObject({ route: 'studio', url: '/studio' });
  });

  it('opens the studio at /studio, and signs in on this device as Open Studio does', () => {
    const result = run('/studio');
    expect(result.route).toBe('studio');
    expect(result.stored.has(SESSION_KEY)).toBe(true);
    expect(run('/studio/').route).toBe('studio');
  });

  it('opens every deep link in the studio, at / or /studio, without signing in', () => {
    for (const query of ['?template=flow-polaroid-pass', '?aspect=1:1', '?frozen=1200', '?thumb=320', '?scene=demo', '?perf=1']) {
      const atRoot = run(`/${query}`);
      expect(atRoot.route, query).toBe('studio');
      expect(atRoot.url, query).toBe(`/studio${query}`);
      expect(atRoot.stored.has(SESSION_KEY), query).toBe(false);
      expect(run(`/studio${query}`).route, query).toBe('studio');
      expect(run(`/studio${query}`).stored.has(SESSION_KEY), query).toBe(false);
    }
  });

  it('knows every parameter the editor reads (src/dev/renderParams.ts)', () => {
    const editor = readFileSync(new URL('../dev/renderParams.ts', import.meta.url), 'utf8');
    const read = [...editor.matchAll(/params\.get\('([a-z]+)'\)/g)].map((m) => m[1]);
    expect(read.length).toBeGreaterThan(0);
    for (const name of read) expect(run(`/?${name}=1`).route, name).toBe('studio');
  });

  it('shows the landing page at an address the app does not have', () => {
    expect(run('/nowhere')).toMatchObject({ route: 'landing', url: '/' });
  });

  it('opens the landing page when storage cannot be read', () => {
    const parsed = { pathname: '/', search: '', hash: '' };
    const dataset: Record<string, string> = {};
    runInNewContext(SOURCE, {
      location: parsed,
      localStorage: { getItem: () => { throw new Error('blocked'); } },
      history: { replaceState: () => undefined },
      document: { documentElement: { dataset }, getElementById: () => null },
      URLSearchParams,
    });
    expect(dataset['route']).toBe('landing');
  });
});

describe('every host serves the page at /studio (D-175)', () => {
  it('names both pages', () => {
    expect(PAGE_PATHS).toEqual(['/', '/studio']);
  });

  it('sends the page’s own headers for /studio, never cached', () => {
    expect(headersFor('/studio')['Cache-Control']).toBe('no-cache');
    expect(headersFor('/studio?template=x')['Cache-Control']).toBe('no-cache');
    expect(cloudflareHeaders()).toContain('/studio\n  Cache-Control: no-cache');
  });

  it('rewrites /studio to the page on Cloudflare, Netlify and Apache', () => {
    expect(cloudflareRedirects()).toContain('/studio /index.html 200');
    expect(apacheHtaccess()).toContain('RewriteRule ^ /index.html [L]');
  });
});
