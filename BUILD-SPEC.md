# BUILD SPEC — Motion Studio

A browser-based photo-to-motion video editor with two modes: **Showcase** (single
looping scene) and **Motion Ads** (multi-scene sequences with a timeline and music).

This document is the contract for the build. Read it in full before writing code.
If anything here is ambiguous or turns out to be wrong in practice, stop and say so
rather than improvising around it.

---

## 1. Product overview

### 1.1 Showcase mode
The user picks a template from a categorised library, drops in 1–N photos, edits
text, logo and look, and gets a short looping motion clip (default ~10s, max 60s)
which they export as MP4 or WebM.

- Template library grouped by category, with search, a free/pro filter and favourites.
- Single scene. Loops. Scrubbable via a simple slider, not a track timeline.
- Variable photo count per template, within the template's declared min/max.
- Per-photo controls: frame ratio, size mode, crop mode.

### 1.2 Motion Ads mode
The user picks a multi-scene template (typically 7–10 scenes, 15–35s), fills the
scenes with their own content, optionally adds overlay layers and a music track,
and exports a longer ad.

- Scenes play sequentially with transitions between them.
- A track timeline showing overlay layers (L1, L2, …) plus a dedicated music track.
- Overlay layers can be photo, text or custom media, each with its own time range.
- Free tier capped at 15 seconds of output; Pro removes the cap.

### 1.3 Shared
- Aspect presets: 16:9, 4:3, 1:1, 4:5, 9:16. Switching re-lays-out, it does not crop.
- Right-hand inspector with four tabs: **Photos**, **Text**, **Logo**, **Look**.
- Light/dark theme toggle.
- Export to MP4 (H.264 + AAC) and WebM (VP9 + Opus).
- Undo/redo across all document edits.
- Autosave. Reloading the tab must not lose work.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Project** | The whole document the user is editing. |
| **Scene** | One template instance with a duration. Showcase = 1 scene. Motion Ad = many. |
| **Overlay** | A user-added element (photo/text/custom media) placed freely on the global timeline, independent of scenes. |
| **Layer** | A drawable primitive produced by a template's `build()` or by an overlay. |
| **Slot** | A named hole in a template that user content fills (photo slot, text slot, logo slot). |
| **Track** | A horizontal row in the Motion Ads timeline holding overlays or audio. |
| **Look** | Palette, background treatment and global style modifiers for a scene. |

---

## 3. Non-negotiable architecture decisions

Do not deviate from any of these without asking first.

**A. One pure render function.**
```ts
renderFrame(ctx: CanvasRenderingContext2D, project: Project, globalTimeMs: number): void
```
Deterministic, no side effects, no reads from React state or the DOM. Preview drives
it from `requestAnimationFrame` with wall-clock time; export drives it from a fixed
timestep loop. The moment these two paths diverge, exports stop matching previews.

**B. Templates are pure generator functions.**
```ts
build(inputs: SceneInputs, ctx: BuildContext): Layer[]
```
Called once per (template, inputs, aspect) change and memoised — **never per frame**.
This is what lets one template serve 3 photos or 8 photos. A template must never
require a change to the renderer. If you find yourself special-casing the renderer
for one template, the schema is wrong: stop and tell me.

**C. Scenes and overlays are separate.**
Scenes are the sequential base story. Overlays are free-placed on the global timeline
with their own `startMs`/`endMs` and track index. They are composited over the scene
output. Do not model overlays as scene layers.

**D. Export renders offline, not in real time.**
Never use `canvas.captureStream()` as the primary path. Render frame N, encode it,
move to frame N+1. A 30s 1080p30 export must finish in well under 30 seconds on a
decent machine.

**E. Fonts load before the first frame is drawn.**
Self-hosted WOFF2. Construct `FontFace` objects explicitly, `await document.fonts.ready`,
and block both preview and export until resolved. A frame drawn in a fallback font
is a bug, not a cosmetic issue.

**F. No CSS or DOM animation inside the artboard.**
The artboard is a canvas. CSS animation is fine for editor chrome only.

**G. The template authoring pipeline exists from milestone 2.**
Registry, lint, headless thumbnail generation. Authoring template number 60 must
cost twenty minutes.

---

## 4. Stack

