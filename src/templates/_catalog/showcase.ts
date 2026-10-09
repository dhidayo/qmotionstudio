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

const lanes = variant('marquee', 'Flow Track');

const MARQUEES: readonly SceneVariant[] = [
  lanes('mq-endless-ticker', 'Endless Ticker', 'A single row of photos that never stops scrolling.', { shape: 'ticker', loops: 1, headline: 'Always something new' }, { min: 3, max: 10, default: 6 }),
  lanes('mq-tilted-rows', 'Tilted Marquee Rows', 'Tilted rows of photos running opposite ways, edge to edge.', { shape: 'tilted', lanes: 3, angle: -12, loops: 1, headline: 'Made with love' }, { min: 4, max: 12, default: 8 }),
  lanes('mq-offset-mosaic', 'Offset Mosaic Scroll', 'Rows of photos offset like brickwork, scrolling at different speeds.', { shape: 'mosaic', lanes: 3, loops: 1, headline: 'Our portfolio' }, { min: 4, max: 12, default: 9 }),
  lanes('mq-drift-columns', 'Drift Columns', 'Columns of photos drifting upward at their own pace.', { shape: 'columns', lanes: 3, loops: 1, headline: 'In full colour' }, { min: 4, max: 12, default: 9 }),
  lanes('mq-photo-wall', 'Photo Wall', 'Four columns of photos scrolling in opposite directions.', { shape: 'wall', lanes: 4, loops: 1, headline: 'The wall of fame' }, { min: 6, max: 12, default: 12 }),
  lanes('mq-rising-pillar', 'Rising Pillar', 'A single column of photos rising in a loop.', { shape: 'pillar', loops: 1, headline: 'Rise up' }, { min: 3, max: 8, default: 6 }),
  lanes('mq-film-strip', 'Film Strip', 'Photos framed on a film strip with sprocket holes, rolling past.', { shape: 'filmstrip', loops: 1, headline: 'Behind the scenes' }, { min: 3, max: 10, default: 7 }),
];

const tiles = variant('tiles', 'Tile Field');

const TILES: readonly SceneVariant[] = [
  tiles('tile-stagger', 'Staggered Lattice', 'Photos pop into a lattice one after another, then fall away and return.', { shape: 'stagger', headline: 'Our work' }, { min: 4, max: 12, default: 9 }, 10_000),
  tiles('tile-pulse', 'Pulse Lattice', 'A wave of light pulses across a lattice of photos.', { shape: 'pulse', headline: 'Alive with ideas' }, { min: 4, max: 12, default: 9 }, 10_000),
  tiles('tile-flip-wave', 'Flip Wave', 'Tiles turn over in a wave to show the next photos.', { shape: 'flipWave', beats: 3, headline: 'Turn the page' }, { min: 4, max: 12, default: 9 }, 10_000),
  tiles('tile-spotlight', 'Lattice Spotlight', 'One tile at a time zooms to the centre, then returns.', { shape: 'spotlight', beats: 6, headline: 'In the spotlight' }, { min: 4, max: 9, default: 6 }),
  tiles('tile-checker', 'Checker Flip', 'Four big tiles flip in a checkerboard to the next photos.', { shape: 'checker', beats: 3, fill: 0.96, headline: 'Two sides' }, { min: 4, max: 8, default: 8 }, 10_000),
  tiles('tile-domino', 'Domino Wave', 'Tiles tip back like dominoes, one after another, and stand again.', { shape: 'domino', beats: 3, headline: 'One thing leads to another' }, { min: 4, max: 12, default: 8 }, 10_000),
  tiles('tile-spiral', 'Spiral Unlock', 'The lattice unlocks from the centre outward, then closes again.', { shape: 'spiral', headline: 'Unlock more' }, { min: 4, max: 12, default: 9 }, 10_000),
  tiles('tile-column-fall', 'Column Fall', 'Columns of photos slide down and restack with each beat.', { shape: 'columnFall', beats: 4, headline: 'Fresh every week' }, { min: 3, max: 12, default: 6 }, 10_000),
  tiles('tile-slot-reels', 'Slot Reels', 'Reels spin and settle like a slot machine, column by column.', { shape: 'reels', beats: 3, headline: 'Spin to win' }, { min: 3, max: 9, default: 3 }, 10_000),
  tiles('tile-masonry', 'Masonry Rise', 'Brickwork columns of photos rise and settle at their own pace.', { shape: 'masonry', headline: 'Built with care' }, { min: 4, max: 12, default: 9 }),
  tiles('tile-radar', 'Radar Sweep', 'A radar arm sweeps the lattice, lighting each photo it passes.', { shape: 'radar', headline: 'Always scanning' }, { min: 6, max: 12, default: 9 }),
  tiles('tile-honeycomb', 'Honeycomb Pulse', 'A honeycomb of photos with a pulse travelling across it.', { shape: 'honeycomb', headline: 'Better together' }, { min: 6, max: 12, default: 10 }),
];

