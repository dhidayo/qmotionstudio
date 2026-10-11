import type { PhotoPlacement } from '@/document/actions';

/**
 * What became of the photos just added, said plainly (D-152).
 *
 * The owner asked for on-screen words that are "very clear, professional, easy
 * to understand", and the rule they describe is one-for-one — "remove a
 * sample photo for each uploaded photos" — so the message counts exactly that:
 * how many samples gave way, how many new spots were made, and how many photos
 * are waiting in Your photos because the design is full.
 *
 * `scene` is the scene's number in a video, or null for a single design.
 */

const count = (n: number, one: string, many: string = `${one}s`): string => (n === 1 ? `a ${one}` : `${n} ${many}`);

export function addedPhotosMessage(plan: Pick<PhotoPlacement, 'replaced' | 'added' | 'waiting'>, scene: number | null): string {
  const placed = plan.replaced + plan.added;
  const waiting = plan.waiting.length;
  const design = scene === null ? 'This design' : `Scene ${scene}`;

  if (placed === 0) {
    if (waiting === 0) return scene === null ? 'That photo is already in this design.' : `That photo is already in scene ${scene}.`;
    const yours = waiting === 1 ? 'your photo is' : `your ${waiting} photos are`;
    return `${design} is full — ${yours} waiting in Your photos. To use ${waiting === 1 ? 'it' : 'them'}, take one of yours out with × in Photos.`;
  }

  const yours = placed === 1 ? 'Your photo' : `Your ${placed} photos`;
  const what = plan.added === 0
    ? `replaced ${count(plan.replaced, 'sample')}`
    : plan.replaced === 0
      ? `${placed === 1 ? 'is' : 'are'} in ${count(plan.added, 'new photo spot')}`
      : `replaced ${count(plan.replaced, 'sample')} and filled ${count(plan.added, 'new photo spot')}`;
  const said = scene === null ? `${yours} ${what}.` : `Scene ${scene}: ${yours.charAt(0).toLowerCase()}${yours.slice(1)} ${what}.`;
  if (waiting === 0) return said;
  const rest = waiting === 1 ? '1 more is' : `${waiting} more are`;
  return `${said} ${design} is now full, so ${rest} waiting in Your photos.`;
}

/** Photos added to a design with no photo spots go on top of it, as extra photos. */
export function onTopMessage(added: number, scene: number | null): string {
  const design = scene === null ? 'This design' : `Scene ${scene}`;
  return added === 1
    ? `${design} has no photo spots, so your photo is on top of it as an extra photo. Drag it where you want it.`
    : `${design} has no photo spots, so your ${added} photos are on top of it as extra photos. Drag them where you want them.`;
}
