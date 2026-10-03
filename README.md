# Q Motion Studio

A browser-based photo-to-motion video editor. Everything renders on your device;
nothing is uploaded to a server.

Two ways to work:

- **Lifestyle** — one looping scene from a designed template: reels, posts,
  moments. (Called Showcase in the spec and in saved documents.)
- **Corporate Ads** — several scenes with transitions, layers, a logo, music
  and timeline effects. (Motion Ads in the spec.)

Both have the **Motion** panel — how strongly and with what feel a template's
animation plays, per scene and per element — and the **effects library**:
38 whole-picture effects (snow, sparkles, light leaks, lightning, camera
shake, film looks…) and 40 element effects (entrances, exits, emphasis,
shine and glow), all drawn by the same renderer as the export. See
DECISIONS.md D-100 – D-105.

- **[BUILD-SPEC.md](BUILD-SPEC.md)** — the contract for the build.
- **[DECISIONS.md](DECISIONS.md)** — every architectural choice, its reason, and
  what was rejected. Read this before changing anything in `src/core`.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck, then production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, including the worker-safety import boundary |
| `npm test` | Vitest unit tests |
| `npm run e2e` | Playwright visual regression |
| `npm run lint:templates` | Validate templates and check manifest agreement |
| `npm run e2e:prod` | The same suite against the production build (`npm run build` first) |
| `npm run thumbs` | Regenerate template posters and preview loops (needs `npm run dev`) |
| `npm run samples` | Regenerate the bundled sample photos |
| `npm run brand` | Cut the favicon, app icons and top-bar mark from `brand/q-source-dark.webp` |
| `npm run measure:load` | Cold load on Fast 3G against §14's 2.5s budget (needs `npm run preview`) |

## Layout

The rule that matters: **`src/core`, `src/document`, `src/templates` and
`src/media` import nothing from React, Zustand or `src/ui`.** That is what lets
the export worker import the renderer without dragging the editor in with it.
ESLint enforces it.

```
src/
  core/         render engine — pure, worker-safe
  core/effects/ the effects library: frame and element effects, all pure
  document/     the Project model and derived selectors
  templates/    template schema, registry, build context
  media/        image/video/audio decode and the media store
  state/        Zustand editor state
  export/       encode + mux pipeline and its worker
  capabilities/ native → wasm → remote provider resolution
  entitlements/ free/pro limits (stubbed in v1)
  ui/           all React lives here
```

## Fonts

Archivo (headline) and Inter (body), both variable, both SIL OFL 1.1 — licences
ship in `public/fonts`. They are self-hosted and load through explicit
`FontFace` objects before the first frame, because a frame measured against the
wrong face stays wrong for the life of the measurement cache (§3E).

The `latin` subsets block first paint (83KB); `latin-ext` is deferred until the
user types something that needs it. See DECISIONS.md D-026.

## Milestone status

M0 – M8 are done: render core, templates, Lifestyle (Showcase), export,
Corporate Ads (Motion Ads) with sequencing, transitions, layers and music,
persistence, entitlements and the PWA. Since then: direct manipulation on the
canvas, motion paths, Soft Pop, the scene picker and project management, and
the effects library, Motion properties and timeline editing (D-100 – D-105).

## Templates

Thirty-two, plus Blank:

| Category | Templates |
|---|---|
| Story Ads (multi-scene) | Launch Story, Product Drop, Proof Reel, Quick Pitch, Social Post, Soft Showcase |
| Soft Pop | Float Away, Scatter, Blowout, Fizzle, Flip Out, Dream Fade |
| Depth Stage | Parallax Depth, Card Stack, Depth Tunnel, Spotlight, Pull Focus |
| Angle Stage | Fan Out, Tilt Sweep, Cascade, Flip Cards, Pinwheel |
| Kinetic Type | Statement, Phrase Swap, Big Number, List Drop, Pull Quote |
| Split Frame | Split Pair, Contact Sheet, Side Band, Panels, Picture in Picture |

A template is a pure generator: `build(inputs, ctx) => Layer[]`, called once per
structural change and memoised, never per frame. Adding one is a single file
under `src/templates/<category-slug>/<id>.ts` plus a manifest entry —
`npm run lint:templates` checks the two agree. Templates never draw the logo
(the renderer does, D-101) and never know about effects or Motion properties,
which are applied after the build.

## Debugging

`?frozen=<ms>` parks the playhead at an exact time instead of playing — used by
the visual tests, and by M4 to compare preview against export at identical
times.

Other steering parameters (see `src/dev/renderParams.ts`):

| Parameter | Effect |
|---|---|
| `?template=<id>` | Render a specific template |
| `?scene=demo` | The M1 render-core fixture |
| `?scene=placeholder` | The M0 aspect test card |
| `?aspect=16:9` | Force an aspect |
| `?thumb=<px>` | Pin the preview's short edge, for thumbnail capture |

These exist so `npm run thumbs` can drive the real app rather than
reimplementing the renderer.

In dev, `window.__motionStudio.stats` exposes the live renderer counters
(`frameCount`, `buildCount`, `lastFrameMs`, `lastBuildMs`).
