import { describe, expect, it } from 'vitest';
import { listEntries, numbers, withListItem } from './numbering';

/** Numbers and lists people type into (D-159). */
describe('numbers', () => {
  it('counts on in the way it was typed', () => {
    expect(numbers('1', 4)).toEqual(['1', '2', '3', '4']);
    expect(numbers('01', 4)).toEqual(['01', '02', '03', '04']);
    expect(numbers('#1', 3)).toEqual(['#1', '#2', '#3']);
    expect(numbers('Step 1', 2)).toEqual(['Step 1', 'Step 2']);
    expect(numbers('A', 3)).toEqual(['A', 'B', 'C']);
    expect(numbers('i', 4)).toEqual(['i', 'ii', 'iii', 'iv']);
    expect(numbers('IV', 2)).toEqual(['IV', 'V']);
    expect(numbers('•', 3)).toEqual(['•', '•', '•']);
  });

  it('takes a list as written, and counts on past its end', () => {
    expect(numbers('5, 4, 3, 2, 1', 5)).toEqual(['5', '4', '3', '2', '1']);
    expect(numbers('1, 2, 9', 5)).toEqual(['1', '2', '9', '10', '11']);
  });

  it('shows no number for an empty pattern or entry', () => {
    expect(numbers('', 3)).toEqual(['', '', '']);
    expect(numbers('1, , 3', 3)).toEqual(['1', '', '3']);
  });
});

describe('one entry of a list', () => {
  it('rewrites just that entry of a list of words, or takes it out', () => {
    expect(listEntries('Plan, Shoot , , Edit')).toEqual(['Plan', 'Shoot', 'Edit']);
    expect(withListItem('Plan, Shoot, Edit', 1, 'Film', { numbered: false, count: 3 })).toBe('Plan, Film, Edit');
    expect(withListItem('Plan, Shoot, Edit', 1, null, { numbered: false, count: 3 })).toBe('Plan, Edit');
    expect(withListItem('Plan, Shoot, Edit', 0, 'Plan, then', { numbered: false, count: 3 })).toBe('Plan  then, Shoot, Edit');
  });

  it('writes a numbered list out whole, keeping the others in their places', () => {
    expect(withListItem('01', 2, '5', { numbered: true, count: 4 })).toBe('01, 02, 5, 04');
    expect(withListItem('01', 1, null, { numbered: true, count: 4 })).toBe('01, , 03, 04');
    // Unchanged is left as typed.
    expect(withListItem('01', 1, '02', { numbered: true, count: 4 })).toBe('01');
  });
});
