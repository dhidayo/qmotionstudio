import { TIER_SWITCHABLE, setTier, useEntitlements } from '@/entitlements';

/**
 * Free or Pro (D-093, D-122). While the tier can be switched — in development,
 * and for the open test release — a two-sided switch, so a tester can see
 * both plans: "add on toggle for FREE and PRO to test for now". Otherwise the
 * plan, stated, and nothing to press.
 */
export function TierSwitch({ size = 'small' }: { size?: 'small' | 'large' }): React.JSX.Element {
  const { tier } = useEntitlements();
  const other = tier === 'pro' ? 'free' : 'pro';
  const text = size === 'large' ? 'text-[13px] px-3 py-1.5' : 'text-[10px] px-1.5 py-0.5';

  if (!TIER_SWITCHABLE) {
    return (
      <span
        title="Pro plans are coming soon"
        className={`rounded-sm font-bold uppercase tracking-wide ${text}`}
        style={{ background: 'var(--c-pro-soft)', color: 'var(--c-pro)' }}
      >
        {tier}
      </span>
    );
  }

  return (
    <button
      type="button"
      data-tier-switch
      onClick={() => { setTier(other); }}
      title={`Test switch: try the app as Free or as Pro. Now ${tier}; click for ${other}.`}
      aria-label={`Tier: ${tier}. Switch to ${other}.`}
      className="inline-flex shrink-0 items-center overflow-hidden rounded-full border font-bold uppercase tracking-wide"
      style={{ borderColor: 'var(--c-pro)' }}
    >
      {(['free', 'pro'] as const).map((side) => (
        <span
          key={side}
          aria-hidden
          className={text}
          style={side === tier
            ? { background: 'var(--c-pro)', color: 'var(--c-panel)' }
            : { color: 'var(--c-pro)' }}
        >
          {side}
        </span>
      ))}
    </button>
  );
}
