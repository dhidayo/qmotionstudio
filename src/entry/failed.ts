/**
 * A page whose code did not download says so, with Reload (D-171, D-175).
 *
 * Plain DOM rather than React: React is in the chunk that did not arrive.
 * Chrome remembers a module that failed and fails every later import of it,
 * so only a reload asks the network again.
 */
export function pageDidNotLoad(host: HTMLElement, page: 'landing' | 'studio', error: unknown): void {
  console.error(`Q Motion Studio: the ${page === 'studio' ? 'studio' : 'page'} did not load.`, error);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const box = document.createElement('div');
  box.className = 'grid h-full place-items-center p-6 text-center';
  box.setAttribute('role', 'alert');
  const inner = document.createElement('div');
  const title = document.createElement('strong');
  title.className = 'font-headline mb-1.5 block text-[16px] text-ink';
  title.textContent = page === 'studio' ? 'The studio did not load' : 'This page did not load';
  const line = document.createElement('p');
  line.className = 'm-0 mb-4 text-[14px] text-ink-muted';
  line.textContent = offline
    ? 'You are offline. Connect, then reload.'
    : 'Part of it did not download. Reload to try again.';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ui-btn ui-btn--primary';
  button.textContent = 'Reload';
  button.addEventListener('click', () => { location.reload(); });
  inner.append(title, line, button);
  box.append(inner);
  host.replaceChildren(box);
}
