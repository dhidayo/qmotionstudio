import * as actions from '@/document/actions';
import type { Overlay } from '@/document/types';
import { DEFAULT_OVERLAY_MS } from '@/document/defaults';
import { placeNew } from '@/document/select/tracks';
import { timelineSpanMs } from '@/document/select/timeline';
import { useEditor } from '@/state/store';

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
  const span = timelineSpanMs(project);
  const spot = project.mode === 'motionAd'
    ? placeNew(project.overlays, { atMs: playheadMs, lengthMs: DEFAULT_OVERLAY_MS, durationMs: span, preferTrack: targetTrack })
    : placeNew(project.overlays, { atMs: 0, lengthMs: span, durationMs: span, preferTrack: null });
  const made = actions.makeOverlay(content, spot);
  const overlay: Overlay = {
    ...made,
    transform: { ...made.transform, x: at.x, y: at.y },
    ...(extra.enterAnim === undefined ? {} : { enterAnim: extra.enterAnim }),
    ...(extra.effects === undefined ? {} : { effects: extra.effects }),
  };
  dispatch(actions.addOverlay(overlay));
  return overlay.id;
}
