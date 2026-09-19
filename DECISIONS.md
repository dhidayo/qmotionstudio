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
