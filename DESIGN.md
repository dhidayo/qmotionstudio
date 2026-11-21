# Q Motion Studio — Design

The reference for how the editor's chrome looks, moves and reads. Chosen direction:
**Soft editorial · Clay** (D-174). UX0 laid these foundations; UX1 (landing page), UX2
(studio frame), UX3 (library, pickers, dialogs) and UX4 (final pass) build on them.

> "I need you to do a major facelifting for this application … The glassmorphism, modern
> views, the user experience upgrade, and accessibility upgrade … I prioritise clarity and
> softness that can cause stickiness for the users."

Tokens live in `src/styles/tokens.css`; the shared component classes in
`src/styles/index.css` (`@layer components`). The artboard never reads either: the
renderer stays pure (D-001), and nothing here changes a design's pixels.

## Principles

1. **The designs are the colour.** The chrome is warm paper and ink. Whatever a person
   makes must be the most colourful thing on the screen.
2. **One accent, used sparingly.** Terracotta marks the one main action in a place
   (Export, Add, Save), the focus ring, sliders and switches that are on, and the chosen
   tab's rule. Labels on every card (New), chosen filter chips and section headers do not
   spend it: they use ink.
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

## Components

Each is a class in `@layer components`, so a utility beside it (a size, a margin) still
wins. Give every control hover (on devices that hover), active and `:focus-visible`.

| Component | Class | Rule |
| --- | --- | --- |
| Primary button | `ui-btn ui-btn--primary` | Terracotta pill, white words, a soft shadow of its own colour. One per place. |
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
| Notice | `glass ui-toast` | Strong frost pill; a dot in the accent (danger when urgent). |
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
| One terracotta primary per panel or dialog. | Terracotta badges on every card, or two primaries side by side. |
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
- **UX2** — the studio frame: the panels (library, inspector), the timeline and the
  phone's transport (`PhoneLayout`) still use their own markup; move them onto these
  classes. The pane resizers and the scrub bar need the `ui-range` look.
- **UX3** — the pickers (element, sound, effect, photos), the export window and the
  projects list have their own filter chips and cards: move them to `ui-chip`/`chip-on`,
  `glass ui-dialog` and the card rule (panel, hairline, `--r-lg`, `--shadow-md` on hover).
- **UX4** — a final pass: every hand-written `rounded-[Npx]`, inline colour and
  `strokeWidth` onto the tokens; audit motion against the rules above.
