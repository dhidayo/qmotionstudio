import { useEffect } from 'react';
import type { PreviewClock } from '@/core/time/clock';
import type { Project } from '@/document/types';
import { DEMO_TEMPLATE_ID, PLACEHOLDER_TEMPLATE_ID } from '@/document/defaults';
import { renderParams } from '@/dev/renderParams';
import { restMomentMs } from '@/templates/restMoment';
import { peekTemplate } from '@/templates/registry';

/**
 * Image plays once; Video loops (D-155).
 *
 * "For Design, I do not want the animation to keep playing on repeat. Play
 * once and stop is enough for user to see design of the templates selected."
 * In Image the clock stops at the end and rests on the picture moment
 * (`restMomentMs`), which is the frame Export → Image saves. Video keeps
 * looping: it is watched, not looked at.
 *
 * A new design, a reopened project or a switch to Image plays again from the
 * start — but only once its template has arrived. Templates load lazily
 * (D-029), and playing on a blank canvas would spend the one play on nothing.
 *
 * `?frozen=` stays where it was put, for the visual suite; `?thumb=` keeps
 * looping, because the library's hover loops are recorded from the preview.
 */
export function usePlayOnce(clock: PreviewClock, project: Project): void {
  const { frozenMs, thumbShortEdge } = renderParams();
  const image = project.mode === 'showcase' && thumbShortEdge === null;
  const templateId = project.scenes[0]?.templateId ?? '';
  // A number, so the effect below runs when the moment moves, not on every edit.
  const restMs = image ? restMomentMs(project) : null;

  useEffect(() => {
    clock.setLoop(!image);
    clock.setRest(restMs);
  }, [clock, image, restMs]);

  useEffect(() => {
    if (!image || frozenMs !== null || templateId === '') return;
    let handle = 0;
    const playWhenReady = (): void => {
      const drawable = templateId === DEMO_TEMPLATE_ID || templateId === PLACEHOLDER_TEMPLATE_ID || peekTemplate(templateId) !== null;
      if (!drawable) {
        handle = requestAnimationFrame(playWhenReady);
        return;
      }
      clock.pause();
      clock.seek(0);
      clock.play();
    };
    playWhenReady();
    return () => { cancelAnimationFrame(handle); };
  }, [clock, image, frozenMs, templateId, project.id]);
}
