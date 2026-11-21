# Q Motion Studio — Design

The reference for how the editor's chrome looks, moves and reads. Chosen direction:
**Soft editorial · Clay** (D-174). UX0 laid these foundations; UX1 (landing page), UX2
(studio frame), UX3 (library, pickers, dialogs) and UX4 (final pass) build on them.

> "I need you to do a major facelifting for this application … The glassmorphism, modern
> views, the user experience upgrade, and accessibility upgrade … I prioritise clarity and
> softness that can cause stickiness for the users."

> After seeing UX0 in the studio (D-176): "Think well if that color works perfectly for
> the work area; I guess it is perfect for landing page. But, the work area shouldn't be
> distracting … I need a product that will resonate well with a larger audience."

So there are **two surfaces**: the landing page keeps Clay at full warmth; the studio
re-points the same tokens to **Studio calm** (below). Tokens live in `src/styles/tokens.css`; the shared component classes in
`src/styles/index.css` (`@layer components`). The artboard never reads either: the
renderer stays pure (D-001), and nothing here changes a design's pixels.

## Principles

1. **The designs are the colour.** The chrome is paper and ink — warm on the landing
   page, near-neutral in the studio. Whatever a person makes must be the most colourful
   thing on the screen.
2. **One accent, used sparingly.** On the landing page terracotta marks the main action,
   focus, sliders, switches and the chosen tab. In the studio it is spent on exactly two
   things — Export and the focus ring — under the **accent budget** below; everything else
   that is chosen, on or primary is ink.
3. **Clarity and softness.** Fine hairlines instead of outlines, generous radii, diffuse
   warm shadows, calm motion. Every word clears WCAG AA in both themes.
4. **Glass only for what floats.** Top bars, the phone's toolbar and selection rows,
   menus, popovers, dialogs, sheets and notices are frosted. Panels, cards, fields and
   the stage are solid, so reading never depends on what is behind. The blur of `.glass`
   sits on a `::before` layer, never on the element itself: an element with a
   `backdrop-filter` becomes the frame of every `fixed` thing inside it (a full-screen
   preview opened from a sheet would sit inside the sheet). Bars carry only the tint.
5. **Painted once.** The colour field behind the chrome is two radial gradients on a
   fixed layer: no blur filter on it, nothing animated.
6. **Light first,** with a warm-charcoal dark mode that re-points the same names.

## Tokens: three layers

| Layer | Prefix | Rule |
| --- | --- | --- |
| Primitive | `--p-*` (`--p-paper-100`, `--p-clay-600`, `--p-char-850`) | Raw values, named for what they are. Never used by a component. |
| Semantic | `--c-*`, `--r-*`, `--shadow-*`, `--t-*`, `--ease-*`, `--font-*`, `--icon-*` | Named for their job. Dark mode re-points only this layer. Every name the app used before D-174 is kept. |
| Component | `--btn-*`, `--field-*`, `--seg-*`, `--chip-on-*`, `--section-*`, `--glass-*`, `--scrim`, `--toast-radius`, `--menu-radius`, `--dialog-radius`, `--sheet-radius` | One component's choices, read by the classes in `index.css`. |

Tailwind sees the semantic colours as utilities: `bg-panel`, `bg-sunk`, `text-ink-muted`,
`border-edge-field`, `bg-accent`, and so on; radii as `rounded-sm … rounded-2xl`; the
headline face as `font-headline`.

### Colour

Clay: the landing page's palette, and the default wherever `data-surface` is not set.
The studio's own values are under **Studio calm** below.

