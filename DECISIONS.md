# DECISIONS

Every architectural choice, its reason, and what was rejected (§17).

Decisions that amend BUILD-SPEC.md say so explicitly. The spec remains the
contract; this file records where it has been deliberately changed and why.

---

## D-001 — `renderFrame` takes a `Ctx2D` union and an explicit `RenderRig`
**Amends §3A.** Approved 2026-09-18.

```ts
renderFrame(ctx: Ctx2D, project: Project, globalTimeMs: number, rig: RenderRig): void
```

Two changes to decision A:

1. `Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D`. The
   export path renders into an OffscreenCanvas in a worker (§11.7, §6.4), whose
   context is a different interface. Under `strict` with no `any`, the original
   signature made decision A and decision D mutually exclusive.
2. A fourth parameter carrying the scene-buffer pool and the layer/text caches.

**Why the rig is a parameter, not a module singleton:** export runs while the
preview is still mounted — the user watches a progress bar over a live editor.
Module-scope scene buffers would be written by both renderers at once and tear.
One rig per renderer makes that impossible by construction.

`renderFrame` remains deterministic — same `(project, time, rig contents)` gives
the same pixels — and still reads no React state and touches no DOM.

**Rejected:** module-level buffers with a mutex (complexity, and it serialises
export behind preview); a second renderer for export (the exact drift decision A
exists to prevent).

**Enforced by:** an eslint import boundary — `src/core`, `src/document`,
`src/templates` and `src/media` may not import React, Zustand or `src/ui`, and
may not reference `document` or `window`.

---

## D-002 — Mediabunny drives the encoders; we do not hand-roll WebCodecs
Approved 2026-09-18. Lands at M4.

Current Mediabunny is not only a muxer: `VideoSampleSource`, `CanvasSource` and
`AudioBufferSource` take a `VideoEncodingConfig`/`AudioEncodingConfig` and own
the `VideoEncoder`/`AudioEncoder` themselves.

Three parts of §11 get simpler as a result:
- §11.4's manual `i % (fps * 2)` keyframe modulo becomes `keyFrameInterval: 2`.
- §11.5's `encodeQueueSize` polling becomes `await source.add(...)` — the
  promise stays pending while the encoders are saturated, which *is* the
  backpressure.
- §11.6's `frame.close()` discipline is handled inside the source.

Codec strings are derived by Mediabunny from `codec: 'avc' | 'vp9'` plus the
resolution, rather than hardcoded — see D-003.

**Rejected:** hand-rolling both encoders and feeding `EncodedVideoPacketSource`.
More control, considerably more code and bug surface, and no capability we
currently need. Still available per-track if something turns out to be
unreachable through the source API.

---

## D-003 — Codec strings are derived, not hardcoded
**Corrects §11.2.**

`vp09.00.10.08` is VP9 profile 0 **level 1.0** — 256×144@30. 1080p needs level
4.0 (`vp09.00.40.08`), 1080p60 needs 4.1. `avc1.640028` is High@4.0, correct for
1080p30 but short for the 60fps option (`avc1.64002a`).

Rather than maintain a table, Mediabunny derives the full codec string from the
resolution and frame rate. `fullCodecString` is available if we ever need to
pin one exactly.

---

## D-004 — Transitions overlap their neighbours
**Fills a gap in §6.4.** Approved 2026-09-18.

A transition consumes `durationMs` from the end of the outgoing scene and the
start of the incoming one. Scene N starts `durationMs` before scene N−1 ends.

```
total = sum(scene durations) − sum(transition durations)
```

**Why:** during the overlap both scenes are inside their own valid local time
range — scene A at local 2750 of 3000, scene B at local 250. The alternative
("a transition inserts extra time") requires one scene to render past its own
duration, where it has no defined content, or to freeze on its last frame.

An overlap is clamped to half the shorter neighbour so the timeline cannot fold
over itself. A `cut` has zero overlap by definition.

This determines total project duration, so it also determines the §12 free-tier
15-second cap and the M5 timeline ruler.

**Implemented in:** `src/document/select/timeline.ts`, with tests.

---

## D-005 — `Keyframe.t` is milliseconds relative to the layer's `startMs`
**Fills a gap in §6.1.** Approved 2026-09-18.

Not normalised 0–1, not global. Relative-to-layer composes correctly with the
staggered repeaters in §6.1: a repeater shifts a layer's start without having to
rewrite every keyframe inside it.

---

## D-006 — Layers carry palette *roles*; colours resolve at draw time
**Amends §3B.** Approved 2026-09-18.

§3B memoises `build()` on `(template, inputs, aspect)`, but `SceneInputs`
contains `look` and `styleOverrides`. Following that literally means dragging a
colour picker rebuilds the template every frame — precisely what §16 forbids,
reached by obeying §3B.

So a `Paint` is either a literal colour or `{ kind: 'role', role }`, and
`resolvePaint` resolves it against the palette on each frame. Cosmetic edits
repaint without invalidating the build.

The same reasoning applies to §8.4's global speed multiplier: it is a time
remap applied before layers are evaluated, never baked into keyframes.

**Still to settle at M2:** the exact split between structural inputs (photo
count, text content, aspect — rebuild) and cosmetic ones (colour, size %,
opacity — repaint only), expressed as a `structureVersion` on the document so
the memo key is cheap to compute.

---

## D-007 — M2 thumbnails ship a WebP poster and a VP9 WebM loop; MP4 defers to M8
**Amends §7.** Approved 2026-09-18.

§7 requires `npm run thumbs` to emit a 2s MP4 per template at M2 — two
milestones before the encoder exists (M4). Playwright's bundled Chromium also
ships without proprietary codecs, so `VideoEncoder` with `avc1` fails there;
MP4 thumbnails need `channel: 'chrome'` against a real Chrome install.

M2 therefore emits the poster plus a VP9 WebM loop, which headless Chromium
encodes natively. MP4 thumbnails become an optional M8 step.

Playwright screenshots are PNG/JPEG only, so WebP posters need a converter
(`sharp`) as a devDependency.

Generated thumbnails are gitignored — they are build output, and 25 templates ×
(poster + loop) is not something to carry in the repository.

---

## D-008 — MaxMotion is its own git repository
Approved 2026-09-18.

`git rev-parse --show-toplevel` previously returned `/Users/adedayo` — the home
directory is under version control and this project was an untracked folder
inside it. §17 requires a commit per milestone, so `git init` was run here.

---

## D-009 — No runtime server in v1; build the capability seam instead
Approved 2026-09-18. **This is the load-bearing one.**

Every operation some browsers cannot perform is a *capability* with providers
resolving in a fixed order:

```
native  →  local-wasm  →  remote
```

v1 registers native and local-wasm providers only. The remote provider is a stub
that always reports unavailable, so nothing in v1 ever requires the network and
§9's "nothing is uploaded" claim stays literally true.

**Why no server:**
- **The renderer cannot be offloaded — it *is* the preview.** Decision A has one
  render function serving both paths, and the preview must run in the browser.
  Moving export to a server duplicates the render path rather than removing it,
  which is the drift decision A exists to prevent.
- Once the two WASM providers below are in place, the population that cannot
  export locally is roughly Firefox for Android and pre-2022 browsers — and they
  still get real-time WebM via MediaRecorder (§11.9).
- Uploading ~30MB of photos and audio would often be *slower* than the local
  export it replaces.
- An open render endpoint is a free compute farm; rate limiting and realistically
  auth follow, pulling in everything §16 prohibits.

**What keeps the option open:** the M2 thumbnail job is already a headless-Chrome
render of the real app (D-012). Turning it into a render service later is
packaging work, not architecture work.

**Revisit if:** more than ~5–10% of exports fall back to MediaRecorder; share
links are wanted (hosting exists anyway then); exports beyond 60s or 4K; mobile
becomes a primary target; collaboration features.

**Implemented in:** `src/capabilities/`.

---

## D-010 — Ship `@mediabunny/aac-encoder`
**Narrow amendment to §16.** Approved 2026-09-18. Lands at M4.

Firefox has no AAC encoding in WebCodecs on any platform, and Safari 16.4–18.7
has no `AudioEncoder` at all (video-only WebCodecs; full support arrives in
Safari 26). So §11.2's `mp4a.40.2` works on Chrome/Edge and Safari 26+ only.

`@mediabunny/aac-encoder` is a size-optimised WASM build of FFmpeg's AAC
encoder, registered through Mediabunny's custom-coder API:

```ts
if (!(await canEncodeAudio('aac'))) registerAacEncoder();
```

§16 prohibits `ffmpeg.wasm`. This is not that — it is one encoder, not the whole
toolchain — and the rule's intent is "do not build the video pipeline on
ffmpeg.wasm", which this does not.

**Note:** Firefox *does* support Opus encoding, so a Firefox user already gets a
complete working WebM export with audio today. This closes the MP4 gap
specifically, not an inability to export.

**To verify at M4:** the package's bundle size (npm blocked the lookup). If it
is heavy it loads lazily on the MP4 path in browsers that need it, so the §14
cold-load budget is unaffected either way.

---

## D-011 — Ship `libheif-js`; HEIC decodes rather than erroring
**Amends §9.** Approved 2026-09-18. Lands at M3.

§9 says detect HEIC and fail with a clear message. iPhone photos are HEIC by
default, so users will hit this constantly.

Native support is roughly 30–35% of sessions: Safari always, Chrome on macOS and
Android, never Firefox, unreliable on Chrome for Windows/Linux. WASM libheif
decodes a 12MP image in 200–500ms in a worker.

Lazy-loaded only when a HEIC is actually dropped, so it never touches the §14
cold-load budget.

---

## D-012 — `gen-thumbs.ts` gets a clean project-in / bytes-out boundary
Approved 2026-09-18. Lands at M2.

Costs nothing now and is what makes D-009 reversible cheaply: the thumbnail job
loads the real app in headless Chrome and drives the real renderer, so it is
already a server renderer in everything but packaging.

---

## D-013 — Template schema splits; ad templates expand once
**Amends §7.** Approved 2026-09-18. Lands at M2.

§7 gives `Template` both a `build()` and, for Motion Ads, a `scenes:
SceneTemplateRef[]`. A multi-scene ad template has no `build()` of its own, so
the type is two incompatible things. It becomes a discriminated union:
`SceneTemplate` (has `build`) and `AdTemplate` (has `scenes`).

Picking an ad template expands it **once** into `Project.scenes`, with
`sourceAdTemplateId` recorded on the project for provenance. Scenes stay a flat
array exactly as §5 specifies.

**Rejected:** retaining the parent template as a live container so the whole ad
could be swapped with content preserved. Materially more complex, and content
mapping between differently-shaped ad templates is ill-defined.

---

## D-014 — Naming: `AnimatedProp` and `PropValues`
**Corrects §5/§6.1.**

§6.1 defines `AnimatedProp` (a union of property names); §5's `Overlay.transform`
is typed `Partial<AnimatedProps>` (plural, an object type) which is never
defined. Two types one character apart is a bug waiting to happen, so the object
type is `PropValues`.

---

