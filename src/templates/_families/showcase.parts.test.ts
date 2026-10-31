import { SHOWCASE_SCENES } from '../_catalog/showcase';
import { describePartChecks } from '../_test/partChecks';
import { create as hero } from './hero';
import { create as marquee } from './marquee';

/** Photo Reveal / Hero Stage and Flow Track, part by part (D-159). */
describePartChecks(SHOWCASE_SCENES.filter((v) => v.family === 'hero'), hero);
describePartChecks(SHOWCASE_SCENES.filter((v) => v.family === 'marquee'), marquee);
