import { chromium, expect as pageExpect, type Browser } from 'playwright/test';
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
  await sandbox?.dispose(['p1']);
});

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
});