const deck = variant('deck', 'Deck Motion');

const DECKS: readonly SceneVariant[] = [
  deck('deck-cascade', 'Deck Cascade', 'The deck cascades into a fanned staircase, then gathers.', { shape: 'cascade', headline: 'Pick a card' }),
  deck('deck-spring', 'Spring Deck', 'Photos spring out of the deck one by one into a neat layout.', { shape: 'spring', card: 0.32, headline: 'Out of the box' }),
  deck('deck-deal-arc', 'Deal Arc', 'Photos are dealt from the deck into a sweeping arc.', { shape: 'deal', card: 0.32, headline: 'Dealt with care' }, { min: 3, max: 9, default: 7 }),
  deck('deck-magician-fan', "Magician's Fan", 'A fan of photos opens, every card turns over, and it closes again.', { shape: 'magician', card: 0.42, headline: 'A little magic' }, { min: 3, max: 8, default: 6 }),
  deck('deck-radial-burst', 'Radial Burst', 'Photos burst out of the centre into a circle, then pull back in.', { shape: 'burst', card: 0.3, headline: 'Out with a bang' }, { min: 4, max: 10, default: 8 }),
  deck('deck-shuffle', 'Shuffle Restack', 'The deck explodes into a shuffle, then snaps back into a stack.', { shape: 'shuffle', card: 0.38, headline: 'Mix it up' }, { min: 3, max: 9, default: 7 }),
  deck('deck-bounce', 'Bounce Settle', 'Photos drop in from above and bounce gently into a grid.', { shape: 'bounce', card: 0.32, headline: 'Landing soon' }, { min: 3, max: 8, default: 6 }),
  deck('deck-story-pile', 'Story Pile', 'Like stories: the top photo lifts away and the next rises up.', { shape: 'storyPile', card: 0.6, headline: 'Swipe up' }, { min: 3, max: 8, default: 5 }),
  deck('deck-scrapbook', 'Scrapbook Drift', 'A scatter of rotated prints that gently breathes.', { shape: 'scrapbook', card: 0.4, headline: 'Our favourite moments' }, { min: 4, max: 10, default: 6 }),
  deck('deck-spin-toss', 'Spin Toss', 'Photos are tossed in from both sides, spinning onto a pile.', { shape: 'toss', card: 0.42, headline: 'Catch this' }),
  deck('deck-swap-dance', 'Swap Dance', 'A row of photos swapping places in pairs, arching past each other.', { shape: 'swap', card: 0.34, headline: 'Switch it up' }, { min: 3, max: 6, default: 5 }),
  deck('deck-tower', 'Tower Rebuild', 'A tower of photos builds up, topples, and builds itself again.', { shape: 'tower', card: 0.3, headline: 'Built to bounce back' }, { min: 3, max: 7, default: 5 }),
];

