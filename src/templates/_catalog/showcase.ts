import type { FamilyId, SceneVariant } from '../catalog';

/**
 * Showcase scenes (D-119): photographs in motion — rings, coverflows,
 * tunnels, walls, grids, decks, heroes, cuts, collages and timelines.
 */

const variant = (family: FamilyId, category: string) => (
  id: string,
  name: string,
  blurb: string,
  params: SceneVariant['params'],
  photos: SceneVariant['photos'] = { min: 3, max: 10, default: 6 },
  durationMs = 12_000,
): SceneVariant => ({ id, name, category, family, blurb, params, photos, durationMs, isNew: true });

const ring = variant('orbit', 'Ring Path');

const RINGS: readonly SceneVariant[] = [
  ring('ring-wide', 'Wide Ring', 'Photos travel a wide ring, passing in front of and behind each other.', { shape: 'ring', radius: 0.4, tilt: 0.3, headline: 'The collection' }),
  ring('ring-tight-focus', 'Tight Ring Focus', 'A tight ring that turns one step at a time onto the front photo.', { shape: 'ring', radius: 0.24, tilt: 0.4, snap: true, card: 0.4, headline: 'One at a time' }, { min: 3, max: 6, default: 4 }),
  ring('ring-snap-front', 'Snap-Front Ring', 'The ring turns and settles each photo at the front in turn.', { shape: 'ring', radius: 0.36, tilt: 0.32, snap: true, headline: 'Meet the range' }),
  ring('ring-tilted-parade', 'Tilted Ring Parade', 'Many photos parade round a steeply tilted ring.', { shape: 'ring', radius: 0.38, tilt: 0.55, card: 0.26, headline: 'Everything we make' }, { min: 6, max: 12, default: 10 }),
  ring('ring-soft-orbit', 'Soft Orbit', 'A calm, flat orbit with photos facing forward.', { shape: 'ring', radius: 0.38, tilt: 0.2, face: false, laps: 0.6, headline: 'Quietly beautiful' }),
  ring('ring-ferris-wheel', 'Ferris Wheel', 'Photos ride a big wheel, upright all the way round.', { shape: 'wheel', radius: 0.34, face: false, card: 0.26, headline: 'Round and round' }, { min: 4, max: 10, default: 8 }),
  ring('ring-low-wheel', 'Low Wheel', 'A wheel turning from below the frame, its top arc on show.', { shape: 'wheel', radius: 0.34, low: true, card: 0.28, headline: 'On a roll', textBelow: false }, { min: 4, max: 10, default: 8 }),
  ring('ring-infinity', 'Infinity Path', 'Photos travel a smooth figure of eight.', { shape: 'infinity', radius: 0.4, tilt: 0.45, headline: 'Endless ideas' }, { min: 4, max: 10, default: 8 }, 14_000),
  ring('ring-planet-moons', 'Planetary Moons', 'One lead photo at the centre, the rest orbiting it.', { shape: 'moons', radius: 0.36, tilt: 0.32, card: 0.36, headline: 'The flagship and friends' }, { min: 3, max: 9, default: 7 }, 14_000),
  ring('ring-dual-cross', 'Dual Ring Cross', 'Two tilted rings counter-rotate through each other.', { shape: 'dual', radius: 0.36, tilt: 0.3, card: 0.26, headline: 'Two worlds, one brand' }, { min: 6, max: 12, default: 10 }, 14_000),
  ring('ring-pendulum', 'Pendulum Swing', 'A fan of photos swings like a pendulum, beat by beat.', { shape: 'pendulum', laps: 1, card: 0.3, headline: 'Find your rhythm' }, { min: 3, max: 7, default: 5 }),
  ring('ring-halo-pulse', 'Halo Rings', 'Two rings of photos turn opposite ways and breathe.', { shape: 'halo', card: 0.26, headline: 'Our community' }, { min: 6, max: 12, default: 12 }),
  ring('ring-roulette', 'Roulette Stop', 'The ring spins fast, then eases onto the next photo.', { shape: 'roulette', radius: 0.36, tilt: 0.32, headline: 'And the winner is' }),
  ring('ring-crescent-arc', 'Crescent Arc', 'Photos travel a crescent, largest at its crown.', { shape: 'crescent', laps: 1, card: 0.34, headline: 'Rising stars' }, { min: 4, max: 10, default: 7 }),
  ring('ring-bloom', 'Bloom Into Ring', 'A stack blooms into a ring, turns, and gathers again.', { shape: 'bloom', radius: 0.36, tilt: 0.32, headline: 'It all opens up' }, { min: 4, max: 10, default: 8 }),
];

const flow = variant('flow', 'Flow Track');