| Token | Light | Dark | Job |
| --- | --- | --- | --- |
| `--c-bg` | `#f7f2ea` paper | `#171411` | The page |
| `--c-panel` | `#fffcf7` | `#211d19` | Reading surfaces: panels, cards, dialogs |
| `--c-panel-alt` | `#f8f3ec` | `#2a2520` | Fields, hover |
| `--c-sunk` | `#f1ebe2` | `#2b2621` | A quiet band: section headers, segmented tracks |
| `--c-sunk-hover` | `#e9e1d5` | `#352f29` | Hover on a band |
| `--c-edge` | `#ebe4da` | `#37302a` | Hairline (decoration) |
| `--c-edge-strong` | `#dcd3c6` | `#4a423a` | Hairline for chips and secondary buttons |
| `--c-edge-field` | `#928677` | `#7d7266` | A control's own outline (fields, switch off) — 3:1 |
| `--c-ink` | `#211d18` | `#f3ede4` | Text |
| `--c-ink-muted` | `#5b544a` | `#c4baac` | Secondary text |
| `--c-ink-faint` | `#685f54` | `#aa9f91` | Small print, hints |
| `--c-accent` | `#ad4824` terracotta | `#e57d55` | The accent, as fill and as text |
| `--c-accent-hover` | `#963b1b` | `#ee9470` | Pressed/hovered accent |
| `--c-accent-ink` | `#ffffff` | `#1a0f08` | Words on the accent |
| `--c-accent-soft` | `#f9e9df` | `#3d281d` | A chosen row's tint |
| `--c-focus` | = accent | = accent | Focus ring |
| `--c-pro` / `--c-pro-soft` | `#8a5000` / `#fbefd5` | `#f0b542` / `#3a2c12` | Pro |
| `--c-danger` | `#b42318` | `#f4857a` | Delete, failure |
| `--c-stage` | `#e7e3dd` | `#100e0c` | The neutral void around the artboard |
| `--c-brand`, `--c-brand-hover`, `--c-brand-ink` | = sunk, sunk-hover, ink | same | Kept names: the old navy (D-128) is now the header band |

### Contrast (WCAG 2.1, computed from the hex values)

Text needs 4.5:1, large text and the parts of a control 3:1. The glass rows use the
frost at its stated opacity over the page, approximated as solid (`#fbf7f0` light,
`#221e1a` dark); the strong frost of menus, dialogs and notices is closer to the panel
still. Nothing below fails; the lowest in each theme is in bold.

| Text on → | bg | panel | panel-alt | sunk | sunk-hover | accent-soft | glass | stage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Light** ink | 15.03 | 16.37 | 15.17 | 14.14 | 12.92 | 14.16 | 15.69 | 13.11 |
| Light ink-muted | 6.70 | 7.30 | 6.77 | 6.30 | 5.76 | 6.31 | 6.99 | 5.84 |
| Light ink-faint | 5.62 | 6.12 | 5.67 | 5.28 | **4.83** | 5.29 | 5.86 | 4.90 |
| Light accent | 5.05 | 5.50 | 5.10 | 4.75 | — | **4.76** | 5.27 | — |
| **Dark** ink | 15.77 | 14.38 | 13.04 | 12.87 | 11.35 | 11.87 | 14.22 | 16.55 |
| Dark ink-muted | 9.58 | 8.74 | 7.92 | 7.82 | 6.90 | 7.22 | 8.64 | 10.06 |
| Dark ink-faint | 7.06 | 6.44 | 5.84 | 5.76 | **5.08** | 5.32 | 6.37 | 7.41 |
| Dark accent | 6.46 | 5.90 | 5.34 | 5.28 | — | **4.87** | 5.83 | — |

| Pair | Light | Dark | Needs |
| --- | --- | --- | --- |
| accent-ink on accent (primary button) | 5.63 | 6.63 | 4.5 |
| accent-ink on accent-hover | 7.15 | 8.16 | 4.5 |
| chip-on: panel on ink | 16.37 | 14.38 | 4.5 |
| pro on pro-soft | 5.70 | 7.36 | 4.5 |
| pro on panel | 6.36 | 9.08 | 4.5 |
| danger on panel | 6.42 | 6.76 | 4.5 |
| danger on pro-soft (Not saved) | 5.76 | 5.48 | 4.5 |
| danger on panel-alt | 5.96 | 6.13 | 4.5 |
| ink on pro-soft | 14.69 | 11.65 | 4.5 |
| edge-field on panel (field outline, switch off) | 3.48 | 3.56 | 3 |
| edge-field on panel-alt | 3.22 | 3.23 | 3 |
| edge-field on bg | 3.19 | 3.91 | 3 |
| accent on stage (focus ring, selection) | 4.41 | 6.78 | 3 |

