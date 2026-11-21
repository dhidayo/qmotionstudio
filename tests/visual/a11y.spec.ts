import AxeBuilder from '@axe-core/playwright';
import { expect, test, type CDPSession, type Page } from '@playwright/test';

/**
 * D-169: "Accessibility is important to me right now. We need to clean this
 * app up."
 *
 * An audit of the editor's chrome, on a computer (1366×768) and a phone
 * (390×844), light and dark: the editor in Image and in Video, the library,
 * the inspector's tabs, the phone's toolbar and sheets, the pickers, the
 * export window and the two questions (Welcome back, Switch to Image mode?).
 *
 * Two kinds of check, on every screen. axe (@axe-core/playwright, D-172) runs
 * the WCAG 2.1 A and AA rules. Alongside it, checks made directly, for what
 * axe does not reach or judges differently: Chromium's own accessibility tree
 * (over the DevTools protocol) for names, roles and headings; computed
 * colours for contrast; boxes for touch targets; real Tab presses for focus;
 * and the running animations under reduced motion. A test fails on a serious
 * or critical finding of either. Knowingly accepted exceptions are listed in
 * ACCEPTED, and kept out of axe by AXE_EXCLUDED, each with its reason.
 * A11Y_REPORT=1 prints every finding, moderate and minor ones too.
 */

type Impact = 'critical' | 'serious' | 'moderate';
type Finding = { readonly rule: string; readonly impact: Impact; readonly where: string };

const DESKTOP = { width: 1366, height: 768 };
const PHONE = { width: 390, height: 844 };
const IMAGE = '/?template=pop-float&aspect=1:1&frozen=3000';
const VIDEO = '/?template=quick-pitch&aspect=9:16&frozen=2000';

/**
 * Knowingly accepted, each with why. Matched against "rule: where".
 */
const ACCEPTED: readonly { readonly match: RegExp; readonly reason: string }[] = [
  {
    match: /^contrast: .*data-disclaimer/,
    reason: 'The test-release note under the picture is 9px faint print by design; it is repeated in Help and goes before release.',
  },
  {
    match: /data-perf-overlay/,
    reason: 'The frame-time overlay is a developer tool: shown only in development or with ?perf, never to the people using the app.',
  },
];

/**
 * The same two exceptions, as axe excludes (D-172): the developer overlay
 * from every rule, the test-release note from contrast alone.
 */
const AXE_EXCLUDED: readonly { readonly selector: string; readonly rules?: readonly string[]; readonly reason: string }[] = [
  { selector: '[data-perf-overlay]', reason: 'The frame-time overlay is a developer tool, never shown to the people using the app.' },
  { selector: '[data-disclaimer]', rules: ['color-contrast'], reason: 'The test-release note is 9px faint print by design; it is repeated in Help and goes before release.' },
];

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// axe takes a few seconds a screen, and a test audits up to eight screens.
test.describe.configure({ timeout: 120_000 });
// Every part of the audit sets its theme, mode and windows through the dev-only handle (D-171).
test.skip(process.env['PW_PROD'] === '1', 'Reads the dev-only editor handle, which the production build rightly omits.');

/** axe's WCAG 2.1 A and AA rules over the whole page, the picture's canvas aside (it has no DOM to judge). */
async function axeFindings(page: Page): Promise<Finding[]> {
  let builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  for (const excluded of AXE_EXCLUDED) if (excluded.rules === undefined) builder = builder.exclude(excluded.selector);
  const { violations } = await builder.analyze();
  const out: Finding[] = [];
  for (const violation of violations) {
    for (const node of violation.nodes) {
      const target = node.target.map(String).join(' ');
      if (AXE_EXCLUDED.some((e) => e.rules?.includes(violation.id) === true && node.html.includes(e.selector.slice(1, -1)))) continue;
      const impact = node.impact ?? violation.impact;
      out.push({
        rule: `axe ${violation.id}`,
        impact: impact === 'critical' || impact === 'serious' ? impact : 'moderate',
        where: `${target} ${node.html.slice(0, 120)}`,
      });
    }
  }
  return out;
}