## D-015 — TypeScript strictness beyond `strict`
Also enabled: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noImplicitReturns`, `noUnusedLocals/Parameters`.

`noUncheckedIndexedAccess` in particular earns its friction in a renderer that
indexes keyframe arrays constantly. §17's "no `any`, no `@ts-ignore`" holds;
anything the standard libs are missing gets declared in `src/types/globals.d.ts`
instead of cast away.

---

## D-016 — Quality tiers name the *short* edge
1080p is 1920×1080 landscape and 1080×1920 portrait; 4:5 is 1080×1350. Sizing
from the long edge instead would make a 9:16 export 608px wide, which is not
what anyone means by 1080p. All five aspects produce even dimensions at every
tier, because H.264 4:2:0 requires it.

**Known and bounded:** at small preview sizes the even-rounding means design
units can land at e.g. 1920.6 rather than exactly 1920 — a sub-pixel difference
between preview and export layout, well inside the M4 comparison threshold.
Correcting it would introduce a visible 1px letterbox, which is worse.

---

## D-017 — `?frozen=<ms>` renders a deterministic frame
M4's exit criterion is "matches the preview frame-for-frame", which is not
literally testable: the preview samples arbitrary wall-clock times, the export
samples `t = n/fps`, and main-thread versus worker text rasterisation differs
slightly in some browsers.

The operational form is: *the same `globalTimeMs` rendered through both paths
differs by under a perceptual threshold*. `?frozen=<ms>` is the hook that makes
that assertable. It also gives the visual regression suite stable baselines.

---

## D-018 — Entitlements export a plain function as well as a hook
**Clarifies §12.** `useEntitlements()` is a React hook, but §6.4 step 5 draws the
free-tier watermark inside the renderer, which cannot call a hook without
breaking D-001. So `getLimits(tier, mode)` is exported alongside it, and the
resolved `watermark` flag is threaded into the render call.

---

## D-019 — `Layer` is a discriminated union
**Refines §6.1.** M1.

§6.1 gives every layer `props: StaticProps`. Modelling that as a union
discriminated on `type` — `ShapeLayer | TextLayer | ImageLayer | …` — is the
same idea with the compiler checking it, so a text layer cannot carry an
image's crop rect and `drawLayer`'s switch is exhaustive by construction.
`StaticProps` survives as `Layer['props']` for continuity with the spec.

`AnimatedProps` (§5) becomes `PropValues` for the reason given in D-014.

---

## D-020 — Blur is a mip chain, not `ctx.filter`
M1.

`ctx.filter = 'blur(Npx)'` is not Baseline — Safari is the gap — and where it
exists it is slow enough that one blurred layer on an eight-photo template
would miss the 30fps budget by itself.

Instead the layer is drawn offscreen, halved repeatedly to the target scale,
then doubled repeatedly back up. Each step is a bilinear resample, so a chain
approximates a Gaussian closely.

**Rejected:** a single large downscale followed by one upscale. Cheaper and
visibly wrong — it leaves stepped, faceted edges on exactly the soft gradients
blur is normally used for. This was caught by eye during M1 and is the reason
the chain exists rather than the one-shot version.

---

## D-021 — Text reveals run on local time, not on `clipProgress`
**Fills a gap in §6.3.** M1.

§6.1 lists `clipProgress` as an animated prop and §6.3 lists the reveal modes,
but not how they connect. Staggered modes (`perWord`, `perChar`) need a genuine
per-item *time* offset; expressing that as a fraction of a normalised progress
value forces the template to do the conversion backwards and makes `staggerMs`
mean something different for every layer duration.

So a `Reveal` carries `startMs`, `durationMs` and `staggerMs`, all relative to
the layer's own start, consistent with D-005. `clipProgress` stays available as
a general-purpose animated clip.

---

## D-022 — Text is laid out at build time into glyph runs
M1, foreshadowed in the M0 spec review.

§6.3 requires a measurement cache because per-frame `measureText` is too slow.
The stronger reason is correctness: per-character positions **cannot** be
obtained by summing cached glyph widths, because kerning and letter spacing
mean the sum of the parts is not the width of the whole. Each character's
position is measured from a prefix, once, and every later frame transforms the
cached run.

Two consequences:
- `BuildContext` needs text measurement, which §7 does not mention. It has it.
- `letterSpacing` is applied through the context, not by hand, so `measureText`
  accounts for it. §8.2's percentage resolves to px as `fontSize × pct / 100`.

`layoutText` depends on a narrow `TextMeasureContext`, not a full `Ctx2D`, so
wrapping and indexing are unit-tested in Node against known glyph widths and
only rasterisation needs a browser.

---

## D-023 — Font *files* are deferred to M2; the §3E pipeline is in place now
M1.

§3E requires self-hosted WOFF2 through explicit `FontFace` objects, with both
paths blocked until they resolve. That machinery exists in
`src/fonts/registry.ts`. What it does not have is typefaces — *which* fonts ship
is a design decision belonging with the template designs at M2, not with the
render core.

Until then both roles resolve to system stacks, which are present by definition,
so nothing is drawn in an unintended fallback and §3E is not violated. Adding a
real face is one registry entry with a `url`; the measurement cache simply
re-keys, so nothing architectural changes.

**Open question for you at M2:** which typefaces. Two roles are needed —
headline and body.

---

## D-024 — §16's "never call build() in the render loop" is asserted, not trusted
M1.

`RenderStats.buildCount` counts actual `build()` invocations, and the Playwright
suite asserts it stays flat across 90+ frames and increments by exactly one when
the aspect changes.

This is the spec's most consequential performance rule and the easiest to
regress silently — a memo key that accidentally includes a per-frame value costs
the whole 16ms build budget sixty times a second while still looking correct.
A convention would not have caught it; a counter does.

---

## D-025 — Module-level scratch is allowed; module-level frame state is not
M1, clarifying D-001.

D-001 puts the scene buffers in the rig because they hold frame content across
the composite step, where two concurrent renderers would tear.

Scratch used entirely within one synchronous call — the blur surfaces, the
per-depth prop objects, the 1×1 measurement canvas — is different, and stays at
module scope. Rendering is synchronous and never re-enters, and preview and
export run in separate realms with separate module instances. The distinction is
"does it survive the call", not "is it mutable".

---

## D-026 — Typefaces: Archivo (headline) and Inter (body), both variable
Resolves D-023. Chosen on your instruction to pick.

**Archivo** for headlines. A grotesque with real presence at heavy weights,
which is what the display type in these templates needs — "MOTION IN THE
BROWSER" at 800 has to hold a frame. Less ubiquitous than the obvious
alternatives, so the product does not look like every other tool built this year.

**Inter** for body. Drawn for screen text at small sizes, which is exactly the
job: the subhead renders at ~28 design units and below. Its ubiquity matters
less for body copy — the headline is what carries identity.

Both are SIL OFL 1.1. The licence text ships beside the fonts in `public/fonts`,
as OFL requires.

**Both are variable, and that is not a stylistic choice.** §8.2 needs five
weights per family. Ten static files would cost roughly 300KB against §14's
~500KB cold-load budget. Two variable files cost 83KB and cover the whole
100–900 axis. Canvas honours weights on multiples of 100, which is precisely
what the inspector exposes, so nothing is lost.

**Subsets.** `latin` loads eagerly and blocks the first frame per §3E.
`latin-ext` is deferred — Inter's alone is 85KB, and nothing needs it until the
user can type (M3). Latin-1 already covers Western European accents.
`needsExtendedSubset()` and `loadExtendedSubsets()` are in place for M3 to wire
to the text inspector.

Measured cold load after this change: **145KB on the wire, ~0.72s at fast 3G**,
against a 2.5s budget.

These are *defaults*. §8.2 gives the user a font picker, so the registry is
expected to grow to six or so families at M3 — under the same variable-font rule.

---

## D-027 — Animated tracking never reaches the measurement cache key
M1. Found while wiring the real fonts in.

`letterSpacing` is an animated prop (§6.1) and also a measurement input. Putting
the resolved value into the text cache key meant every frame of a tracking
animation was a cache miss that re-laid out the whole string — defeating §6.3's
cache at precisely the point it exists for — and re-wrapped the text mid-animation.

So the run is measured once at the *static* spacing and the animated boost is
applied as a per-character offset at paint time, from the cached character
boxes. A line with no boost still draws in a single `fillText`; only genuinely
animated tracking pays for per-character drawing.

**The authoring rule this implies**, which templates have to follow: because
tracking no longer re-wraps, wrap at the *widest* tracking the animation
reaches and animate up to it, not past it. Otherwise lines grow beyond the
width they were wrapped for and overrun the safe area. The demo scene does this
— static spacing is the settled value and the boost runs from negative to zero.

Guarded by a Playwright assertion that the text cache does not grow while the
subhead's tracking animates.

---

## D-028 — Templates measure their type; they do not assume block heights
M1.

The demo scene originally assumed the headline and subhead block heights from
font size. The moment the real typefaces landed, the subhead wrapped to three
lines instead of two and overran the safe area.

How many lines a string wraps to is a property of the face, so templates measure
through `BuildContext.measure` and lay out from real heights. This is one reason
`BuildContext` carries text measurement at all (D-022), and it is cheap: it
happens inside `build()`, which is memoised.

---

## D-029 — The template glob is lazy; metadata is eager
M2.

§7 says templates are "auto-registered by a glob import". Done eagerly, all 25
v1 templates land in the initial bundle and spend §14's whole cold-load budget
before the editor draws anything.

So `import.meta.glob` runs with `eager: false` and each template's code is
fetched when it is first used. The library grid cannot wait on 25 dynamic
imports to render a card, so names, categories, tiers and thumbnails live in a
separate eager manifest.

That creates two sources of truth, which is the cost. `npm run lint:templates`
pays it back by asserting the manifest and the files on disk agree on every
field — drift fails the build rather than shipping a card that opens something
else.

---

## D-030 — Sample photos are synthesised, not photographed
M2. Flagged to you before starting; no objection raised.

§7's thumbnail job and §8.1's "Try sample photos" both need stock images.
Licensed photography would mean a licence to track and attribute, for pictures
that only ever stand in for the user's own.

`npm run samples` draws eight abstract compositions instead — layered geometry,
a horizon, a light source, fine lines and grain, all from a seeded PRNG so they
are reproducible. Deliberately structured rather than soft: the first pass was
gradient meshes, which read as blurred colour and told you nothing about how a
template crops or frames a real picture.

**Still open for you:** whether "Try sample photos" eventually ships real
photography. These do the job for template thumbnails; they are visibly not
photographs, which may or may not matter for the user-facing button at M3.

---

## D-031 — Build scripts inject page code as source, not as functions
M2. Cost about an hour, so it is written down.

`tsx` compiles the build scripts with esbuild, which has `keepNames` enabled and
rewrites functions to call a `__name()` helper. Playwright serialises a function
passed to `page.evaluate` and runs it in the browser, where that helper does not
exist — so anything beyond a trivial arrow fails with `__name is not defined`.

Both `gen-samples.ts` and `gen-thumbs.ts` therefore keep their page-side code in
a string and inject it with `addScriptTag` / `addInitScript`. It costs
type-checking inside those blocks, which is an acceptable trade for build
scripts. Small inline arrows passed to `evaluate` are fine and still used.

Worth knowing before writing any new Playwright-driven script in this repo.

---

## D-032 — Generated thumbnails and samples are committed
**Amends D-007.** M2.

D-007 gitignored thumbnails as build output. That was right in principle and
wrong in practice: the library grid loads them at runtime, so a fresh clone
would show broken images until someone ran a two-minute job that needs a dev
server up.

They are committed instead — twelve files, about 1MB. The churn in binary diffs
when a template's look changes is a smaller problem than an app that looks
broken on checkout. Revisit if CI ever generates them on the way to a deploy.

---

## D-033 — Templates declare their own poster frame
M2.

`npm run thumbs` originally grabbed every poster at a fixed 3.2s. Templates that
cycle — Card Stack deals a new photo every few seconds — got caught mid-
transition, and a poster showing a card halfway out of frame sells nothing.

`TemplateSummary.posterAtMs` lets a template name its own best instant, falling
back to 3.2s. Cheap, and it is the kind of thing that only shows up once you are
looking at all six posters side by side — which is exactly what the thumbnail
pipeline is for.

---

## D-034 — Draw order is fixed at build time, so rotating depth needs slot layers
M3, found while fixing Card Stack.

The renderer draws layers in the order a template emits them. That order is
fixed when `build()` runs, which means a template whose **z-order changes over
time** cannot be expressed by emitting one layer per object.

Card Stack hit this directly: cards cycle, so the card on top this turn is at
the back two turns later. One layer per photo rendered correctly for one turn in
four and painted rear cards over the front one for the rest — a bug that looked
like a spacing problem and was not.

The fix is to invert the mapping: **layers are slots, photos cycle through
them.** Each slot has a fixed depth and therefore a fixed position in the draw
order; a photo appears in a slot only during the turn it occupies it, using the
layer's own time window. Cost is one layer per (slot, photo) pair — 64 at the
eight-photo maximum, and layers outside their window cost a comparison each.

**Rejected:** adding a `z` animated prop and sorting layers per frame. §6.4 does
mention z-ordering for overlays, so it is not foreign to the model, but sorting
every layer every frame to serve one template is the kind of renderer
special-casing §3B warns about. The slot formulation stays inside the existing
architecture and is the standard way carousels are built.

Worth knowing before writing any template with a carousel, a shuffle or
anything else where objects pass in front of each other.

---

## D-035 — The logo is a settings object, not a MediaRef
**Amends §5.** M3.

§5 types `SceneInputs.logo` as `MediaRef | null`, but §8.3 gives the inspector
size, placement, opacity and a lockup with its own text. None of that fits in a
bare reference.

`LogoSettings` carries them. The alternative was smuggling them into
`styleOverrides`, which is for *text* style and would have made the
structural/cosmetic split (D-006) incoherent — logo placement is structural,
logo opacity is not, and both would have sat in the same bag.

---

## D-036 — Undo coalescing is keyed, and sealed on blur rather than keyup
M3.

A slider drag fires an action per pointer move. One undo entry per frame makes
⌘Z useless, so actions carry a `coalesceKey` and consecutive commits sharing one
replace the previous entry rather than stacking. The key includes the target, so
dragging photo 2's size and then photo 3's gives two entries rather than one.

The run is sealed on **blur**, not on keyup. Sealing per keystroke gave keyboard
users ten undo steps for an adjustment that gives mouse users one — caught by a
test that pressed the arrow key ten times and then found a single undo did not
return to the start.

Selection, the open tab, the playhead and favourites are all excluded from the
history. Nobody wants ⌘Z to reopen a panel or un-favourite a template.

---

## D-037 — Background and logo are shared, not per-template
M3.

§8.4's background treatment and §8.3's logo are *user* controls, so they have to
behave identically in every template — "Blurred photo" doing something slightly
different in each one is the kind of inconsistency that makes an editor feel
unreliable. `_shared/chrome.ts` owns both; templates call
`backgroundLayer(inputs, ctx)` and spread `logoLayers(inputs, ctx)`.

Grain and vignette are different: they apply to the finished frame rather than
to a layer, so they live in the compositor as a post pass (`postFx.ts`) and no
template can opt out of them by forgetting.

The grain tile is generated once and repeated with a per-frame *offset*.
Generating noise per frame would mean writing a megapixel of random bytes sixty
times a second, which costs more than the rest of the renderer combined.

---

## D-038 — HEIC decodes in two stages: browser first, WASM only if it refuses
Implements D-011. M3.

`createImageBitmap` is tried first. Safari always decodes HEIC and Chrome does
on macOS and Android, because both delegate to the system codec — roughly a
third of sessions, for free. Only when that throws does the ~2MB libheif WASM
bundle load, behind a dynamic import.

So the module never touches §14's cold-load path and never loads at all for a
user who does not drop a HEIC on a browser that cannot read one. Measured: the
entry chunk grew 0.36KB gzipped, and libheif is its own 697KB chunk.

The decoded PNG replaces the original blob in the media store. A HEIC blob is
useless to everything downstream — including the export worker's re-decode
(§9) — so keeping it would just mean decoding twice.

**Testing note worth keeping.** The first end-to-end test passed on macOS
because Chromium handled HEIC natively, so the WASM path — the one that
actually matters, since the browsers needing it are Firefox and Chrome on
Windows and Linux — was never exercised. The suite now also runs with
`createImageBitmap` stubbed to refuse HEIC, and asserts that the libheif module
was genuinely fetched. A green test that silently skips the branch it claims to
cover is worse than no test.

---

## D-039 — Export confirmed against the M0 research; no API drift
M4, partial.

The M0 research predicted Mediabunny's current shape and it held exactly:

- `CanvasSource` accepts `OffscreenCanvas`, so the worker path works.
- `keyFrameInterval` defaults to 2 seconds — §11.4's manual
  `i % (fps * 2)` modulo is unnecessary.
- `add()` returns a promise that stays pending while the encoder is saturated,
  so awaiting it *is* §11.5's backpressure. There is no `encodeQueueSize` to
  poll and no `VideoFrame` to leak (§11.6), because the source owns and closes
  its own.

Measured on this machine: a 10-second 1080×1920 MP4 in **3.0 seconds**, 11.7MB.
§14 budgets 45s for 30s at 1080p30; extrapolating, that is roughly 9s. Verified
by decoding the result in a video element — `ftypisom…avc1`, 1080×1920, exactly
10.00s, and a frame seeked from 4.0s is 99.6% non-black. WebM likewise: valid
EBML, same dimensions and duration.

**Not yet done in M4:** the MediaRecorder fallback (§11.9) and the
frame-for-frame preview/export comparison that is the milestone's actual exit
criterion. Both are written up as outstanding rather than quietly skipped.

---

## D-040 — "Matches the preview frame-for-frame" is a perceptual threshold
M4. Resolves D-017's open question with a measurement.

§15's M4 criterion cannot be asserted literally. The preview samples arbitrary
wall-clock times while the export samples `t = n/fps`, and a lossy codec never
returns the bytes it was given. The operational form is: **the same
`globalTimeMs` rendered through both paths differs by under a perceptual
threshold.**

`?frozen=<ms>` parks the preview at an exact time and `?thumb=1080` pins its
backing store to the export resolution, so the two frames compare without an
intervening resample.

**Measured: mean absolute error 1.81/255 per channel — 0.7% — and the best
match is at offset 0ms**, meaning the export's frame at t=4000 *is* the
preview's frame at t=4000, not a neighbour. That residual is H.264 compression
plus the sampling downscale, and nothing else.

The threshold is set at 10/255: 5.5× headroom over the observed value, which is
loose enough to survive codec and bitrate variation and tight enough that a real
divergence — a missing layer, a fallback font, a wrong palette, all of which
cost tens of units — fails it.

---

## D-041 — The codec probe gates the offline path only
M4. A bug the fallback's first test caught immediately.

The export dialog disabled its own button when `canEncodeVideo` reported a
format unavailable. Correct for the offline path — and it made the
MediaRecorder fallback **unreachable**, because without WebCodecs the probe
reports *every* format unavailable, which is exactly the situation the fallback
exists for.

The probe now gates only when the offline path is actually in use. In fallback
mode the format selector is hidden too, since §11.9 is WebM regardless.

This is the second time in two milestones that forcing a fallback to run found a
bug that a green test suite had not (see D-038's HEIC note). Fallback paths are
by definition the ones the development machine never takes, so they have to be
forced deliberately or they are not tested at all.

---

## D-042 — Export tests run serially, in their own Playwright project
M4.

Each export test encodes a 1080p clip, which is genuinely CPU-bound. Run six
in parallel alongside the rest of the suite and the machine saturates — load
average hit 54 on this one — at which point unrelated timing assertions start
failing and the run took ten minutes.

The export spec is therefore its own project with `fullyParallel: false`, and
export tests get a 150s budget. Serial costs about ninety seconds and makes
every result mean something.

Worth remembering when adding the audio export tests at M6: they will be just
as expensive.

---

## D-043 — Transition functions take a fifth options argument
**Amends §6.4.** M5.

§6.4 specifies `(ctxOut, bufA, bufB, progress) => void`. Three of the seven
transitions cannot be written against that signature:

- `push` and `wipe` need a **direction**, which §5 already stores on the
  `Transition` and which is meaningless to the other five.
- `zoomBlur` needs a **scratch surface**. It accumulates several scaled copies
  of each buffer, and a composite that reads its own target mid-pass produces
  garbage on some drivers. `BufferPool` has held a third buffer since M1 for
  exactly this, anticipated in its own comment.

The extras arrive in a fifth argument — `{ size, direction, scratch }` — rather
than in module state, so the functions stay pure and the preview and the export
can run two different transitions at the same instant without interfering.

`size` is in **pixels**, not design units: a composite is a pixel operation, and
scaling it would resample an already-rendered frame for nothing.

**Rejected:** a factory per transition returning a four-argument closure (the
same data, one more indirection); module-level scratch (breaks D-001's
concurrency guarantee for the sake of one parameter).

---

## D-044 — An overlay's `transform` is normalised, and `wipeIn` uses `clipProgress`
M5. Fills in two things §5 leaves open.

**Placement.** §5 types an overlay's placement as `Partial<AnimatedProps>` —
a set of numbers with no units. Read literally, `x` would be design units, and
an overlay placed at 9:16 would hang off the edge of the same project at 16:9.
§1.3 requires switching aspect to *re-lay-out*, not to crop, so:

```
x, y            normalised 0–1 within the design box, default centre
scaleX, scaleY  multiply the overlay's nominal size, not the frame
rotation        degrees
opacity         0–1, multiplied into whatever the enter/exit preset does
```

A photo overlay's nominal size is 34% of the frame's short edge; a text
overlay's is 6.2%, scaled by its own `sizePct`.

**wipeIn.** Five of the six presets in §5 are transforms and compose by adding
keyframes. `wipeIn` is not: the content has to stay still while a window over it
opens. That is what §6.1 named `clipProgress` for, and until now nothing read
it. `MaskProps` gains `clipFrom: Direction`, and a mask with one clips to a
fraction of its box. The overlay wraps its content in that mask instead of
animating the content's own scale — which would be a squash, not a wipe.

**Overlay layers are memoised separately from scene layers.** The cache key
excludes `startMs`, so dragging a clip along the timeline moves *when* it draws
without rebuilding *what* it draws, and excludes the palette, because overlay
colours resolve at draw time through Paint roles like everything else (D-006).

---

## D-045 — Inspector edits carry an `ActionScope`
M5.

The four inspector tabs edit "the current scene". Showcase has one, so M0–M4
hard-coded index 0. A Motion Ad has eight, and *which* one is selected is
editor state: it must not be undoable, must not be saved, and cannot live in
the document.

Nor can it live in the action — `setGrain(0.4)` is created by a slider that has
no idea which scene is selected. So `Action.apply` takes a second argument:

```ts
apply(project: Project, scope: ActionScope): Project
```

The store supplies it at dispatch, which is the one place that knows both the
document and the selection. Every existing action kept its signature; only the
four plumbing helpers changed.

The dispatcher also suffixes the coalescing key with the scene index, so
dragging the same slider on two different scenes is two undo steps rather than
one merged one.

**Rejected:** a `selectedScene` field on the document (undo would step through
selection changes, and autosave would persist a cursor); an extra parameter on
every action factory (forty call sites, all passing the same value).

---

## D-046 — Ad templates expand asynchronously, and `?frozen` re-seeks
M5. Two halves of one problem.

An ad template has no `build()` (D-013), so its id must never reach a scene: the
renderer would throw rather than draw a blank frame. `setTemplate` therefore
loads the template *first* and only then dispatches — `applyAdTemplate` for an
ad, `setTemplate` for a scene template. There is no window in which the document
is invalid. `?template=<ad-id>` opens on the placeholder and expands on mount
for the same reason.

The consequence caught a real bug. A project's duration changes *after* the
first paint for every Motion Ad — ten seconds of placeholder, then thirty once
the ad expands — and `PreviewClock.seek` clamps to the current duration. So
`?frozen=10500` parked at 10,000 and rendered the wrong frame, silently. The
frozen hook now re-seeks whenever the duration changes.

That hook is what D-017 and D-040 rest on: `npm run thumbs` and every visual
test read frames through it. A silent clamp there would have made the thumbnail
job and the M5 suite agree with each other about the wrong picture.

---

## D-047 — `SceneTemplateRef` carries seed copy and a photo count
**Extends §7.** M5.

§7 gives a Motion Ad's scene refs three fields: template, duration, transition.
Expanded from those alone, an eight-beat ad is the same placeholder headline
eight times, which reads as a bug rather than as a template.

Two optional fields are added:

- `texts` — seed copy per beat, keyed by the sub-template's own slot ids.
- `photoCount` — how many photo slots this beat fills. A "hero shot" beat and a
  "grid of six" beat are frequently the same template at different counts.

`lint:templates` checks both against the referenced template: unknown slot ids
and out-of-range counts fail the build, as do durations outside the
sub-template's own bounds, aspects the sub-template does not support, and
transitions longer than half of their shorter neighbour — that last one being
the point at which D-004's overlap clamp would silently make the rendered
length disagree with the advertised one.

Photos are dealt from a moving cursor across the pool rather than restarting at
each beat, because consecutive beats showing the same photograph is the single
thing that makes an auto-filled ad look broken.

---

## D-048 — The export Playwright project depends on the app project
**Amends D-042.** M5.

D-042 gave the export spec its own project with `fullyParallel: false`. That
serialises tests *within* the project, but Playwright still schedules the two
projects into one worker pool — so a 1080p encode ran alongside five app
workers.

With 10-second clips that was survivable. M5's thirty-second eight-scene export
went from **20 seconds alone to over two minutes under that load**, and timed
out. Raising the budget would have hidden a real contention problem behind a
bigger number.

`dependencies: ['app']` makes the two phases disjoint. The full suite runs in
**2.7 minutes, down from 4.4** — serialising the phases is faster than letting
them fight, because neither half was getting the cores it needed.

---

## D-049 — The sample set is real photography
**Supersedes D-030.** Approved 2026-09-19.

D-030 chose synthesised abstract compositions for §8.1's "Try sample photos",
reasoning that stock photography meant a licence to track and attribute for
something that only ever stands in for the user's own pictures. The aesthetic
half of that argument did not survive contact with the product: template
posters made of gradients sell a template as a diagram, and a photo-to-motion
editor whose library contains no photographs is not making its own case.

The licensing half was real, and is settled a different way. The eight images
were generated by the project owner with their own tool, so there is no third
party to attribute and no licence to track. Provenance, the prompts and the
constraints a replacement has to meet are recorded in
`assets/samples/PROVENANCE.md`.

This does not touch §16's ban on generative AI, which is about features in the
product. Motion Studio generates nothing at runtime; an asset in the repository
has the same standing however it was made.

**Consequences worth recording:**

- **Sources live outside `public/`.** Everything under `public/` is served in
  dev *and* copied into the production bundle. 2.8MB of originals that nothing
  fetches would be a straight tax on §14's cold-load budget, so they sit in
  `assets/samples/` and `npm run samples` writes only the derived WebP.
- **`npm run samples` changed from a generator to an optimiser.** It still
  drives headless Chromium rather than taking an image library, for the reason
  §4 fixes the dependency list. It now fails if a name in `SAMPLE_NAMES` has no
  source file, or if the folder holds a file no name claims — the set and the
  code are not allowed to drift.
- **Quality is 0.75, not 0.82.** Checked against the two images that break
  first: `dune`, whose smooth sky gradient bands before anything else, and
  `slate`, which is fine fracture detail edge to edge. No visible difference,
  1.16MB across the set instead of 1.6MB.
- **The app now loads only the samples a document references.** Photographs are
  an order of magnitude heavier than the gradients they replace. A fresh
  Showcase project shows four of the eight, and fetching the other four against
  the chance someone presses "Try sample photos" is half a megabyte spent on a
  maybe. An ad expands to reference all eight and the effect runs again for the
  four that are new.

**What the set has to satisfy**, and why replacing one is not just a matter of
taste: a calm lower third (`kinetic-statement` puts a headline there), survival
of a centre crop to all five aspects (`fit: 'cover'` plus the frame-ratio
control), legibility at ~250px (`angle-fan` shows eight at once), and a low-key
grade (the default palette is `#0c0c11`).

