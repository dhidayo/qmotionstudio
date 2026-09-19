# Motion Studio

A browser-based photo-to-motion video editor. Everything renders on your device;
nothing is uploaded to a server.

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
| `npm run thumbs` | Regenerate template posters and preview loops (needs `npm run dev`) |
| `npm run samples` | Regenerate the bundled sample photos |

## Layout

The rule that matters: **`src/core`, `src/document`, `src/templates` and
`src/media` import nothing from React, Zustand or `src/ui`.** That is what lets
the export worker import the renderer without dragging the editor in with it.
ESLint enforces it.

```
src/
  core/         render engine — pure, worker-safe
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

- **M0 — done.** Scaffold, design tokens, editor shell, artboard with correct
  aspect scaling at all five aspects.
- **M1 — done.** Render core: seven layer types, keyframe interpolation,
  easings, a baked spring solver, repeaters, blur, text layout and measurement
  cache, and a hand-written scene running at 60fps.
- **M2 — done.** Template schema and registry, six templates across three
  categories, the structural/cosmetic input split, and the lint and thumbnail
  pipelines.
- M3 — Showcase mode: template library, scrub loop, all four inspector tabs.

## Templates

Six, across three categories:

| Category | Templates |
|---|---|
| Depth Stage | Parallax Depth, Card Stack |
| Angle Stage | Fan Out, Tilt Sweep *(Pro)* |
| Kinetic Type | Statement, Phrase Swap *(Pro)* |

A template is a pure generator: `build(inputs, ctx) => Layer[]`, called once per
structural change and memoised, never per frame. Adding one is a single file
under `src/templates/<category-slug>/<id>.ts` plus a manifest entry —
`npm run lint:templates` checks the two agree.

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