The script that computed these is a one-file node check (relative luminance, WCAG 2.1);
`tests/visual/a11y.spec.ts` re-checks every rendered text in both themes, with axe.

### Radius, shadow, type, icons

- **Radius**: `--r-xs 5` · `--r-sm 7` (fields, segments) · `--r-md 10` (icon buttons,
  section bands) · `--r-lg 14` (menus, cards) · `--r-xl 18` (dialogs) · `--r-2xl 24`
  (sheets) · `--r-pill` (buttons, chips, notices). Larger and softer than before.
- **Shadow**: warm and diffuse, never a hard grey drop. `--shadow-sm` for a raised
  segment; `--shadow-md` for a lifted card; `--shadow-lg` for dialogs; `--shadow-lip`, a
  line of light along the top of what floats. Dark mode deepens them.
- **Type**: Archivo for headlines (`font-headline`: dialog and sheet titles, the product
  name), Inter for everything else (`--font-ui`), both already self-hosted (D-026).
  Tighten headlines (`-0.012em`); body at 13px, small print never under 10px.
- **Icons**: one set, one stroke. 24-unit icons at `1.75`; the small 12-unit glyphs
  (×, chevrons) at `1.6`. Sizes `--icon-sm 14`, `--icon-md 18`, `--icon-lg 22`.

## Studio calm (D-176)

While the studio is open, `AppShell` sets `data-surface="studio"` on `<html>` (on `<html>`
so the menus, dialogs and notices portalled to `<body>` follow it). That re-points the
semantic layer once more; no component names a different token. The landing page (no
attribute) keeps Clay.

| Token | Light | Dark | Job in the studio |
| --- | --- | --- | --- |
| `--c-bg` | `#f6f5f3` | `#181817` | The page: stone, only a whisper of warmth / a neutral charcoal, not brown |
| `--c-panel` | `#fdfdfc` | `#201f1e` | Panels, cards, dialogs |
| `--c-panel-alt` | `#f6f5f3` | `#292827` | Fields, hover |
| `--c-sunk` | `#efeeeb` | `#2a2928` | Section bands, segmented tracks, summary tags |
| `--c-sunk-hover` | `#e6e5e1` | `#343331` | Hover on a band |
| `--c-edge` / `--c-edge-strong` | `#e8e6e2` / `#d8d5d0` | `#353432` / `#484644` | Hairlines |
| `--c-edge-field` | `#8b8883` | `#7b7874` | A control's own outline — 3:1 |
| `--c-ink` / `-muted` / `-faint` | `#1c1b1a` / `#53504c` / `#5e5b56` | `#f2f1ee` / `#c3c0bb` / `#a9a5a0` | Words |
| `--c-cta` (`-hover`, `-ink`) | `#ad4824` (`#963b1b`, white) | `#e57d55` (`#ee9470`, `#1a0f08`) | **The accent: Export and focus only** |
| `--c-focus` | = cta | = cta | Focus ring, a field's focus |
| `--c-accent` (`-hover`, `-ink`) | = ink (`#3a3936`, white) | = ink (`#d9d7d3`, `#1c1b1a`) | Kept name, now **emphasis in ink**: chosen, on, a panel's one primary |
| `--c-accent-soft` | `#ebeae7` | `#33322f` | A chosen row's grey tint |
| `--c-stage` | `#d9d9d9` | `#2c2c2c` | **True grey**, no hue |
| `--c-field-*` | transparent | transparent | No colour field behind the work |
| `--c-select-*` | white line, `rgb(0 0 0 / .55)` keylines, `#1c1b1a` grip edge | same | The selection on the canvas |