type Handle = { __motionStudio: { editor: { getState: () => { setTheme: (t: string) => void } } } };

async function open(page: Page, url: string, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.evaluate((t) => { (globalThis as unknown as Handle).__motionStudio.editor.getState().setTheme(t); }, theme);
  await page.waitForTimeout(600);
}

const INTERACTIVE = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'slider', 'checkbox', 'radio', 'tab', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'switch', 'spinbutton', 'listbox', 'option', 'treeitem',
]);

/** Names, roles and headings, from Chromium's own accessibility tree. */
async function treeFindings(cdp: CDPSession): Promise<Finding[]> {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree') as {
    nodes: { ignored: boolean; role?: { value: string }; name?: { value: string }; properties?: { name: string; value: { value: unknown } }[]; backendDOMNodeId?: number }[];
  };
  const out: Finding[] = [];
  const describe = async (id: number | undefined): Promise<string> => {
    if (id === undefined) return '?';
    try {
      const { node } = await cdp.send('DOM.describeNode', { backendNodeId: id }) as { node: { localName: string; attributes?: string[] } };
      const attrs = node.attributes ?? [];
      const pairs: string[] = [];
      for (let i = 0; i < attrs.length; i += 2) {
        const key = attrs[i] ?? '';
        if (key === 'class' || key === 'style' || key === 'd') continue;
        pairs.push(`${key}="${(attrs[i + 1] ?? '').slice(0, 40)}"`);
      }
      return `<${node.localName} ${pairs.join(' ')}>`;
    } catch { return '?'; }
  };
  let lastLevel = 0;
  for (const node of nodes) {
    if (node.ignored) continue;
    const role = node.role?.value ?? '';
    const name = (node.name?.value ?? '').trim();
    if ((INTERACTIVE.has(role) || role === 'dialog' || role === 'img' || role === 'toolbar' || role === 'radiogroup' || role === 'tablist') && name === '') {
      const disabled = node.properties?.some((p) => p.name === 'disabled' && p.value.value === true) === true;
      out.push({ rule: 'name', impact: disabled || role === 'img' || role === 'tablist' || role === 'radiogroup' ? 'serious' : 'critical', where: `${role} ${await describe(node.backendDOMNodeId)}` });
    }
    if (role === 'heading') {
      const level = Number(node.properties?.find((p) => p.name === 'level')?.value.value ?? 0);
      if (lastLevel > 0 && level > lastLevel + 1) out.push({ rule: 'heading-order', impact: 'moderate', where: `h${lastLevel} → h${level} "${name}"` });
      lastLevel = level;
    }
  }
  return out;
}

