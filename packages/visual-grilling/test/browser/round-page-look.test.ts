// The round page's flow in Chromium: keys, swipes, the Review step, read-only after
// submit, the past-round switcher, the design tree and the theme toggle.

import { chromium, expect as pageExpect, type Browser, type Page } from 'playwright/test';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Sandbox, STORAGE_ROUND } from '../support/harness.ts';

let browser: Browser;
let sandbox: Sandbox;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

afterEach(async () => {
  await sandbox?.dispose(['look']);
});

const TREE = [
  '```design-tree',
  '- [x] Channel: a browser beside the terminal',
  '  - [ ] Where rounds live Q1',
  '  - [ ] Runtime Q2',
  '- [ ] Retention Q3',
  '```',
  '',
].join('\n');

/** The storage round with a design tree after its title. */
const TREE_ROUND = STORAGE_ROUND.replace('# Storage choices\n\n', `# Storage choices\n\n${TREE}`);

async function present(source: string, name = 'round.md'): Promise<string> {
  const result = await sandbox.cli(['present', '--agent', 'Claude Code', sandbox.writeRound(name, source), '--no-open']);
  expect(result.stderr).toBe('');
  return result.stdout.trim();
}

async function open(url: string, viewport = { width: 1280, height: 800 }): Promise<Page> {
  const page = await browser.newPage({ viewport });
  await page.goto(url);
  await pageExpect(page.getByRole('heading', { level: 1 })).toContainText('Round');
  return page;
}

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const submitButton = (page: Page) => page.getByRole('button', { name: /^Submit round/ });

