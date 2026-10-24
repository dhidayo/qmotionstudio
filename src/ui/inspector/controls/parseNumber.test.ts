import { describe, expect, it } from 'vitest';
import { parseNumber } from './parseNumber';

/** A number typed into a number element's field (D-158), as people write them. */
describe('parseNumber', () => {
  it('reads plain and signed numbers', () => {
    expect(parseNumber('1250')).toBe(1250);
    expect(parseNumber('-3.5')).toBe(-3.5);
    expect(parseNumber('−4')).toBe(-4);
    expect(parseNumber('.5')).toBe(0.5);
  });

  it('drops thousands separators', () => {
    expect(parseNumber('1,250')).toBe(1250);
    expect(parseNumber('1,250,000')).toBe(1_250_000);
    expect(parseNumber('1 250')).toBe(1250);
    expect(parseNumber('1’250')).toBe(1250);
  });

  it('reads a comma as a decimal mark where it cannot be thousands', () => {
    expect(parseNumber('4,9')).toBe(4.9);
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('1,234.5')).toBe(1234.5);
  });

  it('refuses what is not a number', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('1e5')).toBeNull();
    expect(parseNumber('$5')).toBeNull();
  });
});
