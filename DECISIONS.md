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