/** Contrast of every piece of visible chrome text against what is behind it (WCAG 1.4.3, AA). */
async function contrastFindings(page: Page): Promise<Finding[]> {
  const found = await page.evaluate(() => {
    type Rgba = [number, number, number, number];
    const parse = (c: string): Rgba | null => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m?.[1]) return null;
      const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
    };
    const over = (top: Rgba, under: Rgba): Rgba => {
      const a = top[3];
      return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
    };
    const lum = ([r, g, b]: Rgba): number => {
      const ch = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const background = (el: Element): Rgba | null => {
      const layers: Rgba[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== 'none') return null;
        const bg = parse(style.backgroundColor);
        if (bg && bg[3] > 0) {
          layers.push(bg);
          if (bg[3] >= 1) break;
        }
      }
      let colour: Rgba = [255, 255, 255, 1];
      for (const layer of layers.reverse()) colour = over(layer, colour);
      return colour;
    };
    const describe = (el: Element): string => {
      const data = [...el.attributes].filter((a) => a.name.startsWith('data-') || a.name === 'aria-label').map((a) => `${a.name}="${a.value.slice(0, 24)}"`);
      let up = el.parentElement;
      for (let i = 0; i < 4 && up && data.length === 0; i++, up = up.parentElement) {
        for (const a of up.attributes) if (a.name.startsWith('data-') || a.name === 'role') data.push(`^${a.name}="${a.value.slice(0, 24)}"`);
      }
      return `<${el.localName} ${data.join(' ')}> "${el.textContent.trim().slice(0, 30)}"`;
    };
    const out: { where: string; ratio: number; need: number }[] = [];
    const seen = new Set<string>();
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('canvas, svg, [data-artboard-stage], [data-welcome-picture]')) continue;
      const text = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0);
      if (!text) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1 || box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      // Inactive controls are exempt (WCAG 1.4.3), as is anything faded on purpose.
      if (el.closest(':disabled, [aria-disabled="true"], [inert]')) continue;
      let faded = false;
      for (let node: Element | null = el; node; node = node.parentElement) if (Number(getComputedStyle(node).opacity) < 1) { faded = true; break; }
      if (faded) continue;
      const bg = background(el);
      const fg = parse(style.color);
      if (!bg || !fg) continue;
      const ink = over(fg, bg);
      const [a, b] = [lum(ink), lum(bg)];
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      if (ratio + 0.005 < need) {
        const where = describe(el);
        if (seen.has(where)) continue;
        seen.add(where);
        out.push({ where: `${where} ${style.color} on rgb(${bg.slice(0, 3).map(Math.round).join(',')})`, ratio, need });
      }
    }
    return out;
  });
  return found.map((f) => ({ rule: 'contrast', impact: 'serious' as const, where: `${f.where} = ${f.ratio.toFixed(2)}:1, needs ${f.need}:1` }));
}

/** Targets on a phone: the primary controls 44px (Apple's and WCAG 2.5.5's size), everything else at least 24px (2.5.8, AA). */
async function targetFindings(page: Page): Promise<Finding[]> {
  const found = await page.evaluate(() => {
    const PRIMARY = '[data-phone-toolbar], [data-phone-scene-row], [data-phone-transport], header, [role="dialog"] > div > div:first-child';
    const out: { where: string; w: number; h: number; primary: boolean }[] = [];
    const controls = document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="radio"], [role="switch"], [role="menuitem"], [role="checkbox"], [role="option"]');
    for (const el of controls) {
      if (el.closest(':disabled, [aria-disabled="true"], [inert], [aria-hidden="true"]')) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1 || box.bottom < 0 || box.top > innerHeight) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
      // A range's thumb is its target, sized by the browser; a link inside a sentence is exempt (2.5.8).
      if (el instanceof HTMLInputElement && (el.type === 'range' || el.type === 'file')) continue;
      if (el.localName === 'a' && style.display === 'inline') continue;
      const primary = el.closest(PRIMARY) !== null;
      const name = el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 24);
      const tag = [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `${a.name}="${a.value.slice(0, 20)}"`).join(' ');
      if ((primary && Math.round(box.height) < 44) || Math.round(box.height) < 24 || Math.round(box.width) < 24) {
        out.push({ where: `<${el.localName} ${tag}> "${name}"`, w: Math.round(box.width), h: Math.round(box.height), primary });
      }
    }
    return out;
  });
  return found.map((f) => ({ rule: 'target-size', impact: 'serious' as const, where: `${f.where} ${f.w}×${f.h}${f.primary ? ' (primary)' : ''}` }));
}

/** Tab through the page: every stop must show where focus is (WCAG 2.4.7). */
async function focusFindings(page: Page, stops = 40): Promise<Finding[]> {
  const out: Finding[] = [];
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); });
  const seen = new Set<string>();
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press('Tab');
    const result = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const focused = getComputedStyle(el);
      const ring = (focused.outlineStyle !== 'none' && parseFloat(focused.outlineWidth) > 0) || focused.boxShadow !== 'none';
      const tag = [...el.attributes].filter((a) => a.name.startsWith('data-') || a.name === 'aria-label' || a.name === 'role').map((a) => `${a.name}="${a.value.slice(0, 20)}"`).join(' ');
      const where = `<${el.localName} ${tag}> "${el.textContent.trim().slice(0, 24)}"`;
      if (ring) return { where, ok: true };
      // A visible change of border or background stands for a ring; compare with the element unfocused.
      const before = { border: focused.borderColor, bg: focused.backgroundColor, color: focused.color };
      (el as HTMLElement).blur();
      const plain = getComputedStyle(el);
      const changed = plain.borderColor !== before.border || plain.backgroundColor !== before.bg || plain.color !== before.color;
      (el as HTMLElement).focus({ focusVisible: true } as FocusOptions);
      return { where, ok: changed };
    });
    if (!result) continue;
    if (seen.has(result.where)) break;
    seen.add(result.where);
    if (!result.ok) out.push({ rule: 'focus-visible', impact: 'serious', where: result.where });
  }
  return out;
}

