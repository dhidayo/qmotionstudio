import { describe, expect, it } from 'vitest';
import {
  availableTracks, libraryMediaId, libraryTrackFor, MUSIC_LIBRARY, url,
} from './library';

/**
 * §10's bundled track library.
 *
 * "Licensing is my responsibility, not yours — leave the library as an empty
 * manifest with a documented shape and three placeholder tracks."
 *
 * So these assert the *shape and the emptiness*, and are written to stay true
 * once real tracks are licensed: nothing here says "three placeholders", it
 * says every entry declares its licence and nothing claims to be available
 * without one.
 */
describe('the music library ships empty and documented', () => {
  it('has the three placeholders §10 asks for', () => {
    expect(MUSIC_LIBRARY).toHaveLength(3);
  });

  it('offers nothing yet, because nothing is licensed yet', () => {
    expect(availableTracks()).toEqual([]);
  });

  it('gives every entry a licence note a reader could check', () => {
    for (const track of MUSIC_LIBRARY) {
      expect(track.licence.length, track.id).toBeGreaterThan(0);
    }
  });

  it('never marks a track available without saying what licenses it', () => {
    // The invariant that has to survive real tracks being added.
    for (const track of MUSIC_LIBRARY) {
      if (track.available) expect(track.licence).not.toMatch(/Not yet licensed/);
    }
  });

  it('uses unique, url-safe ids', () => {
    const ids = MUSIC_LIBRARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('namespaces media ids so a track cannot collide with an upload', () => {
    const track = MUSIC_LIBRARY[0];
    if (!track) throw new Error('expected a track');

    const mediaId = libraryMediaId(track);
    expect(mediaId).toBe(`music:${track.id}`);
    expect(libraryTrackFor(mediaId)).toBe(track);
  });

  it('does not claim someone else’s media id', () => {
    expect(libraryTrackFor('upload:abc')).toBeUndefined();
    expect(libraryTrackFor('sample:dune')).toBeUndefined();
    expect(libraryTrackFor('music:nope')).toBeUndefined();
  });

  it('resolves a fetchable path under public/music', () => {
    const track = MUSIC_LIBRARY[0];
    if (!track) throw new Error('expected a track');
    expect(url(track)).toBe(`/music/${track.id}.${track.ext}`);
  });
});
