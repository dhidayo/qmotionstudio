import * as actions from '@/document/actions';
import type { Overlay, Project } from '@/document/types';
import { DEFAULT_OVERLAY_MS } from '@/document/defaults';
import { placeNew } from '@/document/select/tracks';
import { timelineSpanMs } from '@/document/select/timeline';
import { useEditor } from '@/state/store';

/**
 * Where a new layer goes: in an ad, a clip at the playhead; on a single
 * design, for as long as it lasts. Shared with the add bar (D-153), which adds
 * to designs as well as videos.
 */
export function spotFor(
  project: Project,
  overlays: readonly Overlay[],
  playheadMs: number,
  targetTrack: number | null,
): ReturnType<typeof placeNew> {
  const span = timelineSpanMs(project);
  return project.mode === 'motionAd'
    ? placeNew(overlays, { atMs: playheadMs, lengthMs: DEFAULT_OVERLAY_MS, durationMs: span, preferTrack: targetTrack })
    : placeNew(overlays, { atMs: 0, lengthMs: span, durationMs: span, preferTrack: null });
}

/**
 * A layer added from the Text or Photos tab (D-124), placed the same way from
 * both: in an ad, a clip on its timeline at the playhead; on a single design,
 * which has no timeline, for as long as the design lasts. Returns its id.
 */
export function addLayer(
  content: Overlay['content'],
  at: { x: number; y: number },
  extra: { readonly enterAnim?: Overlay['enterAnim']; readonly effects?: Overlay['effects'] } = {},
): string {
  const { project, playheadMs, targetTrack, dispatch } = useEditor.getState();
  const made = actions.makeOverlay(content, spotFor(project, project.overlays, playheadMs, targetTrack));
  const overlay: Overlay = {
    ...made,
    transform: { ...made.transform, x: at.x, y: at.y },
    ...(extra.enterAnim === undefined ? {} : { enterAnim: extra.enterAnim }),
    ...(extra.effects === undefined ? {} : { effects: extra.effects }),
  };
  dispatch(actions.addOverlay(overlay));
  return overlay.id;
}

/**
 * Photos on top of the design (D-124) — several at once, each a little apart
 * so they do not sit exactly on one another — kept in Your photos too (D-147).
 * One undo step for the lot, where adding them one by one took one each.
 */
export function addPhotoLayers(mediaIds: readonly string[]): readonly string[] {
  const { project, playheadMs, targetTrack, dispatch } = useEditor.getState();
  const made: Overlay[] = [];
  mediaIds.forEach((mediaId, i) => {
    const overlay = actions.makeOverlay({ kind: 'photo', mediaId }, spotFor(project, [...project.overlays, ...made], playheadMs, targetTrack));
    made.push({ ...overlay, transform: { ...overlay.transform, x: 0.5 + i * 0.04, y: 0.5 + i * 0.04 } });
  });
  if (made.length > 0) dispatch(actions.addPhotoLayers(made));
  return made.map((o) => o.id);
}
