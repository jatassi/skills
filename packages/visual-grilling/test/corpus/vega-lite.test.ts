// The Vega-Lite block corpus: every fixture goes through the Node draw check
// (a real `present`) and through the same chunk in Chromium, on the round
// page and so under its CSP; the two verdicts (draws / throws / empty) must
// agree with each other and with the fixture's expectation. Charts that draw
// are then shown on one round page, and a real click on each listed mark
// must name it by the fixture's anchor term, from marks Node draws too.

import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { chromium, expect as pageExpect, type Browser, type Page } from 'playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type * as VegaLiteChunk from '../../src/chunks/vega-lite.ts';
import { DIST, Sandbox } from '../support/harness.ts';
import { sourceOf, VEGA_LITE_FIXTURES, type Verdict } from './vega-lite-fixtures.ts';

let browser: Browser;
let page: Page;
/** Shows the page of charts that draw. */
let sandbox: Sandbox;
/** Presents each fixture for the Node verdict, in its own session so the page's round stays up. */
let checker: Sandbox;
let nodeChunk: typeof VegaLiteChunk;
const violations: string[] = [];

const DRAWS = VEGA_LITE_FIXTURES.filter((fixture) => fixture.verdict === 'draws');

function fence(id: string, title: string, source: string): string {
  return `\`\`\`\`vega-lite id=${id} title=${JSON.stringify(title)}\n${source}\n\`\`\`\``;
}

beforeAll(async () => {
  sandbox = new Sandbox('corpus');
  checker = new Sandbox('corpus-check');
  // One round page with every chart that draws, for the anchor clicks.
  const charts = DRAWS.map((fixture, i) => fence(`c${i}`, fixture.name, sourceOf(fixture)));
  const round = `❓ **Q1** - **Charts**: Every chart that draws.\n\n${charts.join('\n\n')}\n\n➡️ Go.\n`;
  const presented = await sandbox.cli(['present', '--agent', 'Claude Code', sandbox.writeRound('start.md', round), '--no-open']);
  expect(presented.stderr).toBe('');
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  page.on('console', (message) => {
    if (/Content Security Policy|EvalError/i.test(message.text())) violations.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => console.error(`Content Security Policy: ${event.violatedDirective}`));
  });
  await page.goto(presented.stdout.trim());
  nodeChunk = (await import(pathToFileURL(join(DIST, 'page/vega-lite.js')).href)) as typeof VegaLiteChunk;
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await sandbox?.dispose(['corpus']);
  await checker?.dispose(['corpus-check']);
});

async function nodeVerdict(source: string): Promise<{ verdict: Verdict; stderr: string }> {
  const round = `❓ **Q1** - **Fixture**: One block.\n\n${fence('fixture', 'Fixture', source)}\n\n➡️ Draw it.\n`;
  const result = await checker.cli(['present', '--agent', 'Claude Code', checker.writeRound('fixture.md', round), '--no-open']);
  if (result.code === 0) return { verdict: 'draws', stderr: '' };
  expect(result.stderr).toContain('illustration "fixture" (vega-lite)');
  return { verdict: /came out empty/.test(result.stderr) ? 'empty' : 'throws', stderr: result.stderr };
}

// Written as a string: vitest would rewrite a dynamic import() in a function.
const DRAW_IN_PAGE = `async (text) => {
  const chunk = await import('/assets/vega-lite.js');
  try {
    await chunk.drawVegaLite(text, chunk.DARK_TOKENS);
    return 'draws';
  } catch (error) {
    return error.name === 'EmptyDrawingError' ? 'empty' : 'throws';
  }
}`;

async function chromiumVerdict(source: string): Promise<Verdict> {
  return (await page.evaluate(`(${DRAW_IN_PAGE})(${JSON.stringify(source)})`)) as Verdict;
}

/** `bar "runtime: Bun; ms: 60"` → the mark's role description and aria-label. */
function parseTerm(term: string): { kind: string; label: string } {
  const match = /^(\S+) (".*")$/.exec(term);
  if (!match) throw new Error(`not an anchor term: ${term}`);
  return { kind: match[1]!, label: JSON.parse(match[2]!) as string };
}

function markSelector({ kind, label }: { kind: string; label: string }): string {
  const role = `:is([aria-roledescription=${JSON.stringify(kind)}], [aria-roledescription=${JSON.stringify(`${kind} mark`)}])`;
  return `[role="graphics-symbol"]${role}[aria-label=${JSON.stringify(label)}]`;
}

describe('vega-lite block corpus', () => {
  for (const fixture of VEGA_LITE_FIXTURES) {
    it(`${fixture.name}: ${fixture.verdict} in Node and in Chromium`, async () => {
      const source = sourceOf(fixture);
      const node = await nodeVerdict(source);
      const inChromium = await chromiumVerdict(source);
      expect({ node: node.verdict, chromium: inChromium }).toEqual({ node: fixture.verdict, chromium: fixture.verdict });
      if (fixture.says) expect(node.stderr).toMatch(fixture.says);
    });
  }

  it('draws with no CSP violation on the page', () => {
    expect(violations).toEqual([]);
  });
});

describe('vega-lite anchor terms', () => {
  beforeAll(async () => {
    await pageExpect(page.locator('.vega-lite-block')).toHaveCount(DRAWS.length);
    await pageExpect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: /^Comment on / }).first().click();
  });

  for (const fixture of DRAWS) {
    if (!fixture.anchors) return;
    it(`${fixture.name}: a click names ${fixture.anchors.join(', ')}`, async () => {
      const { svg } = await nodeChunk.drawVegaLite(sourceOf(fixture), nodeChunk.DARK_TOKENS);
      const figure = page.getByRole('figure', { name: fixture.name, exact: true });
      for (const term of fixture.anchors!) {
        const mark = parseTerm(term);
        // Node draws the same mark with the same name.
        expect(svg).toMatch(new RegExp(`aria-label="${escapeRegExp(escapeAttribute(mark.label))}" role="graphics-symbol" aria-roledescription="${mark.kind}( mark)?"`));

        await figure.locator(markSelector(mark)).click({ timeout: 5000 });
        await pageExpect(figure.locator('.composer .anchor-text')).toHaveText(term);
        await page.keyboard.press('Escape');
        await pageExpect(figure.locator('.composer')).toBeHidden();
      }
    });
  }
});

function escapeAttribute(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
