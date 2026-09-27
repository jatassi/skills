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
  await sandbox?.dispose(['c1']);
});

const COLD_START = JSON.stringify({
  data: {
    values: [
      { runtime: 'Bun', ms: 60, mark: 'recommended' },
      { runtime: 'Node', ms: 120, mark: 'risk' },
      { runtime: 'Deno', ms: 90, mark: 'muted' },
    ],
  },
  mark: 'bar',
  encoding: {
    x: { field: 'runtime', type: 'nominal', title: 'runtime' },
    y: { field: 'ms', type: 'quantitative', title: 'ms' },
    color: { field: 'mark', type: 'nominal', scale: { domain: ['recommended', 'risk', 'muted'], scheme: 'marks' }, legend: null },
  },
});

const PLAIN = JSON.stringify({
  data: { values: [{ runtime: 'Bun', ms: 60 }] },
  mark: 'bar',
  encoding: { x: { field: 'runtime', type: 'nominal' }, y: { field: 'ms', type: 'quantitative' } },
});

function round(charts: { id: string; title: string; source: string }[]): string {
  const fences = charts.map(({ id, title, source }) => `\`\`\`vega-lite id=${id} title="${title}"\n${source}\n\`\`\``);
  return `# Charts\n\n❓ **Q1** - **Runtime**: Which runtime?\n\n${fences.join('\n\n')}\n\n➡️ Bun.\n`;
}

async function open(source: string, setup?: (page: Page) => Promise<unknown>): Promise<{ page: Page; violations: string[] }> {
  const presented = await sandbox.cli(['present', sandbox.writeRound('round.md', source), '--no-open']);
  expect(presented.stderr).toBe('');
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|EvalError|unsafe-eval/i.test(message.text())) violations.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => console.error(`Content Security Policy: ${event.violatedDirective}`));
  });
  await setup?.(page);
  await page.goto(presented.stdout.trim());
  return { page, violations };
}

/** The fill of a bar, by its datum. */
function fillOf(page: Page, label: string): Promise<string> {
  return page.locator(`[aria-label="${label}"]`).evaluate((element) => getComputedStyle(element).fill);
}

/** The fill of an axis label's text. */
function labelColour(page: Page, text: string): Promise<string> {
  return page.locator('.vega-lite-block text', { hasText: text }).first().evaluate((element) => getComputedStyle(element).fill);
}

describe('vega-lite block', () => {
  it('draws as SVG with the page tokens and the preset marks scheme, under the CSP, and redraws when the theme flips', async () => {
    sandbox = new Sandbox('c1');
    const { page, violations } = await open(round([{ id: 'speed', title: 'Cold start', source: COLD_START }]));
    const figure = page.getByRole('figure', { name: 'Cold start' });
    await pageExpect(figure.locator('.vega-lite-block svg')).toBeVisible();
    await pageExpect(figure.locator('[aria-roledescription="bar"]')).toHaveCount(3);

    // Dark: the preset marks are the answered, risk and muted tokens.
    expect(await fillOf(page, 'runtime: Bun; ms: 60; mark: recommended')).toBe('rgb(63, 185, 80)');
    expect(await fillOf(page, 'runtime: Node; ms: 120; mark: risk')).toBe('rgb(248, 81, 73)');
    expect(await fillOf(page, 'runtime: Deno; ms: 90; mark: muted')).toBe('rgb(139, 148, 158)');
    expect(await labelColour(page, 'Bun')).toBe('rgb(139, 148, 158)');
    // No white backdrop behind the chart.
    await pageExpect(figure.locator('.vega-lite-block svg > rect')).toHaveCount(0);

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
    });
    await pageExpect.poll(() => fillOf(page, 'runtime: Bun; ms: 60; mark: recommended')).toBe('rgb(26, 127, 55)');
    expect(await fillOf(page, 'runtime: Node; ms: 120; mark: risk')).toBe('rgb(207, 34, 46)');
    expect(await labelColour(page, 'Bun')).toBe('rgb(89, 99, 110)');
    expect(violations).toEqual([]);
  });

  it("merges the chart's own config over the page's", async () => {
    sandbox = new Sandbox('c1');
    const own = JSON.stringify({ ...JSON.parse(PLAIN), config: { mark: { color: '#ff00ff' } } });
    const { page } = await open(
      round([
        { id: 'plain', title: 'Plain', source: PLAIN },
        { id: 'own', title: 'Own', source: own },
      ]),
    );
    const bar = (figure: string) =>
      page.getByRole('figure', { name: figure }).locator('[aria-roledescription="bar"]').evaluate((element) => getComputedStyle(element).fill);
    await pageExpect(page.locator('.vega-lite-block')).toHaveCount(2);
    expect(await bar('Plain')).toBe('rgb(47, 129, 247)');
    expect(await bar('Own')).toBe('rgb(255, 0, 255)');
    // The page's axis colours still apply.
    expect(await labelColour(page, 'Bun')).toBe('rgb(139, 148, 158)');
  });

  it('sends a comment on a bar in the chart\'s own terms: chart "Cold start" → bar "runtime: Bun; ms: 60"', async () => {
    sandbox = new Sandbox('c1');
    const source = JSON.stringify({
      data: { values: [{ runtime: 'Bun', ms: 60 }, { runtime: 'Node', ms: 120 }] },
      mark: 'bar',
      encoding: { x: { field: 'runtime', type: 'nominal' }, y: { field: 'ms', type: 'quantitative' } },
    });
    const { page } = await open(round([{ id: 'speed', title: 'Cold start', source }]));
    const figure = page.getByRole('figure', { name: 'Cold start' });
    await figure.getByRole('button', { name: 'Comment on Cold start' }).click();
    await figure.locator('[aria-label="runtime: Bun; ms: 60"]').click();
    await figure.getByRole('textbox').fill('is this warm or cold?');
    await figure.getByRole('button', { name: 'Add comment' }).click();

    const waiting = sandbox.cli(['await', '--timeout', '30']);
    await page.getByRole('button', { name: 'Accept' }).click();
    await page.getByRole('tab', { name: 'Review' }).click();
    await page.getByRole('button', { name: 'Submit round' }).click();
    const result = await waiting;
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('comment 1 · chart "Cold start" → bar "runtime: Bun; ms: 60": "is this warm or cold?"');
  });

  it('shows a page-only failure in its frame and sends it with the submission as a warning', async () => {
    sandbox = new Sandbox('c1');
    const { page } = await open(round([{ id: 'speed', title: 'Cold start', source: PLAIN }]), (page) =>
      // Stands in for a chart that draws in Node but not in this browser.
      page.route('**/assets/vega-lite.js', (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body: 'export const TOKEN_NAMES = []; export async function drawVegaLite() { throw new Error("scale exploded on the page"); }',
        }),
      ),
    );
    const figure = page.getByRole('figure', { name: 'Cold start' });
    await pageExpect(figure.getByRole('alert')).toContainText('This vega-lite failed to draw: scale exploded on the page');

    const waiting = sandbox.cli(['await', '--timeout', '30']);
    await page.getByRole('button', { name: 'Accept' }).click();
    await page.getByRole('tab', { name: 'Review' }).click();
    await page.getByRole('button', { name: 'Submit round' }).click();
    const result = await waiting;
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('   ⚠ vega-lite "speed" failed to draw on the page: scale exploded on the page\n');
  });
});
