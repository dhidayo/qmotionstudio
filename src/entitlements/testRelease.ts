/**
 * The open test release (D-122).
 *
 * "As product is in development and test mode, add on toggle for FREE and PRO
 * to test for now. I can take it out later." While this is true the public
 * site carries the Free/Pro switch (top bar; the phone's menu), so testers can
 * try both. Set it to false — or delete this file and its two imports — and
 * the public build is Free-only again (D-093), with nothing else to change.
 *
 * A file of its own, free of `import.meta.env`, so the browser tests can read
 * the same answer the build did.
 */
export const OPEN_TEST_RELEASE: boolean = true;
