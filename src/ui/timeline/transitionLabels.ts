import type { TransitionKind } from '@/document/types';

/** The transitions' names, in words people use (shared by the timeline and the phone's scene panel). */
export const TRANSITION_LABELS: Record<TransitionKind, string> = {
  cut: 'Cut',
  crossFade: 'Fade',
  push: 'Push',
  wipe: 'Wipe',
  zoomBlur: 'Zoom',
  whiteFlash: 'Flash',
  scale: 'Scale',
};