---

## D-050 — The media store notifies; the inspector subscribes
M5, found while landing D-049.

`MediaStore` has carried a `revision` counter since M3, commented *"bumped on
every change, so callers can tell when a redraw is warranted"*. Nothing ever
read it. The mechanism was designed and never wired up.

The artboard did not need it — it repaints every animation frame and picks up
whatever is in the store. The **inspector** did: it renders once, decoded
bitmaps land in a `Map`, and React has no way to see that. Its photo tiles kept
whatever they had at first paint, which was nothing.

This was invisible for two milestones because the sample set was eight ~95KB
synthesised gradients fetched from a local dev server — the decode reliably won
the race. Real photographs at up to 312KB reliably lose it.

The store now keeps a listener set and notifies on every mutation;
`useMediaRevision()` wraps it in `useSyncExternalStore` for the three places
that read media during render (photo tiles, the logo preview, the overlay
source list). `subscribe` and `getRevision` are bound fields rather than
methods, because `useSyncExternalStore` compares the subscribe function by
identity and would resubscribe on every render otherwise. No React inside
`src/media` — D-001's eslint boundary still holds; the hook lives in the UI
layer.

**Worth recording about the test:** without the fix it fails at **three of four
tiles**, not zero. React re-renders for unrelated reasons and happens to pick up
whatever has decoded by then. A test that checked only the first tile would
have passed against the bug, which is presumably how it survived M3 and M4 —
so the assertion counts every tile.

