/**
 * Reads a typed number, or null. Spaces and apostrophes between thousands go;
 * a comma is a thousands separator when it is followed by three digits
 * ("1,250"), and a decimal mark otherwise ("4,9"); with both, the last is the
 * decimal mark ("1.234,5").
 */
export function parseNumber(text: string): number | null {
  let s = text.trim().replace(/[\s'’_]/g, '').replace(/^\u2212/, '-');
  if (s.length === 0) return null;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (comma >= 0) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
