/**
 * The words an upload says while it reads and when it fails (D-165).
 *
 * "Upload from library doesn't upload nor replace the sample photos": on a
 * phone, several large photos can take a while to read, and a failure used to
 * be a line in a panel that may already have closed. So a button counts
 * through the photos it is reading, and a failure names the photo and why,
 * in a toast that is seen wherever the person is.
 */

export type UploadProgress = { readonly done: number; readonly total: number };

export type UploadFailure = { readonly name: string; readonly reason: string };

/** "Reading…" for one file; "Reading 2 of 5…" while several are read. */
export function readingLabel(progress: UploadProgress | null): string {
  if (progress === null || progress.total <= 1) return 'Reading…';
  return `Reading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`;
}

/** The reason, naming the file when the reason does not already. */
function described(failure: UploadFailure): string {
  return failure.reason.includes(failure.name) ? failure.reason : `${failure.name}: ${failure.reason}`;
}

/**
 * What a toast says when some files could not be read, or null when every one
 * was: "3 photos added; 1 could not be read. IMG_123.HEIC: This HEIC image
 * could not be read." The first failure's reason is given in full; the rest
 * are counted.
 */
export function failureMessage(
  added: number,
  failures: readonly UploadFailure[],
  noun: { one: string; many: string } = { one: 'photo', many: 'photos' },
): string | null {
  const first = failures[0];
  if (first === undefined) return null;
  const count = failures.length;
  if (added === 0) {
    return count === 1
      ? described(first)
      : `${count} ${noun.many} could not be read. ${described(first)}`;
  }
  const addedPart = `${added} ${added === 1 ? noun.one : noun.many} added`;
  return `${addedPart}; ${count} could not be read. ${described(first)}`;
}