/** Under reduced motion, nothing in the chrome keeps moving (§13): no running CSS animation outside the picture. */
async function motionFindings(page: Page): Promise<Finding[]> {
  const running = await page.evaluate(() => document.getAnimations()
    .filter((a) => a.playState === 'running')
    .map((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target;
      const timing = a.effect?.getComputedTiming();
      return { target: target instanceof Element ? `<${target.localName} ${[...target.attributes].filter((x) => x.name.startsWith('data-')).map((x) => x.name).join(' ')}>` : '?', duration: Number(timing?.duration ?? 0) };
    })
    .filter((a) => a.duration > 1));
  return running.map((r) => ({ rule: 'reduced-motion', impact: 'serious' as const, where: `${r.target} ${r.duration}ms` }));
}

/** A modal window keeps focus inside it (WCAG 2.1.2 the other way round: no escape into the page behind). */
async function trapFindings(page: Page, dialogName: string | RegExp): Promise<Finding[]> {
  const dialog = page.getByRole('dialog', { name: dialogName });
  const out: Finding[] = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const inside = await dialog.evaluate((el) => el.contains(document.activeElement));
    if (!inside) {
      out.push({ rule: 'focus-trap', impact: 'serious', where: `Tab ${i + 1} left “${String(dialogName)}”` });
      break;
    }
  }
  return out;
}

async function audit(page: Page, label: string, opts: { phone?: boolean; focus?: boolean } = {}): Promise<Finding[]> {
  const cdp = await page.context().newCDPSession(page);
  const findings = [
    ...await axeFindings(page),
    ...await treeFindings(cdp),
    ...await contrastFindings(page),
    ...(opts.phone === true ? await targetFindings(page) : []),
    ...(opts.focus === true ? await focusFindings(page) : []),
  ];
  await cdp.detach();
  return report(label, findings);
}

function report(label: string, findings: readonly Finding[]): Finding[] {
  const open = findings.filter((f) => !ACCEPTED.some((a) => a.match.test(`${f.rule}: ${f.where}`)));
  if (process.env['A11Y_REPORT'] !== undefined && open.length > 0) {
    console.log(`\n[${label}]\n${open.map((f) => `  ${f.impact} ${f.rule}: ${f.where}`).join('\n')}`);
  }
  return open.filter((f) => f.impact !== 'moderate');
}

