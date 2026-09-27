import { readFileSync } from 'node:fs';
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
  await sandbox?.dispose(['h1']);
});

/** A round of one question per html illustration given, presented and opened. */
async function open(...fences: string[]): Promise<{ page: Page; url: string }> {
  sandbox = new Sandbox('h1');
  const round = fences
    .map((fence, index) => `❓ **Q${index + 1}** - **Question ${index + 1}**: Look.\n\n${fence}\n\n➡️ Fine.\n`)
    .join('\n');
  const presented = await sandbox.cli(['present', sandbox.writeRound('round.md', round), '--no-open']);
  expect(presented.stderr).toBe('');
  const url = presented.stdout.trim();
  const page = await browser.newPage({ viewport: { width: 640, height: 900 } });
  // Fail at the step that stalls, well inside the test's own timeout.
  page.setDefaultTimeout(8_000);
  await page.goto(url);
  return { page, url };
}

const html = (attributes: string, body: string) => `\`\`\`html ${attributes}\n${body}\n\`\`\``;

describe('agent HTML frames', () => {
  it('runs in a sandbox that cannot reach the submit route or read the round page', async () => {
    const probe = `<p data-anchor="parent">…</p><p data-anchor="read">…</p><p data-anchor="submit">…</p>
<script>
  const show = (name, text) => (document.querySelector('[data-anchor="' + name + '"]').textContent = text);
  try { show('parent', 'parent ' + parent.document.title); } catch (error) { show('parent', 'parent blocked'); }
  fetch('/api/rounds/latest').then((r) => r.text()).then((t) => show('read', 'read ' + t), () => show('read', 'read blocked'));
  const body = JSON.stringify({ round: 1, answers: [{ question: 1, mode: 'accepted' }] });
  Promise.allSettled([
    fetch('/api/rounds/1/submission', { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
    fetch('/api/rounds/1/submission', { method: 'POST', mode: 'no-cors', body }),
  ]).then(() => show('submit', 'submit tried'));
</script>`;
    const { page } = await open(html('id=probe title="Probe"', probe));
    const frame = page.frameLocator('iframe[title="Probe"]');
    await pageExpect(frame.locator('[data-anchor="parent"]')).toHaveText('parent blocked');
    await pageExpect(frame.locator('[data-anchor="read"]')).toHaveText('read blocked');
    await pageExpect(frame.locator('[data-anchor="submit"]')).toHaveText('submit tried');

    // The response's CSP sandboxes the frame; the iframe has no sandbox attribute for Claude's built-in browser to refuse.
    expect(await page.locator('iframe[title="Probe"]').getAttribute('sandbox')).toBeNull();
    // Nothing was submitted: the round still waits for the user.
    const waited = await sandbox.cli(['await', '--timeout', '0']);
    expect(waited.stdout.split('\n')[0]).toBe('pending · round 1 · re-run await');
  });

  it('gets the page tokens as variables and Tailwind colours, following the theme toggle', async () => {
    const { page } = await open(
      html('id=card title="Card"', '<div data-anchor="card" class="bg-surface text-fg border border-line p-2">Card</div>'),
    );
    const card = page.frameLocator('iframe[title="Card"]').locator('[data-anchor="card"]');
    const colours = () =>
      card.evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.backgroundColor, style.color, style.getPropertyValue('--vg-surface').trim()];
      });
    await pageExpect.poll(colours).toEqual(['rgb(21, 24, 32)', 'rgb(231, 234, 240)', '#151820']);

    await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
    await pageExpect.poll(colours).toEqual(['rgb(255, 255, 255)', 'rgb(26, 30, 38)', '#ffffff']);
    // Readable in both themes: no light backdrop, and nothing to toggle on the light theme.
    await pageExpect(page.getByRole('button', { name: 'Light backdrop for Card' })).toBeHidden();
  });

  it('inlines Tailwind unless the fence says tailwind=false, and fetches nothing', async () => {
    const { page } = await open(
      html('id=with title="With"', '<div data-anchor="box" class="p-6">padded</div>'),
      html('id=without title="Without" tailwind=false', '<div data-anchor="box" class="p-6">plain</div>'),
    );
    const padding = (title: string) =>
      page
        .frameLocator(`iframe[title="${title}"]`)
        .locator('[data-anchor="box"]')
        .evaluate((element) => getComputedStyle(element).paddingTop);
    await pageExpect.poll(() => padding('With')).toBe('24px');
    await pageExpect(page.frameLocator('iframe[title="With"]').locator('script#vg-tailwind')).toHaveCount(1);
    const frameFetches = await page
      .frameLocator('iframe[title="With"]')
      .locator('html')
      .evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
    expect(frameFetches).toEqual([]);

    await page.getByRole('tab', { name: 'Q2' }).click();
    await pageExpect(page.frameLocator('iframe[title="Without"]').locator('[data-anchor="box"]')).toHaveText('plain');
    expect(await padding('Without')).toBe('0px');
    await pageExpect(page.frameLocator('iframe[title="Without"]').locator('script#vg-tailwind')).toHaveCount(0);
  });

  it('switches unreadable HTML to a light backdrop automatically, with a manual toggle', async () => {
    const { page } = await open(
      html('id=memo title="Memo"', '<h3 style="color:#222">Quarterly memo</h3><p style="color:#333">Dark text written for white paper.</p>'),
    );
    const toggle = page.getByRole('button', { name: 'Light backdrop for Memo' });
    const frameTheme = () =>
      page.frameLocator('iframe[title="Memo"]').locator('html').getAttribute('data-vg-theme');
    await pageExpect(toggle).toHaveAttribute('aria-pressed', 'true');
    await pageExpect.poll(frameTheme).toBe('light');

    await toggle.click();
    await pageExpect(toggle).toHaveAttribute('aria-pressed', 'false');
    await pageExpect.poll(frameTheme).toBe('dark');
    await toggle.click();
    await pageExpect.poll(frameTheme).toBe('light');
  });

  it('sends a data-anchor comment, a weak match with its crop, and script errors as warnings', async () => {
    const widget = `<div class="p-4 flex gap-4 items-center">
  <button data-anchor="retry" class="px-3 py-1 border border-line text-fg">Retry</button>
  <div><svg width="160" height="80"><rect x="0" y="0" width="160" height="80" fill="#888"></rect></svg></div>
</div>
<script>
  document.querySelector('[data-anchor="retry"]').addEventListener('click', () => { throw new Error('retry clicked'); });
  setTimeout(() => { throw new Error('boom'); });
</script>`;
    const { page } = await open(html('id=banner title="Error banner"', widget));
    const figure = page.getByRole('figure', { name: 'Error banner' });
    const frame = page.frameLocator('iframe[title="Error banner"]');
    await pageExpect(frame.getByRole('button', { name: 'Retry' })).toBeVisible();

    // Outside comment mode the agent's own handlers run.
    await frame.getByRole('button', { name: 'Retry' }).click();

    // Focus is in the frame now, so its keys go there: the toggle turns comment mode on.
    await figure.getByRole('button', { name: 'Comment on Error banner' }).click();
    await frame.getByRole('button', { name: 'Retry' }).click();
    await figure.getByRole('textbox', { name: 'Comment on button retry "Retry"' }).fill('too loud');
    await figure.getByRole('button', { name: 'Add comment' }).click();

    await frame.locator('rect').click({ position: { x: 120, y: 60 } });
    await figure.getByRole('textbox', { name: 'Comment on unlabeled shape' }).fill('what is this?');
    await figure.getByRole('button', { name: 'Add comment' }).click();
    await pageExpect(figure.locator('.pins .pin')).toHaveText(['1', '2']);

    await page.getByRole('button', { name: 'Accept' }).click();
    await page.getByRole('tab', { name: 'Review' }).click();
    const waiting = sandbox.cli(['await', '--timeout', '30']);
    await page.getByRole('button', { name: 'Submit round' }).click();
    const result = await waiting;
    expect(result.code).toBe(0);

    const lines = result.stdout.split('\n');
    expect(lines[0]).toBe('submitted · round 1 · 2 warnings');
    const crop = `${sandbox.sessionDir('h1')}/crops/r1-q1-c2.png`;
    expect(result.stdout).toContain('   comment 1 · html "Error banner" → button retry "Retry": "too loud"\n');
    expect(result.stdout).toMatch(
      new RegExp(
        `   comment 2 · html "Error banner" → unlabeled shape  \\[clicked <rect>; at \\d+% across, \\d+% down; crop ${crop.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\]: "what is this\\?"\n`,
      ),
    );
    expect(result.stdout).toContain('   ⚠ html "banner" script error: Uncaught Error: retry clicked\n');
    expect(result.stdout).toContain('   ⚠ html "banner" script error: Uncaught Error: boom\n');
    expect(readFileSync(crop).subarray(1, 4).toString()).toBe('PNG');
  });
});