Shadows and the scrim lose their warmth too (`rgb(20 20 20 / …)`); an ink primary has no
glow (`--btn-primary-shadow: none`); the CTA keeps its soft one (`--btn-cta-shadow`).

### Contrast in the studio (WCAG 2.1, computed from the hex values)

The glass rows are the frost over the page, approximated as solid (`#fbfbfa`, `#1e1e1d`).
Nothing fails; the lowest in each theme is in bold.

| Text on → | bg | panel | panel-alt | sunk | sunk-hover | accent-soft | glass | stage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Light** ink | 15.78 | 16.90 | 15.78 | 14.82 | 13.64 | 14.30 | 16.61 | 12.18 |
| Light ink-muted | 7.36 | 7.88 | 7.36 | 6.91 | 6.36 | 6.66 | 7.74 | 5.68 |
| Light ink-faint | 6.20 | 6.64 | 6.20 | 5.83 | 5.36 | 5.62 | 6.53 | **4.79** |
| Light cta | 5.17 | 5.53 | — | **4.85** | — | — | 5.44 | — |
| **Dark** ink | 15.73 | 14.57 | 13.03 | 12.86 | 11.17 | 11.35 | 14.77 | 12.36 |
| Dark ink-muted | 9.80 | 9.07 | 8.11 | 8.01 | 6.96 | 7.07 | 9.20 | 7.70 |
| Dark ink-faint | 7.26 | 6.72 | 6.01 | 5.93 | **5.15** | 5.24 | 6.81 | 5.70 |
| Dark cta | 6.26 | 5.80 | — | **5.11** | — | — | 5.88 | — |

| Pair | Light | Dark | Needs |
| --- | --- | --- | --- |
| cta-ink on cta (Export) | 5.63 | 6.63 | 4.5 |
| cta-ink on cta-hover | 7.15 | 8.16 | 4.5 |
| accent-ink on accent (an ink primary, a chosen chip) | 17.20 | 15.23 | 4.5 |
| accent-ink on accent-hover | 11.55 | 11.97 | 4.5 |
| danger on panel / panel-alt | 6.46 / 6.03 | 6.65 / 5.94 | 4.5 |
| pro on pro-soft / panel | 5.70 / 6.39 | 7.36 / 8.93 | 4.5 |
| danger on pro-soft (Not saved) | 5.76 | 5.48 | 4.5 |
| edge-field on panel / panel-alt / bg / sunk | 3.47 / 3.24 / 3.24 / 3.04 | 3.75 / 3.35 / 4.05 / 3.31 | 3 |
| focus ring (cta) on stage | 3.99 | 4.92 | 3 |
| ink (a chosen border) on panel | 16.90 | 14.57 | 3 |

### The accent budget