---

## D-051 — Custom media: Mediabunny reads, a ring buffer bridges, export awaits
Completes §15's M5 row. Approved 2026-09-19.

M5 shipped with "add photo/text/custom media" two-thirds done. The overlay
kind, the `video` layer, `drawVideo` and a Pro-gated **+ Media** button all
existed; `MediaStore.getVideoFrame` returned `null` unconditionally and the
uploader accepted images only. A Pro user pressing the button got an overlay
that drew a grey rectangle forever. It was invisible because §12's dev toggle
did not exist either, so nobody could reach the Pro path at all — a gap hidden
behind a second gap.

**Mediabunny reads as well as writes.** §9 says "decode via `VideoDecoder`",
but feeding a decoder means demuxing the container first, §16 rules out
`ffmpeg.wasm`, and an MP4 demuxer is not code this project should own. The
symmetric decision to D-002: `Input` + `BlobSource` + `VideoSampleSink`.
`getSample(t)` is documented to return the last sample whose start timestamp is
≤ t — precisely §9's "frame nearest the requested timestamp". Verified against
the installed 1.58.1 typings, not from memory (§17).

**A ring buffer, because `renderFrame` cannot await.** §3A makes the render
synchronous and decoding is not, so the buffer is filled *ahead* of the draw by
whoever owns the clock. `videoDemands(project, t)` is a pure function from an
instant to the decode work it implies, which keeps the renderer free of side
effects while still never missing a frame. Twelve frames, ~0.4s at 30fps —
§9's "small ring buffer", and a cache miss draws the placeholder rather than
stalling the editor.

**The two clocks differ, deliberately.** Preview calls `prefetchVideo` and does
not wait: a stale frame for one animation frame after a seek is better than
dropping the whole editor to the decoder's pace. Export *awaits* it before
every frame, because a missing frame there is baked into the file, and an
export that quietly substitutes a placeholder is exactly the silent wrongness
§16 exists to prevent.

A frame more than 400ms behind the request is treated as a miss. Without that,
a large seek shows whatever the ring still holds — a frame from a completely
different part of the clip — until the fill lands, and the wrong picture is
worse than no picture.

**Looping.** A clip shorter than its overlay repeats. The common case is a
two-second texture under a ten-second beat, and holding the last frame for
eight seconds reads as a stall rather than as a decision.

**Two bugs fixed on the way in:**

- **+ Media** minted an overlay pointing at `media.ids()[0]`, which on any
  ordinary project is a *photograph*. It now opens a file picker and creates
  the overlay only once a clip has actually decoded — a video is not something
  the editor can invent a default for. The overlay panel's source list is
  likewise filtered to the overlay's own kind.
- The template glob `./*/*.ts` matched `_shared` and `_demo`, so
  `knownTemplateIds()` reported `chrome`, `look`, `photo`, `text` and
  `demoScene` as templates. Harmless — nothing looked them up — but it made
  every "unknown template" message misleading about what was available.

**§12's dev toggle exists now**, because the Pro paths cannot be tested without
it. That is the switch only; the inline upsell and the free-tier watermark
remain M7.

**On the test fixture.** `npm run fixtures` builds four one-second bands of
flat colour. The shape is the point: it lets the tests assert *which* frame is
on screen at a given instant, not merely that something drew. A ring buffer
serving whatever it decoded first passes the weak version of that test and
fails this one.

---

## D-052 — One audio graph, two contexts
M6. The audio counterpart of §3A.

§10 asks for two things that could easily have been written twice: a live
preview scheduling `AudioBufferSourceNode`s, and an export that "renders the
mixed audio offline into a single `AudioBuffer`". Two implementations of trim,
gain and fades is two chances for the exported mix to differ from the one the
editor played — the exact failure decision A exists to prevent on the video
side.

So `scheduleClips(ctx, destination, …)` takes a `BaseAudioContext`, which is
the shared supertype of `AudioContext` and `OfflineAudioContext`. Preview hands
it a live one; the export mixdown hands it an offline one. Neither knows which.

Underneath it, `envelope.ts` is pure arithmetic with no Web Audio at all —
`gainAt`, `resolvedFades`, `envelopeFrom` — so the rules can be pinned down in
unit tests that need no browser on either side.

Two details worth recording:

- **Overlapping fades are scaled, not truncated.** A two-second clip with a
  two-second fade in and a one-second fade out is something a user will drag
  into being. Truncating makes one of them vanish; splitting the available
  time in proportion keeps both audible, which is the only reading that
  respects what was asked for.
- **`envelopeFrom` carries the gain already in effect.** Playback rarely starts
  at a clip's beginning. A clip entered halfway through its fade-in has to
  resume at the level it had reached, or the fade audibly restarts.

---

## D-053 — The mix is rendered on the main thread and crosses as PCM
**Amends §10.** M6.

§10 says to render the mix offline and encode it; §11.7 puts the export in a
worker. Those two cannot both happen in the same place: **Web Audio does not
exist in a worker.** Measured, not assumed — inside a `DedicatedWorkerGlobalScope`,
`OfflineAudioContext` and `AudioContext` are both `undefined`, while
`AudioEncoder` and `AudioData` are present.

So the work is split along the line the platform draws:

- the **main thread** renders the mix through an `OfflineAudioContext`, using
  the same graph the preview plays (D-052);
- the resulting channels are **transferred** to the worker as `Float32Array`s,
  not copied — a three-minute stereo mix is about 70MB and structured-cloning
  it would briefly double that;
- the **worker** builds `AudioSample`s from raw `AudioSampleInit` and hands
  them to Mediabunny, which owns the encoder exactly as it owns the video one
  (D-002).

Audio source blobs are therefore *not* in the worker's media payload. It
receives a finished mix, not something to decode.

The mix is cut to the **video's** duration rather than the music's. Otherwise a
long track would silently change the file's length, and the muxer would be
holding two tracks that disagree about when the piece ends.

---

## D-054 — The audio clock is the clock
M6. How §10's drift budget is actually met.

§10: *"Preview playback uses `AudioBufferSourceNode` scheduled against the same
clock as the visual preview. Drift over a 60s preview must stay under one
frame."*

Accumulating `performance.now()` deltas cannot meet that. An audio device runs
on its own crystal and the two disagree by tens of milliseconds a minute —
every one of them visible as the picture sliding against the beat.

Rather than keeping two clocks in step, there is one. While audio is sounding,
`AudioEngine.currentProjectMs()` reports where the device has actually reached
and `PreviewClock` simply reads it; the visual frame is drawn for whatever time
the audio says it is. Drift is then not small, it is **structurally absent** —
there is nothing left to drift against. With no audio the clock falls straight
back to wall time, which is what Showcase mode and every silent project use.

`PreviewClock` gained a transport subscription for this. Web Audio cannot move
a source once it has started, so every play, pause and seek tears the graph
down and reschedules; polling for those at the readout's 12–20Hz would put a
visible stutter on every scrub.

**A bug this design did not prevent, and how it surfaced:** the first version
wrote the entire mix to the muxer before the video loop began. WebM accepted
it; **MP4 deadlocked** — an interleaved container will not let one track run
arbitrarily far ahead, so `add()` blocked waiting for video frames that had not
been produced yet. The export timed out at 140 seconds. Feeding the audio
alongside the video, two seconds ahead, brought it to 14.7. Worth remembering
that "it worked in one format" is not evidence about the other.

---

## D-055 — The timeline lane spans content; music gets move, trim and slip
M6, after the first version of the music track proved unusable on the ordinary
case: a track longer than the piece it scores.

**The lane was sized to the video.** Clip positions were percentages of
`totalDurationMs`, and `msToPct` clamps at 100%, so a four-minute track on a
fifteen-second ad drew as a full-width bar with its far edge *off the end of
the timeline*. It could not be trimmed, slipped or even seen. The only way to
shorten it was to not have imported it.

The lane now spans `timelineSpanMs` — the larger of the video and the audio —
with everything past the end of the video dimmed behind a dashed marker. That
also makes D-053 visible: the exported mix is cut to the video, and now the
part that will be cut is on screen rather than implied.

Two lengths, kept distinct, because conflating them was the bug:

| | |
|---|---|
| `totalDurationMs` | what renders and exports; what the playhead can reach |
| `timelineSpanMs` | what the lane has to *show* |

The scrub control reports the **video's** length as its `aria-valuemax`: the
lane may run on, but the playhead cannot, and promising reachable time that is
not would be a lie to anyone driving it from the keyboard.

**Three gestures, because trim alone cannot express the thing people want.**
Trim only shortens from the ends, so reaching a chorus ninety seconds into a
track means cutting away the ninety seconds before it — which also moves the
clip. The missing gesture is *slip*:

- **drag the body** → move on the timeline
- **drag an edge** → trim, holding the audio under the cursor still
- **⌥ + drag** → slip: change which section plays, clip stays put
- **⇧** → bypass snapping

Plus **Fit to video** and **Use all** in the inspector, because the common case
deserves one click, and a readout of the section in clock time — `0:12 – 0:27
of 3:40` — since the only other indication of where you are in a long track is
the shape of a waveform, which nobody can read.

A move is clamped against the **video**, not the lane. Clamping to the lane was
circular: the clip could never be dragged past an end that only moved because
the clip had.

**Two bugs found while building it**, both by tests written for something else:

- `trimAudioStart` computed a clamped window and wrote back only the *start*.
  Dragging the left edge far enough right left `trimStart` beyond `trimEnd` — a
  window whose duration computes to zero, so the music silently vanished
  instead of stopping at its minimum length. Both edges are written now.
- The first left-edge trim dispatched **two** actions, a trim and a move, with
  *different* coalesce keys. `commit` only merges with the entry immediately
  before it, so alternating keys meant every pointermove pushed its own undo
  entry: one drag could push a hundred and evict the user's real history off
  the end of `MAX_HISTORY`. Each gesture is one action carrying one key.

**On §12's Pro gate.** Custom media stays Pro, exactly as specified. What
changed is that `+ Media` no longer sits disabled doing nothing when clicked —
a control with no way to discover why it is inert reads as broken software. It
now carries a PRO badge, explains itself on click, and offers the dev switch
§12 already calls for. The inline upsell proper is still M7's.

---

## D-056 — Music is addressed absolutely, cut freely, and loops with the picture
M6, after the first cut of the music track was reported unusable. Three
separate faults, and the first was the serious one.

**The music did not loop.** Web Audio sources play once. The visual preview
loops, so the picture returned to zero while the track carried straight on —
and because the clock is *mastered* by the audio (D-054), the two did not
drift, they diverged by an entire loop: the frame showed 1s while the track was
31s in. The engine now re-arms a timer at the wrap and reschedules from zero.

Worth noting how this hid: `currentProjectMs` already wrapped its *reported*
position with a modulo, so the clock looked like it was looping correctly while
the graph underneath had nothing scheduled at all. The test that catches it
therefore asserts `audioMastered` remains true after the wrap, not merely that
the playhead came back round — the weaker assertion passes against the bug.

**A section deep in a long track was unreachable.** Slip is a drag, and a drag
maps pixels against the *lane*. On a fifteen-second lane the entire width is
fifteen seconds of slip, so "use the part at 1:30" in a three-minute track was
six full drags away. No amount of hint text fixes that; the gesture simply
cannot express it.

So the panel addresses the source **absolutely**: a *Start from* slider
spanning `0 … source − length`, and a *Length used* slider, both reading out in
clock time. Dragging stays for the small adjustments it is good at. The general
rule this is an instance of: a relative gesture scaled to the viewport cannot
reach a value larger than the viewport represents, and needs an absolute
control beside it rather than a bigger hint.

**There was no way to cut a passage out.** §10 says "one track for now" — one
*track*, not one clip, and `project.audio` has been an array since §5.
`scheduleClips` and `renderMixdown` both iterate it already, so the model cost
nothing: the music row now renders every clip, `addAudio` appends rather than
replaces, and `splitAudio` cuts one in two at the playhead. Split twice, delete
the middle. A split that would leave either side under the minimum is refused
rather than producing a sliver too small to grab.

Fades belong to the outer edges of a split: the left half keeps its fade in,
the right its fade out, and the new inner edges butt.

**Also fixed:** the split button first read the playhead from the
`__motionStudio` dev handle, which `AppShell` only installs under
`import.meta.env.DEV` — it would have been permanently disabled in a
production build. The timeline already samples the clock at 20Hz for its own
readout, so it publishes that to the store and the panel reads it there.

---

## D-057 — The transport spans the lane, and the artboard holds the last frame
M6, completing the music work.

The playhead stopped at the end of the video, so every second of overhanging
music was visible on the timeline, editable by slider — and impossible to
*hear*. Deciding where to cut a piece of music means auditioning the part you
are cutting, so the transport now runs to `timelineSpanMs`: the whole lane,
music included.

