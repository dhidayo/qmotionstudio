import { ASPECTS, type Aspect } from '@/core/types';

/**
 * Query parameters that steer what the artboard renders.
 *
 * These exist for the build scripts and the visual suite, not for users:
 * `npm run thumbs` drives the real app rather than reimplementing the renderer
 * (D-012), so it needs a way to say "this template, this aspect, this size,
 * this instant".
 *
 *   ?template=<id>   render a specific template
 *   ?scene=demo      the M1 render-core fixture
 *   ?scene=placeholder  the M0 aspect test card
 *   ?aspect=16:9     force an aspect
 *   ?frozen=<ms>     park the playhead at an exact time
 *   ?thumb=<px>      cap the preview's short edge, for thumbnail capture
 */
export type RenderParams = {
  readonly template: string | null;
  readonly scene: string | null;
  readonly aspect: Aspect | null;
  readonly frozenMs: number | null;
  readonly thumbShortEdge: number | null;
};

function parse(): RenderParams {
  try {
    const params = new URLSearchParams(location.search);

    const rawAspect = params.get('aspect');
    const aspect = rawAspect !== null && (ASPECTS as readonly string[]).includes(rawAspect)
      ? (rawAspect as Aspect)
      : null;

    const rawFrozen = params.get('frozen');
    const frozen = rawFrozen === null ? null : Number(rawFrozen);

    const rawThumb = params.get('thumb');
    const thumb = rawThumb === null ? null : Number(rawThumb);

    return {
      template: params.get('template'),
      scene: params.get('scene'),
      aspect,
      frozenMs: frozen !== null && Number.isFinite(frozen) ? frozen : null,
      thumbShortEdge: thumb !== null && Number.isFinite(thumb) && thumb > 0 ? thumb : null,
    };
  } catch {
    // No location — a worker or a test harness.
    return { template: null, scene: null, aspect: null, frozenMs: null, thumbShortEdge: null };
  }
}

let cached: RenderParams | null = null;

export function renderParams(): RenderParams {
  cached ??= parse();
  return cached;
}