function expectClean(findings: readonly Finding[]): void {
  expect(findings.map((f) => `${f.rule}: ${f.where}`)).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`on a computer, ${theme}`, () => {
    test.use({ viewport: DESKTOP });

    test('the editor in Image: library, inspector tabs and focus', async ({ page }) => {
      await open(page, IMAGE, theme);
      const all: Finding[] = [...await audit(page, `desktop ${theme} image`, { focus: true })];
      const tabs = page.getByRole('tablist').first().getByRole('tab');
      for (const name of ['Elements', 'Photos', 'Text', 'Effects', 'Style']) {
        await tabs.filter({ hasText: name }).first().click();
        await page.waitForTimeout(250);
        all.push(...await audit(page, `desktop ${theme} tab ${name}`));
      }
      expectClean(all);
    });

    test('the editor in Video, and its pickers', async ({ page }) => {
      await open(page, VIDEO, theme);
      const all: Finding[] = [...await audit(page, `desktop ${theme} video`)];
      for (const [button, dialog] of [
        [/^\+ Element/, /^Add an element/],
        [/^\+ Sound/, /sound/i],
        [/^\+ Effect/, /effect/i],
      ] as const) {
        await page.getByRole('button', { name: button }).first().click();
        const window = page.getByRole('dialog', { name: dialog }).first();
        await expect(window).toBeVisible();
        await page.waitForTimeout(300);
        all.push(...await audit(page, `desktop ${theme} ${String(dialog)}`), ...await trapFindings(page, dialog));
        await page.keyboard.press('Escape');
        await expect(window).toHaveCount(0);
      }
      expectClean(all);
    });

    test('the export window and the Switch to Image question', async ({ page }) => {
      await open(page, VIDEO, theme);
      const all: Finding[] = [];
      await page.getByRole('button', { name: 'Export', exact: true }).first().click();
      const exportWindow = page.getByRole('dialog').first();
      await expect(exportWindow).toBeVisible();
      all.push(...await audit(page, `desktop ${theme} export`), ...await trapFindings(page, /Export/));
      await page.keyboard.press('Escape');
      await expect(exportWindow).toHaveCount(0);

      await page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Image', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Switch to Image mode?' })).toBeVisible();
      all.push(...await audit(page, `desktop ${theme} switch`), ...await trapFindings(page, 'Switch to Image mode?'));
      expectClean(all);
    });

    test('Welcome back', async ({ page, context }) => {
      await open(page, IMAGE, theme);
      await page.getByRole('button', { name: 'Video', exact: true }).click();
      await page.getByTitle('Add a text overlay').click();
      await expect(page.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'saved', { timeout: 10_000 });
      const again = await context.newPage();
      await again.emulateMedia({ colorScheme: theme });
      await again.goto('/');
      const dialog = again.getByRole('dialog', { name: 'Welcome back' });
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      expectClean([...await audit(again, `desktop ${theme} welcome`), ...await trapFindings(again, 'Welcome back')]);
    });
  });

  test.describe(`on a phone, ${theme}`, () => {
    test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

    test('the editor in Image and Video, the toolbar and a selection row', async ({ page }) => {
      await open(page, IMAGE, theme);
      const all: Finding[] = [...await audit(page, `phone ${theme} image`, { phone: true })];
      const canvas = await page.locator('canvas').boundingBox();
      if (!canvas) throw new Error('no canvas');
      await page.touchscreen.tap(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      await expect(page.locator('[data-phone-toolbar="selection"]')).toBeVisible();
      all.push(...await audit(page, `phone ${theme} selection`, { phone: true }));

      await open(page, VIDEO, theme);
      await page.locator('[data-phone-scene="1"]').tap();
      await expect(page.locator('[data-phone-scene-row="1"]')).toBeVisible();
      all.push(...await audit(page, `phone ${theme} video scene`, { phone: true }));
      expectClean(all);
    });

    test('the sheets and pickers', async ({ page }) => {
      await open(page, VIDEO, theme);
      const all: Finding[] = [];
      const main = page.locator('[data-phone-toolbar="main"]');
      for (const tool of ['Templates', 'Add', 'Photos', 'Text', 'Effects', 'Style']) {
        await main.getByRole('button', { name: tool, exact: true }).tap();
        await page.waitForTimeout(350);
        all.push(...await audit(page, `phone ${theme} sheet ${tool}`, { phone: true }));
        await page.getByRole('dialog').last().getByRole('button', { name: /^Close/ }).first().tap();
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
      await page.locator('[data-phone-elements]').tap();
      await page.waitForTimeout(300);
      all.push(...await audit(page, `phone ${theme} elements`, { phone: true }));
      await page.getByRole('dialog').last().getByRole('button', { name: /^Close/ }).first().tap();

      await main.getByRole('button', { name: 'Add', exact: true }).tap();
      await page.locator('[data-add="element"]').tap();
      await expect(page.getByRole('dialog', { name: 'Add an element' })).toBeVisible();
      await page.waitForTimeout(300);
      all.push(...await audit(page, `phone ${theme} element picker`, { phone: true }));
      expectClean(all);
    });

    test('the export window, Switch to Image mode? and Welcome back', async ({ page, context }) => {
      await open(page, VIDEO, theme);
      const all: Finding[] = [];
      await page.getByRole('button', { name: 'Export', exact: true }).tap();
      await expect(page.getByRole('dialog', { name: /Export/ })).toBeVisible();
      await page.waitForTimeout(300);
      all.push(...await audit(page, `phone ${theme} export`, { phone: true }));
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: /Export/ })).toHaveCount(0);

      await page.locator('[data-phone-menu]').tap();
      await page.getByRole('button', { name: /^Image/, pressed: false }).first().tap();
      await expect(page.getByRole('dialog', { name: 'Switch to Image mode?' })).toBeVisible();
      all.push(...await audit(page, `phone ${theme} switch`, { phone: true }));
      await page.getByRole('button', { name: 'Stay in Video' }).tap();

      // Some work, written to disk: a fresh tab asks Welcome back.
      await page.locator('[data-phone-toolbar="main"]').getByRole('button', { name: 'Add', exact: true }).tap();
      await page.getByRole('group', { name: 'Add' }).locator('[data-add="text"]').tap();
      await page.waitForTimeout(2_000);
      const again = await context.newPage();
      await again.emulateMedia({ colorScheme: theme });
      await again.goto('/');
      await expect(again.getByRole('dialog', { name: 'Welcome back' })).toBeVisible({ timeout: 10_000 });
      all.push(...await audit(again, `phone ${theme} welcome`, { phone: true }));
      expectClean(all);
    });
  });
}

