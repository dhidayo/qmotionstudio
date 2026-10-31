/**
 * Numbers and lists people can type into (D-159).
 *
 * "Places where you have outline on templates, the numbers cannot be modified."
 * A design's numbers — a step's 1, 2, 3, a pillar's 01, 02 — used to be made
 * from each item's place and drawn as nobody's text. They are now a text slot
 * of their own holding a pattern, and the numbers come from what was typed:
 *
 *   ''              no numbers
 *   '1' · '01'      1, 2, 3… · 01, 02, 03… (the padding is kept)
 *   '#1' · 'Step 1' the words round the number are kept
 *   'A' · 'a'       letters
 *   'I' · 'i'       Roman numerals
 *   '5, 4, 3'       taken as written; past its end the last one counts on
 *   '1, , 3'        an empty entry hides that one number
 *
 * The same file splits and joins a list text — "Plan, Shoot, Edit" — so that
 * typing into one entry on the picture rewrites just that entry.
 */

const ROMAN: readonly (readonly [number, string])[] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

function toRoman(n: number): string {
  let out = '';
  let rest = Math.max(1, Math.floor(n));
  for (const [value, symbol] of ROMAN) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

function fromRoman(text: string): number | null {
  if (!/^[IVXLCDM]+$/i.test(text)) return null;
  let n = 0;
  let rest = text.toUpperCase();
  for (const [value, symbol] of ROMAN) {
    while (rest.startsWith(symbol)) {
      n += value;
      rest = rest.slice(symbol.length);
    }
  }
  return rest.length === 0 && n > 0 ? n : null;
}

/** `seed` moved on by `by` steps in its own kind of counting. A bullet such as • repeats. */
export function stepNumber(seed: string, by: number): string {
  if (by === 0) return seed;
  const digits = /^(.*?)(\d+)(\D*)$/.exec(seed);
  if (digits) {
    const [, pre = '', num = '0', post = ''] = digits;
    return `${pre}${String(Math.max(0, Number(num) + by)).padStart(num.length, '0')}${post}`;
  }
  // Roman only for more than one letter, or a lone I, V or X: "C" alone is a letter.
  const roman = /^(.*?)\b([IVXLCDM]+|[ivxlcdm]+)\b(\W*)$/.exec(seed);
  const numeral = roman?.[2];
  if (roman && numeral !== undefined && (numeral.length > 1 || /^[IVXivx]$/.test(numeral))) {
    const value = fromRoman(numeral);
    if (value !== null) {
      const next = toRoman(value + by);
      return `${roman[1] ?? ''}${numeral === numeral.toLowerCase() ? next.toLowerCase() : next}${roman[3] ?? ''}`;
    }
  }
  const letter = /^(.*?)([A-Za-z])(\W*)$/.exec(seed);
  if (letter) {
    const [, pre = '', ch = 'A', post = ''] = letter;
    const base = ch === ch.toUpperCase() ? 65 : 97;
    const code = ((((ch.charCodeAt(0) - base + by) % 26) + 26) % 26) + base;
    return `${pre}${String.fromCharCode(code)}${post}`;
  }
  return seed;
}

/** `count` numbers from what was typed. */
export function numbers(typed: string, count: number): string[] {
  if (typed.trim().length === 0) return Array.from({ length: count }, () => '');
  const entries = typed.split(',').map((entry) => entry.trim());
  const last = entries[entries.length - 1] ?? '';
  return Array.from({ length: count }, (_, i) => {
    if (i < entries.length) return entries[i] ?? '';
    return last.length === 0 ? '' : stepNumber(last, i - entries.length + 1);
  });
}

/** A list text's entries, as a design draws them: trimmed, empty ones left out. Most lists are split at commas; quotes, which hold commas, at `|`. */
export function listEntries(text: string, separator = ','): string[] {
  return text.split(separator).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

/** How a list's entries are written back: "a, b" or "a | b". */
const joiner = (separator: string): string => (separator === ',' ? ', ' : ` ${separator} `);

/**
 * A list text with one entry changed, or taken out (`words` null).
 *
 * `numbered` lists are numbers: they are written out whole — editing the
 * third of "01" gives "01, 02, 5, 04" — and a number taken out leaves its
 * place empty, so the others keep theirs. Words cannot hold a comma, which
 * would split the entry in two.
 */
export function withListItem(
  current: string,
  item: number,
  words: string | null,
  options: { readonly numbered: boolean; readonly count: number; readonly separator?: string },
): string {
  const separator = options.separator ?? ',';
  const clean = words === null ? null : words.split(separator).join(' ').trim();
  if (options.numbered) {
    const list = numbers(current, Math.max(options.count, item + 1));
    // Unchanged stays as typed: "1" is not rewritten "1, 2, 3" by a look.
    if (list[item] === (clean ?? '')) return current;
    list[item] = clean ?? '';
    return list.join(', ');
  }
  const list = listEntries(current, separator);
  if (item < 0 || item >= list.length) return current;
  if (clean === null || clean.length === 0) list.splice(item, 1);
  else list[item] = clean;
  return list.join(joiner(separator));
}
