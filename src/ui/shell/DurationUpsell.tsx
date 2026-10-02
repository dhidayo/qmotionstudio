import * as actions from '@/document/actions';
import { totalDurationMs } from '@/document/select/timeline';
import { TIER_SWITCHABLE, setTier, useEntitlements } from '@/entitlements';
import { useEditor } from '@/state/store';

/**
 * §12's inline upsell, shown when a project outgrows the free tier.
 *
 * The spec asks for both doors: upgrade, or "remove this scene to keep working
 * with the first 15 seconds". Offering only the first would make the cap feel
 * like a hostage situation, and the second is genuinely what someone trying
 * the app out wants — a piece that exports, now, at the length they are
 * allowed.
 *
 * Nothing is enforced behind the user's back. The project is left over the cap
 * until they choose, because silently deleting a scene on a tier change would
 * be far worse than an export that refuses.
 */
export function DurationUpsell(): React.JSX.Element | null {
  const project = useEditor((s) => s.project);
  const dispatch = useEditor((s) => s.dispatch);
  const { tier, limits } = useEntitlements(project.mode);

  const durationMs = totalDurationMs(project);
  if (tier !== 'free' || durationMs <= limits.maxDurationMs) return null;

  const capSeconds = Math.round(limits.maxDurationMs / 1000);

  return (
    <div
      role="status"
      data-duration-upsell
      className="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-1.5 text-[11px]"
      style={{ background: 'var(--c-pro-soft)', color: 'var(--c-pro)' }}
    >
      <span className="font-semibold">
        This is {(durationMs / 1000).toFixed(1)}s. Free exports stop at {capSeconds}s.
      </span>
      <span style={{ color: 'var(--c-ink-muted)' }}>
        Keep editing either way — only the export is capped.
      </span>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => { dispatch(actions.trimToLimit(limits.maxDurationMs)); }}
          className="rounded-md border px-2 py-0.5 text-[11px]"
          style={{ borderColor: 'var(--c-pro)' }}
        >
          Keep the first {capSeconds}s
        </button>
        {TIER_SWITCHABLE ? (
          <button
            type="button"
            /*
             * §12's stub: v1 has no payments, and must not pretend to. The dev
             * toggle is the whole upgrade path in development (D-093).
             */
            onClick={() => { setTier('pro'); }}
            title="Development toggle — v1 has no payments (§12)."
            className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: 'var(--c-pro)', color: 'var(--c-panel)' }}
          >
            Go Pro
          </button>
        ) : (
          <span style={{ color: 'var(--c-ink-muted)' }}>Pro plans are coming soon.</span>
        )}
      </div>
    </div>
  );
}