describe('round page keys', () => {
  it('answers and submits a whole round from the keyboard', async () => {
    sandbox = new Sandbox('look');
    const page = await open(await present(STORAGE_ROUND));

    // Q1: Enter accepts the recommendation.
    await page.keyboard.press('Enter');
    await pageExpect(region(page, 'Q1').getByRole('button', { name: /^Accept/ })).toHaveAttribute('aria-pressed', 'true');
    await pageExpect(page.getByText('1 / 6')).toBeVisible();

    // J moves on; an option's letter picks it.
    await page.keyboard.press('j');
    await pageExpect(region(page, 'Q2')).toBeVisible();
    await page.keyboard.press('b');
    await pageExpect(page.getByRole('button', { name: 'Option B: Bun' })).toHaveAttribute('aria-pressed', 'true');

    // W opens the answer box and focuses it; keys typed there are text, not commands.
    await page.keyboard.press('j');
    await page.keyboard.press('w');
    const answer = page.getByRole('textbox', { name: 'Your answer to Q3' });
    await pageExpect(answer).toBeFocused();
    await page.keyboard.type('just keep them');
    await pageExpect(answer).toHaveValue('just keep them');
    await pageExpect(region(page, 'Q3')).toBeVisible();
    await page.keyboard.press('Escape');
    await pageExpect(answer).not.toBeFocused();

    // U marks unsure; K moves back.
    await page.keyboard.press('j');
    await page.keyboard.press('u');
    await pageExpect(region(page, 'Q4').getByRole('button', { name: /^Unsure/ })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('j');
    await page.keyboard.press('j');
    await pageExpect(region(page, 'Q6')).toBeVisible();
    await page.keyboard.press('k');
    await pageExpect(region(page, 'Q5')).toBeVisible();

    // ⌘↵ opens the Review step first, then sends from it.
    await page.keyboard.press('ControlOrMeta+Enter');
    await pageExpect(region(page, 'Review')).toBeVisible();
    await pageExpect(region(page, 'Review')).toContainText('2 unanswered questions will be sent as unsure.');

    const waiting = sandbox.cli(['await', '--timeout', '30']);
    await page.keyboard.press('ControlOrMeta+Enter');
    await pageExpect(page.getByRole('status')).toHaveText('Round submitted · waiting for the next round');
    const result = await waiting;
    expect(result.stdout.slice(result.stdout.indexOf('summary:'))).toBe(`summary:
Q1 Where are rounds saved? · accepted A
Q2 Which runtime? · picked B
Q3 Retention? · own answer
Q4 Submit control placement · unsure
Q5 Tree column · no answer
Q6 Retry policy · no answer
`);
  });

  it('keeps Enter for accepting after a step is chosen with the mouse', async () => {
    sandbox = new Sandbox('look');
    const page = await open(await present(STORAGE_ROUND));

    await page.getByRole('tab', { name: 'Q2' }).click();
    await page.keyboard.press('Enter');
    await pageExpect(region(page, 'Q2').getByRole('button', { name: /^Accept/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /^Next/ }).click();
    await page.keyboard.press('Enter');
    await pageExpect(region(page, 'Q3').getByRole('button', { name: /^Accept/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('round page swipes', () => {
  /** A one-finger swipe across the question panel, `dx` pixels sideways. */
  async function touchSwipe(page: Page, dx: number): Promise<void> {
    await page.locator('.step-host').evaluate((host, dx) => {
      const box = host.getBoundingClientRect();
      const at = (x: number) =>
        new Touch({ identifier: 1, target: host, clientX: x, clientY: box.top + 40 });
      const x = box.left + box.width / 2;
      host.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [at(x)], changedTouches: [at(x)] }));
      host.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [at(x + dx)] }));
    }, dx);
  }

  it('moves one question per trackpad or touch swipe, and ignores a steep or short one', async () => {
    sandbox = new Sandbox('look');
    const page = await open(await present(STORAGE_ROUND));
    const header = region(page, 'Q1').locator('header');
    await pageExpect(header).toBeVisible();
    // An unanswered question shows its state by its icon alone.
    await pageExpect(header).not.toContainText('No answer');

    // A trackpad swipe, momentum and all, moves one question.
    await page.mouse.move(640, 300);
    for (let i = 0; i < 12; i++) await page.mouse.wheel(30, 0);
    await pageExpect(region(page, 'Q2')).toBeVisible();
    await page.waitForTimeout(400);
    await page.mouse.wheel(-120, 0);
    await pageExpect(region(page, 'Q1')).toBeVisible();

    // A mostly vertical wheel scrolls rather than swipes.
    await page.waitForTimeout(400);
    await page.mouse.wheel(60, 200);
    await page.waitForTimeout(100);
    await pageExpect(region(page, 'Q1')).toBeVisible();

    await touchSwipe(page, -120);
    await pageExpect(region(page, 'Q2')).toBeVisible();
    await touchSwipe(page, 30);
    await pageExpect(region(page, 'Q2')).toBeVisible();
    await touchSwipe(page, 120);
    await pageExpect(region(page, 'Q1')).toBeVisible();
  });
});

describe('Review step', () => {
  it('lists every answer with an Edit link, warns about unanswered ones, and turns read-only after submit', async () => {
    sandbox = new Sandbox('look');
    const page = await open(await present(STORAGE_ROUND));

    await page.getByRole('button', { name: /^Accept/ }).click();
    await page.getByRole('tab', { name: 'Q2' }).click();
    await page.getByRole('button', { name: 'Option B: Bun' }).click();
    await page.getByRole('tab', { name: 'Review' }).click();

    const review = region(page, 'Review');
    const rows = review.getByRole('listitem');
    await pageExpect(rows).toHaveCount(6);
    await pageExpect(rows.nth(0)).toContainText('Where are rounds saved?');
    await pageExpect(rows.nth(0)).toContainText('Accepted A: Session folder in $TMPDIR');
    await pageExpect(rows.nth(1)).toContainText('Picked B: Bun');
    await pageExpect(rows.nth(2)).toContainText('No answer');
    await pageExpect(review).toContainText('4 unanswered questions will be sent as unsure.');

    // Edit goes back to the question.
    await review.getByRole('button', { name: 'Edit Q3' }).click();
    await pageExpect(region(page, 'Q3')).toBeVisible();
    await page.getByRole('button', { name: /^Unsure/ }).click();
    await page.getByRole('tab', { name: 'Review' }).click();
    await pageExpect(review).toContainText('3 unanswered questions will be sent as unsure.');

    // The bar's Submit sends from the Review step.
    const waiting = sandbox.cli(['await', '--timeout', '30']);
    await submitButton(page).click();
    await pageExpect(page.getByRole('status')).toHaveText('Round submitted · waiting for the next round');
    expect((await waiting).stdout).toMatch(/^submitted · round 1 · Storage choices/);

    // Read-only: no warning, no Edit, Submit off, answer controls disabled, keys ignored.
    await pageExpect(review).not.toContainText('will be sent as unsure');
    await pageExpect(review.getByRole('button', { name: 'Edit Q1' })).toHaveCount(0);
    await pageExpect(page.getByRole('button', { name: /^Submitted/ })).toBeDisabled();
    await review.getByRole('button', { name: 'View Q1' }).click();
    const accept = region(page, 'Q1').getByRole('button', { name: /^Accept/ });
    await pageExpect(accept).toHaveAttribute('aria-pressed', 'true');
    await pageExpect(accept).toBeDisabled();
    await page.keyboard.press('u');
    await page.keyboard.press('b');
    await pageExpect(region(page, 'Q1').getByRole('button', { name: /^Unsure/ })).toHaveCount(0);
    await pageExpect(page.getByRole('button', { name: 'Option B: The repository' })).toHaveAttribute('aria-pressed', 'false');
    await pageExpect(accept).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('past rounds', () => {
  it('opens past rounds read-only with their answers, and keeps drafts of the open round', async () => {
    sandbox = new Sandbox('look');
    const url = await present(STORAGE_ROUND);
    const page = await open(url);

    // Round 1: pick B on Q2 and submit.
    await page.getByRole('tab', { name: 'Q2' }).click();
    await page.getByRole('button', { name: 'Option B: Bun' }).click();
    await page.getByRole('tab', { name: 'Review' }).click();
    await submitButton(page).click();
    await pageExpect(page.getByRole('status')).toHaveText('Round submitted · waiting for the next round');

    // Round 2 is answered in the terminal once round 3 arrives.
    await present('# Follow-ups\n\n❓ **Q7** - **Anything else?**: Last one.\n\n➡️ No.\n', 'round-2.md');
    await pageExpect(page.getByRole('heading', { level: 1 })).toHaveText('Round 2 · Follow-ups');
    await present('# Wrap-up\n\n❓ **Q8** - **Ship it?**: Ready?\n\n- **A** - Yes\n- **B** - No\n\n➡️ **A**\n', 'round-3.md');
    await pageExpect(page.getByRole('heading', { level: 1 })).toHaveText('Round 3 · Wrap-up');

    // A draft on the open round.
    await page.getByRole('button', { name: 'Option B: No' }).click();

    await page.getByRole('button', { name: 'Round 3', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Rounds' });
    await pageExpect(menu.getByRole('menuitemradio')).toHaveCount(3);
    await pageExpect(menu.getByRole('menuitemradio').nth(0)).toContainText('Current round');
    await pageExpect(menu.getByRole('menuitemradio').nth(1)).toContainText('Answered in the terminal');
    await pageExpect(menu.getByRole('menuitemradio').nth(2)).toContainText('Submitted');
    await menu.getByRole('menuitemradio', { name: /Round 1/ }).click();

    await pageExpect(page.getByRole('heading', { level: 1 })).toHaveText('Round 1 · Storage choices');
    await pageExpect(page.getByText('Round 1 was submitted. It is read-only.')).toBeVisible();
    await pageExpect(submitButton(page)).toHaveCount(0);
    await page.getByRole('tab', { name: 'Q2' }).click();
    const picked = page.getByRole('button', { name: 'Option B: Bun' });
    await pageExpect(picked).toHaveAttribute('aria-pressed', 'true');
    await pageExpect(picked).toBeDisabled();

    // Round 2 was answered in the terminal.
    await page.getByRole('button', { name: 'Round 1', exact: true }).click();
    await page.getByRole('menuitemradio', { name: /Round 2/ }).click();
    await pageExpect(page.getByText('Round 2 was answered in the terminal. It is read-only.')).toBeVisible();

    // Back to the open round, with its draft.
    await page.getByRole('button', { name: 'Back to round 3' }).click();
    await pageExpect(page.getByRole('heading', { level: 1 })).toHaveText('Round 3 · Wrap-up');
    await pageExpect(page.getByRole('button', { name: 'Option B: No' })).toHaveAttribute('aria-pressed', 'true');
    await pageExpect(submitButton(page)).toBeEnabled();
  });

  it('keeps a past round\'s comments pinned in place, read-only', async () => {
    sandbox = new Sandbox('look');
    const table = [
      '❓ **Q1** - **Tools**: Compare them.',
      '',
      '```table id=compare title="Compare"',
      '| Tool | Install |',
      '|---|---|',
      '| CLI | brew |',
      '```',
      '',
      '➡️ The CLI.',
      '',
    ].join('\n');
    const page = await open(await present(table));

    await page.keyboard.press('m');
    const compare = page.getByRole('figure', { name: 'Compare' });
    await compare.getByRole('cell', { name: 'brew' }).click();
    await compare.getByRole('textbox').fill('why brew?');
    await compare.getByRole('button', { name: 'Add comment' }).click();
    await pageExpect(page.locator('.bar .comment-count')).toHaveText('1 comment');
    await page.keyboard.press('Escape');
    await pageExpect(compare.getByRole('button', { name: 'Comment on Compare' })).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('ControlOrMeta+Enter');
    await page.keyboard.press('ControlOrMeta+Enter');
    await pageExpect(page.getByRole('status')).toHaveText('Round submitted · waiting for the next round');

    await present('❓ **Q2** - **Next**: Next.\n\n➡️ Yes.\n', 'round-2.md');
    await pageExpect(page.getByRole('heading', { level: 1 })).toHaveText('Round 2');
    await page.getByRole('button', { name: 'Round 2', exact: true }).click();
    await page.getByRole('menuitemradio', { name: /Round 1/ }).click();

    await page.getByRole('tab', { name: 'Q1' }).click();
    const past = page.getByRole('figure', { name: 'Compare' });
    await pageExpect(past.locator('.pins .pin')).toHaveText(['1']);
    await pageExpect(past.getByRole('list', { name: 'Comments on Compare' })).toContainText('why brew?');
    await pageExpect(past.getByRole('button', { name: 'Comment on Compare' })).toBeDisabled();
    await pageExpect(past.getByRole('button', { name: 'Delete comment 1' })).toHaveCount(0);
    await page.keyboard.press('m');
    await pageExpect(past.getByRole('button', { name: 'Comment on Compare' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('design tree', () => {
  it('shows as a column on a wide page, and its Q links open those questions', async () => {
    sandbox = new Sandbox('look');
    const page = await open(await present(TREE_ROUND));

    const tree = page.getByRole('complementary', { name: 'Design tree' });
    await pageExpect(tree).toBeVisible();
    await pageExpect(tree).toContainText('Channel');
    await pageExpect(tree).toContainText('a browser beside the terminal');
    await pageExpect(page.getByRole('button', { name: 'Design tree', exact: true })).toBeHidden();

    await tree.getByRole('link', { name: 'Q2' }).click();
    await pageExpect(region(page, 'Q2')).toBeVisible();
    await tree.getByRole('link', { name: 'Q3' }).click();
    await pageExpect(region(page, 'Q3')).toBeVisible();
  });

  it('opens as a drawer in a narrow pane, and a Q link closes it on that question', async () => {
    sandbox = new Sandbox('look');
    const page = await open(await present(TREE_ROUND), { width: 560, height: 800 });

    const tree = page.getByRole('complementary', { name: 'Design tree' });
    await pageExpect(tree).toBeHidden();
    await page.getByRole('button', { name: 'Design tree', exact: true }).click();
    await pageExpect(tree).toBeVisible();

    await tree.getByRole('link', { name: 'Q3' }).click();
    await pageExpect(region(page, 'Q3')).toBeVisible();
    await pageExpect(tree).toBeHidden();

    // Escape closes it too.
    await page.getByRole('button', { name: 'Design tree', exact: true }).click();
    await pageExpect(tree).toBeVisible();
    await page.keyboard.press('Escape');
    await pageExpect(tree).toBeHidden();
  });

  it("opens an earlier round's question from its Q link, and comes back to this round's", async () => {
    sandbox = new Sandbox('look');
    const page = await open(await present(STORAGE_ROUND));
    const follow = [
      '```design-tree',
      '- [x] Runtime: Bun, per Q2',
      '- [ ] Anything else Q7',
      '```',
      '',
      '❓ **Q7** - **Anything else?**: Last one.',
      '',
      '➡️ No.',
      '',
    ].join('\n');
    await present(follow, 'round-2.md');
    await pageExpect(page.getByRole('heading', { level: 1 })).toHaveText('Round 2');

    const tree = page.getByRole('complementary', { name: 'Design tree' });
    await pageExpect(tree.getByRole('link', { name: 'Q2' })).toHaveAttribute('title', 'Opens round 1');
    await pageExpect(tree.getByRole('link', { name: 'Q7' })).not.toHaveAttribute('title');
    await tree.getByRole('link', { name: 'Q2' }).click();
    await pageExpect(page.getByRole('heading', { level: 1 })).toHaveText('Round 1 · Storage choices');
    await pageExpect(region(page, 'Q2')).toBeVisible();

    await page.getByRole('button', { name: 'Back to round 2' }).click();
    await tree.getByRole('link', { name: 'Q7' }).click();
    await pageExpect(page.getByRole('heading', { level: 1 })).toHaveText('Round 2');
    await pageExpect(region(page, 'Q7')).toBeVisible();
  });

  it('is hidden when the round has no tree', async () => {
    sandbox = new Sandbox('look');
    const page = await open(await present(STORAGE_ROUND));
    await pageExpect(page.getByRole('complementary', { name: 'Design tree' })).toHaveCount(0);
    await pageExpect(page.getByRole('button', { name: 'Design tree', exact: true })).toHaveCount(0);
  });
});

describe('theme', () => {
  it('opens dark and switches to light from the toggle, remembering the choice', async () => {
    sandbox = new Sandbox('look');
    const page = await open(await present(STORAGE_ROUND));

    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await pageExpect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
    // Enter after a mouse click still accepts, rather than toggling the theme back.
    await page.keyboard.press('Enter');
    await pageExpect(page.getByRole('button', { name: /^Accept/ })).toHaveAttribute('aria-pressed', 'true');
    await pageExpect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();

    await page.reload();
    await pageExpect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
  });
});
