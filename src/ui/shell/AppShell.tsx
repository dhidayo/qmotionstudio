import { useEffect, useMemo } from 'react';
import { Artboard } from '@/ui/artboard/Artboard';
import { ScrubBar } from '@/ui/artboard/ScrubBar';
import { LibraryRail } from '@/ui/library/LibraryRail';
import { Inspector } from '@/ui/inspector/Inspector';
import { PerfOverlay } from '@/dev/PerfOverlay';
import { PreviewClock } from '@/core/time/clock';
import { createRenderRig, disposeRenderRig } from '@/core/render/rig';
import { useEditor } from '@/state/store';
import { totalDurationMs } from '@/document/select/timeline';

export function AppShell(): React.JSX.Element {
  const project = useEditor((s) => s.project);
  const duration = totalDurationMs(project);

  // One rig and one clock for the preview. The export path will create its own
  // pair, which is the whole point of D-001 — the two never share scratch space.
  // Created empty on purpose: duration is owned by the effect below, so the
  // clock never needs rebuilding when the document's length changes.
  const clock = useMemo(() => new PreviewClock(0), []);
  const rig = useMemo(() => createRenderRig(), []);

  useEffect(() => { clock.setDuration(duration); }, [clock, duration]);

  /**
   * `?frozen=<ms>` parks the playhead at an exact time instead of playing.
   *
   * This is the deterministic render hook the visual tests need — a moving
   * frame cannot have a stable baseline — and it is the same hook M4 uses to
   * compare a preview frame against an exported one at identical times, which
   * is the only way "matches the preview" can actually be asserted.
   */
  useEffect(() => {
    const frozen = new URLSearchParams(location.search).get('frozen');
    if (frozen === null) {
      clock.play();
      return;
    }
    const at = Number(frozen);
    clock.seek(Number.isFinite(at) ? at : 0);
    clock.pause();
  }, [clock]);
  useEffect(() => () => { disposeRenderRig(rig); }, [rig]);

  // §13: space toggles playback. Focus-scoped so it does not fight a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (typing) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (clock.playing) clock.pause();
        else clock.play();
      }
    };
    addEventListener('keydown', onKey);
    return () => { removeEventListener('keydown', onKey); };
  }, [clock]);

  return (
    <div className="flex h-full min-h-0 flex-1">
      <LibraryRail />
      <main className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--c-stage)' }}>
        <div className="relative min-h-0 flex-1">
          <Artboard project={project} clock={clock} rig={rig} />
          <PerfOverlay rig={rig} />
        </div>
        <ScrubBar clock={clock} />
      </main>
      <Inspector />
    </div>
  );
}
