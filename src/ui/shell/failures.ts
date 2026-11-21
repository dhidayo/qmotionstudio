/**
 * What the app says when something fails (D-171).
 *
 * "Never fails silently": every failure a person can meet — saving, a
 * design that will not load, an export, an update, a crash — ends in words
 * that say what happened and what to do next, never a blank or a hang. The
 * words are chosen here, from the error itself, so each place that catches
 * one says the same thing for the same cause and the choice can be tested
 * without a browser.
 *
 * Plain words, no codes. The original error still goes to the console
 * beside every message (§16): the message is for the person, the console for
 * a bug report.
 */

/** Every error in a chain of `cause`s, outermost first. */
function chain(error: unknown): unknown[] {
  const seen: unknown[] = [];
  let at: unknown = error;
  while (at !== undefined && at !== null && !seen.includes(at) && seen.length < 8) {
    seen.push(at);
    at = at instanceof Error ? at.cause : undefined;
  }
  return seen;
}

function nameOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string') return error.name;
  return '';
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

/**
 * The device has no room left for this site's storage.
 *
 * IndexedDB rejects with a `QuotaExceededError` DOMException when the site's
 * share is used up. A disk that is itself full can come back as an
 * `UnknownError` instead (Chrome: "Encountered full disk while opening
 * backing store"), so the wording is matched as well as the name.
 */
export function isQuotaError(error: unknown): boolean {
  return chain(error).some((e) => nameOf(e) === 'QuotaExceededError'
    || /quota|storage is full|disk is full|full disk|not enough space/i.test(messageOf(e)));
}

/** The browser ran out of memory: an allocation that failed, or an encoder that said so. */
export function isMemoryError(error: unknown): boolean {
  return chain(error).some((e) => /out of memory|allocation failed|array buffer allocation|cannot allocate|insufficient memory/i.test(messageOf(e)));
}

/**
 * A part of the app loaded on demand did not arrive: a design, the export
 * window, the encoder. Offline before it was kept, or a new version that
 * replaced the file. Each engine words it differently.
 */
export function isChunkLoadError(error: unknown): boolean {
  return chain(error).some((e) => /dynamically imported module|importing a module script failed|module script failed|failed to fetch|load failed|networkerror|chunk/i.test(messageOf(e))
    || nameOf(e) === 'ChunkLoadError');
}

function offline(): boolean {
  return typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine;
}

/** Said when an autosave fails (beside the top bar's "Not saved"). */
export function saveFailureMessage(error: unknown): string {
  if (isQuotaError(error)) {
    return 'This device is out of storage, so your latest changes are not saved. Delete projects you no longer need, or save a project file from the menu.';
  }
  return 'Your latest changes could not be saved. They are still here — keep this tab open, or save a project file from the menu.';
}

/** Said when a photograph or other file could not be kept on the device. */
export function mediaSaveFailureMessage(error: unknown): string {
  if (isQuotaError(error)) {
    return 'This device is out of storage, so your new photos are not saved. Delete projects you no longer need, then add them again.';
  }
  return saveFailureMessage(error);
}

/** Said when a design (or a part of the app) could not be loaded. */
export function designFailureMessage(error: unknown): string {
  if (isChunkLoadError(error)) {
    return offline()
      ? 'That design is not on this device yet. Connect to the internet, then reload the page.'
      : 'That design could not be downloaded. Check your connection, then reload the page.';
  }
  return 'That design could not be loaded. Try another, or reload the page.';
}

/** Said when a window loaded on first use (Export, the project list) could not be loaded. */
export function windowFailureMessage(error: unknown): string {
  if (isChunkLoadError(error)) {
    return offline()
      ? 'That window is not on this device yet. Connect to the internet, then reload the page.'
      : 'That window could not be downloaded. Check your connection, then reload the page.';
  }
  return 'That window could not be opened. Try again, or reload the page.';
}

/** The plain-words line for an export that failed, with what to try next. */
export function exportFailureMessage(error: unknown): string {
  if (isMemoryError(error)) {
    return 'Your device ran out of memory making this video. Close other tabs and apps, or choose 720p or 30 fps, and export again.';
  }
  if (isQuotaError(error)) {
    return 'There is not enough free storage on this device to save the video. Free some space and export again.';
  }
  if (isChunkLoadError(error)) {
    return offline()
      ? 'The video maker is not on this device yet. Connect to the internet, reload the page and export again.'
      : 'The video maker could not be downloaded. Check your connection, reload the page and export again.';
  }
  /*
   * A sound that is not ready already says which and what to do (D-156,
   * D-172): "A video in this design has not loaded yet… Wait a moment and
   * export again". Its words are kept as they are; a hint about WebM or 720p
   * after them would send the person the wrong way.
   */
  const ready = chain(error).find((e) => nameOf(e) === 'AudioNotReadyError');
  if (ready !== undefined && messageOf(ready).trim() !== '') return messageOf(ready).trim();
  const said = messageOf(error).trim();
  /*
   * A worker that dies without a word is, in practice, a worker that ran out
   * of memory or was stopped by the browser — on a phone, usually because the
   * tab was put in the background.
   */
  if (said === '' || /^Export worker failed:\s*(undefined)?$/.test(said)) {
    return 'The export stopped unexpectedly — usually the device ran short of memory or the tab was in the background. Keep this tab open, try 720p, and export again.';
  }
  const sentence = /[.!?]$/.test(said) ? said : `${said}.`;
  return `The export failed: ${sentence} Try again; if it fails again, try WebM or 720p.`;
}

/** Said beside the format choice when H.264 cannot be encoded here (§11.9). */
export const MP4_FALLBACK = 'MP4 is not available in this browser — WebM will be used.';

/** Said while a video is being made, where a phone may stop it in the background. */
export const KEEP_OPEN = 'Keep this tab open until it finishes — switching away can stop the export.';

/** Said if the tab was hidden while the video was being made. */
export const WAS_HIDDEN = 'This tab was in the background while the video was being made. If it stalls, cancel and export again with the tab open.';

/** The update notice (the service worker found a newer version). */
export const UPDATE_READY = 'A new version of Q Motion Studio is ready.';

/** The crash screen's heading. */
export const CRASHED = 'Something went wrong — your work is saved';