const hero = variant('hero', 'Hero Stage');
const reveal = variant('hero', 'Photo Reveal');

const HEROES: readonly SceneVariant[] = [
  hero('hero-soft-crossfade', 'Soft Focus Crossfade', 'One photo at a time on a stage, breathing gently, dissolving to the next.', { shape: 'crossfade', headline: 'The story so far' }, { min: 2, max: 8, default: 4 }, 10_000),
  hero('hero-with-flanks', 'Hero With Flanks', 'A hero photo centre stage, its neighbours at the sides, shifting along.', { shape: 'flanks', card: 0.6, headline: 'Centre of attention' }, { min: 3, max: 8, default: 5 }),
  hero('hero-triptych', 'Triptych Shift', 'Three panels, the centre one featured, shifting each beat.', { shape: 'triptych', card: 0.5, headline: 'Three of a kind' }, { min: 3, max: 8, default: 6 }),
  hero('hero-polaroid-drop', 'Polaroid Drop', 'Prints drop onto the table one by one and pile up.', { shape: 'polaroid', card: 0.56, headline: 'Memories in the making' }, { min: 3, max: 8, default: 5 }),
  hero('hero-billboard-spin', 'Billboard Spin', 'A billboard turns on its axis to show the next photo.', { shape: 'billboard', card: 0.62, headline: 'Turn it around' }, { min: 2, max: 8, default: 4 }, 10_000),
  hero('hero-stamp-press', 'Stamp Press', 'Each photo stamps down onto the stage with a punchy landing.', { shape: 'stamp', card: 0.6, headline: 'Make an impression' }, { min: 2, max: 8, default: 5 }),
  hero('hero-peel-deck', 'Peel Off Deck', 'The top photo peels away to reveal the next beneath it.', { shape: 'peel', card: 0.62, headline: 'Peel back the layers' }, { min: 2, max: 8, default: 5 }),
  hero('hero-lightbox', 'Lightbox Swap', 'A dim grid of photos, each lifted large in turn.', { shape: 'lightbox', card: 0.62, headline: 'Picked for you' }, { min: 4, max: 9, default: 6 }),
  hero('hero-rack-focus', 'Rack Focus', 'Focus racks along a row of photos, the rest soft and dim.', { shape: 'rackFocus', card: 0.55, headline: 'Bring it into focus' }, { min: 3, max: 7, default: 5 }),
  hero('hero-depth-dissolve', 'Depth Dissolve', 'Each photo sinks back as the next rises forward.', { shape: 'dissolve', card: 0.62, headline: 'Next up' }, { min: 2, max: 8, default: 5 }),
  reveal('reveal-ken-burns', 'Ken Burns Relay', 'Full-frame photos, each with a slow pan and zoom, relaying to the next.', { shape: 'kenBurns', headline: 'Every picture tells a story' }, { min: 2, max: 8, default: 4 }),
  reveal('reveal-velvet-push', 'Velvet Push', 'The camera pushes through each photo into the next.', { shape: 'velvetPush', headline: 'Go deeper' }, { min: 2, max: 8, default: 4 }),
  reveal('reveal-close-up', 'Close-Up Reveal', 'Starts tight on a detail, then opens out to the full picture.', { shape: 'closeUp', headline: 'The details matter' }, { min: 2, max: 8, default: 4 }),
  reveal('reveal-silk-pullback', 'Silk Pullback', 'A buttery pull back from a close-up to a wide, settled frame.', { shape: 'pullback', headline: 'See the bigger picture' }, { min: 2, max: 8, default: 4 }),
  reveal('reveal-portrait-lift', 'Portrait Lift', 'Rises from the lower third into a soft close-up.', { shape: 'lift', headline: 'Meet the team' }, { min: 2, max: 8, default: 4 }),
  reveal('reveal-side-glide', 'Side Glide', 'Each photo glides in from the side and settles.', { shape: 'glide', headline: 'Smooth from start to finish' }, { min: 2, max: 8, default: 4 }),
];

