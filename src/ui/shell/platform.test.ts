import { describe, expect, it } from 'vitest';
import { capsFrom, chord, isApplePlatform, isAppleTouch, keyLabel, keysFor, undoKeys, undoSentence } from './platform';

/**
 * Which keys this device has, and whether it has a keyboard (D-161). Pure
 * parts, fed navigator-shaped values for the devices people actually use.
 */

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

const KEYBOARD = capsFrom({ finePointer: true, coarsePointer: false, sawKey: false });
const TOUCH = capsFrom({ finePointer: false, coarsePointer: true, sawKey: false });

describe('isApplePlatform (D-161)', () => {
  it('a Mac, an iPhone, and an iPad that says it is a Mac', () => {
    expect(isApplePlatform({ platform: 'MacIntel', userAgent: MAC_UA })).toBe(true);
    expect(isApplePlatform({ platform: 'iPhone', userAgent: IPHONE_UA })).toBe(true);
    expect(isApplePlatform({ platform: 'MacIntel', userAgent: MAC_UA, maxTouchPoints: 5 })).toBe(true);
  });

  it('not Windows, Android, Linux or ChromeOS', () => {
    expect(isApplePlatform({ platform: 'Win32', userAgent: WINDOWS_UA })).toBe(false);
    expect(isApplePlatform({ platform: 'Linux armv8l', userAgent: ANDROID_UA })).toBe(false);
    expect(isApplePlatform({ platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe(false);
    expect(isApplePlatform({ userAgentData: { platform: 'Chrome OS' }, platform: 'Linux x86_64' })).toBe(false);
  });

  it('trusts the client hint over the older fields, and the platform over the user agent', () => {
    expect(isApplePlatform({ userAgentData: { platform: 'macOS' }, platform: 'Win32' })).toBe(true);
    expect(isApplePlatform({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe(false);
    // An embedded Windows view that mentions Mac OS X in its user agent is still Windows.
    expect(isApplePlatform({ platform: 'Win32', userAgent: `${WINDOWS_UA} like Mac OS X` })).toBe(false);
    expect(isApplePlatform({ userAgent: IPHONE_UA })).toBe(true);
    expect(isApplePlatform(undefined)).toBe(false);
  });
});

describe('isAppleTouch', () => {
  it('an iPhone or iPad, never a Mac with a mouse', () => {
    expect(isAppleTouch({ userAgent: IPHONE_UA })).toBe(true);
    expect(isAppleTouch({ userAgent: MAC_UA, maxTouchPoints: 5 })).toBe(true);
    expect(isAppleTouch({ userAgent: MAC_UA, maxTouchPoints: 0 })).toBe(false);
    expect(isAppleTouch({ userAgent: ANDROID_UA, maxTouchPoints: 5 })).toBe(false);
  });
});

describe('chord', () => {
  it('writes a combination the way each platform does', () => {
    expect(chord('mod+shift+Z', true)).toBe('⌘⇧Z');
    expect(chord('mod+shift+Z', false)).toBe('Ctrl+Shift+Z');
    expect(chord('mod+D', false)).toBe('Ctrl+D');
    expect(chord('alt+S', true)).toBe('⌥S');
  });

  it('passes single keys through', () => {
    for (const key of ['Enter', 'Delete', ']', '[', '?']) {
      expect(chord(key, true)).toBe(key);
      expect(chord(key, false)).toBe(key);
    }
  });

  it('has no Apple symbol off Apple, and no Ctrl on Apple', () => {
    expect(Object.values(keysFor(false)).join('')).not.toMatch(/[⌘⌥⇧⌫]/);
    expect(Object.values(keysFor(true)).join('')).not.toMatch(/Ctrl|Alt|Shift/);
  });
});

describe('capsFrom', () => {
  it('a mouse or trackpad means a keyboard is very likely', () => {
    expect(capsFrom({ finePointer: true, coarsePointer: false, sawKey: false })).toEqual({ keyboard: true, touchOnly: false, touchToo: false });
    // A touch laptop, an iPad with a trackpad.
    expect(capsFrom({ finePointer: true, coarsePointer: true, sawKey: false })).toEqual({ keyboard: true, touchOnly: false, touchToo: true });
  });

  it('a finger alone is touch only, until a real key is pressed', () => {
    expect(capsFrom({ finePointer: false, coarsePointer: true, sawKey: false })).toEqual({ keyboard: false, touchOnly: true, touchToo: true });
    expect(capsFrom({ finePointer: false, coarsePointer: true, sawKey: true })).toEqual({ keyboard: true, touchOnly: false, touchToo: true });
  });
});

describe('undo and menu labels', () => {
  it('says the key with a keyboard, and the button without one', () => {
    expect(undoKeys(KEYBOARD, true)).toBe('⌘Z');
    expect(undoKeys(KEYBOARD, false)).toBe('Ctrl+Z');
    expect(undoKeys(TOUCH, true)).not.toMatch(/⌘|Ctrl/);
    expect(undoSentence(KEYBOARD, false)).toBe('Press Ctrl+Z to undo.');
    // Lower-case "undo" stays in every form: toasts are matched on it.
    expect(undoSentence(TOUCH, true)).toMatch(/undo/);
    expect(undoSentence(TOUCH, true)).not.toMatch(/⌘|Ctrl|Press/);
  });

  it('a menu shows a key only where there is a keyboard, and a double-click as a double-tap on touch', () => {
    expect(keyLabel('mod+D', KEYBOARD, true)).toBe('⌘D');
    expect(keyLabel('mod+D', KEYBOARD, false)).toBe('Ctrl+D');
    expect(keyLabel('mod+D', TOUCH, true)).toBeUndefined();
    expect(keyLabel('Delete', TOUCH, false)).toBeUndefined();
    expect(keyLabel('double-click', KEYBOARD, false)).toBe('Double-click');
    expect(keyLabel('double-click', TOUCH, false)).toBe('Double-tap');
  });
});