`totalDurationMs` still governs what renders and what exports. Only the
transport is longer, and with no audio the two are identical — nothing changes
for Showcase or for a silent project.

**The artboard holds the last frame past the end.** Left alone, the renderer
draws a scene whose layers have all ended: a bare background, which reads as
the preview having broken rather than as "past the end". The preview loop
clamps its render time to the video while the transport carries on, so there is
still a picture. The dimmed region of the lane and a `past end` marker on the
readout are what say where you actually are.

Clamped in the preview loop rather than in `renderFrame`, because it is a
property of *previewing*, not of rendering. The export never asks for a time
past the video, and D-001's one-render-function guarantee stays exactly as
strong: given the same time, both paths still draw the same pixels.

**`setPointerCapture` is now guarded.** It throws `NotFoundError` when the
pointer id is no longer active, and thrown from a React event handler with no
error boundary above it that unmounts the entire editor — a dropped drag would
take the application with it. Capture is an optimisation here: without it a
drag stops tracking once the pointer leaves the element, which is a small
degradation, and losing the editor is not.

## D-058 — changing the timeline's length must not change the transport

Found by a flaking test, and the flake was the smaller half of it.

`AppShell` applied its opening transport decision — autoplay, or the `?frozen`
park — from an effect keyed on the project's duration. D-046 added `duration`
to those deps on purpose, because a Motion Ad expands asynchronously and a
freeze applied once on mount parked every ad at the placeholder length. What
that missed is that the same effect also *decides whether the editor is
playing*, so every later duration change re-imposed that decision.

Under D-057 the duration now moves whenever the lane does, which is on every
music gesture that shifts the end of the track. So: pause the preview, add
music or drag a clip past the end of the video, and the transport silently
started playing again. The user's most recent instruction to the editor was
"stop", and the editor overrode it from an effect.

The mirror image is what flaked. With `?frozen` the same re-run does
`seek(frozen); pause()`, so an ad whose expansion landed *after* play had been
pressed re-parked the playhead mid-playback. The clock test measured that as
the audio clock advancing at a third of wall time and reported a stall — a true
symptom with the wrong cause attached, which is the expensive kind.

Split in two. Autoplay is now a mount-only decision about how the editor opens.
The re-seek keeps its duration dependency, because the reason for D-046 has not
gone away, but it only fires while the transport is still parked: pressing play
releases the freeze, and nothing re-imposes it.

Both halves are now asserted directly, on a paused preview and on a playing
one, rather than inferred from a timing ratio. Verified against the old
behaviour: both fail, each on its own assertion.

**`AudioEngine.play` is generation-guarded.** It can suspend at `ctx.resume()`,
and a seek arriving in that gap starts a second `play()`. The second calls
`stop()`, but the first has not scheduled anything yet, so there is nothing to
stop — and when it resumes it schedules sources that `#scheduled` holds no
reference to. Nothing can then stop them and they play over the top of the new
ones until the track ends. Only reachable around the first resume, since after
that `play()` never actually suspends, which is precisely why it would have
been diagnosed as unreproducible.

## D-059 — direct manipulation lives in the DOM, over the canvas

Placement was two sliders called "Across" and "Down". That is a way of typing
coordinates, not a way of putting something where you want it, and §8.3's own
logo panel had been promising "drag the logo on the artboard" since M3 without
anything behind it.

**The chrome is DOM, never pixels.** D-001 makes one `renderFrame` serve both
the preview and the export, so a handle painted into the canvas would be
encoded into the user's video and baked into every template thumbnail. Drawing
it as absolutely-positioned elements over the canvas also gets focus, cursors
and an accessible name for free, which a canvas cannot have.

**One coordinate space, in design units.** `bounds.ts` returns every box in the
project's design box — short edge 1080, the frame's aspect — and the view
converts to CSS pixels once, through the same uniform scale `makeViewport`
uses. Tracking CSS pixels instead would make rotation and resize depend on the
size of the user's window.

That one space turns out to cover scene content too, which was not obvious.
Every design box in play has the frame's aspect and differs from this one only
by a scalar, so anything expressed as a fraction of the short edge — which is
how templates are written, and how the logo's size and the safe inset are both
defined — lands in the same place in both. The logo therefore needed no second
coordinate pathway, and neither will a scene photo.

**Boxes come from the built layer, not from a second calculation.** `layerSize`
reads the props of the layer `overlayLayer` actually produced, and text is
measured with the spec the renderer measures. A selection box that is subtly
wrong is worse than none, because it teaches the user that the handles lie. The
one place the arithmetic genuinely is duplicated — the logo's placement, which
the template chrome computes as a layer and this computes as a rectangle — is
pinned by a test that builds the real layer and compares. Verified by
introducing the obvious drift: it fails on all five aspects.

**Handles are capped at a third of the box.** A one-line caption is about 20
CSS pixels tall; an unclamped 13px hit zone on the north edge and another on
the south met in the middle and swallowed the body, so pressing the centre of a
caption stretched it instead of picking it up. Grabbing the body has to keep
working at every size — it is the gesture people reach for first.

**Resize projects onto the handle's own direction** rather than taking the
distance from the anchor. The absolute version mirrored the object when an edge
was dragged past its opposite: pulling the top edge downwards made the box
taller *upwards*. Both of these are covered by tests that were checked against
the unfixed code.

Conventions chosen to match what people already know: corners keep the
proportions, sides stretch one axis, ⇧ turns snapping off everywhere (matching
the music track), rotation snaps to fifteens, arrows nudge and ⇧+arrows nudge
further. Selecting the logo opens the logo panel, because selecting something
and then having to go and find the panel that edits it is a step nobody should
have to be told about.

The drag and the Size slider share one set of bounds (20–600%). They did not at
first, and a corner drag produced 416% while the slider stopped at 300% — the
document then held a value the panel could not show, and the next touch of the
slider would have snapped the overlay down without being asked.

## D-060 — the measurements get a quiet phase

Three tests measure time: §14's frame and build budgets, and §10's drift
budget. Under five parallel browsers they measure the machine instead. The
60fps assertion passes six times out of six on its own and fails about one run
in two inside a saturated pool — and the number it prints is honest, in that
the frames really did not happen, because the CPU was busy running the rest of
the suite.

This is D-042's problem again, and gets D-042's remedy: `app` → `perf` →
`export`, three disjoint phases, each measuring what it claims to. The tests
are tagged `@perf` in their titles and selected by `grep`.

Worth recording what this is *not*. The suspicion was that the new selection
layer had slowed the render loop, and it took a proper baseline to rule out —
including one round where the diagnostic itself, an extra `AudioContext` opened
to tell a starved audio device from an app fault, was heavy enough to skew the
very numbers it was measuring. With the same 79 tests as before, the runtime
change is neutral: 1.1m against a 1.0–1.1m baseline, all passing.

## D-061 — the template's own elements move, by offset (B)

Choosing B over C. C would have let each template declare which of its
elements may be moved, which sounds safer and is worse: some things would drag
and some would not, with no way to tell which without trying. For an editor
whose whole claim is that it needs no training, unpredictable is worse than
either extreme — people would conclude it was broken rather than that the
headline was protected. So everything moves, and "Reset to template" is what
makes that safe.

**A nudge is an offset, never a position.** The template still decides where
things go; the document records how far the user pulled each one from there.
That is the difference between "you may adjust this layout" and "you have taken
this layout over", and it is what keeps §1.3 true: switching aspect still
re-lays-out, switching template still works, and a photo that moves because its
neighbours changed takes its nudge with it. Reset is then just forgetting the
entry — there is no original position to reconstruct, so there is nothing to
get wrong.

**Nothing in any template changed.** `photoProps` and `textFor` are the two
funnels every template's photos and text already pass through, and both are
handed the slot's identity anyway, so the tag is applied there. Templates not
written yet get it for free, and none of the nine had to be touched.

**Composed into the layer's own tracks, after the build.** Per keyframe, so a
photo that drifts across its scene keeps drifting — it just drifts somewhere
else. Replacing the track with a constant would have thrown the motion away,
which is the one thing a nudge must not do. Scale multiplies and rotation adds
for the same reason.

Applied *after* `structureKey` rather than folded into it: a drag changes these
values on every pointer move, and putting them in the build key would re-run
`build()`, with its text measurement, sixty times a second for the length of
the drag — §16's forbidden build-in-the-render-loop wearing a different hat.
With nothing nudged, `applySlotTransforms` returns the cached array by
reference, so a project that never uses this pays nothing at all.

**The editor reads what the renderer drew.** `rig.drawn` records the primary
scene's built layers, and the preview loop publishes it to React when its
identity changes — which is when the scene or its layers change, not once a
frame. The current time is deliberately not in that record: it changes every
frame, and the editor can work it out from the playhead. The first version put
it there and the boxes simply never appeared, because React read the scratch
once at mount and never looked again.

Slots get corners and rotation but not edge handles: one uniform scale is all a
nudge carries, and a template photo's proportions are the frame-ratio control's
business (§8.1).

## D-062 — text is aligned within its declared wrap width

Found while fitting selection boxes to text, and a real rendering bug rather
than a measuring one.

`drawLayer` anchors a text layer on `maxWidthPx`, deliberately, so that a
centred heading does not shift about as its content changes length. `drawText`
then aligned its lines within the *measured* width instead. The two disagreed,
so a centred caption with wrapping on was drawn half the slack to the left of
where its anchor said it was: "Across 50%" did not put it in the middle of the
frame, and the demo scene's own headline sat about twenty-six pixels left of
the artwork beneath it.

The block has to be the same width in both places or centring cannot mean
anything, so the paint now uses the declared width. The five demo-scene
baselines moved, and the new ones are visibly better centred.

The matching arithmetic in `bounds.ts` walks the alignment offset back out,
because the handles go round the glyphs rather than round the wrap column.

**And the write-back has to invert it.** A box is drawn at the centre of what
is painted, but a drag writes a *position*, and for an anchored layer those are
different points. Missing that made every overlay drag overshoot by a constant
— invisible horizontally, where the offset happens to be zero for centred text,
and exactly half a line vertically. `PlacedBox.anchorOffset` carries the gap so
both directions agree.

## D-063 — overlay keyframes, in the shape people already know

The render core has done keyframed motion since M1 — `Tracks`, easings and a
spring solver are the heart of it. What was missing was any way for a user to
say so. So this is almost entirely a translation problem, and the design
decisions are about what *not* to build.

**A pose, not a property track.** One keyframe holds position, size, rotation
and opacity together. Five separate lanes is how a compositor works and is
exactly the thing that makes compositors need explaining. People think "it is
here at the start and over there by the end"; a pose is that thought written
down.

**Auto-keyframe.** Move the playhead, drag the overlay, repeat. There is no
record button and no "add keyframe" step in the main path — the button in the
panel exists for the case where you want one without moving anything.

**One easing for the whole overlay**, named Smooth, Even and Springy. A curve
editor is the point where a motion tool starts needing to be taught.

**Off until asked for.** No `poses`, no behaviour change, no extra widget in
anyone's way. Turning it on seeds a single pose from wherever the overlay
already sits, so nothing moves — one keyframe is the same picture as none.

**Presets compose over the path rather than competing with it.** An entrance
and a motion path both want to control position. The entrance is transient, so
`composePath` lays it over the first `enter` milliseconds, samples the path at
the moment it settles and hands back. The exit does the same in reverse, which
is why an overlay that travelled across the frame leaves from the far side
rather than snapping home first.

That also avoids the group wrapper the obvious implementation wants, and means
there is one code path rather than two: an overlay with a single pose samples
the same value everywhere and every track collapses to exactly the keyframes
these functions produced before any of this existed. The nineteen existing
overlay tests passed unchanged through the refactor, which is the evidence for
that claim.

**A new keyframe is seeded from everything the overlay is already doing.**
Dropping one to move something sideways must not snap its size, rotation and
opacity to their defaults at the same instant — the commonest way a keyframe
editor surprises someone who only meant to nudge one thing. Verified against
the unfixed version.

The inspector's own placement sliders edit the pose under the playhead too.
They wrote `transform` at first, which is the resting placement and is ignored
while a path exists, so they showed a stale number and appeared to do nothing.

**Scene content deliberately does not get this.** A template's elements are the
template's, and animating them would fight the motion it was designed around.
They keep the static nudges of D-061.

## D-064 — a scrub publishes the playhead immediately

`scrubTo` moved the clock and updated the ruler's own readout, leaving the
store's `playheadMs` to the 20Hz sampler. Everything that *acts* on the
playhead was therefore working from where it had been up to fifty milliseconds
ago.

That was survivable when the playhead only decided whether a music clip could
be split. It is not survivable for keyframes: fifty milliseconds is inside the
sixty-millisecond tolerance that decides whether two keyframes are the same
one, so a drag straight after a scrub could land on the wrong keyframe, and
switching animation off could freeze an overlay at the wrong moment. It did,
and a test caught it.

A scrub is a deliberate move to an exact time, so it now says so at once.
Playback still publishes at 20Hz, which is all a readout needs.

## D-065 — stacking, as a nudge

Nothing let anyone say which element should be in front. Overlays had lanes,
which are stacking but do not read as it; the template's own elements had no
control at all.

**For scene elements, `z` joins the slot nudge.** Same shape as the rest of
D-061 — the template's stacking is the starting point and this records how far
the user has lifted something out of it — so it survives a template change and
"Reset to template" puts the order back along with everything else.

