import { colorFill, roleFill, type ImageProps, type Layer, type Paint, type Reveal, type SpringSpec, type Tracks } from '@/core/types';
import { fontString } from '@/fonts/registry';
import type { SceneInputs, TextStyle } from '@/document/types';
import type { BuildContext } from '../buildContext';
import { flag, pick, text, type SceneVariant } from '../catalog';
import type { SceneTemplate, TextSlotDef } from '../schema';
import { backgroundLayer, contentFloor } from '../_shared/chrome';
import { fillSlots, photoProps, type FilledSlot } from '../_shared/photo';
import { CLEAR, clamp01, defineScene, easeInOut, easeOutBack, headlineSlot, kf, labelSlot, measureSlot, part, placeText, rect, sampled, shapeSlot, sublineSlot } from './kit';
import { listEntries, numbers } from '../_shared/numbering';
import { slotWords, textFor } from '../_shared/text';

/**
 * Covers & Thumbnails (D-151): "If you see the templates in my design, it
 * looks like thumbnail that one can use for social media posts, or youtube
 * thumbnails … maybe you'd create another category under Socials & Business".
 *
 * One composition, the one a marketing team publishes every week: a bold
 * ground, a small brand mark and name top left, a heavy two- or three-line
 * headline, a photograph on the other side in a rounded panel, an arch or a
 * circle with an accent shape behind it, and a short footer line. What sits
 * under the headline is the variant's job — a figure, an agenda, pillars,
 * steps, a button, a guest — chosen by `kind`; the photograph's frame and the
 * shape behind it by `frame` and `backing`.
 *
 * Landscape and square frames put the words left and the photograph right,
 * the way a video thumbnail reads; portrait frames stack them. The words are
 * measured first and shrunk together until they fit their column, so a
 * longer headline or a fifth agenda item never runs out of the frame.
 *
 * Every colour is a palette role (D-121): the ground is Background, the
 * headline Text, the mark, shapes and figures Accent, the footer Secondary
 * text — so a look restyles the whole cover in one tap.
 *
 * The person's own logo is drawn by the renderer where they place it (D-101),
 * and the build never reads it. The mark here is the first letter of the
 * company name on an accent tile; clearing the name clears the corner for a
 * logo placed top left.
 *
 * Every decoration is a part (D-159): the brand mark, the pills and buttons,
 * the shape behind the photograph, the dots, the chips and discs — each can be
 * picked, recoloured, moved, resized and deleted, and a pill moves with the
 * words it sits behind. The photograph's frame carries the photo slot, so
 * dragging the photo moves it in its frame. The letter in the mark, VS and
 * every number are text the person can type into: the mark's letter follows
 * the company name until one is typed, and numbers follow the pattern typed
 * ("01", "Step 1", "A", "5, 4, 3…").
 */

type Kind =
  | 'update' | 'guide' | 'report' | 'launch' | 'agenda' | 'milestone' | 'pillars' | 'deck'
  | 'youtube' | 'podcast' | 'tutorial' | 'top' | 'versus' | 'vlog' | 'course' | 'live';

const KINDS: readonly Kind[] = [
  'update', 'guide', 'report', 'launch', 'agenda', 'milestone', 'pillars', 'deck',
  'youtube', 'podcast', 'tutorial', 'top', 'versus', 'vlog', 'course', 'live',
];

/** How the photograph is framed. */
type Frame = 'rounded' | 'arch' | 'circle' | 'tilt' | 'bleed';
const FRAMES: readonly Frame[] = ['rounded', 'arch', 'circle', 'tilt', 'bleed'];

/** The accent shape behind it. */
type Backing = 'block' | 'disc' | 'ring' | 'band' | 'none';
const BACKINGS: readonly Backing[] = ['block', 'disc', 'ring', 'band', 'none'];

type Box = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** A part of the word column, measured, with the space above it and how to draw it at a place. */
type Piece = {
  readonly h: number;
  readonly w: number;
  readonly gap: number;
  readonly draw: (x: number, top: number) => Layer[];
};

/** A soft overshoot for things that slide into place. */
const SOFT: SpringSpec = { kind: 'spring', stiffness: 150, damping: 15, mass: 1 };

/**
 * The entrance, settling inside about a second and a half: shapes first, the
 * photograph with them, the brand, then the words a line at a time, then what
 * sits under them. Everything after is a calm hold with a little life in it.
 */
const AT = { backing: 0, photo: 150, brand: 80, eyebrow: 280, headline: 380, footer: 1150, settled: 1500 } as const;

const LINES = (startMs: number, staggerMs = 110): Reveal => ({ kind: 'kinetic', unit: 'line', motion: 'rise', startMs, durationMs: 650, staggerMs });
const SLIDE = (startMs: number): Reveal => ({ kind: 'kinetic', unit: 'line', motion: 'slideRight', startMs, durationMs: 480, staggerMs: 60 });
const LETTERS = (startMs: number): Reveal => ({ kind: 'kinetic', unit: 'char', motion: 'rise', startMs, durationMs: 380, staggerMs: 16 });
const FADE = (startMs: number, durationMs = 300): Reveal => ({ kind: 'fade', startMs, durationMs });

const ORDINAL = ['First', 'Second', 'Third', 'Fourth', 'Fifth'] as const;

/** The accent shape behind the photograph, whichever it is (D-159). */
const BACKING = shapeSlot('backing', 'Shape behind the photo');

