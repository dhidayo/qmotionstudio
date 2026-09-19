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
