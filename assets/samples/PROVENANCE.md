# Sample photographs — provenance

The eight images in this folder are §8.1's "Try sample photos" set, and the
stand-ins `npm run thumbs` uses to render every template poster.

## Where they came from

Generated with Google Gemini Pro by Adedayo (the project owner) on 2026-09-19,
from the prompts recorded below. They are not stock photography and carry no
third-party licence: D-030 originally chose synthesised abstracts precisely to
avoid one, and generating the replacements settles the same question a
different way (D-049).

This folder is the only copy of the originals. `public/samples/*.webp` is
derived from it by `npm run samples` and can be regenerated at any time; these
cannot.

Note that image generation is not deterministic, so re-running a prompt will
produce a different photograph in the same register rather than the same file.
The prompts are here to keep the *set* coherent if one ever needs replacing —
not to reproduce it byte for byte.

## Why these are outside `public/`

Everything under `public/` is served in development and copied verbatim into
the production bundle. These sources total about 2.8MB and nothing fetches
them, so shipping them would be a straight tax on §14's cold-load budget. The
build reads them from here and writes only the optimised WebP into `public/`.

## The set

Eight, which is not a round number: `photoSlots.max` is 8 on both `angle-fan`
and `depth-stack`, so a full set never has to show the same photograph twice
within one scene.

| Name | Aspect | Subject | Sits against |
|---|---|---|---|
| `dune` | 4:5 | Wind-carved dune ridge at low sun | bone, ember |
| `tide` | 4:3 | Seawater drawing back over dark sand | tide |
| `canopy` | 1:1 | Light breaking through a forest canopy | forest |
| `ember` | 4:5 | Embers and sparks in a dying fire | ember |
| `slate` | 3:2 | Wet slate cliff face after rain | midnight |
| `bloom` | 4:5 | A magnolia blossom in deep shade | midnight |
| `dusk` | 16:9 | Ridgelines receding into violet haze | midnight |
| `reef` | 1:1 | Caustic light over a shallow coral shelf | tide, forest |

Three portrait, three landscape, two square — deliberately mixed, so the set
exercises cover-cropping at every aspect the app offers.

## What the set has to survive

Four constraints shaped the prompts, and any replacement has to meet them:

1. **A calm lower third.** `kinetic-statement` lays a headline across the
   bottom of the frame over a gradient scrim. Busy detail there and the type
   stops reading.
2. **A centre crop to any aspect.** Photos are drawn with `fit: 'cover'` and
   the frame-ratio control recrops them to 1:1, 4:3, 3:4, 16:9 or 9:16, so
   nothing important can sit at the extreme edges.
3. **Legibility at about 250px.** `angle-fan` shows up to eight of them at once
   as cards. One clear shape, strong tonal contrast, no fine detail carrying
   the image.
4. **A low-key grade.** The default palette is `#0c0c11`. A bright, airy set
   fights every dark palette in the library and makes white headlines
   unreadable.

## Prompts

Each image was generated with this preamble followed by its own description.

```
Photorealistic still photograph, full-frame camera, fast prime lens, natural
light only. Low-key moody grade: deep rich blacks, restrained highlights, no
blown-out whites. Fine film grain. One clear subject or gesture that still
reads at postage-stamp size. The lower third of the frame must stay visually
calm — shadow, water, haze, sand or plain ground — so overlaid white text
remains legible. Keep the subject away from the extreme edges so the image
survives a centre crop to both square and widescreen. No people, no faces, no
visible text, lettering, signage, watermarks or logos. No borders, frames or
collage.
```

**dune** · 4:5
> Wind-carved sand dune ridge at low sun, the crest cutting a clean diagonal
> across the frame. Warm amber and bronze sand against a deep shadow slope,
> ripples catching raking side light, the lower third falling away into soft
> shadow.

**tide** · 4:3
> A thin sheet of seawater drawing back over dark wet sand, cold blue sky
> reflected in the film of water. Long-exposure softness in the retreating
> foam, deep teal shadows, horizon set high in the frame.

**canopy** · 1:1
> Looking straight up through a dense forest canopy, backlit leaves glowing
> against a dark tangle of branches. Deep green and near-black, narrow shafts
> of pale light breaking through the gaps toward the centre.

**ember** · 4:5
> Glowing embers in a dying fire, shot close, out-of-focus sparks lifting into
> black air. Molten orange and deep red against near-total darkness, the lower
> third almost entirely shadow.

**slate** · 3:2
> A wet slate cliff face after rain, stratified grey-blue rock with water
> tracing down the fractures. Cold overcast light, steel and graphite tones,
> detail concentrated in the upper two thirds.

**bloom** · 4:5
> A single magnolia blossom in deep shade, petals caught by one narrow shaft of
> late light. Dusty pink and magenta against a near-black background, the stem
> falling away into darkness.

**dusk** · 16:9
> A wide empty valley at last light, layered ridgelines receding into violet
> haze. Deep indigo sky above a thin band of fading warmth at the horizon,
> foreground ridge in near-silhouette.

**reef** · 1:1
> An underwater view across a shallow coral shelf, sunlight rippling in caustic
> patterns over textured coral. Teal and jade fading into deep blue-green
> toward the edges of the frame.

## Replacing one

Drop the new file in as `<name>.jpg` (or `.png`/`.webp`) and run
`npm run samples`. The script fails if a name in `SAMPLE_NAMES` has no source,
or if this folder holds a file no name claims — the set and the code are not
allowed to drift.

Sources at 2,000px on the long edge are about 15% under what
`kinetic-statement` ideally wants for a full-bleed 1080×1920 export, which is
not visible in practice. Above 2,400px the script downscales; it never upscales.
