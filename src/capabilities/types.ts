/**
 * D-009. The capability seam.
 *
 * Every operation that some browsers cannot perform is expressed as a
 * capability with one or more providers. Providers resolve in a fixed order:
 *
 *   native  →  local-wasm  →  remote
 *
 * v1 registers native and local-wasm providers only. The remote provider is a
 * stub that always reports unavailable, so nothing in v1 ever requires the
 * network and §9's "nothing is uploaded" claim stays literally true.
 *
 * When a server becomes worth building, it is a new provider file per
 * capability — not a refactor. The prompt-to-connect UI is already built and
 * tested against the providers that exist.
 */

export type CapabilityId =
  | 'encodeVideoH264'
  | 'encodeVideoVp9'
  | 'encodeAudioAac'
  | 'encodeAudioOpus'
  | 'decodeHeic'
  | 'renderProject';

export type ProviderKind = 'native' | 'local-wasm' | 'remote';

export const PROVIDER_ORDER: readonly ProviderKind[] = ['native', 'local-wasm', 'remote'] as const;

export type ProviderProgress = (fraction: number) => void;

export interface CapabilityProvider<TIn, TOut> {
  readonly id: CapabilityId;
  readonly kind: ProviderKind;
  /** Drives the connect-to-continue prompt. Always false for native and wasm. */
  readonly requiresNetwork: boolean;
  /** A short human label for the export dialog, e.g. "browser" or "bundled encoder". */
  readonly label: string;
  isAvailable(): Promise<boolean>;
  run(input: TIn, signal: AbortSignal, onProgress?: ProviderProgress): Promise<TOut>;
}

export type Resolution<TIn, TOut> =
  | { readonly status: 'available'; readonly provider: CapabilityProvider<TIn, TOut> }
  /** A provider exists but needs the network, and we are offline or it is v1-stubbed. */
  | { readonly status: 'needs-connection'; readonly provider: CapabilityProvider<TIn, TOut> }
  | { readonly status: 'unavailable' };