**Only the tagged elements are reordered, and only among the positions they
already occupied.** The first version sorted the whole layer list, which made
"Send to back" mean *behind the background*: the photo did go to the back, and
it vanished. Literally correct and not what anyone means. The background and
any decoration the template drew between the photos now stay exactly where they
were, and the content is permuted around them.

**Front and back, not forward and backward.** A single step needs to know what
the neighbours are, and the document holds nudges rather than the built layer
list, so it cannot see them. Front and back is also the question people
actually ask.

**For overlays, both halves move.** §6.4 draws by track and then by position in
the list, so bringing one to the front sets its track *and* puts it last.
Changing only the track would leave two overlays sharing a lane stuck in
whatever order they were added — which is exactly when someone reaches for
this. The lane control stays, relabelled, because the timeline shows lanes and
they are useful for organising clips in time.

## D-066 — keyframes had to be visible before they were useful

Reported as "I do not understand what it does as I do not see anything that
shows it on the app", and measuring the page bore that out exactly: the
controls sat **1102 pixels** down the inspector, under a heading called
"Movement" that was directly below another one called "Motion". Nothing on the
canvas or the timeline said the feature existed.

**A motion path on the artboard.** A dashed line through the poses with a dot
at each, and the one under the playhead filled. This is the fix that matters:
it answers the only question anyone has while placing keyframes — where is this
thing going — and it makes the feature discoverable to someone who never opens
the panel. Each dot comes from `overlayBox` at that pose's own time, so it sits
exactly where the handles would be if the playhead were there, rather than at
the raw stored position, which for anchored text is half a line away.

**Movement folded into Placement.** Where something is and where it is *over
time* are one question. Splitting them is what put the controls below the fold
in the first place, and "Motion" and "Movement" as adjacent headings was a
distinction nobody should be asked to hold.

**The diamonds got bigger.** Six pixels on a thin clip is not a signal.

**Escape now works from anywhere.** It was bound to the selection box, so it
only worked while that box had focus — touch any control in the inspector and
it silently stopped. It skips text fields and defers to an open dialog, both of
which have a better claim to the key.

## D-067 — persistence: documents and blobs are stored apart (M7, in progress)

Two IndexedDB stores, because the halves have nothing in common. A document is
a few kilobytes of ids and numbers rewritten on every edit; a photograph is
megabytes written once and never touched again. Together they would mean
rewriting the photographs every time someone dragged a slider. Media is keyed
by `mediaId` and shared across projects, exactly as §5's "the document holds
only ids" implies, so duplicating a project will copy a list of ids rather than
a pile of blobs.

**What is stored is the original blob, never the decoded form.** An
`ImageBitmap` cannot be written to IndexedDB, an `AudioBuffer` is many times
the size of the file it came from, and a `VideoClip` holds an open reader. A
restore therefore runs the same decoders the uploader runs, which is what makes
a reopened project behave identically to one just imported rather than nearly
identically.

**Autosave is debounced at 700ms and waits for the restore.** Writing before
reading would save the blank project the store starts with straight over the
one on disk, which is the worst thing a save can do. Blobs are written once
each and tracked, so an edit costs one small document write.

**A deep link wins over the last project.** `?template=` and `?scene=` mean
"show me this" — they are how `npm run thumbs` and the whole visual suite drive
the app — so a URL that names something always starts fresh, and only a plain
visit reopens previous work. It is also what a link is for: sending someone a
template and having it open their own half-finished ad would be worse than
useless.

**`migrate.ts` exists now that saves do.** One step per version, so adding a
version means adding a function. It refuses a document written by a newer build
rather than guessing, because forwards is not a migration. The v1 → v2 step is
kept even though no v1 document was ever written — persistence arrived with
v2 — so the chain stays honest and the mechanism has something real to be
tested against.

## D-068 — one IndexedDB database per store

`idb-keyval`'s `createStore(db, store)` opens the database at its default
version and creates only *its* object store in `onupgradeneeded`. Three calls
against one database name meant the first to open created it at version 1
holding a single store; the other two then found the database already at
version 1, their upgrade never ran, and every transaction against them threw
`NotFoundError`.

The save therefore failed on its first attempt and on every attempt after it.
The badge read "Not saved" for the whole session and a reload found nothing —
which is exactly how it was reported. Each store now has its own database,
which is the library's own convention.

Worth naming the shape of the mistake: the failure was total and immediate, and
it still shipped, because the work was committed on a green typecheck and a
green suite that had nothing to say about IndexedDB. The tests added here would
have caught it in the first minute.

## D-069 — undo has a floor at the document you opened

A project opens as a placeholder and only becomes an ad once its template has
been fetched and expanded (D-046) — and that expansion was dispatched through
the ordinary undoable pipeline. So enough presses of ⌘Z walked back *through*
it and left the editor showing the bare M0 test card, with one scene called
`__placeholder__`. Reported as "when I use undo, especially on the motion, I
get into blank page", and keyframing is exactly where it would surface first,
because it is the feature that has you making several small edits and then
reconsidering them.

Opening a document is not an edit to it. `setTemplate` now takes
`asBaseline`, and the initial expansion seals the history behind it, so the
earliest state undo can reach is the ad as it first appeared. Picking a
template from the library stays undoable, because that *is* an edit.

## D-070 — the debounce needed a flush

Autosave waits 700ms, which leaves a window where an edit made and a tab closed
in quick succession is lost. That is the exact promise §13 makes, so the window
had to be closed: the save now also runs on `visibilitychange` to hidden and on
`pagehide`.

It is a real fix for a closing tab and it is *not* a substitute for waiting,
which the tests here have to do explicitly. A programmatic reload tears the
page down faster than an IndexedDB transaction completes, so a test that edits
and reloads immediately is testing the teardown race rather than persistence.
The badge cannot help it decide: it reads "saved" from the previous write while
the newest change is still inside the debounce.

## D-071 — keyframes had to say "keyframe"

Reported as "nothing on the UI says keyframe, no place to add it or define
keyframe start and keyframe end". Both halves were true. The word appeared only
*after* flipping a switch called "Animate movement", so anyone hunting for
keyframes found nothing at all, and the only way to make one was the general
mechanism — move the playhead, drag — which is not what people ask for first.
They ask to say where a thing starts and where it ends.

So: a **Keyframes** section, named, above Placement, explaining what a keyframe
is before anything is turned on. **Set start** and **Set end** buttons that go
to that moment *and* key it, so the frame being defined is the one on screen. A
**list of keyframes with their times**, each one a button that jumps the
playhead to it and carries its own remove. The general mechanism still works
and is now the third way in rather than the only one.

"Set end" keys `span - 1`, not `span`. A layer's time range is half-open
(`timeMs < endMs`), so the exact end is the first instant the overlay is *gone*
— the keyframe was real and there was no object on screen to drag.

**Navigating publishes the playhead**, for the reason D-064 gave: everything
that acts on it reads the published value, which the readout only refreshes at
20Hz. Leaving that to catch up meant a drag straight after "Set end" wrote its
keyframe at the time the playhead used to be, so both ends of the motion
quietly became the same pose. It failed two runs in three before the fix.

## D-072 — the watermark is a property of the rig, not of the renderer

§12 gives the free tier a watermark and §6.4 draws it at step 5. The renderer
cannot ask a React hook (D-001) and must not read ambient state, or it stops
being a function of (project, time, rig).

So the rig carries an accessor. The preview's asks the entitlements module each
frame, which is what lets the dev toggle take effect without rebuilding the rig
and discarding every cache; the export worker's returns the flag the *request*
carried, so an export states its own tier rather than inheriting whatever the
main thread believed.

It is suppressed for `?thumb=` and `?scene=`. A thumbnail job photographing a
template for the library, and a render-core fixture, are not documents anybody
is making — and a watermarked template thumbnail would be advertising the
limitation rather than the template.

Shown on the preview, not only at export: finding out at export time that the
picture has a mark on it is the worst possible moment to learn it.

## D-073 — the duration cap offers both doors

§12 asks for the inline upsell to offer either upgrade or "remove this scene to
keep working with the first 15 seconds". Both, because offering only the
upgrade makes a cap feel like a hostage situation, and the trim is genuinely
what someone evaluating the app wants: a piece that exports, now, at the length
they are allowed.

Nothing is enforced behind the user's back — the project stays over the cap
until they choose. Silently deleting a scene on a tier change would be far
worse than an export that refuses.

`trimToLimit` keeps only the scenes that *fit*. The first version kept the one
straddling the cap, on the theory that cutting a beat in half is ruder; the
result was a project still over length with the banner still up, which makes
the button look broken. Whatever the spec's offer says it does, it has to
actually do.

## D-074 — the project list is a dialog, and reads from disk

§13 asks for a project list "on load, with rename, duplicate and delete". A
dialog rather than a gallery screen: the editor is the application, and sending
someone to a separate place to get back into their work adds a step to the
thing they do most — opening the project they were just in, which autosave
already does for them.

It reads the list from disk every time it opens rather than mirroring it in
React state. The list is small and looked at rarely, and a cached copy would be
one more thing that can disagree with what is actually saved.

**Switching projects flushes the one being left.** Autosave is debounced, so
anything done in the last fraction of a second — renaming it in this very
dialog, most obviously — has not reached disk. Without the flush, switching
away saved the *new* project over that intent and the rename was gone. A test
caught it as "Untitled project copy" where "Original copy" was expected.

**Duplicate copies what is on screen**, not what is on disk, for the same
reason. And it is genuinely cheap: the document holds only ids (§5), so a copy
refers to the same photographs rather than duplicating them — which is also why
deleting a project deliberately leaves its media alone. Blobs are shared, and
reclaiming them needs to ask every remaining project what it still refers to.

`writeProject` stamps `savedAt` itself. Asking callers for it put a clock
reading in every one of them, including inside React components, where reading
the clock during render is exactly the impurity that makes output depend on
when it ran.

## D-075 — offline is a requirement here, not a nicety

§9 says nothing ever leaves the device, so an editor that stops working without
a network would be failing at its own premise. Everything it needs is already
local: templates are bundled, media is in IndexedDB, the encoders are the
browser's.

`vite-plugin-pwa` in `generateSW` mode, precaching the wasm and the fonts as
well as the code — the HEIC decoder is what makes half the photo formats work,
and the default 2MB cap would have silently skipped it. Disabled in
development, because a service worker caching the dev server is a reliable way
to spend an afternoon debugging yesterday's code.

Icons are generated from `public/favicon.svg` by `npm run icons`, for the
reason §7 forbids hand-made thumbnails: two files meant to be the same picture
drift the moment one is edited.

## D-076 — below tablet, the side columns become sheets

§13's words. The test is not that things get narrower but that they change
kind: at 1100px an artboard with both columns open is down to about 520px,
which is the point the preview stops being the biggest thing on screen.

The sheets hold *the same components* — `LibraryRail` and `Inspector`
unchanged. Forking them into phone versions would be two of everything to keep
in step for the rest of the project's life, and the first thing to drift would
be exactly the controls a phone user has no other way to reach.

Measured from the window through `useSyncExternalStore` rather than written as
media queries, because the choice is structural rather than cosmetic, and
reading the width during the first render avoids showing a desktop layout to a
phone for a frame.

A sheet covers the toolbar, so two cannot be swapped without closing one. That
is how sheets behave everywhere else, and it is what makes tapping away the
obvious way out — which is now what the test asserts, having first asserted the
switching behaviour I had assumed and not built.

## D-077 — the template's own elements get keyframes too

Reported twice, the second time as "nothing on the UI says keyframe" from
someone with a photo selected. Keyframes existed only for overlays (D-063), so
selecting a template photo offered a Placement section containing nothing but
"Reset to template". Searching the page for the word found nothing, and the
reasonable conclusion was that the product did not have the feature.

The reasoning behind overlays-only was that animating a template's element
would fight the motion the template was designed around. That is a real
tension, and it is not a reason to withhold the control — it is a reason to
decide what the control *means*. What is keyframed is the **nudge**: how far
the user has pulled the element from where the template put it. So the two
motions compose rather than compete, the same way D-061's static nudge already
did, and an element with keyframes still drifts the way its template intended.

`KeyframeControls` is now one component serving both. An editor where some
things animate and some do not, with nothing saying which, is exactly the
confusion this set out to end.

**One pose is keyframes *on*, not motion.** Two questions live here and
conflating them cost three separate bugs in one sitting: the switch read "off"
after seeding its first pose, the constant path read the resting values and
ignored what that pose said, and `isIdentity` declared the element untouched
and skipped it. `hasNudgePoses` answers "has the user turned this on";
`animatedNudge` answers "does it move".

**The composite is sampled at the union of both sets of keyframe times.** Two
motions have to become one track and they do not share times, so the result is
pinned wherever either curve changes direction and interpolated between. That
is an approximation of "template easing plus user easing", and the right one —
but it is only used when the nudge actually moves. A constant nudge keeps the
exact path it had, because approximating something that needs no approximation
would quietly cost fidelity to every project that never asked for this.

## D-078 — M8 opens a fifth category: Split Frame

§15's M8 asks for 25 templates across at least five categories. The library had
nine across four, and the gap was not only a count — it had no *comparison*
layout at all, which is the thing people reach for most: before and after, two
products, two places.

`split-pair` is the first of the category. Two photographs meeting on a hard
seam, arriving from opposite edges, with the seam drawn in the accent colour
rather than implied — two photographs of similar tone read as one badly cropped
picture without it.

The split follows the frame: side by side where there is width to spare,
stacked where there is not. A 9:16 frame cut vertically gives two slivers
nobody can read, and §1.3 requires an aspect change to re-lay-out rather than
to letterbox.