test.describe('reduced motion', () => {
  test.use({ viewport: DESKTOP });

  test('nothing in the chrome keeps moving', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, IMAGE, 'light');
    await page.getByRole('button', { name: /^\+ Element/ }).first().click();
    await page.waitForTimeout(400);
    const all = report('reduced motion', [...await motionFindings(page)]);
    await expect(page.locator('canvas[data-playing]')).toHaveCount(0);
    expectClean(all);
  });
});

/*
 * The landing page and the account menu (D-175): the same audit, both themes,
 * on a computer and a phone. The landing page is for someone not signed in,
 * so it starts from nothing; its sections rise into place as they come on
 * screen, so the page is scrolled through first and every word is judged.
 */
async function openLanding(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript((t) => { localStorage.setItem('ms.theme', t); }, theme);
  await page.goto('/');
  await page.waitForSelector('.lp-hero');
  for (let y = 0; y < 14_000; y += 600) {
    await page.evaluate((top) => { window.scrollTo(0, top); }, y);
    await page.waitForTimeout(40);
  }
  await page.waitForSelector('[data-design-link]');
  await page.evaluate(() => { window.scrollTo(0, 0); });
  await page.waitForTimeout(900);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`the landing page, ${theme}`, () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('on a computer', async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await openLanding(page, theme);
      expectClean(await audit(page, `landing desktop ${theme}`, { focus: true }));
    });

    test('on a phone', async ({ page }) => {
      await page.setViewportSize(PHONE);
      await openLanding(page, theme);
      expectClean(await audit(page, `landing phone ${theme}`, { phone: true }));
    });
  });

  test.describe(`the account menu, ${theme}`, () => {
    test('on a computer', async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await open(page, IMAGE, theme);
      await page.getByRole('button', { name: 'Account' }).click();
      await expect(page.getByRole('dialog', { name: 'Account' })).toBeVisible();
      expectClean([...await audit(page, `account desktop ${theme}`), ...await trapFindings(page, 'Account')]);
    });

    test('on a phone', async ({ page }) => {
      await page.setViewportSize(PHONE);
      await open(page, IMAGE, theme);
      await page.getByRole('button', { name: 'Account' }).click();
      await expect(page.getByRole('dialog', { name: 'Account' })).toBeVisible();
      expectClean([...await audit(page, `account phone ${theme}`, { phone: true }), ...await trapFindings(page, 'Account')]);
    });
  });
}
