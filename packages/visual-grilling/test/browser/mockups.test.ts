// Option mockups on the round page: side-by-side cards in sandboxed frames,
// picking by card, the recommended highlight, and comments and warnings from
// inside a mockup reaching the agent.

import { chromium, expect as pageExpect, type Browser, type Page } from 'playwright/test';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Sandbox } from '../support/harness.ts';

let browser: Browser;
let sandbox: Sandbox;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

afterEach(async () => {
  await sandbox?.dispose(['m1']);
});

const ROUND = `# Layout

❓ **Q1** - **Navigation**: Tabs, drawer or neither?

- **A** - Tabs

  \`\`\`html
  <nav data-anchor="tabs" class="flex gap-2 p-3"><span>Home</span><span>Settings</span></nav>
  \`\`\`

- **B** - Drawer

  \`\`\`html
  <aside class="p-3"><button data-anchor="open" class="px-2 border border-line text-fg">Open menu</button></aside>
  <script>setTimeout(() => { throw new Error('drawer broke'); });</script>
  \`\`\`

- **C** - Neither

➡️ **B** The drawer keeps the header quiet.
`;

async function open(): Promise<Page> {
  sandbox = new Sandbox('m1');
  const presented = await sandbox.cli(['present', '--agent', 'Claude Code', sandbox.writeRound('round.md', ROUND), '--no-open']);
  expect(presented.stderr).toBe('');
  const page = await browser.newPage({ viewport: { width: 640, height: 900 } });
  page.setDefaultTimeout(8_000);
  await page.goto(presented.stdout.trim());
  return page;
}

const card = (page: Page, letter: string) => page.getByRole('figure', { name: `Mockup ${letter}` });

describe('option mockups', () => {
  it('draws each mockup as a card keyed by letter, side by side, with the recommended one highlighted', async () => {
    const page = await open();
    const cards = page.getByRole('group', { name: 'Mockups' }).getByRole('figure');
    await pageExpect(cards).toHaveCount(2);
    await pageExpect(card(page, 'A').locator('figcaption')).toContainText('ATabs');
    await pageExpect(card(page, 'B').locator('figcaption')).toContainText('BDrawer');
    await pageExpect(page.frameLocator('iframe[title="Mockup A"]').locator('[data-anchor="tabs"]')).toContainText('Home');
    await pageExpect(page.frameLocator('iframe[title="Mockup B"]').getByRole('button', { name: 'Open menu' })).toBeVisible();

    // Side by side: the same row, B to the right of A.
    const [a, b] = [await card(page, 'A').boundingBox(), await card(page, 'B').boundingBox()];
    expect(a!.y).toBe(b!.y);
    expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1);

    // The recommendation points at B.
    await pageExpect(card(page, 'B')).toHaveClass(/\brecommended\b/);
    await pageExpect(card(page, 'B')).toContainText('Recommended');
    await pageExpect(card(page, 'A')).not.toHaveClass(/\brecommended\b/);
    await pageExpect(card(page, 'A')).not.toContainText('Recommended');
  });

  it('picks an option by its card, and marks the card of an accepted recommendation', async () => {
    const page = await open();
    await pageExpect(page.frameLocator('iframe[title="Mockup A"]').locator('nav')).toBeVisible();

    await card(page, 'A').locator('.stage').click();
    await pageExpect(page.getByRole('button', { name: 'Option A: Tabs' })).toHaveAttribute('aria-pressed', 'true');
    await pageExpect(card(page, 'A')).toHaveClass(/\bon\b/);
    await pageExpect(page.getByRole('button', { name: 'Pick option A' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Pick option B' }).click();
    await pageExpect(page.getByRole('button', { name: 'Option B: Drawer' })).toHaveAttribute('aria-pressed', 'true');
    await pageExpect(page.getByRole('button', { name: 'Option A: Tabs' })).toHaveAttribute('aria-pressed', 'false');
    await pageExpect(card(page, 'A')).not.toHaveClass(/\bon\b/);

    // The key and the card agree.
    await page.keyboard.press('a');
    await pageExpect(card(page, 'A')).toHaveClass(/\bon\b/);
    await page.getByRole('button', { name: 'Accept' }).click();
    await pageExpect(card(page, 'B')).toHaveClass(/\bon\b/);
    await pageExpect(card(page, 'A')).not.toHaveClass(/\bon\b/);

    await page.getByRole('tab', { name: 'Review' }).click();
    const waiting = sandbox.cli(['await', '--timeout', '30']);
    await page.getByRole('button', { name: 'Submit round' }).click();
    const result = await waiting;
    expect(result.stdout).toContain('Q1 Navigation\n   accepted: B · Drawer\n');

    // Read-only now: the cards no longer pick, and the mockups stay live to look at.
    await pageExpect(page.getByRole('button', { name: 'Pick option A' })).toBeHidden();
  });

  it('anchors a comment inside a mockup to its option, and sends its script errors as warnings', async () => {
    const page = await open();
    const frame = page.frameLocator('iframe[title="Mockup B"]');
    await pageExpect(frame.getByRole('button', { name: 'Open menu' })).toBeVisible();

    await card(page, 'B').getByRole('button', { name: 'Comment on Mockup B' }).click();
    // In comment mode the card steps aside, so the click is the mockup's to anchor, not a pick.
    await pageExpect(page.getByRole('button', { name: 'Pick option B' })).toBeHidden();
    await frame.getByRole('button', { name: 'Open menu' }).click();
    await card(page, 'B').getByRole('textbox', { name: 'Comment on button open "Open menu"' }).fill('hard to find');
    await card(page, 'B').getByRole('button', { name: 'Add comment' }).click();
    await pageExpect(card(page, 'B').locator('.pins .pin')).toHaveText(['1']);
    await pageExpect(page.getByRole('button', { name: 'Option B: Drawer' })).toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('tab', { name: 'Review' }).click();
    const waiting = sandbox.cli(['await', '--timeout', '30']);
    await page.getByRole('button', { name: 'Submit round' }).click();
    const result = await waiting;
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')[0]).toBe('submitted · round 1 · Layout · 1 warning');
    expect(result.stdout).toContain(`Q1 Navigation
   comments only, no verdict
   comment 1 · mockup B → button open "Open menu": "hard to find"
   ⚠ mockup B script error: Uncaught Error: drawer broke
`);
  });
});