const FLOWS: readonly SceneVariant[] = [
  flow('flow-coverflow', 'Coverflow Glide', 'The classic coverflow: side photos turned away, the centre one facing you, gliding.', { shape: 'coverflow', laps: 1, headline: 'Browse the range' }),
  flow('flow-coverflow-snap', 'Coverflow Snap', 'Coverflow that holds each photo at the centre, then moves on.', { shape: 'coverflow', snap: true, headline: 'One highlight at a time' }),
  flow('flow-soft-coverflow', 'Soft Coverflow', 'A gentler coverflow with shallow turns and wide spacing.', { shape: 'coverflow', tilt: 35, gap: 0.75, laps: 0.6, headline: 'Take your time' }),
  flow('flow-vertical-gallery', 'Vertical Tilt Gallery', 'A coverflow running top to bottom, tipping toward you.', { shape: 'vertical', snap: true, card: 0.38, headline: 'Scroll the story' }),
  flow('flow-diagonal-lane', 'Diagonal Lane', 'Photos travel a diagonal lane through the frame.', { shape: 'diagonal', laps: 1, headline: 'On the move' }),
  flow('flow-center-lock', 'Centre Lock Row', 'A row slides along, the centre photo locking large.', { shape: 'centerLock', snap: true, headline: 'Featured today' }),
  flow('flow-product-shelf', 'Perspective Shelf', 'A shelf of photos recedes into the distance, scrolling past.', { shape: 'shelf', laps: 1, card: 0.5, headline: 'Fresh on the shelf' }, { min: 4, max: 10, default: 8 }),
  flow('flow-conveyor', 'Conveyor', 'Photos ride a lane from far away right up to the lens.', { shape: 'conveyor', laps: 1, card: 0.5, headline: 'Coming your way' }, { min: 4, max: 10, default: 7 }),
  flow('flow-escalator', 'Escalator Rise', 'Photos ride a diagonal escalator up and out of frame.', { shape: 'escalator', laps: 1, card: 0.4, headline: 'Level up' }, { min: 4, max: 10, default: 7 }),
  flow('flow-sine-scroll', 'Sine Scroll', 'A marquee of photos riding a soft wave.', { shape: 'sine', laps: 1, card: 0.36, headline: 'Go with the flow' }, { min: 4, max: 10, default: 8 }),
  flow('flow-polaroid-pass', 'Polaroid Pass', 'Tilted prints drift past at their own depths.', { shape: 'polaroid', laps: 1, card: 0.4, headline: 'Moments worth keeping' }, { min: 4, max: 10, default: 7 }),
  flow('flow-stack-push', 'Stack Push', 'Each photo slides onto the pile like a new notification.', { shape: 'stackPush', card: 0.55, headline: 'What is new' }, { min: 3, max: 8, default: 6 }),
  flow('flow-zipper-lanes', 'Zipper Lanes', 'Two lanes of photos running opposite ways.', { shape: 'zipper', laps: 1, card: 0.38, headline: 'Both sides of the story' }, { min: 4, max: 12, default: 8 }),
  flow('flow-river', 'River Flow', 'Photos drift down a meandering river toward you.', { shape: 'river', laps: 1, card: 0.42, headline: 'Let it flow' }, { min: 4, max: 10, default: 7 }),
];

const depth = variant('depth', 'Depth Stage');

const DEPTHS: readonly SceneVariant[] = [
  depth('dp-flythrough', 'Flythrough Corridor', 'Photos line the walls of a corridor you fly through.', { shape: 'tunnel', laps: 1, headline: 'Step inside' }, { min: 6, max: 12, default: 12 }),
  depth('dp-receding-hall', 'Receding Hall', 'Photos rush toward you from a deep vanishing point.', { shape: 'hall', laps: 1, headline: 'Here it comes' }, { min: 5, max: 12, default: 10 }),
  depth('dp-warp-rush', 'Warp Rush', 'Photos streak past in a hyperspace rush toward the lens.', { shape: 'warp', laps: 1, headline: 'Full speed ahead' }, { min: 6, max: 12, default: 12 }, 10_000),
  depth('dp-helix', 'Helix Climb', 'Photos climb a spiral, turning to face you as they pass the front.', { shape: 'helix', laps: 1, radius: 0.34, headline: 'Ever upward' }, { min: 5, max: 12, default: 10 }),
  depth('dp-double-helix', 'Double Helix', 'Two strands of photos corkscrew together.', { shape: 'doubleHelix', laps: 1, radius: 0.3, card: 0.28, headline: 'In our DNA' }, { min: 6, max: 12, default: 12 }),
  depth('dp-cylinder-roll', 'Cylinder Roll', 'Photos wrap a cylinder that rolls toward you.', { shape: 'cylinder', laps: 1, radius: 0.34, headline: 'Keep it rolling' }, { min: 6, max: 12, default: 10 }),
  depth('dp-ribbon-wave', 'Ribbon Wave', 'A ribbon of photos rides a rolling wave.', { shape: 'wave', laps: 1, card: 0.3, headline: 'Ride the wave' }, { min: 5, max: 12, default: 9 }),
  depth('dp-dome-mosaic', 'Dome Mosaic', 'Photos mapped onto a turning sphere.', { shape: 'dome', laps: 1, radius: 0.36, card: 0.22, headline: 'Around the world' }, { min: 9, max: 12, default: 12 }, 14_000),
  depth('dp-floating-stack', 'Floating Stack', 'A loose stack of photos drifting in parallax.', { shape: 'floating', card: 0.36, headline: 'Layer by layer' }, { min: 4, max: 9, default: 6 }),
  depth('dp-depth-carousel', 'Depth Carousel', 'A carousel that pushes the front photo out toward you.', { shape: 'carousel', laps: 1, radius: 0.34, headline: 'Front and centre' }),
  depth('dp-vanishing-fan', 'Vanishing Fan', 'Photos fan out from a far point toward the camera, then gather.', { shape: 'fan', card: 0.38, headline: 'Open it up' }, { min: 4, max: 9, default: 7 }),
  depth('dp-accordion-fold', 'Accordion Fold', 'Photos side by side, folding open and shut like an accordion.', { shape: 'accordion', laps: 1, card: 0.3, headline: 'Unfolding now' }, { min: 4, max: 8, default: 6 }),
];

export const SHOWCASE_SCENES: readonly SceneVariant[] = [
  ...RINGS,
  ...FLOWS,
  ...DEPTHS,
];