- Vite + React 18 + TypeScript (strict, no `any`, no `@ts-ignore`)
- Tailwind for editor chrome only
- Zustand for editor state, with an explicit undo/redo middleware over the document
- **Mediabunny** for muxing — note that `mp4-muxer` and `webm-muxer` are deprecated
  and superseded by it; do not use them
- WebCodecs `VideoEncoder` / `AudioEncoder`, with a `MediaRecorder` fallback
- `idb-keyval` (or Dexie if the schema warrants) for persistence
- Playwright for headless thumbnail generation and visual regression
- Vitest for unit tests

No UI component library. No animation library inside the artboard. No `ffmpeg.wasm`.

---

## 5. Document model

```ts
type Aspect = '16:9' | '4:3' | '1:1' | '4:5' | '9:16';

type Project = {
  id: string;
  name: string;
  mode: 'showcase' | 'motionAd';
  aspect: Aspect;
  scenes: Scene[];          // showcase has exactly one
  overlays: Overlay[];      // motionAd only
  audio: AudioClip[];       // motionAd only, one track for now
  brand: Brand;
  createdAt: number;
  updatedAt: number;
};

type Scene = {
  id: string;
  templateId: string;
  durationMs: number;
  transitionIn: Transition | null;   // null on the first scene
  inputs: SceneInputs;
};

type SceneInputs = {
  photos: PhotoInput[];              // ordered; index 0 is the "FIRST" photo
  texts: Record<string, string>;     // keyed by the template's text slot ids
  logo: MediaRef | null;
  look: LookSettings;
  styleOverrides: StyleOverrides;    // user changes to font, weight, colour etc.
};

type PhotoInput = {
  mediaId: string;                   // points into the media store
  frame: '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
  sizeMode: 'template' | 'larger' | 'fillFrame' | 'overflow';
  sizePct: number;                   // 100–400
  cropMode: 'template' | 'original';
  cropRect?: { x: number; y: number; w: number; h: number };  // normalised
};

type Overlay = {
  id: string;
  track: number;                     // 0 = L1, 1 = L2, …
  startMs: number;
  endMs: number;
  kind: 'photo' | 'text' | 'customMedia';
  content: OverlayContent;
  transform: Partial<AnimatedProps>;
  enterAnim: AnimPreset;
  exitAnim: AnimPreset;
};

type AudioClip = {
  id: string;
  mediaId: string;
  startMs: number;      // position on the project timeline
  trimStartMs: number;  // offset into the source file
  trimEndMs: number;
  gainDb: number;
  fadeInMs: number;
  fadeOutMs: number;
};

type Brand = {
  logo: MediaRef | null;
  palette: Record<PaletteRole, string>;   // bg, surface, ink, inkMuted, accent
  fontHeadline: FontId;
  fontBody: FontId;
};
```

**Media store.** Decoded bitmaps and audio buffers live in a separate in-memory store
keyed by `mediaId`, with blobs persisted to IndexedDB. The document holds only ids.
This keeps the document small, serialisable and cheap to undo.

---

## 6. Render core

### 6.1 Layer types
`image`, `text`, `shape`, `gradient`, `group`, `mask`, `video` (custom media only).

Every layer carries:
```ts
type Layer = {
  id: string;
  type: LayerType;
  startMs: number;        // relative to its scene or overlay
  endMs: number;
  props: StaticProps;
  tracks: Partial<Record<AnimatedProp, Keyframe[]>>;
  children?: Layer[];     // group only
};

type AnimatedProp =
  | 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity'
  | 'blur' | 'letterSpacing' | 'clipProgress' | 'cornerRadius';

type Keyframe = { t: number; v: number; ease: EaseName };
```

Interpolation: values interpolate between adjacent keyframes using the ease on the
**later** keyframe. Hold before the first and after the last.

**Easings:** `linear`, `inQuad`/`outQuad`/`inOutQuad`, `inCubic`/`outCubic`/`inOutCubic`,
`outExpo`, `outBack`, `inOutSine`, plus a sampled spring solver taking
`(stiffness, damping, mass)` and pre-baking to a lookup table at build time.

**Repeaters.** Templates that arrange N photos need a repeater helper in the build
context, not N hand-written layers:
```ts
ctx.repeat(inputs.photos, (photo, i, n) => ({ ... }))
```
with helpers for staggered delays, radial/arc placement, grid placement and
depth-sorted z-ordering. Build these once; every multi-photo template will use them.

