import { chord, keysFor } from './platform';

/**
 * What the Help list says, per device (D-107, D-161).
 *
 * The keys are written the way this device writes them — ⌘D on a Mac, iPhone
 * or iPad, Ctrl+D everywhere else — and a device used by touch alone gets the
 * gestures instead: a list of keys it does not have helps nobody. Pure data,
 * so both lists are tested without a browser.
 */
export type HelpGroup = { readonly title: string; readonly rows: readonly (readonly [string, string])[] };

export function shortcutGroups(apple: boolean, touchToo: boolean): readonly HelpGroup[] {
  const keys = keysFor(apple);
  const k = (spec: string): string => chord(spec, apple);
  return [
    {
      title: 'On the canvas',
      rows: [
        ['Click', 'Select a photo, text, layer or the logo'],
        ['Double-click', 'Type into text · replace a photo or the logo'],
        ['Enter', 'The same as a double-click, for what is selected'],
        // A long press only on a screen that can be touched as well.
        [touchToo ? 'Right-click · hold on touch' : 'Right-click', 'Everything you can do to it'],
        ['Arrow keys', `Nudge what is selected (${keys.shift} for bigger steps)`],
        [']  /  [', 'Bring to front / send to back'],
        ['Esc', 'Deselect · stop typing without keeping it'],
      ],
    },
    {
      title: 'Anywhere',
      rows: [
        // A Mac's delete key is the one above Return, marked ⌫; elsewhere either key works.
        [apple ? '⌫ Delete' : 'Delete · Backspace', 'Delete what is selected'],
        [k('mod+D'), 'Duplicate what is selected'],
        [`${k('mod+Z')}  /  ${k('mod+shift+Z')}`, 'Undo / redo'],
        ['Space', 'Play / pause'],
        ['← →', 'Step one frame'],
        [k('mod+E'), 'Export'],
        ['?', 'This list'],
      ],
    },
    {
      title: 'On the timeline',
      rows: [
        ['Drag a clip', 'Move it — up or down to change layer'],
        ['Drag its dotted ends', 'Make it shorter or longer'],
        ['Click a selected clip', 'Move the playhead there'],
        ['Click a layer name', 'Add new elements to that layer'],
        [`${keys.alt} while dragging`, 'Turn snapping off'],
      ],
    },
  ];
}

/**
 * For a phone or tablet used by touch alone: what the fingers do, checked
 * against the canvas (D-161). A panel swipes down to close only on a phone,
 * where it rises from the bottom; on a tablet it is a window (D-116).
 */
export function gestureGroups(phone: boolean): readonly HelpGroup[] {
  return [
    {
      title: 'On the picture',
      rows: [
        ['Tap', 'Select a photo, text, layer or the logo'],
        ['Tap the empty picture', 'Put down what is selected'],
        ['Drag what is selected', 'Move it · drag a corner to resize it'],
        ['Double-tap', 'Type into text · replace a photo or the logo'],
        ['Press and hold', 'Everything you can do to it'],
        ['Pinch with two fingers', 'Zoom in and out, and move the view'],
        ['Double-tap the empty picture', 'Fit the picture back on the screen'],
      ],
    },
    {
      title: 'Anywhere',
      rows: [
        ['↶  ↷', 'Undo / redo'],
        phone ? ['Swipe a panel down', 'Close it'] : ['Tap outside a panel', 'Close it'],
      ],
    },
    {
      title: 'On the timeline',
      rows: [
        ['Drag a clip', 'Move it'],
        ['Drag its ends', 'Make it shorter or longer'],
        ['Press and hold a clip', 'Everything you can do to it'],
      ],
    },
  ];
}
