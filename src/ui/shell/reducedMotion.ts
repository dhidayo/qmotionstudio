/**
 * Whether the person has asked for less motion (§13). The editor's chrome
 * then neither glides nor loops: scrolls jump, previews show their still.
 * The picture itself is the product and still plays (D-169).
 */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** How the chrome scrolls something into view: smoothly, unless motion is to be kept down. */
export function chromeScroll(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