### 6.2 Image layers
Object-fit cover/contain, crop rect, corner radius, drop shadow, optional mirrored
reflection with gradient fade, optional border/frame with configurable inset and colour.

### 6.3 Text layers
Font family, size, weight, tracking, line height, colour, alignment, max wrap width.
Style flags matching the inspector: **Wrap**, **Shadow**, **Outline**, **Pill**.
Reveal modes: `none`, `fade`, `maskWipe(dir)`, `perWord(staggerMs)`, `perChar(staggerMs)`,
`swap` (crossfade between the primary text and the alt phrase).

Text measurement must be cached — `ctx.measureText` per character per frame will
destroy preview performance on kinetic templates.

### 6.4 Scene compositor
```
renderFrame(ctx, project, globalTimeMs)
  1. Resolve which scene(s) are active (two during a transition overlap)
  2. For each: localTime = globalTimeMs - sceneStart; fetch memoised layers; draw to a scene buffer
  3. Composite the buffers through the transition function
  4. Draw active overlays, ordered by track then z
  5. Draw persistent brand elements (logo lockup, watermark if free tier)
```
Scene buffers are reusable `OffscreenCanvas` instances — allocate two and swap;
do not create canvases per frame.

**Transitions:** `cut`, `crossFade`, `push(dir)`, `wipe(dir)`, `zoomBlur`, `whiteFlash`,
`scale`. Each is a pure function `(ctxOut, bufA, bufB, progress) => void`.

### 6.5 Layout and aspect
Templates declare a `designSize`. The renderer applies one uniform scale plus a
per-aspect layout hint from the template (`safeArea`, `stackDirection`) so a 9:16
template doesn't fall apart at 16:9. Templates may declare which aspects they support;
unsupported ones are hidden from the aspect switcher for that template rather than
rendered badly.

---

## 7. Template system

```ts
type Template = {
  id: string;
  name: string;
  category: string;            // 'Depth Stage', 'Angle Stage', …
  mode: 'showcase' | 'motionAd' | 'both';
  tier: 'free' | 'pro';
  isNew?: boolean;
  designSize: { w: number; h: number };
  supportedAspects: Aspect[];
  defaultDurationMs: number;
  photoSlots: { min: number; max: number; default: number };
  textSlots: TextSlotDef[];    // id, label, placeholder, maxChars, defaultStyle
  supportsLogo: boolean;
  look: LookDef;
  build(inputs: SceneInputs, ctx: BuildContext): Layer[];
};
```

Motion Ad templates additionally declare a `scenes: SceneTemplateRef[]` array giving
the ordered sub-templates, their durations and the transitions between them.

**File layout:** `src/templates/<category-slug>/<template-id>.ts`, auto-registered by
a glob import. A `npm run lint:templates` script validates ids are unique, slot ranges
are sane, durations are within bounds, and every declared aspect actually renders.

**Thumbnails:** `npm run thumbs` runs a headless Playwright job that loads each
template with stock sample photos and writes:
- a static poster frame (`public/thumbs/<id>.webp`)
- a short looping preview (`public/thumbs/<id>.mp4`, 2s, low bitrate)

Never hand-author thumbnails. Never commit them from a manual screenshot.

---

## 8. Inspector panels

### 8.1 Photos
Upload button (drag/drop, paste and file picker all work). Thumbnail grid with the
first photo badged **FIRST**, drag to reorder, click to select, remove per photo.
Photo count stepper bounded by the template's min/max — increasing beyond the
supplied photos reuses earlier ones. "Try sample photos" and "Remove all".
Frame ratio, size mode (Template / Larger / Fill frame / Overflow) with a percentage
slider, and crop mode (Template crop / Original photo).

### 8.2 Text
One block per text slot the template declares. Each block: the text field, then font
family, weight (Regular / Medium / Semibold / Bold / Extra bold), alignment, size
slider, colour picker, style toggles (Wrap / Shadow / Outline / Pill), wrap width %,
letter spacing %. Where a template supports swap animations, a second "alt phrase"
field with its own style block.

### 8.3 Logo
Upload, size, corner position or free placement, opacity, and a "lockup" option that
pairs the logo with a text mark.

