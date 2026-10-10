import { describe, expect, it } from 'vitest';
import { dropIndex } from './useSceneReorder';
import type { SceneSpan } from '@/document/select/timeline';

const spans = [0, 3000, 6000, 9000].map((startMs, index) => ({ index, startMs, endMs: startMs + 3000 }) as unknown as SceneSpan);

describe('where a dragged scene lands (D-130)', () => {
  it('lands after every other scene whose middle it has passed', () => {
    // Scene 1 dragged to the very start: first.
    expect(dropIndex(spans, 1, 100)).toBe(0);
    // Scene 0 dragged past the middles of scenes 1 and 2: third.
    expect(dropIndex(spans, 0, 7600)).toBe(2);
    // Scene 0 dragged to the end: last.
    expect(dropIndex(spans, 0, 11_900)).toBe(3);
    // Short of the next scene's middle: where it was.
    expect(dropIndex(spans, 2, 6200)).toBe(2);
  });
});