const cut = variant('cuts', 'Scene Cuts');

const CUTS: readonly SceneVariant[] = [
  cut('cut-iris', 'Iris Wipe', 'A circular iris opens onto the next photo.', { shape: 'iris', headline: 'Open your eyes' }, { min: 2, max: 8, default: 4 }, 10_000),
  cut('cut-diamond', 'Diamond Wipe', 'A diamond window expands to bring in the next photo.', { shape: 'diamond', headline: 'A cut above' }, { min: 2, max: 8, default: 4 }, 10_000),
  cut('cut-barn-door', 'Barn Door', 'Two doors open from the middle onto the next photo.', { shape: 'barnDoor', headline: 'Doors are open' }, { min: 2, max: 8, default: 4 }, 10_000),
  cut('cut-stripes', 'Stripe Unveil', 'Stripes sweep in from alternate sides to unveil the next photo.', { shape: 'stripes', headline: 'Bold moves' }, { min: 2, max: 8, default: 4 }, 10_000),
  cut('cut-blinds', 'Blinds Reveal', 'Venetian blinds open one after another onto the next photo.', { shape: 'blinds', headline: 'Let the light in' }, { min: 2, max: 8, default: 4 }, 10_000),
  cut('cut-slices', 'Slice Shuffle', 'Slices of the next photo shuffle in from both sides.', { shape: 'slices', headline: 'Shake things up' }, { min: 2, max: 8, default: 4 }, 10_000),
  cut('cut-diagonal', 'Diagonal Wipe', 'A clean diagonal wipe between photos.', { shape: 'diagonal', headline: 'On the angle' }, { min: 2, max: 8, default: 4 }, 10_000),
  cut('cut-cross-zoom', 'Cross Zoom', 'The outgoing photo zooms past the camera as the next zooms in.', { shape: 'crossZoom', headline: 'Zoom in' }, { min: 2, max: 8, default: 4 }, 10_000),
  cut('cut-whip-pan', 'Whip Pan', 'An ultra-fast pan whips to the next photo.', { shape: 'whip', headline: 'Fast forward' }, { min: 2, max: 8, default: 5 }, 9_000),
  cut('cut-flash', 'Flash Cut', 'A white flash punctuates the hard cut between photos.', { shape: 'flash', headline: 'In a flash' }, { min: 2, max: 8, default: 5 }, 9_000),
  cut('cut-glitch', 'Glitch Cut', 'The next photo breaks in through jittering, flickering slices.', { shape: 'glitch', headline: 'System update' }, { min: 2, max: 8, default: 4 }, 10_000),
  cut('cut-shutter', 'Shutter Slats', 'Horizontal slats flip open to reveal the next photo.', { shape: 'shutter', headline: 'Behind the shutters' }, { min: 2, max: 8, default: 4 }, 10_000),
  cut('cut-card-grid', 'Card Wipe Grid', 'Cells pop in across the frame, building the next photo.', { shape: 'cardGrid', headline: 'Piece by piece' }, { min: 2, max: 8, default: 4 }, 10_000),
  cut('cut-push', 'Push', 'Each photo pushes the last one out of frame.', { shape: 'push', headline: 'Push forward' }, { min: 2, max: 8, default: 5 }, 10_000),
];

const collage = variant('halo', 'Photo Collage');

