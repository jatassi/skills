import { chromium, expect as pageExpect, type Browser, type Page } from 'playwright/test';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { crash, Sandbox, STORAGE_ROUND } from '../support/harness.ts';

let browser: Browser;
let sandbox: Sandbox;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

afterEach(async () => {
  await sandbox?.dispose(['p1', 'p2', 'p3']);
});

/** Presents the storage round, opens it, and leaves drafts on Q1 (accepted) and Q3 (own answer). */
async function openWithDrafts(sessionId: string): Promise<Page> {
  sandbox = new Sandbox(sessionId);
  const url = (await sandbox.cli(['present', sandbox.writeRound('round.md', STORAGE_ROUND), '--no-open'])).stdout.trim();
  const page = await browser.newPage();
  await page.goto(url);
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.getByRole('tab', { name: 'Q3' }).click();
  await page.getByRole('button', { name: 'Write my own answer' }).click();
  await page.getByRole('textbox', { name: 'Your answer to Q3' }).fill('an unsent draft');
  return page;
}

/** The round and its drafts are still there to read and copy, and nothing can be sent. */
async function expectReadOnlyWithDrafts(page: Page): Promise<void> {
  const draft = page.getByRole('textbox', { name: 'Your answer to Q3' });
  await pageExpect(draft).toHaveValue('an unsent draft');
  await pageExpect(draft).not.toBeEditable();
  await pageExpect(draft).toBeEnabled();
  await page.getByRole('tab', { name: 'Q1' }).click();
  await pageExpect(page.getByRole('button', { name: 'Accept' })).toHaveAttribute('aria-pressed', 'true');
  await pageExpect(page.getByRole('button', { name: 'Accept' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Review' }).click();
  await pageExpect(page.getByRole('region', { name: 'Review' })).toContainText('Q3 Retention? · own answer: “an unsent draft”');
  await pageExpect(page.getByRole('button', { name: 'Submit round' })).toBeDisabled();
}

describe('round page', () => {
  it('submits a round through the UI and shows the next round in the same tab', async () => {
    sandbox = new Sandbox('p1');
    const presented = await sandbox.cli(['present', sandbox.writeRound('round.md', STORAGE_ROUND), '--no-open']);
    const url = presented.stdout.trim();

    const page = await browser.newPage();
    await page.goto(url);
    await pageExpect(page.getByRole('heading', { level: 1 })).toHaveText('Round 1 · Storage choices');

    // Q1: accept the recommendation.
    await page.getByRole('button', { name: 'Accept' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    // Q2: pick option B.
    await page.getByRole('button', { name: 'Option B: Bun' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    // Q3: write my own answer.
    await page.getByRole('button', { name: 'Write my own answer' }).click();
    await page.getByRole('textbox', { name: 'Your answer to Q3' }).fill('keep them until the repo is cleaned');
    await page.getByRole('button', { name: 'Next' }).click();
    // Q4: unsure. Q5: left unanswered.
    await page.getByRole('button', { name: 'Unsure' }).click();
    // Q6: accept a free-text recommendation.
    await page.getByRole('tab', { name: 'Q6' }).click();
    await page.getByRole('button', { name: 'Accept' }).click();

    await page.getByRole('tab', { name: 'Review' }).click();
    const review = page.getByRole('region', { name: 'Review' });
    await pageExpect(review).toContainText('Q2 Which runtime? · picked B');
    await pageExpect(review).toContainText('1 question has no answer and will be sent as unsure.');

    const waiting = sandbox.cli(['await', '--timeout', '30']);
    await page.getByRole('button', { name: 'Submit round' }).click();
    await pageExpect(page.getByRole('status')).toHaveText('Round submitted · waiting for the next round');

    const result = await waiting;
    expect(result.code).toBe(0);
    const summary = result.stdout.slice(result.stdout.indexOf('summary:'));
    expect(summary).toBe(`summary:
Q1 Where are rounds saved? · accepted A
Q2 Which runtime? · picked B
Q3 Retention? · own answer
Q4 Submit control placement · unsure
Q5 Tree column · no answer
Q6 Retry policy · accepted
`);

    const next = await sandbox.cli([
      'present',
      sandbox.writeRound('round-2.md', '# Follow-ups\n\n❓ **Q7** - **Anything else?**: Last one.\n\n➡️ No.\n'),
      '--no-open',
    ]);
    expect(next.stdout.trim()).toBe(url);
    await pageExpect(page.getByRole('heading', { level: 1 })).toHaveText('Round 2 · Follow-ups');
    await pageExpect(page.getByRole('region', { name: 'Q7' })).toContainText('Last one.');
  });

  it('shows each illustration and mockup as its raw source in a titled frame', async () => {
    sandbox = new Sandbox('p1');
    const round = [
      '❓ **Q1** - **Flow**: Which flow?',
      '',
      '```mermaid id=flow title="Request flow"',
      'flowchart LR',
      '  a --> b',
      '```',
      '',
      '- **A** - Tabs',
      '  ```html',
      '  <nav>tabs</nav>',
      '  ```',
      '- **B** - Drawer',
      '',
      '➡️ **A**',
      '',
    ].join('\n');
    const presented = await sandbox.cli(['present', sandbox.writeRound('round.md', round), '--no-open']);

    const page = await browser.newPage();
    await page.goto(presented.stdout.trim());
    const flow = page.getByRole('figure', { name: 'Request flow' });
    await pageExpect(flow).toContainText('mermaid');
    await pageExpect(flow.locator('pre')).toHaveText('flowchart LR\n  a --> b');
    await pageExpect(page.getByRole('figure', { name: 'Mockup A' }).locator('pre')).toHaveText('<nav>tabs</nav>');
  });

  it('shows "answered in the terminal" and "Grilling finished" after end, keeping the drafts', async () => {
    const page = await openWithDrafts('p2');

    expect((await sandbox.cli(['end'])).code).toBe(0);
    await pageExpect(page.getByRole('alert')).toContainText('Grilling finished');
    await pageExpect(page.getByRole('status')).toHaveText('Answered in the terminal');
    await expectReadOnlyWithDrafts(page);
  });

  it('shows "Server stopped" when the server goes away without finishing, keeping the drafts', async () => {
    const page = await openWithDrafts('p3');
    const { pid } = sandbox.serverInfo('p3');

    await crash(pid);
    await pageExpect(page.getByRole('alert')).toContainText('Server stopped');
    await pageExpect(page.getByText('Grilling finished')).toHaveCount(0);
    await expectReadOnlyWithDrafts(page);
  });
});
