/**
 * `setPointerCapture`, without the sharp edge.
 *
 * It throws `NotFoundError` when the pointer id is no longer active — a
 * pointer released between the event being queued and the handler running, a
 * synthetic event, a device that vanished mid-gesture. Thrown from inside a
 * React event handler with no error boundary above it, that unmounts the whole
 * editor: a dropped drag takes the application with it.
 *
 * Capture is an optimisation here rather than a requirement. Losing it means a
 * drag stops tracking once the pointer leaves the element, which is a small
 * degradation; losing the editor is not.
 */
export function capturePointer(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // The gesture still works, it just stops following the pointer outside
    // the element. Not worth a console line on every stray event.
  }
}
