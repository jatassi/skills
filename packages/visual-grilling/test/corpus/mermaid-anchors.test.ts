// The Mermaid anchor corpus: every fixture that lists anchor terms is drawn on
// a real round page, one question each. Chromium clicks each listed element in
// comment mode, the round is submitted through the UI, and every comment line
// must read in the source's own terms.

import { chromium, expect as pageExpect, type Browser, type Locator, type Page } from 'playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Sandbox } from '../support/harness.ts';
import { MERMAID_FIXTURES, type AnchorCheck } from './mermaid-fixtures.ts';

const ANCHORED = MERMAID_FIXTURES.filter((fixture) => fixture.anchors);

let browser: Browser;
let sandbox: Sandbox;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await sandbox?.dispose(['anchors']);
});

function round(): string {
  const questions = ANCHORED.map(
    (fixture, index) =>
      `❓ **Q${index + 1}** - **${fixture.name}**: Click it.\n\n\`\`\`\`mermaid id=f${index + 1}\n${fixture.source}\n\`\`\`\`\n\n➡️ Fine.\n`,
  );
  return `# Anchors\n\n${questions.join('\n')}`;
}

/**
 * Where a person would click: a third of the way along a line or path (its
 * midpoint is where an edge label sits), anything else's centre.
 */
async function clickPoint(target: Locator): Promise<{ x: number; y: number }> {
  await target.scrollIntoViewIfNeeded();
  return target.evaluate((element) => {
    if (element instanceof SVGGeometryElement && /^(path|line|polyline)$/.test(element.localName)) {
      const point = element.getPointAtLength(element.getTotalLength() / 3);
      const screen = point.matrixTransform(element.getScreenCTM()!);
      return { x: screen.x, y: screen.y };
    }
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
}

function locate(figure: Locator, check: AnchorCheck): Locator {
  const drawing = figure.locator('.diagram > svg');
  const matches = check.css ? drawing.locator(check.css) : drawing.getByText(check.text!, { exact: true });
  return matches.nth(check.nth ?? 0);
}

async function comment(page: Page, figure: Locator, check: AnchorCheck, text: string): Promise<void> {
  const { x, y } = await clickPoint(locate(figure, check));
  await page.mouse.click(x, y);
  await figure.locator('.composer textarea').fill(text);
  await figure.getByRole('button', { name: 'Add comment' }).click();
}

describe('mermaid anchor corpus', () => {
  it('reads every listed click back in the source\'s own terms', async () => {
    sandbox = new Sandbox('anchors');
    const presented = await sandbox.cli(['present', sandbox.writeRound('round.md', round()), '--no-open']);
    expect(presented.stderr).toBe('');
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.setDefaultTimeout(5_000);
    await page.goto(presented.stdout.trim());

    const expected: string[] = [];
    for (const [index, fixture] of ANCHORED.entries()) {
      const number = index + 1;
      await page.getByRole('tab', { name: `Q${number}`, exact: true }).click();
      const figure = page.getByRole('figure', { name: `f${number}` });
      await pageExpect(figure.locator('.diagram > svg')).toBeVisible();
      const toggle = figure.getByRole('button', { name: `Comment on f${number}` });
      if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
      const more = figure.getByRole('button', { name: 'Show full diagram' });
      if (await more.isVisible()) await more.click();

      expected.push(`Q${number} ${fixture.name}`, '   comments only, no verdict');
      for (const [k, check] of fixture.anchors!.entries()) {
        await comment(page, figure, check, `c${k + 1}`);
        expected.push(`   comment ${k + 1} · mermaid "f${number}" → ${check.term}: "c${k + 1}"`);
      }
    }

    const waiting = sandbox.cli(['await', '--timeout', '60']);
    await page.getByRole('tab', { name: 'Review' }).click();
    await page.getByRole('button', { name: 'Submit round' }).click();
    const result = await waiting;
    expect(result.code).toBe(0);
    const body = result.stdout.slice(result.stdout.indexOf('\nQ1 ') + 1, result.stdout.indexOf('\nsummary:'));
    expect(body.split('\n').filter(Boolean)).toEqual(expected);
  }, 180_000);
});
