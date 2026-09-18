import {
  PROVIDER_ORDER,
  type CapabilityId,
  type CapabilityProvider,
  type ProviderKind,
  type Resolution,
} from './types';

// The registry is intentionally loosely typed internally and strongly typed at
// the boundary — a Map cannot carry per-key generics, and the alternative is a
// cast at every call site rather than one here.
type AnyProvider = CapabilityProvider<never, unknown>;

const providers = new Map<CapabilityId, AnyProvider[]>();
const availability = new WeakMap<AnyProvider, Promise<boolean>>();

export function registerProvider<TIn, TOut>(provider: CapabilityProvider<TIn, TOut>): void {
  const list = providers.get(provider.id) ?? [];
  list.push(provider);
  list.sort((a, b) => rank(a.kind) - rank(b.kind));
  providers.set(provider.id, list);
}

function rank(kind: ProviderKind): number {
  const index = PROVIDER_ORDER.indexOf(kind);
  return index === -1 ? PROVIDER_ORDER.length : index;
}

/** Probes are cached per provider — isConfigSupported is not free, and nothing changes mid-session. */
function probe(provider: AnyProvider): Promise<boolean> {
  let cached = availability.get(provider);
  if (!cached) {
    cached = provider.isAvailable().catch(() => false);
    availability.set(provider, cached);
  }
  return cached;
}

/**
 * Picks the best available provider for a capability.
 *
 * Returns `needs-connection` — rather than `unavailable` — when the only
 * provider that could do the job requires the network. That is the distinction
 * the UI needs to show a "connect to continue" prompt instead of a dead end.
 */
export async function resolveCapability<TIn, TOut>(
  id: CapabilityId,
): Promise<Resolution<TIn, TOut>> {
  const list = providers.get(id) ?? [];
  let networked: AnyProvider | undefined;

  for (const provider of list) {
    if (!(await probe(provider))) continue;
    if (provider.requiresNetwork) {
      networked ??= provider;
      continue;
    }
    return { status: 'available', provider: provider as unknown as CapabilityProvider<TIn, TOut> };
  }

  if (networked) {
    return {
      status: 'needs-connection',
      provider: networked as unknown as CapabilityProvider<TIn, TOut>,
    };
  }
  return { status: 'unavailable' };
}

/** For the export dialog's capability readout and for tests. */
export function listProviders(id: CapabilityId): readonly { kind: ProviderKind; label: string }[] {
  return (providers.get(id) ?? []).map((p) => ({ kind: p.kind, label: p.label }));
}

export function resetRegistry(): void {
  providers.clear();
}
