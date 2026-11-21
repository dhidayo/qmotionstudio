import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * A part of the interface fetched when first needed rather than with the
 * editor (D-173).
 *
 * The editor's own script was 275KB compressed, about two seconds of a slow
 * phone connection before anything was drawn (D-171). Most of it was never
 * on the first screen: the other device's layout, the pickers, the export
 * window, the panels a tap opens. Each of those is a part like this one.
 *
 * `preload` and the component share one download, so a part fetched while
 * the editor is idle (./prefetch.ts) opens at once when asked for, and
 * `loaded` says whether it has arrived — the layout switch waits for it
 * rather than blanking the screen (./layouts.ts).
 *
 * A part that has arrived draws in the same render, with no loading state in
 * between: React's `lazy` takes a thenable, and one that answers at once is
 * read at once. A real promise always answers later, which would show the
 * loading state for a frame even for a part already here.
 *
 * A failed download is kept, not retried: Chrome remembers a module that
 * failed and fails every later import of it without asking the network, so
 * only a reload can fetch it again (D-171). Whatever draws the part says so
 * through a boundary (./Boundaries.tsx).
 */
export type LazyPart<P extends object> = {
  readonly Component: LazyExoticComponent<ComponentType<P>>;
  /** Starts the download, if it has not started; resolves once the part is here. */
  readonly preload: () => Promise<void>;
  /** Whether the part has arrived and can draw without waiting. */
  readonly loaded: () => boolean;
};

export function lazyPart<P extends object>(load: () => Promise<ComponentType<P>>): LazyPart<P> {
  let pending: Promise<ComponentType<P>> | null = null;
  let arrived: ComponentType<P> | null = null;
  const fetchPart = (): Promise<ComponentType<P>> => {
    pending ??= load().then((component) => {
      arrived = component;
      return component;
    });
    return pending;
  };
  const module = (): Promise<{ default: ComponentType<P> }> => {
    const here = arrived;
    if (here === null) return fetchPart().then((component) => ({ default: component }));
    // Answers at once (see above); `lazy` only ever calls `then` on it.
    const ready = { then: (resolve: (value: { default: ComponentType<P> }) => void) => { resolve({ default: here }); } };
    return ready as unknown as Promise<{ default: ComponentType<P> }>;
  };
  return {
    Component: lazy(module),
    preload: () => fetchPart().then(() => undefined),
    loaded: () => arrived !== null,
  };
}
