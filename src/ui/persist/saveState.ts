/**
 * Where the autosave has got to (§13).
 *
 * Its own module because both the store and the hook need the type, and the
 * store must not import the hook — `src/state` sits below `src/ui`, and a
 * cycle between them is the kind of thing that only shows up as a blank page
 * in a production build.
 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';