### 8.4 Look
Palette role swatches with one-click preset palettes, background treatment
(solid / gradient / blurred photo / pattern), grain, vignette, global speed multiplier,
and a corner-radius control for framed templates.

All inspector edits go through the same undoable document action pipeline. No
inspector control may mutate the document directly.

---

## 9. Media handling

- Accept JPEG, PNG, WebP, AVIF. Detect HEIC and fail with a clear message rather than
  a broken bitmap.
- Decode with `createImageBitmap` and downscale so the longest edge is at most 2× the
  artboard's longest edge. Full-resolution phone photos will exhaust memory on mobile.
- Keep both a display-resolution and an export-resolution bitmap where they differ.
- Transfer bitmaps to the export worker as `ImageBitmap` (transferable). Never as data URLs.
- Custom media (Pro) accepts short MP4/WebM clips; decode via `VideoDecoder` and
  present the frame nearest the requested timestamp. Cache decoded frames in a small ring buffer.
- Nothing is ever uploaded to a server. State this in the UI.

---

## 10. Audio

- Import MP3/M4A/WAV/OGG, plus a bundled royalty-free track library.
  **Licensing is my responsibility, not yours — leave the library as an empty manifest
  with a documented shape and three placeholder tracks.**
- Decode with `OfflineAudioContext.decodeAudioData`.
- Per-clip: trim start/end, gain in dB, fade in/out, and a waveform preview on the track.
- Preview playback uses `AudioBufferSourceNode` scheduled against the same clock as
  the visual preview. Drift over a 60s preview must stay under one frame.
- Export: render the mixed audio offline into a single `AudioBuffer`, slice into
  `AudioData` chunks, encode (AAC for MP4, Opus for WebM), and mux as a second track.
  Audio and video timestamps must share one microsecond timebase.

---

## 11. Export pipeline

1. Feature-detect with `await VideoEncoder.isConfigSupported(config)` at runtime.
   **Never** feature-detect by user agent.
2. Codecs: MP4 → `avc1.640028` + `mp4a.40.2`. WebM → `vp09.00.10.08` + `opus`.
3. Presets: 720p / 1080p; 30fps default with a 60fps option; quality tiers mapping to bitrate.
4. Keyframe every 2 seconds: `encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 })`.
5. **Respect backpressure.** Await `encodeQueueSize` dropping below a threshold before
   queueing more frames, or memory will balloon on a 60-second export.
6. **Always call `frame.close()`** on every `VideoFrame`. Leaks here are silent and fatal.
7. Run in a Web Worker with `OffscreenCanvas`.
   ⚠️ Loading custom fonts inside a worker requires `self.fonts.add(new FontFace(...))`
   and is fiddly. If it costs more than an hour, render on the main thread with periodic
   yielding and move only the encoder into the worker — then tell me which route you took and why.
8. Real progress (frames encoded / total), a working cancel, and a clear error surface.
   Never swallow an export error.
9. Fallback path: `MediaRecorder` + `canvas.captureStream()`, WebM only, real-time.
   Tell the user plainly why MP4 is unavailable on their browser.

**Browser support.** WebCodecs `VideoEncoder` is available in Chrome 94+, Safari 16.4+
and Firefox 130+ desktop, but is not yet Baseline — Firefox for Android lacks it.
The fallback is not optional.

---

## 12. Entitlements

Free/Pro gating is real in the UI but **stubbed in the backend for v1**.

Put everything behind a single module:
```ts
// src/entitlements/index.ts
export type Tier = 'free' | 'pro';
export type Limits = {
  maxDurationMs: number;       // free: 15_000 for motionAd, 60_000 for showcase
  proTemplates: boolean;
  customMedia: boolean;
  maxExportHeight: number;
  watermark: boolean;
};
export function useEntitlements(): { tier: Tier; limits: Limits };
```
The v1 implementation returns a tier from local state with a dev toggle. Swapping in
a real API call later must touch this file and nothing else.

Gating points: template cards show a PRO badge and are filterable; exceeding the free
duration shows the inline upsell seen in the reference UI, offering either upgrade or
"remove this scene to keep working with the first 15 seconds"; custom media is Pro;
free exports carry a small watermark.