In the studio the accent is spent on **Export** (`ui-btn--cta`, the top bar's and the
phone's, and the export window's own Export) and the **focus ring** (`--c-focus`: the
outline, a field's border and ring, a pane resizer reached by keyboard). Nothing else, by
default. Everything that says "chosen", "on" or "the main thing in this panel" says it in
ink and grey:

| Moved to ink or grey | How |
| --- | --- |
| A panel's one primary: Save this as my brand, + Add text, + Add photos, Change sticker… | `ui-btn--primary` → ink fill, light words, no glow. At most one per panel. |
| + Photos and the add bar's chips, + Motion when ready | `ui-chip--accent` / `--ready` → ink words, a darker hairline, a grey tint |
| Use this frame, Reset frame, + Video mode (phone) | `ui-btn--secondary`: hairline pill, ink words |
| Try another, Replace… | secondary, as before |
| Sliders (`ui-range`), the scrub bar, native checkboxes (`accent-color`) | ink thumb ringed in panel |
| Switches on, chosen tab's rule, chosen look tile, chosen rows and cards | ink |
| The timeline's chosen clip, the playhead, reorder marker, picture-moment mark | ink outline on the grey tint; ink line |
| A notice's dot | `ink-muted`; `danger` when urgent |
| The pane resizer | `edge-field` on hover, ink while dragged, focus colour by keyboard |

Keep **danger** red for what destroys. Example: in the Style tab, *Save this as my brand*
is the panel's ink primary and *Try another* a secondary; the only terracotta on the
screen is Export. Don't: a terracotta *+ Add text* beside a terracotta Export.

### The stage

A true grey, no hue (`#d9d9d9` light, `#2c2c2c` dark), so a design's colours read as they
export. Mid-light in light mode, so a white design still has an edge and a black one sits
calmly; a dark grey a step above the panels in dark mode, so a black design has an edge.
Never tinted, never a gradient, never the colour field.

### The selection on the canvas

Neither the accent nor the chrome's ink, and the same in both themes, because the design
under it can be any colour: a **white 1.5px line between two dark keylines**
(`--c-select-line`, `--c-select-keyline`), **white grips with a dark edge and a small
shadow** (`--c-select-grip-edge`, `--c-select-grip-shadow`). The hover outline, the snap
guides and the motion path use the same pair. It shows on a white poster, a black one and
a photograph alike.

## Components

Each is a class in `@layer components`, so a utility beside it (a size, a margin) still
wins. Give every control hover (on devices that hover), active and `:focus-visible`.

| Component | Class | Rule |
| --- | --- | --- |
| CTA button | `ui-btn ui-btn--cta` | The screen's one main action — Export. Terracotta pill, white words, a soft shadow of its own colour. The only accent button in the studio (D-176). |
| Primary button | `ui-btn ui-btn--primary` | A panel's one main action. Terracotta on the landing page; an ink pill in the studio. One per place. |
| Secondary | `ui-btn ui-btn--secondary` | Panel pill with a hairline; hover deepens the hairline. |
| Quiet | `ui-btn ui-btn--quiet` | No fill until hovered (`--c-sunk`). Close, Cancel in a bar. |
| Danger | `ui-btn ui-btn--danger` | Hairline pill, danger words; hover tints. Never filled red. |
| Small | `+ ui-btn--sm` | 26px, for inspector rows. |
| Icon button | `ui-iconbtn` (`ui-iconbtn--edge`) | 32px, quiet; size utilities override (`size-11` on phones). |
| Chip | `ui-chip` (`--accent`, `--ready`) | Pill with a hairline. Chosen: `chip-on`, ink fill. |
| Segmented | `ui-seg` + `ui-seg-opt` | A sunk track; the chosen option is raised on it (panel, soft shadow, ink, 600), by `aria-pressed`. |
| Field | `ui-field` | Panel-alt fill, a 3:1 outline, the accent and a soft ring on focus. |
| Slider | `ui-range` | A hairline track, an accent thumb ringed in panel; 22px thumb on touch. |
| Switch | `Toggle` | Track `--c-edge-field` off, accent on; white knob with a shadow. |
| Tabs | `ui-tab` | Words; the chosen one in ink, 600, over a 2px accent rule (`aria-selected`). |
| Section | `brand-surface ui-section-bar` + `ui-section-body` | A sunk header band, uppercase ink label, chevron; body a solid card with a hairline. Folds by `aria-expanded` (D-131). |
| Menu | `glass ui-menu` + `ui-menu-item` | Strong frost, `--r-lg`, items with their own radius and a sunk hover. |
| Dialog | `glass ui-dialog` over `scrim` | Strong frost, `--r-xl`, Archivo title, actions as pills. |
| Bottom sheet | `glass ui-dialog` (phone: `rounded-t-2xl`) | Strong frost, grab bar, round close. |
| Notice | `glass ui-toast` | Strong frost pill; an ink-muted dot (danger when urgent). Sits centred at the foot of the stage (`data-toast-anchor`), over the picture's margin, never over a control (D-176). |
| Bars | `glass-bar` | Top bar, phone top bar, phone toolbar and selection rows: the frost's tint over the colour field, hairline, no shadow, no blur (nothing passes under a bar) and no stacking context (it would trap the windows a bar opens). |

## Motion

- Durations: `--t-instant 80ms` (menu hover), `--t-fast 120ms` (colour, press),
  `--t-base 200ms` (sheets, notices), `--t-slow 300ms` (the most a UI move takes).
- Easing: `--ease-out` for anything entering or responding; `--ease-in-out` for
  something moving on screen; `--ease-drawer` for sheets. Never ease-in.
- Press: buttons and chips `scale(0.97)`, icon buttons `0.94`, on `:active`.
- Enter from near, not from nothing: notices rise 8px and scale from 0.98.
- No animation for keyboard-driven actions; nothing animates the artboard (§13).
- **Reduced motion** collapses every `--t-*` to 0, stops animations (the rule in
  `index.css`) and drops the press scale. Colour changes remain, instant.
- **Reduced transparency**, or a browser without `backdrop-filter`: every frost becomes
  the solid panel.

## Accessibility

- AA everywhere, both themes: the table above, re-checked by `tests/visual/a11y.spec.ts`
  (axe plus computed colours) on a computer and a phone, light and dark.
- Focus: a 2px accent outline, 2px off the element, on `:focus-visible`; fields add a
  soft ring. Never removed without a replacement.
- Touch: the phone's primary controls are 44px (`min-h-11`, `size-11`), everything else
  at least 24px.
- Selection is never colour alone: chosen segments are raised and bold, chosen tabs
  bold over a rule, chosen chips filled.
- A control's outline that identifies it (field, switch track) clears 3:1.
- Hover effects only on devices that hover.

## Do and don't

| Do | Don't |
| --- | --- |
| In the studio, terracotta on Export and focus only. | A terracotta "+ Add text", tab rule or slider in the studio. |
| One primary per panel or dialog (ink in the studio). | Terracotta badges on every card, or two primaries side by side. |
| A true-grey stage; white-and-keyline selection. | A tinted stage, or a selection in the accent that vanishes on a red design. |
| Ink fill for "chosen" filters and labels. | Accent fill for every chosen state. |
| Frost the bar, the menu, the sheet. | Frost a panel, a card or a field. |
| Solid panel under any text people read at length. | Text straight on the colour field. |
| A hairline (`--c-edge`) between areas. | Heavy outlines or grey drop shadows. |
| Re-point a semantic token for a theme. | A raw hex in a component. |
| `--c-edge-field` for a field's outline. | `--c-edge` alone as the only edge of an input. |
| Archivo for titles, Inter for the rest. | A third face, or Archivo for small print. |
| Respect `prefers-reduced-motion` and `-transparency`. | Animate blur or the colour field. |

## For the next phases

- **UX1** — the landing page can use the colour field at full strength, `font-headline`
  at display sizes (tighten to `-0.035em`), and the glass for the product pictures.
- **UX2** — done (D-176): Studio calm, the accent budget, the true-grey stage, the
  neutral selection; the phone's transport and timeline summary, the scrub bar
  (`ui-range ui-range--scrub`) and the pane resizers on the shared classes; notices at
  the foot of the stage.
- **UX3** — the pickers (element, sound, effect, photos), the export window and the
  projects list have their own filter chips and cards: move them to `ui-chip`/`chip-on`,
  `glass ui-dialog` and the card rule (panel, hairline, `--r-lg`, `--shadow-md` on hover).
- **UX4** — a final pass: every hand-written `rounded-[Npx]`, inline colour and
  `strokeWidth` onto the tokens; audit motion against the rules above.