Type sits over the join on a scrim of its own, because a caption legible on one
half and lost on the other is the usual way this layout fails. The scrim needed
an explicit position: a centre-anchored layer with no x/y draws at the origin,
which is the top-left corner, so the first version put it in the corner and
left the type with nothing behind it.

## D-079 — the playhead decides where a keyframe goes

"Set start" and "Set end" were wrong, and reported as wrong: they chose the
times themselves — start meant zero, end meant the end of the clip — wherever
the playhead actually was. Moving the scrubber *is* how someone says when
something happens, and a control that overrides the choice they just made
reads as the tool not listening.

One action now: **Add keyframe here**, at the playhead, with **Remove** for the
one under it. The hint below changes with the count, so the second keyframe —
the one that turns a pose into motion — is asked for rather than assumed.

**Keyframes show on the timeline.** An overlay's sit on its own clip, which is
where anyone would look. A template photo has no clip of its own, so its
keyframes now mark the scene track it belongs to. Without that the only
evidence anything was animated lived in a panel.

## D-080 — clicking the timeline moves the playhead

It used to be the ruler strip alone: a five-pixel target you have to know
about, with every other part of the timeline inert. Reported as "I keep looking
for ways to bring the playhead to current location", which is the right
complaint — every editor anyone has used scrubs when you click its timeline.

Clips stop the event themselves, so dragging a scene or a music clip is
unchanged; this catches the space around them.

## D-081 — the playhead is published by the shell, not by the timeline

Found while fixing the above, and worse than either. The published playhead was
sampled by the Timeline's own interval — and the Timeline only exists in Motion
Ads. In Showcase it therefore never moved off zero, so everything that *acts*
on the playhead was silently wrong there: a keyframe added at four seconds was
recorded at zero, and the canvas believed the element had not moved.

The playhead is a property of the application, not of one panel that happens to
draw it. The shell publishes it now, at the same 20Hz, and the timeline keeps
only its own readout. The artboard still reads the clock directly every frame
(§3A) and is unaffected.

## D-082 — motion is a span, and the span lives on the timeline

Reported three times, finally plainly: "can't I have them on the timeline like
other products have them". Every version before this asked the user to think in
points — add a keyframe, add another, hope the gap between them is what you
meant. That is the general case, and leading with the general case made the
simple job (move this from here to there over a couple of seconds) as much work
as the hard one.

Motion is now a **bar**: it starts here, it ends there, drag the body to move
it, drag an end to change how long it takes. Five seconds by default, clamped
to the element — a three-second overlay gets a three-second motion rather than
one that runs off the end.

**Both ends start as the pose the element already holds**, so adding a motion
changes nothing until you move the element at one end of it. That is what makes
the bar the thing you reach for first and the canvas the thing you reach for
second, instead of a keyframe silently teleporting something the moment it
appears.

Poses are still the model underneath, and three or more is still a path — the
panel says "a custom path with several points" and the bar moves the whole
thing. The general case did not go away; it stopped being the front door.

**Showcase gets the bar on its scrubber.** It has no track timeline (§1.1), so
a motion added there had nowhere to show and could only be edited through a
panel. The slider is that mode's time axis, so the same bar goes on it.

**The motion styles are named for what they look like**: Smooth, Soft bounce,
Steady. The spring was retuned — damping 17 rather than 20 — because a "soft
bounce" that does not visibly overshoot is just a slower move. Slots had no
choice at all before this; their easing was hardcoded, which is part of why
motion there felt like it dragged.

## D-083 — a nested drawable is measured in its parent's space, and on its parent's clock

Found while planning a template that wanted a rotating ring, and it turned out
to be a defect already shipped. A group or a mask is not a container: it is a
coordinate space *and* a clock. `drawLayer` draws children inside its own
transform and hands them its own local time, so a child's `x` of 0 means "at my
parent's centre", not "at the left edge of the frame".

`slotBoxes` carried neither. It walked into groups and masks to find tagged
drawables — correctly — and then read their positions as though they were
top-level layers. Phrase Swap puts its photographs inside a mask at the centre
of the frame that scales from 0.6 to 1.12, so **its photo's selection box sat in
the frame's top-left corner, at the wrong size, for the whole scene.** Selecting
that photograph put the handles nowhere near it.

The ancestry — position, scale, rotation and time — is now accumulated on the
way down and composed into the box. At the top level the composition is the
identity, so nothing about the common case changes.

Rejected: forbidding masks around tagged drawables. Masking is how a photograph
gets a shape that is not a rectangle, and three of the new templates want it.

## D-084 — a nudge is sampled on the element's own clock

The same bug from the other side, and worse because it affected templates with
no nesting at all. A nudge with poses becomes keyframes *inside the element's own
tracks*, so by the time anything is drawn its pose times are local times. The
boxes sampled it against the scene clock.

For a layer starting at zero the two are the same, which is why this survived —
most template layers do. But every template that cycles gives its elements a
start time of their own: Card Stack, Flip Cards, Spotlight. On those, a motion on
a photo put the handles somewhere the photo had never been.

Both halves are pinned by tests that fail without them. Five of them, and they
were watched failing against the reverted file before this was called fixed.

## D-085 — slot-tagged drawables are not put inside a transformed container

The constraint that falls out of D-083, and it binds template authors rather
than the renderer.

Composing the ancestry fixes where the *handles* are drawn. It does not fix
where a *drag* goes, because a nudge is applied inside the layer's own tracks and
is therefore scaled and rotated by every ancestor before it reaches the screen.
Dragging a photograph rightwards on a ring turned 30° would send it off at 30°.
In a feature whose entire promise is that things go where you put them, that is
indefensible.

So Pinwheel is not built as a rotating group, although a turning ring is exactly
what a group is for: the orbit is sampled into each photograph's own tracks
instead — twenty linear samples, because the turn is linear and a pinwheel that
eases looks like one winding down. Rotation needs no sampling at all, being two
keyframes, and the entrance is a spring on scale rather than a flight out from
the centre, which is what keeps the position tracks pure orbit.

Where a container is genuinely needed, it stays an **identity** transform and the
motion goes elsewhere: Panels, List Drop and Side Band slide the photograph
*inside* a static window, and Pull Quote scales the photograph inside a circle
that never scales. Identical to look at; exact to drag. `clipProgress` is the
one animation a container may have, because it moves the window and not the
child.

## D-086 — twenty-five templates, five in each of five categories

§15's M8 asks for 25 across at least five categories. Distributed evenly rather
than by filling the easiest category, because the category list is the top-level
navigation: a library of 5 / 2 / 2 / 2 / 14 teaches the user that four of the
five tabs are not worth opening.

What each new one is *for* drove the choice, not what was easy to draw. The
library could show a photograph beautifully and could not make a list, a
statistic, a testimonial, or a photograph beside a block of copy with a button in
it — which between them are most of what anybody actually posts. Hence Big
Number, List Drop, Pull Quote and Side Band, none of which are camera moves.

Three deliberate constraints came out of writing them:

- **An empty text slot is removed, not skipped.** List Drop has four item slots;
  a project using three has to read as a list of three. Reserving the space
  leaves a hole that looks like a bug in the export, so the items are measured
  before anything is placed.
- **Layers are stations, not photographs**, wherever photographs cycle through
  positions. Draw order is fixed at build time and a cycling arrangement's depth
  order is not, so the layer has to be the place and the photograph has to be
  the thing passing through it. Card Stack found this first; Depth Tunnel and
  Spotlight are built the same way.
- **Pull Focus is capped at four photographs**, and that is a render-cost
  decision rather than a design one: every photograph is alive for the whole
  scene and all but one is blurred, so each costs an offscreen pass per frame
  (§14).

## D-087 — a click on the timeline is selection *and* time

Reported after everything else about the timeline worked: "when I click an
element on the timeline, the playhead does not move to that click location… I
keep looking for ways to bring the playhead to current location."

Every editor moves the playhead when you click empty timeline, and none of them
move it when you click a clip — clicking a clip selects it, because a selection
you cannot make without also losing your place is not a selection. Both
conventions are right, and following only the second leaves no way at all to say
"take me to this moment in this thing".

So the rule is **the first click chooses the thing, and a second click on the
thing already chosen says which moment of it.** No modifier to learn, nothing to
discover, and the case that prompted it — wanting the playhead somewhere inside a
clip — takes two clicks in the place you were already pointing.

A drag is not a click. The press records where it started and whether the clip
was already selected, and the release decides: more than three pixels of travel
and it was a drag, so the clip moved and the playhead did not.

Rejected: seeking on *every* click, which the same report offered as its first
suggestion. It makes selecting something destroy where you were, and you cannot
open a clip's panel without losing your frame.

**The empty music row was a special case of the same complaint**, and a plainer
bug: its "No music" note sat over most of the row and swallowed the press, so the
one row with nothing in it was the one row where clicking did nothing. It is
`pointer-events-none` now.

## D-088 — motion is a lane, and its ends are diamonds

The span model (D-082) was right and the drawing of it was not. Two faults,
reported together.

**It was nested inside the clip.** The bar's positions are lane percentages, so
inside a four-second clip they were percentages of four seconds: a three-second
motion came out about eighteen pixels long, in the wrong place, tucked into a
corner of the clip it belonged to. "It is too tiny to know that I can move it"
was a generous reading of a bar that was also in the wrong place.

**And its ends had no shape.** A control that can be dragged has to look like
one, and for a keyframe that means a diamond — the shape every timeline has used
for this for thirty years and the one people arrive already knowing. Asked for
by name: "keyframes are represented by a diamond shape".

So motion has a lane of its own, on the same time axis as every other row, with
diamonds at the ends sitting in 24-pixel targets. A custom path shows a smaller
diamond at each point it passes through; a plain A-to-B does not, because there
the two ends are the whole story and a third diamond would be inventing one.

The lane also says something when there is nothing on it. The commonest report
about this feature was never that it worked badly — it was that nobody could find
it — so an element with no motion yet gets a **+ Motion** button on the lane,
next to a line saying what to do after pressing it.

## D-089 — the playhead is published every frame

"The image moved fast and the outline moves slowly as expected over the duration
of the frame."

Measured under scrubbing, the selection box and the element agree exactly. Under
*playback* they could not: the artboard draws at 60fps from the clock, and the
playhead everything else reads was published on a 50ms timer. The picture moved
smoothly and its outline stepped along a third as often.

20Hz was a defensible choice when the only things reading it displayed a number.
It stopped being one when the selection box started following a moving element.

Published on every animation frame now, and only when it has actually changed —
so a paused editor does no work and nothing re-renders while nothing is
happening.

## D-090 — a container may stand for an element

Until now only an image or a text block could carry a slot, so only an image
or a text block could be dragged. Soft Pop's exits break a photo into pieces —
twelve for Scatter, thirty-five for Blowout — and those pieces *are* the photo.
If someone has dragged the photo, the pieces have to come apart from where it
was dragged to.

Tagging each piece does not work: each piece is a window onto the photo, and
nudging what is inside a window slides the picture within it rather than moving
the window. So a group or a mask may now carry the slot itself. The nudge goes
on the container's tracks, once, in the scene's own space, and everything inside
moves together — which is exactly what a container is.

This sits beside D-085 rather than against it. D-085 forbids a tagged drawable
*inside* a scaled or rotated container, because the nudge would be applied
along the container's axes. Here the container is the tagged thing, and a
group scales and rotates about its own origin — so a Soft Pop card, whose group
sits at the photo's centre, scales and turns about its centre exactly as an
image does.

Two rules come with it, and the library test enforces both for every template
at every aspect:

- **Nothing tagged inside a tagged container.** The photo inside a card is
  untagged (`untagged()` in `_shared/photo.ts`), or a drag would move it twice.
- **A tagged group's handles come from its first child with a size**, at that
  child's resting place, since a group has no box of its own.

## D-091 — the handles are only on what is on screen

A layer outside its own time window draws nothing, and the selection boxes did
not know that. Every template that shows photographs one after another puts
them in the same place, so at any moment several boxes were stacked on the
spot the visible photo occupied — and a click picked whichever was on top,
which was often one you could not see.

Boxes now skip layers outside their window, and containers outside theirs take
their children with them. Skipped *before* the one-box-per-slot rule, so a
slot's visible layer still gets the handles when an invisible one came first.

Soft Pop needed it outright. Card Stack, Flip Cards and Spotlight had been
quietly wrong in the same way since they were written.

## D-092 — Soft Pop: what "soothing" means, in numbers

Asked for as "a soothing pop out… very soothing to the eyes and heart". A mood
cannot be tested, so the family is held to rules that can:

- **Nothing is quick.** Entrances take most of a second and exits well over
  one. The shortest motion anywhere in the family is longer than the longest in
  Kinetic Type.
- **Nothing jolts.** Every curve is a sine or a cubic ease. The one spring
  (`SOFT_POP`) has a damping ratio near 0.86: it overshoots by about one percent
  and settles once — felt, not seen.
- **Something is always moving, slowly.** Each photo eases back from 110% for
  the whole time it is on screen, so no frame is a still waiting for a cut.
- **Arrivals overlap departures.** The next photo is coming in before the last
  has gone, so there is never an empty beat between them.
- **Type arrives slowly too.** Words a beat apart, a caption that takes over a
  second to fade up. Type that snaps in breaks a calm reel faster than a cut.

The photo zooms *inside* a still frame rather than the card itself shrinking —
a masked window — because a picture settling within its frame is far calmer
than a frame changing size.

