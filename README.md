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

## Milestone status

- **M0 — done.** Scaffold, design tokens, editor shell, artboard with correct
  aspect scaling at all five aspects.
- M1 — render core: layer types, keyframes, easings, spring, repeaters, text
  measurement cache.

## Debugging

`?frozen=<ms>` parks the playhead at an exact time instead of playing — used by
the visual tests, and by M4 to compare preview against export at identical
times.