const COLLAGES: readonly SceneVariant[] = [
  collage('halo-float', 'Idea Halo Float', 'Tilted photos float around a centred headline.', { shape: 'float', headline: 'Big ideas start here', subline: 'A studio for bold brands' }, { min: 4, max: 9, default: 7 }),
  collage('halo-assemble', 'Idea Halo Assemble', 'Photos fly in from the edges and settle into a halo, then leave.', { shape: 'assemble', headline: 'It all comes together', subline: 'Strategy, design and film' }, { min: 4, max: 9, default: 7 }),
  collage('halo-spin', 'Idea Halo Spin', 'The whole constellation slowly orbits the headline.', { shape: 'spin', headline: 'Around the world', subline: 'Stories from 40 countries' }, { min: 4, max: 9, default: 7 }),
  collage('halo-pulse', 'Idea Halo Pulse', 'Each photo in the halo lifts forward in turn.', { shape: 'pulse', headline: 'Meet the makers', subline: 'The people behind the work' }, { min: 4, max: 9, default: 7 }),
  collage('halo-breathe', 'Idea Halo Breathe', 'The halo gently expands and contracts around the words.', { shape: 'breathe', headline: 'Take a breath', subline: 'Wellness for busy teams' }, { min: 4, max: 9, default: 7 }),
  collage('halo-scatter', 'Idea Halo Scatter', 'Photos scatter outward, then magnetically reform.', { shape: 'scatter', headline: 'Break the mould', subline: 'Then make a better one' }, { min: 4, max: 9, default: 7 }),
  collage('halo-cascade', 'Idea Halo Cascade', 'Photos appear one by one around the ring.', { shape: 'cascade', headline: 'Built step by step', subline: 'Our process' }, { min: 4, max: 9, default: 7 }),
  collage('halo-parallax', 'Idea Halo Parallax', 'Layered drift: near photos move more than far ones.', { shape: 'parallax', headline: 'Depth in every detail', subline: 'Crafted with care' }, { min: 4, max: 9, default: 7 }),
];

const timeline = variant('timeline', 'Timeline');

const TIMELINES: readonly SceneVariant[] = [
  timeline('tl-track', 'Milestone Track', 'A playhead travels the line, bringing each milestone forward with its year.', { shape: 'track', headline: 'Our journey', milestones: '2019, 2020, 2021, 2022, 2023, 2024, 2025' }, { min: 3, max: 8, default: 6 }),
  timeline('tl-arc', 'Timeline Arc', 'Milestones on a rising arch, lifted as the playhead reaches them.', { shape: 'arc', headline: 'How far we have come', milestones: 'Founded, First client, 10 staff, New office, Award, Today' }, { min: 3, max: 7, default: 6 }),
  timeline('tl-zigzag', 'Timeline Zigzag', 'Photos alternate above and below the line as the story moves along.', { shape: 'zigzag', headline: 'A decade of growth', milestones: '2016, 2018, 2020, 2022, 2024, 2026' }, { min: 3, max: 8, default: 6 }),
  timeline('tl-spine', 'Timeline Spine', 'A vertical spine with milestones branching left and right.', { shape: 'spine', headline: 'Project roadmap', milestones: 'Discover, Define, Design, Build, Launch, Grow' }, { min: 3, max: 8, default: 6 }),
  timeline('tl-metro', 'Metro Line', 'A transit-map line; each station lights up as the train arrives.', { shape: 'metro', headline: 'Next stop: success', milestones: 'Plan, Prepare, Pitch, Win, Deliver, Celebrate' }, { min: 3, max: 7, default: 6 }),
  timeline('tl-clothesline', 'Clothesline', 'Prints hang on a sagging line and sway as the playhead passes.', { shape: 'hang', headline: 'Our year in pictures', milestones: 'Jan, Mar, May, Jul, Sep, Nov' }, { min: 3, max: 7, default: 6 }),
  timeline('tl-focus', 'Timeline Focus', 'Every photo stays on the track; the playhead enlarges each in turn.', { shape: 'focus', headline: 'Moments that made us', milestones: '2020, 2021, 2022, 2023, 2024, 2025' }, { min: 3, max: 8, default: 6 }),
];

export const SHOWCASE_SCENES: readonly SceneVariant[] = [
  ...COLLAGES,
  ...TIMELINES,
  ...HEROES,
  ...CUTS,
  ...DECKS,
  ...RINGS,
  ...FLOWS,
  ...MARQUEES,
  ...DEPTHS,
  ...TILES,
];