**Do not build auth, payments or a server in v1.** Design so they slot in later.

---

## 13. Persistence and shell

- Autosave the document to IndexedDB on a debounce; blobs stored separately by `mediaId`.
- Project list on load, with rename, duplicate and delete.
- PWA via `vite-plugin-pwa`, installable, offline-capable.
- Light/dark theme toggle persisted to `localStorage`.
- Keyboard: space = play/pause, ⌘Z/⌘⇧Z = undo/redo, arrows = step one frame,
  ⌘E = export, ⌘S is a no-op with a "saves automatically" toast.
- `prefers-reduced-motion` suppresses editor chrome animation only, never the artboard.
- Responsive down to tablet. On phones, inspector and library become bottom sheets.

---

## 14. Performance budgets

| Metric | Target |
|---|---|
| Preview frame rate, 1080p artboard, 8-photo template | ≥ 30fps on a mid-range laptop |
| Export, 30s @ 1080p30 | ≤ 45s on a modern desktop |
| Template `build()` | ≤ 16ms |
| Cold load to interactive editor | ≤ 2.5s on a fast 3G throttle |
| Peak heap, 8 photos + 60s audio | ≤ 900MB |

Add a dev-only performance overlay showing frame time, build time and heap.

---

## 15. Milestones

Work one at a time. After each: stop, summarise, tell me how to test it, and wait for
my review. Do not run ahead.

| # | Scope | Done when |
|---|---|---|
| **M0** | Scaffold, design tokens, editor shell, artboard with correct aspect scaling | A static placeholder frame renders correctly at all five aspects |
| **M1** | Render core — layer types, keyframes, easings, spring, repeaters, text measurement cache | Unit tests prove interpolation is exact; a hand-written scene animates at 60fps |
| **M2** | Template schema, registry, build context, 6 templates across 3 categories, thumbnail pipeline | `npm run thumbs` produces posters and previews for all 6; `lint:templates` passes |
| **M3** | Showcase mode complete — library with categories/search/filter/favourites, scrub loop, all four inspector tabs | I can load photos, edit every control in the screenshots, and see it reflected live |
| **M4** | Export v1, video only — Mediabunny, worker, MP4 + WebM, MediaRecorder fallback, progress, cancel | A 10s 1080p MP4 exports and matches the preview frame-for-frame |
| **M5** | Motion Ads — scene sequencing, transitions, timeline UI, overlay layers, add photo/text/custom media, 3 multi-scene templates | A 30s multi-scene ad plays and exports correctly |
| **M6** | Audio — import, trim, gain, fades, waveform, synced preview, muxed export | A 30s export has in-sync audio in both MP4 and WebM |
| **M7** | Persistence, project list, PWA, theme, entitlement stubs and upsell UI, responsive layout | Reload loses nothing; free/pro gating behaves correctly with the dev toggle |
| **M8** | Template scale-up to 25 for v1 | 25 templates across at least 5 categories, all with generated thumbnails |

---

## 16. Do not

- Do not build auth, payments, a database or any server in v1.
- Do not add any generative AI feature.
- Do not use `canvas.captureStream()` as the primary export path.
- Do not use `mp4-muxer` or `webm-muxer` — both are deprecated in favour of Mediabunny.
- Do not install an animation library, a UI kit or `ffmpeg.wasm`.
- Do not store image or audio data in `localStorage`.
- Do not copy code, assets, template designs, copy or branding from any existing product.
  Design the templates yourself.
- Do not call `build()` inside the render loop.
- Do not silently swallow errors anywhere in the export or decode path.

---

## 17. Working agreement

- TypeScript strict. No `any`. No `@ts-ignore`.
- Commit at the end of each milestone with a clear message.
- Maintain `DECISIONS.md`: every architectural choice, its reason, and what was rejected.
- Your training data may be stale. Before writing against them, check current docs for:
  Mediabunny's `Output` / `BufferTarget` API, the `VideoEncoder` and `AudioEncoder`
  config shapes, and `OffscreenCanvas` font handling. If an API differs from what you
  expected, say so rather than working around it.
- Where two approaches are genuinely defensible, stop and ask rather than building on
  one for an hour.
- Visual regression tests via Playwright on a fixed set of template/frame pairs, so
  template work can't silently break the renderer.
