import { describe, expect, it } from 'vitest';
import { TEMPLATE_MANIFEST } from './manifest';
import { DESIGN_PURPOSES, purposeOf, VIDEO_PURPOSES } from './purpose';

describe('designs by purpose (D-143)', () => {
  const listed = TEMPLATE_MANIFEST.filter((t) => t.listed !== false);

  it('gives every design and film a purpose from its own list', () => {
    for (const t of listed) {
      const list: readonly string[] = t.kind === 'ad' ? VIDEO_PURPOSES : DESIGN_PURPOSES;
      expect(list, `${t.id} → ${purposeOf(t)}`).toContain(purposeOf(t));
    }
  });

  it('leaves no purpose empty', () => {
    for (const purpose of DESIGN_PURPOSES) expect(listed.some((t) => t.kind === 'scene' && purposeOf(t) === purpose), purpose).toBe(true);
    for (const purpose of VIDEO_PURPOSES) expect(listed.some((t) => t.kind === 'ad' && purposeOf(t) === purpose), purpose).toBe(true);
  });

  it('puts the obvious ones where a person would look', () => {
    expect(purposeOf({ id: 'biz-pricing', kind: 'scene' })).toBe('Sales & prices');
    expect(purposeOf({ id: 'story-hiring', kind: 'ad' })).toBe('Hiring');
    expect(purposeOf({ id: 'el-cta-button', kind: 'scene' })).toBe('Calls to action');
  });
});