export function create(variant: SceneVariant): SceneTemplate {
  const p = variant.params;
  const kind = pick<Kind>(p, 'kind', KINDS, 'update');
  const frame = pick<Frame>(p, 'frame', FRAMES, 'rounded');
  const backing = pick<Backing>(p, 'backing', BACKINGS, 'block');
  const dotted = flag(p, 'dots');
  const centred = kind === 'versus';
  const align = centred ? 'center' : 'left';

  const label = (id: string, name: string, fallback: string, style: Partial<TextStyle> = {}, maxChars = 40): TextSlotDef =>
    labelSlot(id, name, text(p, id, fallback), { align, letterSpacingPct: 0, ...style }, maxChars);

  const headline = headlineSlot(text(p, 'headline', 'Corporate Update'), { align, weight: 800, letterSpacingPct: -2 }, 60);
  const subline = sublineSlot(text(p, 'subline', 'Our plans, our people and our progress'), { align, letterSpacingPct: 0 });
  const eyebrow = label('eyebrow', 'Small line above', 'COMPANY NEWS', { weight: 700, letterSpacingPct: 12 }, 32);
  const brand = label('brand', 'Company name', 'Your Company', { weight: 700, align: 'left' }, 32);
  const footer = label('footer', 'Website or date', 'yourcompany.com', { weight: 600, align: 'left', letterSpacingPct: 1 }, 48);
  const figure = label('figure', 'Big number', '+42%', { fontId: 'headline', weight: 800, letterSpacingPct: -3 }, 10);
  const figureNote = label('figureNote', 'What the number means', 'Revenue growth on last quarter', { weight: 600 }, 60);
  const button = label('button', 'Button', 'Learn more', { weight: 700, letterSpacingPct: 1 }, 24);
  const sticker = label('sticker', 'Sticker', 'NEW', { fontId: 'headline', weight: 800, letterSpacingPct: 4, align: 'center' }, 8);
  const highlight = label('highlight', 'Highlighted words', 'That Work', { fontId: 'headline', weight: 800, letterSpacingPct: -1 }, 24);
  const guest = label('guest', 'Guest', 'with Amaka Obi', { weight: 700 }, 40);
  const live = label('live', 'Badge', 'LIVE', { weight: 800, letterSpacingPct: 12 }, 12);
  const when = label('when', 'Date and time', 'Today · 7 PM GMT', { weight: 700 }, 40);
  const list = (id: string, name: string, fallback: string, maxChars = 90): TextSlotDef => label(id, name, fallback, { weight: 600 }, maxChars);
  const pillars: TextSlotDef = { ...list('pillars', 'Pillars, separated by commas', 'Brand, Content, Social, Growth'), list: 'words' };
  const steps: TextSlotDef = { ...list('steps', 'Steps, separated by commas', 'Plan, Shoot, Edit'), list: 'words' };
  const details: TextSlotDef = { ...list('details', 'Course details, separated by commas', '12 lessons, 4 hours, Certificate'), list: 'words' };
  const first = label('first', 'First option', 'Freelance', { weight: 700, align: 'left' }, 24);
  const second = label('second', 'Second option', 'Agency', { weight: 700, align: 'left' }, 24);
  const dayNames = ['MON', 'TUE', 'WED', 'FRI'];
  const agendaItems = ['Team kick-off', 'Client review', 'Design sprint', 'Planning session'];
  const days = dayNames.map((d, i) => label(`day${i + 1}`, `${ORDINAL[i] ?? ''} day`, d, { weight: 800, letterSpacingPct: 6 }, 10));
  const agenda = agendaItems.map((d, i) => label(`item${i + 1}`, `${ORDINAL[i] ?? ''} item`, d, { weight: 600 }, 40));
  const topItems = ['Plan your week', 'Batch your tasks', 'Block focus time', 'Automate admin', 'Review on Friday'];
  const ranked = topItems.map((d, i) => label(`item${i + 1}`, `${ORDINAL[i] ?? ''} on the list`, d, { weight: 600 }, 40));
  // Words drawn inside a part (D-159): the mark's letter, VS, the numbers.
  const glyphStyle: Partial<TextStyle> = { fontId: 'headline', weight: 800, align: 'center', letterSpacingPct: 0 };
  const initial = (name: string): string => (name.trim()[0] ?? '').toUpperCase();
  const mark: TextSlotDef = {
    ...label('mark', 'Brand mark letter', initial(brand.placeholder), glyphStyle, 3),
    derive: (texts) => initial((texts[brand.id] ?? brand.placeholder).slice(0, brand.maxChars)),
  };
  const vs = label('vs', 'Between the photos', 'VS', glyphStyle, 4);
  const numberList = (id: string, name: string, fallback: string, style: Partial<TextStyle> = glyphStyle): TextSlotDef =>
    ({ ...label(id, name, fallback, style, 24), list: 'numbers' });
  const rankNumbers = numberList('numbers', 'Numbers', '1');
  const pillarNumbers = numberList('pillarNumbers', 'Pillar numbers', '01', { ...glyphStyle, fontId: 'body' });
  const stepNumbers = numberList('stepNumbers', 'Step numbers', '1');

  const body: Record<Kind, TextSlotDef[]> = {
    update: [eyebrow, subline],
    guide: [eyebrow, subline],
    report: [eyebrow, figure, figureNote],
    launch: [eyebrow, subline, button, sticker],
    agenda: [eyebrow, ...days.flatMap((d, i) => [d, agenda[i] ?? d])],
    milestone: [eyebrow, figure, figureNote],
    pillars: [eyebrow, pillars, pillarNumbers],
    deck: [eyebrow, subline],
    youtube: [highlight],
    podcast: [eyebrow, guest],
    tutorial: [eyebrow, steps, stepNumbers],
    top: [eyebrow, ...ranked, rankNumbers],
    versus: [first, second, vs],
    vlog: [eyebrow, subline],
    course: [eyebrow, details, button],
    live: [live, subline, when],
  };
  const slots: TextSlotDef[] = [headline, ...body[kind], brand, mark, ...(kind === 'youtube' ? [] : [footer])];
  const twoPhotos = kind === 'podcast' || kind === 'versus';

  const build = (inputs: SceneInputs, ctx: BuildContext): Layer[] => {
    const { design, safe, durationMs } = ctx;
    const u = Math.min(design.w, design.h);
    // Landscape and square frames read left to right like a video thumbnail; portrait ones stack.
    const split = design.w >= design.h * 0.95;
    const square = split && design.w < design.h * 1.2;
    const mx = Math.max(safe.x, u * 0.075);
    const my = Math.max(safe.y, u * 0.065);
    const floor = contentFloor(design, safe);
    const photos = fillSlots(inputs.photos, twoPhotos ? 2 : 1);
    const said = (slot: TextSlotDef): string => slotWords(slot, inputs).slice(0, slot.maxChars);
    // An emptied text is a deleted one (D-124): its piece, and any shape that goes with it, leave too.
    const shown = (slot: TextSlotDef): boolean => slots.includes(slot) && said(slot).trim().length > 0;
    // Read the way an entry typed on the picture is written back (numbering.ts), so entry k is the same one both ways.
    const listOf = (slot: TextSlotDef): string[] => listEntries(said(slot)).slice(0, 6);
    const backLayers: Layer[] = [];
    const photoLayers: Layer[] = [];
    const frontLayers: Layer[] = [];
    const wordLayers: Layer[] = [];

    // ── Words, measured ──────────────────────────────────────────────────

    const withWords = (slot: TextSlotDef, words: string): SceneInputs => ({ ...inputs, texts: { ...inputs.texts, [slot.id]: words } });
    const measure = (slot: TextSlotDef, size: number, maxW: number, lineHeight = 1.08, words?: string): { width: number; height: number } =>
      measureSlot(ctx, slot, words === undefined ? inputs : withWords(slot, words), size, maxW, lineHeight);
    /** A slot's text, or one entry of a list slot (`item`), typed into on its own (D-159). */
    const place = (slot: TextSlotDef, options: Parameters<typeof placeText>[3], words?: string): Layer =>
      placeText(ctx, slot, words === undefined ? inputs : withWords(slot, words), options).layer;
    /** A short word decorating something, not anybody's text: a specimen's "Aa". */
    const ornament = (words: string, size: number, x: number, y: number, fill: Paint, options: { readonly at: number; readonly font?: string; readonly tracks?: Tracks; readonly width?: number }): Layer => ({
      id: ctx.id('ornament'), type: 'text', startMs: 0, endMs: durationMs, anchorX: 0.5, anchorY: 0,
      tracks: { x: [kf(0, x)], y: [kf(0, y)], ...options.tracks },
      props: { text: words, fontId: options.font ?? 'headline', fontSizePx: size, weight: 800, letterSpacingPct: 0, lineHeight: 1, align: 'center', fill, maxWidthPx: options.width ?? size * 3, reveal: FADE(options.at, 250) },
    });
    /**
     * A letter or number drawn inside a part (D-159): the slot's words in the
     * slot's style, centred on (x, `cy`), made smaller only when they would
     * not fit `fit` — so what the design wrote looks exactly as it did, and a
     * longer number typed in stays inside its disc. No slot of its own: the
     * part carries it, and typing goes through the part.
     */
    const glyph = (slot: TextSlotDef, words: string, size: number, x: number, cy: number, fill: Paint, options: { readonly at: number; readonly width?: number; readonly fit?: number; readonly lift?: number }): Layer[] => {
      if (words.trim().length === 0) return [];
      const width = options.width ?? size * 3;
      const style = (base: number): ReturnType<typeof textFor> =>
        textFor(slot, withWords(slot, words), { baseSizePx: base, maxWidthPx: width, reveal: FADE(options.at, 250), lineHeight: 1, fallbackFill: fill });
      let props = style(size);
      const wide = ctx.measure({ text: props.text, font: fontString(props.fontId, props.fontSizePx, props.weight), fontSizePx: props.fontSizePx, letterSpacingPx: (props.letterSpacingPct / 100) * props.fontSizePx, lineHeight: 1, align: 'center', maxWidthPx: null }).width;
      const fit = options.fit ?? width;
      if (wide > fit && wide > 0) props = style(size * (fit / wide));
      const { slot: _slot, ...drawn } = props;
      return [{
        id: ctx.id('glyph'), type: 'text', startMs: 0, endMs: durationMs, anchorX: 0.5, anchorY: 0,
        tracks: { x: [kf(0, x)], y: [kf(0, capTop(cy, drawn.fontSizePx) + (options.lift ?? 0) * drawn.fontSizePx)] },
        props: drawn,
      }];
    };
    /** The top of a one-line text whose capitals should sit centred on `cy`. */
    const capTop = (cy: number, size: number): number => cy - size * 0.45;
    const pop = (at: number, ms = 420, from = 0): Tracks => ({ scaleX: [kf(at, from), kf(at + ms, 1, 'outBack')], scaleY: [kf(at, from), kf(at + ms, 1, 'outBack')] });
    /** A slow drift up and down, for shapes resting after their entrance. */
    const bob = (x: number, y: number, amp: number, periodMs: number, phase: number, from: number, extra?: (ms: number) => { scale?: number; opacity?: number; rotation?: number }): Tracks =>
      sampled(0, durationMs, 90, (ms) => {
        const settle = clamp01((ms - from) / 900);
        return { x, y: y + Math.sin((ms / periodMs) * Math.PI * 2 + phase) * amp * easeInOut(settle), ...extra?.(ms) };
      });

    // ── The brand row and the footer ─────────────────────────────────────

    // Portrait frames have room to spare: their small type is set a size larger.
    const grow = split ? 1 : design.h > design.w * 1.5 ? 1.25 : 1.12;
    const markSize = u * 0.056 * grow;
    const brandH = shown(brand) ? markSize : 0;
    const brandRow = (maxW: number): Layer[] => {
      if (!shown(brand)) return [];
      const cy = my + markSize / 2;
      const nameSize = u * 0.03 * grow;
      const nameX = mx + markSize + u * 0.02;
      const name = measure(brand, nameSize, maxW - markSize - u * 0.02);
      const oneLine = name.height < nameSize * 1.5;
      // The name first: "Fill frame" puts a photograph behind the first of the design's own texts (D-115), and the mark beside it has to stay in front.
      return [
        place(brand, { sizePx: nameSize, maxWidthPx: maxW - markSize - u * 0.02, x: nameX, y: oneLine ? capTop(cy, nameSize) : cy - name.height / 2, anchorX: 0, reveal: SLIDE(AT.brand + 180) }),
        part(ctx, 'mark', shapeSlot('mark', 'Brand mark', { text: { slot: mark.id } }), { x: mx + markSize / 2, y: cy }, [
          rect(ctx, 'markTile', { w: markSize, h: markSize, x: mx + markSize / 2, y: cy, radius: markSize * 0.28, fill: roleFill('accent'), tracks: { ...pop(AT.brand, 460), rotation: [kf(AT.brand, -30), kf(AT.brand + 460, 0, 'outBack')] } }),
          ...glyph(mark, said(mark), markSize * 0.56, mx + markSize / 2, cy, roleFill('onAccent'), { at: AT.brand + 220, fit: markSize * 0.8, lift: 0.02 / 0.56 }),
        ]),
      ];
    };

    const footSize = u * 0.026 * grow;
    const dash = u * 0.036;
    /** The footer's height at the width it is given: a long one wraps upwards, never below the floor. */
    const footHeight = (maxW: number): number => (shown(footer) ? measure(footer, footSize, maxW - dash - u * 0.018).height : 0);
    const footerRow = (x: number, maxW: number): Layer[] => {
      if (!shown(footer)) return [];
      const top = floor - footHeight(maxW);
      return [
        place(footer, { sizePx: footSize, maxWidthPx: maxW - dash - u * 0.018, x: x + dash + u * 0.018, y: top, anchorX: 0, fill: roleFill('inkMuted'), reveal: SLIDE(AT.footer + 100) }),
        rect(ctx, 'footRule', { w: dash, h: Math.max(3, u * 0.005), x, y: top + footSize * 0.47, anchorX: 0, radius: u * 0.003, fill: roleFill('accent'), tracks: { scaleX: [kf(AT.footer, 0), kf(AT.footer + 400, 1, 'outExpo')] }, slot: shapeSlot('footRule', 'Line beside the footer'), follows: `text:${footer.id}` }),
      ];
    };

    // ── The word column, as pieces ───────────────────────────────────────

    /** Every piece under the headline arrives after it, in turn. */
    const stack = (scale: number, colW: number): Piece[] => {
      const pieces: Piece[] = [];
      // Thumbnail-sized: two or three heavy lines, read at a glance on a small card.
      const ratio = design.w / design.h;
      const shapeSize = ratio > 1.5 ? 0.125 : ratio > 1.2 ? 0.11 : split ? 0.095 : ratio > 0.7 ? 0.115 : 0.13;
      const headSize = u * (kind === 'versus' ? shapeSize * 0.8 : kind === 'youtube' ? shapeSize * 1.15 : shapeSize) * scale;
      const head = shown(headline) ? measure(headline, headSize, colW, 1.02) : { width: 0, height: 0 };
      const headLines = Math.max(1, Math.round(head.height / (headSize * 1.02)));
      // Everything but the headline, a size up on a portrait frame, which has the room.
      const s = scale * grow;
      let next = AT.headline + headLines * 110 + 260;
      const after = (): number => { const at = next; next += 150; return at; };

      // Above the headline.
      if (kind === 'live' && shown(live)) pieces.push(livePill(live, u * 0.026 * s));
      else if (shown(eyebrow)) {
        const pill = kind === 'podcast' || kind === 'tutorial' || kind === 'top' || kind === 'course';
        pieces.push(pill ? eyebrowPill(eyebrow, u * 0.024 * s) : eyebrowText(eyebrow, u * 0.026 * s, colW));
      }

      if (shown(headline)) {
        pieces.push({
          h: head.height, w: head.width, gap: u * 0.026 * scale,
          draw: (x, top) => [place(headline, { sizePx: headSize, maxWidthPx: colW, x, y: top, anchorX: 0, lineHeight: 1.02, reveal: LINES(AT.headline) })],
        });
      }

      switch (kind) {
        case 'youtube':
          if (shown(highlight)) pieces.push(highlightBox(highlight, headSize * 0.8, colW, AT.headline + headLines * 110 + 150));
          break;
        case 'update':
        case 'vlog':
        case 'deck':
          if (kind === 'deck') pieces.push(rule(u * 0.03 * s, after()));
          if (shown(subline)) pieces.push(sublinePiece(u * 0.033 * s, colW, after()));
          break;
        case 'guide':
          if (shown(subline)) pieces.push(sublinePiece(u * 0.033 * s, colW, after()));
          pieces.push(swatches(u * 0.058 * s, after()));
          break;
        case 'launch':
          if (shown(subline)) pieces.push(sublinePiece(u * 0.032 * s, colW, after()));
          if (shown(button)) pieces.push(buttonPill(button, u * 0.028 * s, after()));
          break;
        case 'report':
        case 'milestone':
          if (shown(figure) || shown(figureNote)) pieces.push(figurePiece(u * (split ? 0.15 : 0.17) * s, u * 0.03 * s, colW, after()));
          break;
        case 'agenda':
          pieces.push(listPiece('check', days, agenda, u * 0.031 * s, colW, after()));
          break;
        case 'top':
          pieces.push(listPiece('number', [], ranked, u * 0.03 * s, colW, after()));
          break;
        case 'pillars':
          if (shown(pillars)) pieces.push(chipsPiece(pillars, true, u * 0.028 * s, colW, after()));
          break;
        case 'course':
          if (shown(details)) pieces.push(chipsPiece(details, false, u * 0.026 * s, colW, after()));
          if (shown(button)) pieces.push(buttonPill(button, u * 0.028 * s, after()));
          break;
        case 'tutorial':
          if (shown(steps)) pieces.push(stepsPiece(u * 0.03 * s, colW, after()));
          break;
        case 'podcast':
          if (shown(guest)) pieces.push(plainLine(guest, u * 0.034 * s, colW, roleFill('accent'), after()));
          pieces.push(wave(u * 0.06 * s, colW, after()));
          break;
        case 'live':
          if (shown(subline)) pieces.push(sublinePiece(u * 0.032 * s, colW, after()));
          if (shown(when)) pieces.push(whenLine(u * 0.03 * s, colW, after()));
          break;
        case 'versus':
          break;
      }

      return pieces;
    };

    const eyebrowText = (slot: TextSlotDef, size: number, colW: number): Piece => {
      const m = measure(slot, size, colW);
      return { h: m.height, w: m.width, gap: 0, draw: (x, top) => [place(slot, { sizePx: size, maxWidthPx: colW, x, y: top, anchorX: 0, fill: roleFill('accent'), reveal: LETTERS(AT.eyebrow) })] };
    };

    const eyebrowPill = (slot: TextSlotDef, size: number): Piece => {
      const m = measure(slot, size, u);
      const padX = size * 0.95;
      const h = size * 2.3;
      const w = m.width + padX * 2;
      return {
        h, w, gap: 0,
        draw: (x, top) => [
          rect(ctx, 'eyebrowPill', { w, h, x: x + w / 2, y: top + h / 2, radius: h / 2, fill: roleFill('accent'), tracks: pop(AT.eyebrow - 60, 420), slot: shapeSlot('eyebrowPill', 'Pill behind the small line'), follows: `text:${slot.id}` }),
          place(slot, { sizePx: size, maxWidthPx: m.width + 2, x: x + padX, y: capTop(top + h / 2, size), anchorX: 0, fill: roleFill('onAccent'), reveal: FADE(AT.eyebrow + 160) }),
        ],
      };
    };

    const livePill = (slot: TextSlotDef, size: number): Piece => {
      const m = measure(slot, size, u);
      const dot = size * 0.62;
      const padX = size * 0.9;
      const h = size * 2.3;
      const w = padX + dot + size * 0.55 + m.width + padX;
      return {
        h, w, gap: 0,
        draw: (x, top) => {
          const cy = top + h / 2;
          const dotX = x + padX + dot / 2;
          const beats = sampled(0, durationMs, 60, (ms) => {
            const beat = ((ms - AT.settled) % 1200 + 1200) % 1200 / 1200;
            const on = ms < AT.settled ? 0 : Math.sin(beat * Math.PI);
            return { x: dotX, y: cy, scale: ms < AT.eyebrow ? 0 : 1 + on * 0.3, opacity: ms < AT.eyebrow ? 0 : 1 - on * 0.45 };
          });
          return [
            part(ctx, 'livePill', shapeSlot('livePill', 'Badge behind LIVE'), { x: x + w / 2, y: cy }, [
              rect(ctx, 'livePillShape', { w, h, x: x + w / 2, y: cy, radius: h / 2, fill: roleFill('accent'), tracks: pop(AT.eyebrow - 80, 420) }),
              rect(ctx, 'liveDot', { w: dot, h: dot, x: dotX, y: cy, ellipse: true, fill: roleFill('onAccent'), tracks: beats }),
            ], { follows: `text:${slot.id}` }),
            place(slot, { sizePx: size, maxWidthPx: m.width + 2, x: dotX + dot / 2 + size * 0.55, y: capTop(cy, size), anchorX: 0, fill: roleFill('onAccent'), reveal: FADE(AT.eyebrow + 140) }),
          ];
        },
      };
    };

    const sublinePiece = (size: number, colW: number, at: number): Piece => {
      const maxW = Math.min(colW, u * 0.9);
      const m = measure(subline, size, maxW, 1.35);
      return { h: m.height, w: m.width, gap: size * 0.9, draw: (x, top) => [place(subline, { sizePx: size, maxWidthPx: maxW, x, y: top, anchorX: 0, lineHeight: 1.35, fill: roleFill('inkMuted'), reveal: LINES(at, 90) })] };
    };

    const plainLine = (slot: TextSlotDef, size: number, colW: number, fill: Paint, at: number): Piece => {
      const m = measure(slot, size, colW, 1.2);
      return { h: m.height, w: m.width, gap: size * 0.75, draw: (x, top) => [place(slot, { sizePx: size, maxWidthPx: colW, x, y: top, anchorX: 0, lineHeight: 1.2, fill, reveal: SLIDE(at) })] };
    };

    const whenLine = (size: number, colW: number, at: number): Piece => {
      const ring = size * 0.9;
      const m = measure(when, size, colW - ring - size * 0.6);
      return {
        h: Math.max(m.height, ring), w: ring + size * 0.6 + m.width, gap: size * 1.1,
        draw: (x, top) => {
          const cy = top + Math.max(m.height, ring) / 2;
          return [
            part(ctx, 'clock', shapeSlot('clock', 'Clock'), { x: x + ring / 2, y: cy }, [
              rect(ctx, 'whenRing', { w: ring, h: ring, x: x + ring / 2, y: cy, ellipse: true, fill: CLEAR, stroke: { paint: roleFill('accent'), width: Math.max(2, size * 0.14) }, tracks: pop(at, 380) }),
              rect(ctx, 'whenHand', { w: Math.max(2, size * 0.12), h: ring * 0.32, x: x + ring / 2, y: cy, anchorY: 1, fill: roleFill('accent'), tracks: { ...pop(at + 120, 300), rotation: [kf(0, 0), kf(durationMs, 360, 'linear')] } }),
            ], { follows: `text:${when.id}` }),
            place(when, { sizePx: size, maxWidthPx: colW - ring - size * 0.6, x: x + ring + size * 0.6, y: capTop(cy, size), anchorX: 0, reveal: SLIDE(at + 80) }),
          ];
        },
      };
    };

    const rule = (size: number, at: number): Piece => ({
      h: Math.max(3, u * 0.006), w: u * 0.14, gap: size * 1.1,
      draw: (x, top) => [rect(ctx, 'rule', { w: u * 0.14, h: Math.max(3, u * 0.006), x, y: top, anchorX: 0, anchorY: 0, radius: u * 0.003, fill: roleFill('accent'), tracks: { scaleX: [kf(at, 0), kf(at + 600, 1, 'outExpo')] }, slot: shapeSlot('rule', 'Line under the headline') })],
    });

    const highlightBox = (slot: TextSlotDef, size: number, colW: number, at: number): Piece => {
      const m = measure(slot, size, colW * 0.92, 1.0);
      const padX = size * 0.3;
      const padY = size * 0.12;
      const w = m.width + padX * 2;
      const h = m.height + padY * 2;
      const tilt = -2.5;
      return {
        h, w, gap: size * 0.28,
        draw: (x, top) => [
          rect(ctx, 'highlight', { w, h, x, y: top + h / 2, anchorX: 0, radius: u * 0.008, fill: roleFill('accent'), tracks: { rotation: [kf(0, tilt)], scaleX: [kf(at, 0.001), kf(at + 420, 1, 'outExpo')] }, slot: shapeSlot('highlight', 'Box behind the highlighted words'), follows: `text:${slot.id}` }),
          place(slot, { sizePx: size, maxWidthPx: m.width + 2, x: x + padX, y: top + padY, anchorX: 0, lineHeight: 1.0, fill: roleFill('onAccent'), tracks: { rotation: [kf(0, tilt)] }, reveal: { kind: 'kinetic', unit: 'word', motion: 'pop', startMs: at + 200, durationMs: 420, staggerMs: 70 } }),
        ],
      };
    };

    const buttonPill = (slot: TextSlotDef, size: number, at: number): Piece => {
      const m = measure(slot, size, u * 0.6);
      const padX = size * 1.35;
      const h = size * 2.6;
      const w = m.width + padX * 2;
      return {
        h, w, gap: size * 1.5,
        draw: (x, top) => {
          const cy = top + h / 2;
          // A sheen crosses the button now and then, once everything has arrived.
          const sheenW = h * 0.55;
          const sweep = sampled(0, durationMs, 50, (ms) => {
            const cycle = 2800;
            // First pass after the library's still is taken (posterAtMs), then every few seconds.
            const local = ms < AT.settled + 1300 ? -1 : ((ms - AT.settled - 1300) % cycle) / 900;
            return { x: local < 0 || local > 1 ? -w : -w / 2 - sheenW + easeInOut(local) * (w + sheenW * 2), y: 0, rotation: 20 };
          });
          return [
            part(ctx, 'button', shapeSlot('button', 'Button'), { x: x + w / 2, y: cy }, [
              rect(ctx, 'buttonShape', { w, h, x: x + w / 2, y: cy, radius: h / 2, fill: roleFill('accent'), tracks: pop(at, 460) }),
              {
                id: ctx.id('sheen'), type: 'mask', startMs: 0, endMs: durationMs,
                tracks: { x: [kf(0, x + w / 2)], y: [kf(0, cy)] },
                props: { shape: 'rect', w, h, cornerRadius: h / 2 },
                children: [{ id: ctx.id('sheenBar'), type: 'shape', startMs: 0, endMs: durationMs, tracks: sweep, props: { shape: 'rect', w: sheenW, h: h * 2.2, fill: roleFill('onAccent', 0.28) } }],
              },
            ], { follows: `text:${slot.id}` }),
            place(slot, { sizePx: size, maxWidthPx: m.width + 2, x: x + padX, y: capTop(cy, size), anchorX: 0, fill: roleFill('onAccent'), reveal: FADE(at + 220) }),
          ];
        },
      };
    };

    const figurePiece = (size: number, noteSize: number, colW: number, at: number): Piece => {
      const num = shown(figure) ? measure(figure, size, colW, 1.0) : { width: 0, height: 0 };
      const gapX = u * 0.03;
      const besideW = colW - num.width - gapX;
      const beside = shown(figure) && besideW >= u * 0.2;
      const noteW = beside ? Math.min(besideW, u * 0.36) : colW;
      const note = shown(figureNote) ? measure(figureNote, noteSize, noteW, 1.25) : { width: 0, height: 0 };
      // Beside the figure, the note sits on its capitals' middle.
      const noteOffset = beside ? Math.max(0, size * 0.42 - note.height / 2) : num.height + (num.height > 0 ? u * 0.012 : 0);
      const h = beside ? Math.max(num.height, noteOffset + note.height) : noteOffset + note.height;
      return {
        h, w: beside ? num.width + gapX + note.width : Math.max(num.width, note.width), gap: u * 0.03,
        draw: (x, top) => [
          ...(shown(figure) ? [place(figure, { sizePx: size, maxWidthPx: colW, x, y: top, anchorX: 0, lineHeight: 1.0, fill: roleFill('accent'), reveal: { kind: 'count', startMs: at, durationMs: 900 }, tracks: { opacity: [kf(at - 100, 0), kf(at + 150, 1)] } })] : []),
          ...(shown(figureNote) ? [place(figureNote, { sizePx: noteSize, maxWidthPx: noteW, x: beside ? x + num.width + gapX : x, y: top + noteOffset, anchorX: 0, lineHeight: 1.25, reveal: LINES(at + 250, 90) })] : []),
        ],
      };
    };

    /** An agenda (a tick, a day, an item) or a ranked list (a numbered disc, an item), one row at a time. */
    const listPiece = (marker: 'check' | 'number', dayList: readonly TextSlotDef[], itemList: readonly TextSlotDef[], size: number, colW: number, at: number): Piece => {
      const rows = itemList.map((item, i) => ({ item, day: dayList[i] })).filter((row) => shown(row.item) || (row.day !== undefined && shown(row.day)));
      const disc = size * 1.45;
      const dayW = Math.max(0, ...rows.map((row) => (row.day && shown(row.day) ? measure(row.day, size * 0.9, u * 0.3).width : 0)));
      const textX = disc + u * 0.022 + (dayW > 0 ? dayW + u * 0.026 : 0);
      const textW = Math.max(u * 0.15, colW - textX);
      const heights = rows.map((row) => Math.max(disc, shown(row.item) ? measure(row.item, size, textW, 1.2).height : 0));
      const rowGap = size * 0.85;
      const h = heights.reduce((sum, rh) => sum + rh, 0) + rowGap * Math.max(0, rows.length - 1);
      return {
        h, w: colW, gap: size * 1.4,
        draw: (x, top) => {
          const out: Layer[] = [];
          const dividers: Layer[] = [];
          const marks = marker === 'number' ? numbers(said(rankNumbers), rows.length) : [];
          let y = top;
          rows.forEach((row, i) => {
            const rh = heights[i] ?? disc;
            const cy = y + rh / 2;
            const t = at + i * 140;
            if (i > 0) dividers.push(rect(ctx, 'divider', { w: colW, h: Math.max(1, u * 0.0018), x, y: y - rowGap / 2, anchorX: 0, fill: roleFill('ink', 0.12), tracks: { scaleX: [kf(t - 60, 0), kf(t + 440, 1, 'outCubic')] } }));
            const pieces: Layer[] = [rect(ctx, 'listDisc', { w: disc, h: disc, x: x + disc / 2, y: cy, ellipse: true, fill: roleFill('accent'), tracks: pop(t, 360) })];
            if (marker === 'check') {
              // The tick: a short stroke then a long one, drawn in turn.
              const stroke = Math.max(2.5, disc * 0.11);
              pieces.push(rect(ctx, 'tickShort', { w: disc * 0.26, h: stroke, x: x + disc * 0.3, y: cy + disc * 0.02, anchorX: 0, radius: stroke / 2, fill: roleFill('onAccent'), tracks: { rotation: [kf(0, 45)], scaleX: [kf(t + 200, 0), kf(t + 320, 1)] } }));
              pieces.push(rect(ctx, 'tickLong', { w: disc * 0.44, h: stroke, x: x + disc * 0.46, y: cy + disc * 0.17, anchorX: 0, radius: stroke / 2, fill: roleFill('onAccent'), tracks: { rotation: [kf(0, -50)], scaleX: [kf(t + 320, 0), kf(t + 480, 1)] } }));
            } else {
              pieces.push(...glyph(rankNumbers, marks[i] ?? '', disc * 0.58, x + disc / 2, cy, roleFill('onAccent'), { at: t + 160, width: disc, fit: disc * 0.84 }));
            }
            // The disc and what is on it, one part that moves with its line (D-159).
            const ref = marker === 'check'
              ? shapeSlot(`tick${i + 1}`, `Tick ${i + 1}`)
              : shapeSlot(`number${i + 1}`, `Number ${i + 1}`, { text: { slot: rankNumbers.id, item: i } });
            out.push(part(ctx, marker === 'check' ? 'tick' : 'listNumber', ref, { x: x + disc / 2, y: cy }, pieces, shown(row.item) ? { follows: `text:${row.item.id}` } : {}));
            if (row.day && shown(row.day)) {
              out.push(place(row.day, { sizePx: size * 0.9, maxWidthPx: dayW + 2, x: x + disc + u * 0.022, y: capTop(cy, size * 0.9), anchorX: 0, fill: roleFill('accent'), reveal: SLIDE(t + 60) }));
            }
            if (shown(row.item)) {
              const m = measure(row.item, size, textW, 1.2);
              out.push(place(row.item, { sizePx: size, maxWidthPx: textW, x: x + textX, y: m.height > size * 1.3 ? cy - m.height / 2 : capTop(cy, size), anchorX: 0, lineHeight: 1.2, reveal: SLIDE(t + 100) }));
            }
            y += rh + rowGap;
          });
          // The rules between the lines, one part, behind them.
          return dividers.length > 0 ? [part(ctx, 'dividers', shapeSlot('dividers', 'Lines between the rows', { tint: 'ink' }), { x: x + colW / 2, y: top + h / 2 }, dividers), ...out] : out;
        },
      };
    };

    /** Pills that wrap into rows; numbered "01, 02…" for strategy pillars. */
    const chipsPiece = (slot: TextSlotDef, numbered: boolean, size: number, colW: number, at: number): Piece => {
      const items = listOf(slot);
      const padX = size * 0.95;
      const chipH = size * 2.5;
      const gapX = u * 0.016;
      const gapY = u * 0.016;
      // The numbers typed for the pillars (D-159), "01" counting on unless told otherwise.
      const marks = numbered ? numbers(said(pillarNumbers), items.length) : [];
      const numbering = marks.some((m) => m.length > 0);
      const longest = Math.max(0, ...marks.filter((m) => m.length > 2).map((m) => measure(pillarNumbers, size, u, 1.08, m).width));
      const numW = numbering ? Math.max(measure(slot, size, u, 1.08, '00').width, longest) + size * 0.5 : 0;
      const chips = items.map((item) => ({ item, labelW: Math.min(measure(slot, size, colW, 1.08, item).width, colW - padX * 2 - numW) })).map((c) => ({ ...c, w: c.labelW + padX * 2 + numW }));
      const rows: { item: string; labelW: number; w: number }[][] = [[]];
      let rowW = 0;
      for (const chip of chips) {
        const row = rows[rows.length - 1];
        if (row && row.length > 0 && rowW + gapX + chip.w > colW) { rows.push([]); rowW = 0; }
        rows[rows.length - 1]?.push(chip);
        rowW += (rowW > 0 ? gapX : 0) + chip.w;
      }
      const h = rows.length * chipH + (rows.length - 1) * gapY;
      const widest = Math.max(0, ...rows.map((row) => row.reduce((sum, c) => sum + c.w, 0) + gapX * Math.max(0, row.length - 1)));
      return {
        h, w: widest, gap: size * 1.5,
        draw: (x, top) => {
          const out: Layer[] = [];
          let k = 0;
          rows.forEach((row, r) => {
            let cx = x;
            const cy = top + r * (chipH + gapY) + chipH / 2;
            for (const chip of row) {
              const t = at + k * 110;
              const name = numbered ? 'Pillar' : 'Detail';
              const leader = `text:${slot.id}#${k}`;
              out.push(rect(ctx, 'chip', { w: chip.w, h: chipH, x: cx + chip.w / 2, y: cy, radius: chipH / 2, fill: roleFill('surface'), stroke: { paint: roleFill('ink', 0.12), width: Math.max(1, u * 0.002) }, tracks: pop(t, 380), slot: shapeSlot(`chip${k + 1}`, `${name} ${k + 1}'s pill`, { tint: 'surface' }), follows: leader }));
              const mark = marks[k] ?? '';
              if (numbering && mark.length > 0) {
                // A number beside the words is its own text, and moves with them (D-159).
                const numX = cx + padX + (numW - size * 0.5) / 2;
                out.push(place(pillarNumbers, { sizePx: size, maxWidthPx: size * 3, x: numX, y: capTop(cy, size), anchorX: 0.5, lineHeight: 1, fill: roleFill('accent'), reveal: FADE(t + 150, 250), item: k, label: `Number ${k + 1}`, follows: leader }, mark));
              }
              out.push(place(slot, { sizePx: size, maxWidthPx: chip.labelW + 2, x: cx + padX + numW, y: capTop(cy, size), anchorX: 0, reveal: FADE(t + 160), item: k, label: `${name} ${k + 1}` }, chip.item));
              cx += chip.w + gapX;
              k += 1;
            }
          });
          return out;
        },
      };
    };

    /** Numbered steps in a row, joined by a line; a column when the row will not fit. */
    const stepsPiece = (size: number, colW: number, at: number): Piece => {
      const items = listOf(steps);
      const disc = size * 1.7;
      const inner = u * 0.016;
      const link = u * 0.04;
      const widths = items.map((item) => measure(steps, size, colW - disc - inner, 1.08, item).width);
      const across = widths.reduce((sum, w) => sum + disc + inner + w, 0) + link * Math.max(0, items.length - 1) <= colW;
      const rowGap = size * 0.7;
      const h = across ? disc : items.length * disc + Math.max(0, items.length - 1) * rowGap;
      const w = across ? widths.reduce((sum, wd) => sum + disc + inner + wd, 0) + link * Math.max(0, items.length - 1) : disc + inner + Math.max(0, ...widths);
      return {
        h, w, gap: size * 1.4,
        draw: (x, top) => {
          const out: Layer[] = [];
          let cx = x;
          const links: Layer[] = [];
          const marks = numbers(said(stepNumbers), items.length);
          items.forEach((item, i) => {
            const t = at + i * 160;
            const cy = across ? top + disc / 2 : top + i * (disc + rowGap) + disc / 2;
            const left = across ? cx : x;
            const leader = `text:${steps.id}#${i}`;
            // The disc and its number, one part that moves with its step (D-159).
            out.push(part(ctx, 'stepDisc', shapeSlot(`step${i + 1}`, `Step ${i + 1}'s number`, { text: { slot: stepNumbers.id, item: i } }), { x: left + disc / 2, y: cy }, [
              rect(ctx, 'stepDiscShape', { w: disc, h: disc, x: left + disc / 2, y: cy, ellipse: true, fill: roleFill('accent'), tracks: pop(t, 380) }),
              ...glyph(stepNumbers, marks[i] ?? '', disc * 0.55, left + disc / 2, cy, roleFill('onAccent'), { at: t + 150, width: disc, fit: disc * 0.84 }),
            ], { follows: leader }));
            out.push(place(steps, { sizePx: size, maxWidthPx: (widths[i] ?? 0) + 2, x: left + disc + inner, y: capTop(cy, size), anchorX: 0, reveal: SLIDE(t + 80), item: i, label: `Step ${i + 1}` }, item));
            const end = left + disc + inner + (widths[i] ?? 0);
            if (across && i < items.length - 1) {
              links.push(rect(ctx, 'stepLink', { w: link - u * 0.016, h: Math.max(2, u * 0.003), x: end + u * 0.008, y: cy, anchorX: 0, fill: roleFill('ink', 0.3), tracks: { scaleX: [kf(t + 200, 0), kf(t + 420, 1)] } }));
            }
            cx = end + link;
          });
          return links.length > 0 ? [...out, part(ctx, 'stepLinks', shapeSlot('stepLinks', 'Lines between the steps', { tint: 'ink' }), { x: x + w / 2, y: top + h / 2 }, links)] : out;
        },
      };
    };

    /** The palette itself, as a brand book shows it: a type specimen and four colours. */
    const swatches = (d: number, at: number): Piece => {
      const specimen = d * 1.05;
      const gap = d * 0.24;
      const fills: Paint[] = [roleFill('accent'), roleFill('ink'), roleFill('surface'), roleFill('inkMuted')];
      const specimenW = specimen * 1.25;
      const w = specimenW + gap * 1.5 + fills.length * d + (fills.length - 1) * gap;
      return {
        h: d, w, gap: u * 0.05,
        draw: (x, top) => {
          const cy = top + d / 2;
          const out: Layer[] = [ornament('Aa', specimen, x + specimenW / 2, capTop(cy, specimen), roleFill('ink'), { at, width: specimenW * 1.4 })];
          fills.forEach((fill, i) => {
            out.push(rect(ctx, 'swatch', { w: d, h: d, x: x + specimenW + gap * 1.5 + d / 2 + i * (d + gap), y: cy, ellipse: true, fill, stroke: { paint: roleFill('ink', 0.16), width: Math.max(1, u * 0.002) }, tracks: pop(at + 120 + i * 90, 380) }));
          });
          // The palette, shown whole: picked and moved as one (D-159). Its colours are the look's own.
          return [part(ctx, 'swatches', shapeSlot('swatches', 'Colour swatches'), { x: x + w / 2, y: cy }, out)];
        },
      };
    };

    /** A sound wave that keeps moving: the episode is playing. */
    const wave = (maxH: number, colW: number, at: number): Piece => {
      const bars = 26;
      const barW = u * 0.0075;
      const gap = u * 0.0075;
      const w = Math.min(colW, bars * (barW + gap));
      return {
        h: maxH, w, gap: u * 0.035,
        draw: (x, top) => {
          const out: Layer[] = [];
          const cy = top + maxH / 2;
          for (let i = 0; i < bars; i++) {
            const bx = x + i * (barW + gap) + barW / 2;
            if (bx > x + colW) break;
            // (Each bar is a piece of the one part below.)
            const phase = i * 0.55;
            out.push(rect(ctx, 'waveBar', {
              w: barW, h: maxH, x: bx, y: cy, radius: barW / 2, fill: roleFill('accent', 0.55 + (i % 3) * 0.2),
              tracks: sampled(0, durationMs, 70, (ms) => ({
                x: bx, y: cy,
                scaleY: Math.max(0.08, (0.22 + 0.78 * Math.abs(Math.sin(ms / 240 + phase) * Math.sin(ms / 530 + phase * 0.4))) * clamp01((ms - at - i * 12) / 350)),
              })),
            }));
          }
          return [part(ctx, 'wave', shapeSlot('wave', 'Sound wave'), { x: x + w / 2, y: cy }, out)];
        },
      };
    };

    /**
     * The column, at the largest size that fits `maxH` and `colW`: every piece
     * shrinks together, so the hierarchy stays as designed however long the
     * person's words are.
     */
    const fitStack = (colW: number, maxH: number): { pieces: Piece[]; height: number } => {
      let scale = 1;
      for (let i = 0; i < 14; i++) {
        const pieces = stack(scale, colW);
        const height = pieces.reduce((sum, piece, k) => sum + piece.h + (k === 0 ? 0 : piece.gap), 0);
        const widest = Math.max(0, ...pieces.map((piece) => piece.w));
        if ((height <= maxH && widest <= colW + 1) || scale <= 0.45) return { pieces, height };
        scale *= 0.93;
      }
      const pieces = stack(scale, colW);
      return { pieces, height: pieces.reduce((sum, piece, k) => sum + piece.h + (k === 0 ? 0 : piece.gap), 0) };
    };
    const drawStack = (pieces: readonly Piece[], x: number, top: number): Layer[] => {
      const out: Layer[] = [];
      let y = top;
      pieces.forEach((piece, k) => {
        if (k > 0) y += piece.gap;
        out.push(...piece.draw(x, y));
        y += piece.h;
      });
      return out;
    };

    // ── The photograph ───────────────────────────────────────────────────

    // The look's corner radius, a little rounder at this size: 0 in Style gives square panels.
    const radius = Math.max(0, inputs.look.cornerRadius) * 1.7;
    const shadowPaint = colorFill('rgba(0,0,0,0.28)');
    const OFFSET = u * 0.038;
    /** An arch's feet: gently rounded, never more than a corner. */
    const feetOf = (box: Box): number => Math.min(radius, box.w * 0.12);
    /** The disc behind a frame: a little larger than it, set off to one side and down. */
    const discOf = (box: Box, side: 1 | -1): { d: number; x: number; y: number } => ({
      d: Math.max(box.w, Math.min(box.h, box.w * 1.25)) * 1.02,
      x: box.x + box.w / 2 - side * box.w * 0.16,
      y: box.y + box.h / 2 + box.h * 0.08,
    });
    const ringOf = (shape: Frame, box: Box): number => (shape === 'circle' ? box.w : Math.min(box.w, box.h)) * 1.17;
    /**
     * How far everything round a frame of w × h reaches past it on each side:
     * the backing, a tilted print's border and lean, a live photograph's
     * rings. The frame is sized so that all of it fits its side of the
     * cover — none of it may reach into the words.
     */
    const reach = (shape: Frame, w: number, h: number, side: 1 | -1): { l: number; r: number; t: number; b: number } => {
      let l = 0;
      let r = 0;
      let t = 0;
      let b = 0;
      const grow = (x0: number, y0: number, x1: number, y1: number): void => {
        l = Math.max(l, -w / 2 - x0);
        r = Math.max(r, x1 - w / 2);
        t = Math.max(t, -h / 2 - y0);
        b = Math.max(b, y1 - h / 2);
      };
      const box: Box = { x: -w / 2, y: -h / 2, w, h };
      switch (backing) {
        case 'block':
          grow(-w / 2 + side * OFFSET, -h / 2 + OFFSET, w / 2 + side * OFFSET, h / 2 + OFFSET);
          break;
        case 'disc': {
          const disc = discOf(box, side);
          grow(disc.x - disc.d / 2, disc.y - disc.d / 2, disc.x + disc.d / 2, disc.y + disc.d / 2);
          break;
        }
        case 'ring': {
          const d = ringOf(shape, box) + u * 0.03;
          grow(-d / 2, -d / 2, d / 2, d / 2);
          break;
        }
        case 'band':
          // Room either side for the band to show.
          if (shape !== 'bleed') grow(-w * 0.62, -h * 0.55, w * 0.62, h * 0.55);
          break;
        case 'none':
          break;
      }
      if (shape === 'tilt') {
        const border = u * 0.018;
        const lean = h * 0.065;
        grow(-w / 2 - border - lean, -h / 2 - border - u * 0.02, w / 2 + border + lean, h / 2 + border * 4 + lean * 0.4);
      }
      if (kind === 'live') grow(-w * 0.64, -h * 0.64, w * 0.64, h * 0.64);
      return { l, r, t, b };
    };
    /** A photograph sized to an exact box, cropped to fill it. */
    const fitted = (ph: FilledSlot, w: number, h: number): ImageProps => ({ ...photoProps(ph, Math.max(w, h)), w, h, fit: 'cover' });
    /** The photograph easing in from slightly closer, then pushing in slowly for the rest of the scene. */
    const pushIn = (at: number): Tracks => ({
      scaleX: [kf(at, 1.16), kf(at + 1100, 1, 'outCubic'), kf(durationMs, 1.06, 'inOutSine')],
      scaleY: [kf(at, 1.16), kf(at + 1100, 1, 'outCubic'), kf(durationMs, 1.06, 'inOutSine')],
    });
    /** Slides a frame in from `from` with a soft overshoot. Translation only: the photograph inside is draggable (D-085). */
    const slideIn = (cx: number, cy: number, from: { dx: number; dy: number }, at: number): Tracks => ({
      x: [kf(at, cx + from.dx), kf(at + 950, cx, SOFT)],
      y: [kf(at, cy + from.dy), kf(at + 950, cy, SOFT)],
      opacity: [kf(at, 0), kf(at + 320, 1)],
    });

    /** The photograph in its frame: a fixed window that slides in, the picture easing inside it. */
    const framed = (ph: FilledSlot, shape: Frame, box: Box, from: { dx: number; dy: number }, at: number, shadowed = true): Layer[] => {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const move = slideIn(cx, cy, from, at);
      /*
       * The frame is the photograph (D-159): it carries the photo slot, so a
       * drag moves the framed photograph — not the picture inside its window —
       * and front and back mean something. The picture inside is untagged.
       */
      const photoSlot = { kind: 'photo' as const, index: ph.slotIndex };
      const photoKey = `photo:${ph.slotIndex}`;
      const image = (w: number, h: number, y = 0): Layer => {
        const { slot: _slot, ...props } = fitted(ph, w, h);
        return { id: ctx.id('photo'), type: 'image', startMs: 0, endMs: durationMs, tracks: { x: [kf(0, 0)], y: [kf(0, y)], ...pushIn(at) }, props };
      };
      // A soft shadow under the frame: a shape of the same outline in the ground colour, hidden by the photograph but for its shadow.
      const shadow = (r: number, ellipse = false): Layer[] => (shadowed ? [{
        id: ctx.id('frameShadow'), type: 'shape', startMs: 0, endMs: durationMs, tracks: move, follows: photoKey,
        props: { shape: ellipse ? 'ellipse' : 'rect', w: box.w, h: box.h, cornerRadius: r, fill: roleFill('bg'), shadow: { blur: u * 0.06, offsetX: 0, offsetY: u * 0.025, paint: shadowPaint } },
      }] : []);
      switch (shape) {
        case 'circle':
          return [...shadow(box.w / 2, true), { id: ctx.id('frame'), type: 'mask', startMs: 0, endMs: durationMs, tracks: move, props: { shape: 'ellipse', w: box.w, h: box.h, slot: photoSlot }, children: [image(box.w, box.h)] }];
        case 'arch': {
          // A round top and gently rounded feet: a tall window clipped by a short one.
          const feet = feetOf(box);
          return [
            ...shadow(Math.min(box.w / 2, box.h / 2)),
            {
              id: ctx.id('frame'), type: 'mask', startMs: 0, endMs: durationMs, tracks: move,
              props: { shape: 'rect', w: box.w, h: box.h, cornerRadius: feet, slot: photoSlot },
              children: [{
                id: ctx.id('archTop'), type: 'mask', startMs: 0, endMs: durationMs, tracks: { x: [kf(0, 0)], y: [kf(0, box.w / 2)] },
                props: { shape: 'rect', w: box.w, h: box.h + box.w, cornerRadius: box.w / 2 },
                children: [image(box.w, box.h, -box.w / 2)],
              }],
            },
          ];
        }
        case 'tilt': {
          // A print with a white border, dropped at an angle; anchored at the photograph's centre so both turn together.
          const border = u * 0.018;
          const cardW = box.w + border * 2;
          const cardH = box.h + border * 5;
          const tilt = sampled(0, durationMs, 80, (ms) => {
            const enter = easeOutBack((ms - at) / 900);
            const settle = clamp01((ms - at - 900) / 900);
            return { x: cx + (1 - clamp01((ms - at) / 700)) * from.dx, y: cy + (1 - clamp01((ms - at) / 700)) * from.dy + Math.sin(ms / 1400) * u * 0.006 * settle, rotation: -11 + enter * 7.5 + Math.sin(ms / 2100) * 0.6 * settle, opacity: clamp01((ms - at) / 300) };
          });
          return [
            { id: ctx.id('print'), type: 'shape', startMs: 0, endMs: durationMs, anchorX: 0.5, anchorY: (border + box.h / 2) / cardH, tracks: tilt, follows: photoKey, props: { shape: 'rect', w: cardW, h: cardH, cornerRadius: u * 0.006, fill: roleFill('surface'), shadow: { blur: u * 0.05, offsetX: 0, offsetY: u * 0.02, paint: shadowPaint } } },
            { id: ctx.id('photo'), type: 'image', startMs: 0, endMs: durationMs, tracks: tilt, props: fitted(ph, box.w, box.h) },
          ];
        }
        case 'bleed':
          return [{ id: ctx.id('frame'), type: 'mask', startMs: 0, endMs: durationMs, tracks: move, props: { shape: 'rect', w: box.w, h: box.h, slot: photoSlot }, children: [image(box.w, box.h)] }];
        case 'rounded':
          return [...shadow(radius), { id: ctx.id('frame'), type: 'mask', startMs: 0, endMs: durationMs, tracks: move, props: { shape: 'rect', w: box.w, h: box.h, cornerRadius: radius, slot: photoSlot }, children: [image(box.w, box.h)] }];
      }
    };

    /** The accent shape behind the photograph, and the dots beside it. */
    const behind = (shape: Frame, box: Box, stage: Box, side: 1 | -1): Layer[] => {
      const out: Layer[] = [];
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const off = OFFSET;
      switch (backing) {
        case 'block': {
          // The same size as the frame, set off down and to one side; it wipes in, then rests and drifts.
          const bx = box.x + side * off;
          const pinX = side > 0 ? bx : bx + box.w;
          const tracks: Tracks = { ...bob(pinX, cy + off, u * 0.006, 4200, 0, AT.settled), scaleX: [kf(AT.backing, 0.001), kf(AT.backing + 700, 1, 'outExpo')] };
          if (shape === 'arch') {
            // An arch of colour behind an arch, made the same way: a tall window clipped by a short one, filled.
            out.push({
              id: ctx.id('block'), type: 'mask', startMs: 0, endMs: durationMs, anchorX: side > 0 ? 0 : 1, tracks,
              props: { shape: 'rect', w: box.w, h: box.h, cornerRadius: feetOf(box), slot: BACKING },
              children: [{
                id: ctx.id('blockTop'), type: 'mask', startMs: 0, endMs: durationMs, tracks: { x: [kf(0, (side * box.w) / 2)], y: [kf(0, box.w / 2)] },
                props: { shape: 'rect', w: box.w, h: box.h + box.w, cornerRadius: box.w / 2 },
                children: [rect(ctx, 'blockFill', { w: box.w, h: box.h + box.w, x: 0, y: 0, fill: roleFill('accent') })],
              }],
            });
            break;
          }
          out.push(rect(ctx, 'block', { w: box.w, h: box.h, x: pinX, y: cy + off, anchorX: side > 0 ? 0 : 1, radius: shape === 'circle' ? box.w / 2 : radius, fill: roleFill('accent'), tracks, slot: BACKING }));
          break;
        }
        case 'disc': {
          const disc = discOf(box, side);
          out.push(rect(ctx, 'disc', { w: disc.d, h: disc.d, x: disc.x, y: disc.y, ellipse: true, fill: roleFill('accent'), tracks: { ...bob(disc.x, disc.y, u * 0.007, 4600, 1, AT.settled), ...pop(AT.backing + 40, 700) }, slot: BACKING }));
          break;
        }
        case 'ring': {
          const d = ringOf(shape, box);
          const stroke = Math.max(3, u * 0.007);
          const ring = rect(ctx, 'ring', { w: d, h: d, x: cx, y: cy, ellipse: true, fill: CLEAR, stroke: { paint: roleFill('accent'), width: stroke }, tracks: { ...pop(AT.photo + 350, 650, 0.7), opacity: [kf(AT.photo + 350, 0), kf(AT.photo + 600, 1)] } });
          // A bead travelling round the ring: the slow tick of a held scene.
          out.push(part(ctx, 'ringPart', BACKING, { x: cx, y: cy }, [ring, rect(ctx, 'bead', {
            w: stroke * 3.4, h: stroke * 3.4, x: cx, y: cy, ellipse: true, fill: roleFill('accent'),
            tracks: sampled(0, durationMs, 60, (ms) => {
              const a = -Math.PI * 0.75 + (ms / 9000) * Math.PI * 2;
              return { x: cx + Math.cos(a) * d / 2, y: cy + Math.sin(a) * d / 2, scale: clamp01((ms - AT.photo - 700) / 300) };
            }),
          })]));
          break;
        }
        case 'band': {
          if (shape === 'bleed') {
            // Along the photograph's inner edge, a bar of accent drawn down it.
            const vertical = box.h >= box.w * 0.6 && split;
            out.push(rect(ctx, 'edge', {
              slot: BACKING,
              w: vertical ? u * 0.024 : box.w, h: vertical ? box.h : u * 0.024, x: vertical ? box.x : box.x, y: vertical ? box.y : box.y + box.h, anchorX: vertical ? 1 : 0, anchorY: vertical ? 0 : 0, fill: roleFill('accent'),
              tracks: vertical ? { scaleY: [kf(AT.backing + 200, 0.001), kf(AT.backing + 1000, 1, 'outExpo')] } : { scaleX: [kf(AT.backing + 200, 0.001), kf(AT.backing + 1000, 1, 'outExpo')] },
            }));
            break;
          }
          // A diagonal band across the photograph's side of the frame, kept to it.
          const angle = -24;
          const length = Math.hypot(stage.w, stage.h) * 1.3;
          out.push({
            id: ctx.id('bandWindow'), type: 'mask', startMs: 0, endMs: durationMs,
            tracks: { x: [kf(0, stage.x + stage.w / 2)], y: [kf(0, stage.y + stage.h / 2)] },
            props: { shape: 'rect', w: stage.w, h: stage.h },
            // The band is the part, not its window, so only the band itself is picked; it stays inside the window when moved.
            children: [rect(ctx, 'band', { w: length, h: Math.min(box.w, box.h) * 0.42, x: cx - (stage.x + stage.w / 2), y: cy - (stage.y + stage.h / 2) + box.h * 0.06, fill: roleFill('accent'), tracks: { rotation: [kf(0, angle)], scaleX: [kf(AT.backing, 0.001), kf(AT.backing + 800, 1, 'outExpo')] }, slot: BACKING })],
          });
          break;
        }
        case 'none':
          break;
      }
      // The dots go to the corner the backing leaves free; accent on accent would not show.
      if (dotted) out.push(...dotGrid(box, backing === 'disc' ? (side > 0 ? -1 : 1) : side, stage));
      return out;
    };

    /** A small grid of dots at the frame's corner, away from the backing. */
    const dotGrid = (box: Box, side: 1 | -1, stage: Box): Layer[] => {
      const cols = 5;
      const rows = 4;
      const pitch = u * 0.03;
      const d = u * 0.011;
      const gw = (cols - 1) * pitch;
      const gh = (rows - 1) * pitch;
      // Opposite the backing: top-left of the frame when the backing sits right, top-right when left.
      const left = side > 0 ? Math.max(stage.x - u * 0.01, box.x - gw * 0.55) : Math.min(stage.x + stage.w - gw + u * 0.01, box.x + box.w - gw * 0.45);
      const top = Math.max(my * 0.6, box.y - gh * 0.5);
      const out: Layer[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = left + c * pitch;
          const y = top + r * pitch;
          const t = AT.backing + 200 + (r + c) * 45;
          out.push(rect(ctx, 'dot', { w: d, h: d, x, y, ellipse: true, fill: roleFill('accent'), tracks: bob(x, y, u * 0.004, 3600, (r + c) * 0.5, t + 500, (ms) => ({ scale: easeOutBack((ms - t) / 380) })) }));
        }
      }
      // Twenty dots, one part (D-159).
      return [part(ctx, 'dots', shapeSlot('dots', 'Dots'), { x: left + gw / 2, y: top + gh / 2 }, out)];
    };

    /** The NEW sticker on a launch: stamped onto the photograph's corner, breathing gently. */
    const stickerOn = (box: Box, side: 1 | -1): Layer[] => {
      if (!shown(sticker)) return [];
      const d = u * 0.15;
      const sx = side > 0 ? box.x + d * 0.18 : box.x + box.w - d * 0.18;
      const sy = box.y + d * 0.2;
      const at = 950;
      const size = d * 0.26;
      const breathe = (ms: number): number => (ms < at + 600 ? easeOutBack((ms - at) / 420) * 0.6 + 0.4 * clamp01((ms - at) / 420) : 1 + Math.sin((ms - at - 600) / 700) * 0.035);
      return [
        rect(ctx, 'sticker', { w: d, h: d, x: sx, y: sy, ellipse: true, fill: roleFill('accent'), stroke: { paint: roleFill('onAccent', 0.85), width: Math.max(2, u * 0.004) }, tracks: { ...sampled(0, durationMs, 70, (ms) => ({ x: sx, y: sy, scale: ms < at ? 0 : breathe(ms), rotation: -12 })) }, slot: shapeSlot('sticker', 'Sticker'), follows: `text:${sticker.id}` }),
        place(sticker, { sizePx: size, maxWidthPx: d * 0.9, x: sx, y: capTop(sy, size), anchorX: 0.5, fill: roleFill('onAccent'), tracks: { rotation: [kf(0, -12)] }, reveal: { kind: 'kinetic', unit: 'word', motion: 'pop', startMs: at + 220, durationMs: 360, staggerMs: 0 } }),
      ];
    };

    /** A little card of rising bars over the photograph's corner: the quarter, at a glance. */
    const chartCard = (box: Box, stage: Box, side: 1 | -1): Layer[] => {
      const w = u * 0.24;
      const h = u * 0.15;
      const cx = Math.max(stage.x + w / 2, side > 0 ? box.x + w * 0.2 : box.x + box.w - w * 0.2);
      const cy = Math.min(design.h - u * 0.02 - h / 2, box.y + box.h - h * 0.35);
      const at = 900;
      const float = (dx: number, dy: number, extra?: (ms: number) => { scale?: number; scaleY?: number }): Tracks => sampled(0, durationMs, 90, (ms) => {
        const enter = 1 - easeOutBack((ms - at) / 700);
        return { x: cx + dx, y: cy + dy + enter * u * 0.05 + Math.sin(ms / 1500) * u * 0.005 * clamp01((ms - at - 700) / 600), opacity: clamp01((ms - at) / 250), ...extra?.(ms) };
      });
      const out: Layer[] = [{ id: ctx.id('chartCard'), type: 'shape', startMs: 0, endMs: durationMs, tracks: float(0, 0), props: { shape: 'rect', w, h, cornerRadius: u * 0.02, fill: roleFill('surface'), shadow: { blur: u * 0.04, offsetX: 0, offsetY: u * 0.014, paint: shadowPaint } } }];
      const heights = [0.38, 0.56, 0.48, 0.82];
      const barW = w * 0.12;
      const baseY = h * 0.32;
      heights.forEach((share, i) => {
        const bh = h * 0.62 * share;
        const dx = -w * 0.3 + i * w * 0.2;
        out.push({ id: ctx.id('chartBar'), type: 'shape', startMs: 0, endMs: durationMs, anchorY: 1, tracks: float(dx, baseY, (ms) => ({ scaleY: Math.max(0.001, easeOutBack((ms - at - 250 - i * 110) / 500)) })), props: { shape: 'rect', w: barW, h: bh, cornerRadius: barW * 0.25, fill: roleFill('accent', i === heights.length - 1 ? 1 : 0.35 + i * 0.15) } });
      });
      // The card and its bars, one part; its colour is the bars' (D-159).
      return [part(ctx, 'chart', shapeSlot('chart', 'Chart card'), { x: cx, y: cy }, out)];
    };

    /** Confetti and sparkles round the photograph for a milestone, falling slowly for as long as the scene lasts. */
    const confetti = (stage: Box): Layer[] => {
      const out: Layer[] = [];
      const fills: Paint[] = [roleFill('accent'), roleFill('ink', 0.75), roleFill('surface'), roleFill('accent', 0.6)];
      for (let i = 0; i < 18; i++) {
        const hx = hash(i, 1);
        const x0 = stage.x + hx * stage.w;
        const speed = stage.h / (5200 + hash(i, 2) * 3000);
        const start = hash(i, 3) * stage.h;
        const spin = (hash(i, 4) - 0.5) * 0.4;
        const w = u * (0.01 + hash(i, 5) * 0.006);
        out.push({
          id: ctx.id('confetti'), type: 'shape', startMs: 0, endMs: durationMs,
          tracks: sampled(0, durationMs, 70, (ms) => {
            const fall = (start + ms * speed) % stage.h;
            return { x: x0 + Math.sin(ms / 700 + i) * u * 0.012, y: stage.y + fall, rotation: ms * spin, opacity: clamp01((ms - 500 - i * 40) / 300) * clamp01((stage.h - fall) / (stage.h * 0.15)) * clamp01(fall / (stage.h * 0.08)) };
          }, stage.h * 0.5),
          props: { shape: 'rect', w, h: w * 1.9, cornerRadius: w * 0.2, fill: fills[i % fills.length] ?? roleFill('accent') },
        });
      }
      // Listed in Style, never picked on the picture: it is everywhere (D-159, D-120).
      return [part(ctx, 'confetti', shapeSlot('confetti', 'Confetti', { pick: false }), { x: stage.x + stage.w / 2, y: stage.y + stage.h / 2 }, out)];
    };

    /** Rings that spread from the photograph while it is live. */
    const pulses = (box: Box, photoKey: string): Layer[] => {
      const out: Layer[] = [];
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      for (let i = 0; i < 3; i++) {
        out.push(rect(ctx, 'pulse', {
          w: box.w, h: box.h, x: cx, y: cy, ellipse: true, fill: CLEAR, stroke: { paint: roleFill('accent', 0.8), width: Math.max(2, u * 0.004) },
          tracks: sampled(0, durationMs, 60, (ms) => {
            const local = ms - AT.settled - i * 700;
            const u2 = local < 0 ? 0 : (local % 2100) / 2100;
            return { x: cx, y: cy, scale: 1 + u2 * 0.28, opacity: local < 0 ? 0 : (1 - u2) * 0.9 };
          }),
        }));
      }
      // They spread from the photograph, so they go where it goes; never picked, or they would hide it (D-159).
      return [part(ctx, 'pulses', shapeSlot('pulses', 'Rings round the photo', { pick: false }), { x: cx, y: cy }, out, { follows: photoKey })];
    };

    // ── Composition ──────────────────────────────────────────────────────

    const layers: Layer[] = [backgroundLayer(inputs, ctx)];

    if (kind === 'versus') {
      composeVersus();
    } else if (split) {
      const share = square ? 0.56 : design.w / design.h > 1.5 ? 0.53 : 0.55;
      const splitX = design.w * share;
      const colW = splitX - mx - u * 0.03;
      const footH = footHeight(colW);
      wordLayers.push(...brandRow(colW));
      wordLayers.push(...footerRow(mx, colW));
      const top = my + brandH + (brandH > 0 ? u * 0.06 : 0);
      const bottom = floor - footH - (footH > 0 ? u * 0.05 : 0);
      const { pieces, height } = fitStack(colW, bottom - top);
      wordLayers.push(...drawStack(pieces, mx, top + Math.max(0, (bottom - top - height) * 0.45)));
      const stage: Box = frame === 'bleed'
        ? { x: splitX + u * 0.02, y: 0, w: design.w - splitX - u * 0.02, h: design.h }
        : { x: splitX + u * 0.02, y: my, w: design.w - mx - splitX - u * 0.02, h: design.h - my * 2 };
      composePhoto(stage, { dx: u * 0.07, dy: 0 });
    } else {
      const colW = design.w - mx * 2;
      const footH = footHeight(colW);
      wordLayers.push(...brandRow(colW * 0.75));
      wordLayers.push(...footerRow(mx, colW));
      const top = my + brandH + (brandH > 0 ? u * 0.05 : 0);
      const bottom = floor - footH - (footH > 0 ? u * 0.05 : 0);
      // The words take what they need, up to a little over half; the photograph has the rest.
      const { pieces, height } = fitStack(colW, (bottom - top) * 0.56);
      // The photograph above, the words below it: read top to bottom, as a feed shows a post.
      const gap = u * 0.06;
      const textTop = bottom - height;
      wordLayers.push(...drawStack(pieces, mx, textTop));
      const stage: Box = frame === 'bleed'
        ? { x: 0, y: top, w: design.w, h: textTop - gap - top }
        : { x: mx, y: top, w: colW, h: textTop - gap - top };
      composePhoto(stage, { dx: 0, dy: u * 0.06 });
    }

    // What sits on the photograph draws after the words, so that with "Fill frame" (D-115) — the photograph
    // moved behind the first of the words — the sticker, the chart and the confetti stay in front of it.
    layers.push(...backLayers, ...photoLayers, ...wordLayers, ...frontLayers);
    return layers;

    // ── The photograph's side, by kind ───────────────────────────────────

    function composePhoto(stage: Box, from: { dx: number; dy: number }): void {
      const [main, other] = photos;
      if (!main) return;
      if (kind === 'podcast') {
        // Host and guest: a large circle and a smaller one overlapping it, each set in the ground.
        const d1 = Math.min(stage.w * (split ? 0.8 : 0.62), stage.h * 0.8);
        const d2 = d1 * 0.58;
        const c1 = { x: stage.x + stage.w - d1 / 2 - (split ? stage.w * 0.02 : stage.w * 0.06), y: stage.y + stage.h * 0.46 - (split ? 0 : d2 * 0.12) };
        const c2 = { x: Math.max(stage.x + d2 / 2, c1.x - d1 * 0.62), y: Math.min(stage.y + stage.h - d2 / 2, c1.y + d1 * 0.36) };
        const host: Box = { x: c1.x - d1 / 2, y: c1.y - d1 / 2, w: d1, h: d1 };
        const guestBox: Box = { x: c2.x - d2 / 2, y: c2.y - d2 / 2, w: d2, h: d2 };
        backLayers.push(...behind('circle', host, stage, -1));
        photoLayers.push(...framed(main, 'circle', host, from, AT.photo));
        if (other) {
          const rim = u * 0.014;
          photoLayers.push(rect(ctx, 'guestRim', { w: d2 + rim * 2, h: d2 + rim * 2, x: c2.x, y: c2.y, ellipse: true, fill: roleFill('bg'), tracks: slideIn(c2.x, c2.y, { dx: -from.dx, dy: from.dy }, AT.photo + 260), follows: `photo:${other.slotIndex}` }));
          photoLayers.push(...framed(other, 'circle', guestBox, { dx: -from.dx, dy: from.dy }, AT.photo + 260, false));
        }
        return;
      }
      // Which way the backing is set off: right on a landscape cover, left on a portrait one.
      const side: 1 | -1 = split || frame === 'bleed' ? 1 : -1;
      const box = frameIn(stage, side);
      backLayers.push(...behind(frame, box, stage, side));
      photoLayers.push(...framed(main, frame, box, from, AT.photo));
      // The sticker takes the corner nearest the words, where it reads with them.
      if (kind === 'launch') frontLayers.push(...stickerOn(box, split ? 1 : -1));
      if (kind === 'report') frontLayers.push(...chartCard(box, stage, -1));
      if (kind === 'milestone') frontLayers.push(...confetti(split ? { x: stage.x - u * 0.02, y: 0, w: design.w - stage.x, h: design.h } : { x: 0, y: 0, w: design.w, h: stage.y + stage.h }));
      if (kind === 'live') backLayers.push(...pulses(box, `photo:${main.slotIndex}`));
      if (kind === 'vlog') frontLayers.push(...tape(box, `photo:${main.slotIndex}`));
    }

    /**
     * The frame for the photograph: as large as its side of the cover allows
     * with everything round it (`reach`) inside that side too, and centred
     * there with it.
     */
    function frameIn(stage: Box, side: 1 | -1): Box {
      if (frame === 'bleed') return stage;
      const aspect = frame === 'circle'
        ? 1
        : split
          ? (frame === 'arch' ? 0.76 : square ? 0.82 : 0.86)
          : Math.max(frame === 'arch' ? 0.72 : 0.9, Math.min(frame === 'arch' ? 0.82 : 1.5, stage.w / Math.max(1, stage.h)));
      let w = Math.min(stage.w, stage.h * aspect);
      // Everything round the frame grows with it, bar a fixed offset or two: a few passes settle it.
      for (let pass = 0; pass < 4; pass++) {
        const e = reach(frame, w, w / aspect, side);
        w *= Math.min(stage.w / (w + e.l + e.r), stage.h / (w / aspect + e.t + e.b));
      }
      const h = w / aspect;
      const e = reach(frame, w, h, side);
      // Above left-aligned words, a narrower photograph sits to the right: the eye runs from it down to the headline.
      const slack = stage.w - (w + e.l + e.r);
      return {
        x: stage.x + (split ? slack / 2 : slack * 0.85) + e.l,
        y: stage.y + (stage.h - (h + e.t + e.b)) / 2 + e.t,
        w,
        h,
      };
    }

    /** Two strips of tape holding the print down. */
    function tape(box: Box, photoKey: string): Layer[] {
      const w = Math.min(u * 0.16, box.w * 0.35);
      const h = u * 0.042;
      const strips = [-1, 1].map((s) => rect(ctx, 'tape', {
        w, h, x: box.x + box.w / 2 + s * box.w * 0.3, y: box.y - u * 0.004, fill: roleFill('surface', 0.72), radius: u * 0.003,
        tracks: { rotation: [kf(0, s * 14 - 4)], opacity: [kf(900, 0), kf(1150, 1)], scaleX: [kf(900, 1.3), kf(1150, 1, 'outCubic')] },
      }));
      // The tape holds the print down, so it goes where the print goes (D-159).
      return [part(ctx, 'tape', shapeSlot('tape', 'Tape', { tint: 'surface' }), { x: box.x + box.w / 2, y: box.y }, strips, { follows: photoKey })];
    }

    /** This vs That: two photographs face to face, VS between them, the question above. */
    function composeVersus(): void {
      const [a, b] = photos;
      const colW = design.w - mx * 2;
      const footH = footHeight(colW * 0.6);
      wordLayers.push(...brandRow(colW * 0.6));
      wordLayers.push(...footerRow(mx, colW * 0.6));
      const top = my + brandH + (brandH > 0 ? u * 0.045 : 0);
      const { pieces, height } = fitStack(split ? colW * 0.8 : colW, (floor - top) * 0.3);
      wordLayers.push(...drawStack(pieces, split ? mx + colW * 0.1 : mx, top));
      const areaTop = top + height + u * 0.05;
      const areaBottom = floor - footH - (footH > 0 ? u * 0.04 : 0);
      const gap = u * 0.035;
      const area: Box = { x: mx, y: areaTop, w: colW, h: Math.max(u * 0.3, areaBottom - areaTop) };
      const boxes: Box[] = split
        ? [{ x: area.x, y: area.y, w: (area.w - gap) / 2, h: area.h }, { x: area.x + (area.w + gap) / 2, y: area.y, w: (area.w - gap) / 2, h: area.h }]
        : [{ x: area.x, y: area.y, w: area.w, h: (area.h - gap) / 2 }, { x: area.x, y: area.y + (area.h + gap) / 2, w: area.w, h: (area.h - gap) / 2 }];
      const names = [first, second];
      [a, b].forEach((ph, i) => {
        const box = boxes[i];
        if (!ph || !box) return;
        const away = i === 0 ? -1 : 1;
        photoLayers.push(...framed(ph, 'rounded', box, split ? { dx: away * u * 0.08, dy: 0 } : { dx: 0, dy: away * u * 0.06 }, AT.photo + i * 120));
        const slot = names[i];
        if (!slot || !shown(slot)) return;
        const size = u * 0.03;
        const m = measure(slot, size, box.w * 0.7);
        const padX = size * 0.9;
        const h = size * 2.3;
        const w = m.width + padX * 2;
        const lx = box.x + u * 0.025;
        const ly = box.y + box.h - u * 0.025 - h;
        const t = 1000 + i * 120;
        frontLayers.push(rect(ctx, 'optionPill', { w, h, x: lx + w / 2, y: ly + h / 2, radius: h / 2, fill: roleFill('surface'), tracks: pop(t, 380), slot: shapeSlot(`option${i + 1}`, `${i === 0 ? 'First' : 'Second'} option's pill`, { tint: 'surface' }), follows: `text:${slot.id}` }));
        frontLayers.push(place(slot, { sizePx: size, maxWidthPx: m.width + 2, x: lx + padX, y: capTop(ly + h / 2, size), anchorX: 0, reveal: FADE(t + 150) }));
      });
      // VS, stamped where the two meet.
      const d = u * (split ? 0.16 : 0.14);
      const vx = split ? area.x + area.w / 2 : area.x + area.w / 2;
      const vy = split ? area.y + area.h / 2 : area.y + area.h / 2;
      const at = 800;
      frontLayers.push(part(ctx, 'vs', shapeSlot('vs', 'VS badge', { text: { slot: vs.id } }), { x: vx, y: vy }, [
        rect(ctx, 'vsRim', { w: d + u * 0.024, h: d + u * 0.024, x: vx, y: vy, ellipse: true, fill: roleFill('bg'), tracks: pop(at, 480) }),
        rect(ctx, 'vsDisc', {
          w: d, h: d, x: vx, y: vy, ellipse: true, fill: roleFill('accent'),
          tracks: sampled(0, durationMs, 70, (ms) => ({ x: vx, y: vy, scale: ms < at ? 0 : ms < at + 600 ? easeOutBack((ms - at) / 480) : 1 + Math.sin((ms - at - 600) / 600) * 0.03 })),
        }),
        ...glyph(vs, said(vs), d * 0.4, vx, vy, roleFill('onAccent'), { at: at + 200, width: d, fit: d * 0.8 }),
      ]));
    }
  };

  return defineScene(variant, { textSlots: slots, build });
}

/** A repeatable number in [0, 1) for confetti: the same on every build (§3B). */
function hash(i: number, salt: number): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