Each exit carries its own rule about direction and order, because that is where
calm is won or lost:

- **Scatter** — pieces leave from the edges inward, so the photo unravels
  rather than bursts and no piece crosses another. Some of each delay is left to
  chance, or the grid's rows hold together all the way out.
- **Blowout** — a breeze crosses left to right, so the photo is never gone at
  once. Every piece flies for the same time however late it sets off, and lifts
  as much as it drifts, so the pieces clear the part of the photo still whole.
- **Fizzle** — the photo is gone within most of the exit; its motes live on
  past it. The last thing on screen is a few points of light, still rising.
- **Flip Out** — the page leaves and nothing comes back. The next photo is
  already lying beneath, still, before the turn begins.
- **Float Away** — one direction only. Arrival and departure both travel
  upward, so they pass rather than cross. The departing card is drawn behind,
  because receding is further away.
- **Dream Fade** — the incoming photo fades in *over* the outgoing one, which
  stays fully opaque until covered. A two-way crossfade is half transparent at
  its middle, and the frame visibly dims there.

The card's shadow is a halo — a radial gradient stretched to the card's
proportions — rather than a filled box. A filled box shows its own colour
through every gap the moment a photo breaks apart or fades. A halo shows only
shade, which is what the eye expects under something lifting away.

`Soft Showcase` strings the family into a product ad, with every hand-over a
crossfade of the same length: the variety is in how each beat's photographs
leave, not in the cuts between them.

## D-093 — the tier switch does not ship

v1 has no payments (§12), so the only road to Pro was a switch: the FREE badge
in the top bar, "Go Pro" in the duration upsell, and "Switch to Pro" beside the
video-overlay note. The spec meant it as a developer's tool, and it shipped in
the production build exactly as written — anyone could make themselves Pro with
one click, which made every Pro limit decoration.

`TIER_SWITCHABLE` is on in development and off in a production build unless
that build is made with `VITE_TIER_TOGGLE=1` (a private staging copy). In the
public build the badge is a label, the upsells say Pro is coming, and a tier
left in storage by a dev session — or typed in by hand — is ignored.

When subscriptions arrive, `TIER_SWITCHABLE` and `setTier` are what they
replace, still inside `src/entitlements` as §12 requires.

## D-094 — host configuration is generated, and tested

`deploy/headers.ts` defines the security policy and caching rules once. The
build writes them as `_headers` (Cloudflare Pages) and `.htaccess` (Apache, and
so cPanel), and `vite preview` sends the same headers — so `npm run e2e:prod`
runs the whole suite under the policy users will actually get.

The Content Security Policy was reasoned from what the bundle does rather than
copied: WebAssembly for the HEIC decoder and AAC encoder (`'wasm-unsafe-eval'`,
not the broader `'unsafe-eval'`, since nothing uses eval), `blob:` workers for
Mediabunny's helpers, inline style attributes for React. No third-party origin
appears anywhere, which is §9's promise stated as policy. The theme script
moved out of `index.html` into `public/theme-boot.js` so inline scripts can be
forbidden outright.

The suite had only ever run against the dev server. The production build
bundles the export worker differently and is the only build with a service
worker — so until now the thing that ships had never been tested. Both runs now
exist: `npm run e2e` and `npm run e2e:prod`.

## D-095 — ask the browser to keep the user's work

Projects and photographs live only on the device. Without asking for
persistent storage, a browser short of space may clear a site's data, and
Safari clears that of sites not visited for a week — deleting every project
without warning. Autosave now asks once, after the first save succeeds. Most
browsers decide silently from usage (an installed app is usually granted it);
Firefox asks. Refusal is logged, not treated as an error.

## D-096 — arrow keys nudge what you clicked

The selection box's label says "Arrow keys move it", and they did not. Clicking
an element never gave its box keyboard focus, so the arrows went to the global
shortcuts and stepped the playhead while the element stayed put — and on an
element with motion, each press edited a pose at a different moment.

Two fixes, both needed. The box takes focus on pointer *up*: on pointer down,
the browser's own mousedown follows and moves focus to the non-focusable
overlay, so a focus set then is lost — it only appeared to work in the dev
build because React scheduled it later there. And the global shortcuts now step
back when something closer has already handled the key.

The first version of the test passed while the bug was plain to see, twice:
`?frozen` parks the transport, and on a drifting template stepping the playhead
moves the photo by itself. It now uses a still template without `?frozen`, and
fails against either fix reverted.

## D-097 — "+ Scene" asks what kind of scene

"When I click + Scene… one is basically forced on me." It was: the button
copied the selected scene's design. And in Motion Ads the library lists *ad*
templates — picking one replaces the whole ad — so there was no way at all to
put a Soft Pop beat after a Kinetic Type one, or to restyle one beat without
rebuilding it.

"+ Scene" and a new "Change design" open one picker: every scene design,
grouped as the library groups them, searchable, Pro badged (the gate stays at
export), with **Blank** first. Changing a scene's design keeps its photos, its
text where the new design's slots match, and its length within what the new
design allows — restyling a beat should not cost its content or its timing.

**Blank** is a real template — background and logo, no slots — so the Look tab,
transitions and export all work on it unchanged. It is unlisted
(`listed: false`): a blank card among thirty designed ones reads as a broken
thumbnail, so it is offered where starting from nothing is the question —
"+ Scene" and "New blank canvas". A blank canvas opens in Motion Ads, because
building from scratch uses the timeline's layers and their motion.

Scene clips on the timeline now show design names — "Float Away", not
"pop-float". An internal id reads as a bug.

## D-098 — your work carries on

"Ensure continuity in user work." Three places started over on the samples:

- **A new scene** now takes its photos from the project's own pool, beginning
  with ones the scene before it did not show, plus that scene's logo and look.
  Text starts fresh: slots differ between designs, and a headline in the wrong
  slot is worse than none. Speed resets, being a choice about one beat.
- **Applying an ad template** deals out the person's photos and puts their logo
  on every beat. `expandAdTemplate` could always take photos; the store never
  passed any. The ad's palette still applies — it is part of the design chosen.
- **Switching to Showcase** keeps one scene and sets the rest aside (§5). That
  was only in a tooltip; now a notice says so as it happens, with ⌘Z as the
  way back.

`userPhotoIds` is the single definition of "the person's own photos": not
samples, not empty stand-ins, once each, in order.

## D-099 — the project is named at the top

The name lived only inside the project list, which you had to open to learn
what you were working on. Now the top bar shows it: click to rename (Enter or
click away saves, Escape cancels), a menu beside it, and "Switch project" — the
list, renamed for what it is used for.

- **Save as** names a copy and opens it; the original is untouched.
- **Make a copy** saves "Name copy" alongside and leaves you where you are. The
  list's old Duplicate opened the copy, which is Save as's job; both buttons
  now mean the same thing wherever they are.
- **New project** and **New blank canvas** are in the menu and the list.
- **Delete asks first.** It sat one click from the copy button, it is permanent,
  and undo does not reach across projects.

Every one of these writes to disk before confirming, and the notice ("“Autumn
launch” saved.") appears only after the write has finished — a "saved" shown
before the save is a promise, not a confirmation. One hook,
`useProjectActions`, backs the menu and the list so they cannot drift again.

The menu is positioned against the window: the top bar scrolls sideways on
narrow screens, and a scrolling box clips anything hanging out of it, so the
first version opened and was cut off in the same instant.

## D-100 — an effects library, at three levels

"I had to output a video from this product then take to CapCut to add effects
to it." Asked for at three levels — the whole scene, one element as it enters
or leaves, and a chosen moment on the timeline — so there are three homes,
one library, and one renderer path:

- **Scene effects** (`SceneInputs.effects`) run in the scene's real time, so
  they move with the scene and snow falls at the same speed whatever its
  speed setting. In Lifestyle this is the whole video, with "Part of it" and
  the playhead for a moment.
- **Element effects** (`elementEffects` by slot key or `logo`, and
  `Overlay.effects`) are timed by *phase* — enter, during, exit — not by
  clock, so an exit stays on the element's exit when a scene is lengthened.
  For a template's own element the phase is measured from when it is
  actually visible (its opacity track), not from its layer window: a photo
  in a sequence is seen for a second of a ten-second layer.
- **Timeline effects** (`Project.effects`, Corporate Ads) cover everything,
  scenes and layers, on an FX lane, and stay put when scenes move.

Thirty-eight frame effects (atmosphere, light, camera, stylize) and forty
element effects (entrance, exit, emphasis, light). All procedural and pure:
every particle is computed from its index, the effect's seed (a hash of its
id, so deleting one effect does not reshuffle another's snow) and the time.
Nothing is simulated frame to frame, so the playhead can land anywhere and
the export is the preview. No `ctx.filter` — Safari's canvas lacks it — so
colour looks are blend-mode fills and pixel looks read the frame back through
grow-only scratch surfaces.

Camera moves wrap a scene's layers before they draw (so a shake is the
template re-rendered, not a resampled copy), plus just enough zoom to keep the
frame's edges covered. A timeline camera move has to move what is already
drawn, so it copies the frame once — only while one is active.

Element effects hang off a new optional `fx` on any layer and are applied in
`drawLayer`: motion folds into the resolved props; "onto" effects (a shine) are
drawn isolated and `source-atop` so they never spill off a logo's transparent
corners; glows are the element's own silhouette, tinted and blurred behind it.
None of it is in `build()` or the build key — templates never know effects
exist, and a slider drag never rebuilds anything.

0% intensity means none, fade included — tested for every effect. The
library's cards are live previews drawn by the same renderer on the scene's
own photo, still until hovered.

## D-101 — the logo is drawn by the renderer, with its lockup attached

Reported: dragging the logo in Free moved its outline and not the logo. Cause:
every template built the logo into its layers, and the build key held the
logo's placement *mode* but not its position, so the first drag (switching to
Free) rebuilt once and every later one did nothing. Adding the position to the
key would have re-run whole templates on every pointer move. Instead the
renderer draws the logo after the scene's layers, memoised on its own
settings; templates no longer call a logo builder at all.

The lockup is laid out against the logo *as it appears*: a wide wordmark drawn
"contain" into a square box used to leave the text a third of a box below the
visible mark. It sits a fixed gap from the visible edge — below (default),
above, right or left — at a chosen size and colour, inside one group with the
logo, so they move, fade and take effects together. Pinned to a corner, the
whole unit is pinned, so a lockup never hangs off the frame. In Free, `x`/`y`
still place the logo image's centre, so saved projects open unchanged. The
selection box is the unit, computed by the same `logoGeometry` the renderer
uses; the lockup is measured with one shared text spec.

Logo opacity was also baked into the build and did not update live; it does
now, as a side effect of the same change.

## D-102 — Motion properties, for every template

"I would like to have the properties right in the panel where I can modify
the behaviour of the animation." Templates are pure `build()`s with no
parameters, and giving thirty of them hand-made knobs would not reach designs
not yet written. So the tuning is generic and applied after the build, like
the slot nudges:

- **Strength** scales every movement away from its resting value — the value a
  track holds longest, counting before its first keyframe and after its last,
  which is right for things that arrive, rest and leave, only arrive, or only
  leave. 0% holds still; 200% doubles. Opacity is presence, not movement, and
  is left alone.
- **Feel** gives every move one easing character; a spring is never applied to
  opacity, which it would push past its bounds.

Scene-wide, and per element over it; a tuned container carries its tuning to
its pieces. Speed moved here from Look.

## D-103 — layers fill up before new ones open

Every new element used to get a layer of its own. Now it takes the *highest*
existing layer with room at the playhead (highest, so it lands in front of what
it shares the moment with — the alternative is a photo that appears to add
nothing), and a new layer only when none has room. Clicking a layer's name or
an empty stretch of it chooses that layer: new elements go there, at the
playhead or straight after the clip they would have hit.

Only an explicit choice counts. The first version also followed the selected
clip, which sent every new caption to the end of the last one instead of to the
playhead — the tests caught it.

Clips drag between layers. On release, one dropped on top of another goes back
to its own layer, or the nearest above with room, and a notice says so; emptied
layers close up. One undo step for the whole gesture.

## D-104 — delete, and a menu for everything on the timeline

Delete or Backspace removes what is selected — a layer, an effect, the music, a
scene picked on the timeline, the logo — with a notice that says how to undo.
Never while typing, never under a dialog; a template's own element explains
why it cannot be deleted rather than doing nothing.

Right-click, a long press (touch), or "⋯" on a selected clip opens the same
menu of what can be done to that thing: effects, entrance, exit, duplicate,
arrange, layers, change design, delete. One module (`ui/editing/commands`)
backs the key and every menu, on the timeline and on the canvas.

Lifting the finger after a long press makes the browser click whatever is now
under it — the menu, which had just opened there — and the first item ran by
itself. Pointer clicks in the first moments after a touch-opened menu are
ignored; mouse and keyboard use is untouched.

## D-105 — names: Q Motion Studio, Lifestyle, Corporate Ads; Logo into Look

The product is Q Motion Studio, its mark the owner's own Q, cut from their
artwork by `npm run brand` into the favicon, app icons and top-bar mark. The
modes are Lifestyle (was Showcase) and Corporate Ads (was Motion Ads); the
document keeps its ids, so saved projects need no migration, and the labels
live in one place. The Logo tab became a section of Look — "I do not see a
reason why they are apart" — in both modes, with "Use on every scene" for
ads; its tab went to Motion.
