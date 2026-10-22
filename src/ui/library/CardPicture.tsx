import { useEffect, useRef, useState } from 'react';
import type { Aspect } from '@/core/types';
import type { Project } from '@/document/types';
import { aspectPosterUrl, loopAspect, posterUrl, previewUrl, type TemplateSummary } from '@/templates/manifest';
import { LivePreview } from './LivePreview';
import { PlayingPreview } from './PlayingPreview';
import { useTrialProject } from './useTrialProject';

/** How long a mouse rests on a card before it plays live: long enough that sweeping past does not. */
const HOVER_DELAY_MS = 350;
/** A card is small; its live picture needs no more than this on the short edge. */
const CARD_SHORT_EDGE = 360;

export type HoverIntent = {
  /** A mouse has rested on the card for a moment, and not clicked it. */
  readonly resting: boolean;
  readonly bind: {
    readonly onPointerEnter: (event: React.PointerEvent) => void;
    readonly onPointerLeave: () => void;
    readonly onPointerDown: () => void;
  };
};

/**
 * A mouse resting on a card, for its live picture (D-160). Fingers never
 * count — a phone has no hover, and its cards play by themselves — and a
 * click ends it: the design is on the canvas then, or in the large preview.
 */
export function useHoverIntent(): HoverIntent {
  const [resting, setResting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  const stop = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setResting(false);
  };
  return {
    resting,
    bind: {
      onPointerEnter: (event) => {
        if (event.pointerType !== 'mouse') return;
        stop();
        timer.current = setTimeout(() => { setResting(true); }, HOVER_DELAY_MS);
      },
      onPointerLeave: stop,
      onPointerDown: stop,
    },
  };
}

/**
 * A design card's picture, always in the project's frame shape (D-150, D-160).
 *
 * The recorded loop was made in the design's first shape. It plays only on a
 * card of that shape; on any other, the card keeps its still in the card's
 * own shape rather than showing a picture of another shape boxed inside it.
 * With a mouse, resting on a card plays it live in that shape — one card at a
 * time, the hovered one — with the person's own photos and words in it.
 */
export function CardPicture({
  template,
  shape,
  playsItself,
  resting,
  trial,
}: {
  template: TemplateSummary;
  shape: Aspect;
  /** On a screen with no hover the loop plays by itself while the card is on screen (D-109). */
  playsItself: boolean;
  /** From `useHoverIntent`: the card's live picture is wanted. */
  resting: boolean;
  /** The project to play live — `libraryTrial`, `sceneAddTrial` or `sceneReplaceTrial`, which keep their identity. */
  trial: (templateId: string) => Promise<Project>;
}): React.JSX.Element {
  const still = aspectPosterUrl(template.id, shape);
  const loops = shape === loopAspect(template);
  const live = useTrialProject(resting ? template.id : null, trial);
  return (
    <>
      {playsItself && loops ? <PlayingPreview id={template.id} still={still} /> : (
        <img
          src={still}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => { if (!e.currentTarget.src.includes(`/thumbs/${template.id}.webp`)) e.currentTarget.src = posterUrl(template.id); }}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {/* The live picture could not be made: the loop instead, where it is this shape. */}
      {resting && live.status === 'failed' && loops && !playsItself && (
        <video src={previewUrl(template.id)} autoPlay muted loop playsInline aria-hidden className="absolute inset-0 size-full object-cover" />
      )}
      {resting && live.status === 'ready' && <LivePreview project={live.project} aspect={shape} still={still} maxShortEdge={CARD_SHORT_EDGE} />}
    </>
  );
}
