import { describe, expect, it } from 'vitest';
import { gestureGroups, shortcutGroups, type HelpGroup } from './shortcuts';

/** The Help list in the device's own terms (D-161). */

const text = (groups: readonly HelpGroup[]): string =>
  groups.flatMap((group) => [group.title, ...group.rows.flat()]).join('\n');

describe('help per device (D-161)', () => {
  it('off Apple: Ctrl, Alt and Shift, never ⌘ ⌥ ⇧', () => {
    for (const touchToo of [false, true]) {
      const all = text(shortcutGroups(false, touchToo));
      expect(all).not.toMatch(/[⌘⌥⇧⌫]/);
      expect(all).toContain('Ctrl+D');
      expect(all).toContain('Ctrl+Shift+Z');
      expect(all).toContain('Alt while dragging');
    }
  });

  it('on Apple: ⌘ ⌥ ⇧, never Ctrl or Alt', () => {
    const all = text(shortcutGroups(true, false));
    expect(all).not.toMatch(/Ctrl|\bAlt\b/);
    expect(all).toContain('⌘D');
    expect(all).toContain('⌘⇧Z');
  });

  it('mentions a long press only where the screen can be touched', () => {
    expect(text(shortcutGroups(false, false))).not.toMatch(/hold on touch/);
    expect(text(shortcutGroups(false, true))).toMatch(/hold on touch/);
  });

  it('the gestures name no keys and no mouse', () => {
    for (const phone of [true, false]) {
      const all = text(gestureGroups(phone));
      expect(all).not.toMatch(/click|key|Ctrl|[⌘⌥⇧]|Esc|Enter/i);
      expect(all).toMatch(/Tap/);
      expect(all).toMatch(/Press and hold/);
      expect(all).toMatch(/Double-tap/);
    }
  });

  it('a panel swipes down to close only on a phone, where it rises from the bottom', () => {
    expect(text(gestureGroups(true))).toMatch(/Swipe a panel down/);
    expect(text(gestureGroups(false))).not.toMatch(/Swipe/);
    expect(text(gestureGroups(false))).toMatch(/Tap outside a panel/);
  });

  it('every row has a gesture or key and what it does', () => {
    for (const groups of [shortcutGroups(true, true), shortcutGroups(false, false), gestureGroups(true), gestureGroups(false)]) {
      for (const group of groups) {
        expect(group.rows.length).toBeGreaterThan(0);
        for (const [keys, what] of group.rows) {
          expect(keys.trim().length).toBeGreaterThan(0);
          expect(what.trim().length).toBeGreaterThan(0);
        }
        // Rows are keyed by their keys in the dialog.
        expect(new Set(group.rows.map(([keys]) => keys)).size).toBe(group.rows.length);
      }
    }
  });
});
