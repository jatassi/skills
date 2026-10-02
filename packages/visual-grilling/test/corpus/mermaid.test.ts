// The Mermaid block corpus: every fixture goes through the Node draw check
// (a real `present`) and through the same chunk in Chromium, and the two
// verdicts (draws / throws / empty) must agree with each other and with the
// fixture's expectation.

import { chromium, type Browser, type Page } from 'playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Sandbox } from '../support/harness.ts';
import { MERMAID_FIXTURES, type Verdict } from './mermaid-fixtures.ts';

let browser: Browser;
let page: Page;
let sandbox: Sandbox;

beforeAll(async () => {
  sandbox = new Sandbox('corpus');
  const presented = await sandbox.cli([
    'present',
    '--agent',
    'Claude Code',
    sandbox.writeRound('start.md', '❓ **Q1** - **Start**: Nothing drawn.\n\n➡️ Go.\n'),
    '--no-open',
  ]);
  expect(presented.code).toBe(0);
  browser = await chromium.launch();
  page = await browser.newPage();
  // The round page's origin, so the chunk loads exactly as the page loads it.
  await page.goto(presented.stdout.trim());
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await sandbox?.dispose(['corpus']);
});

async function nodeVerdict(source: string): Promise<{ verdict: Verdict; stderr: string }> {
  const round = `❓ **Q1** - **Fixture**: One block.\n\n\`\`\`\`mermaid id=fixture\n${source}\n\`\`\`\`\n\n➡️ Draw it.\n`;
  const result = await sandbox.cli(['present', '--agent', 'Claude Code', sandbox.writeRound('fixture.md', round), '--no-open']);
  if (result.code === 0) return { verdict: 'draws', stderr: '' };
  expect(result.stderr).toContain('illustration "fixture" (mermaid)');
  return { verdict: /came out empty/.test(result.stderr) ? 'empty' : 'throws', stderr: result.stderr };
}

// Written as a string: vitest would rewrite a dynamic import() in a function.
const DRAW_IN_PAGE = `async (text) => {
  const chunk = await import('/assets/mermaid.js');
  try {
    await chunk.drawMermaid('corpus-' + Math.random().toString(36).slice(2), text, chunk.DARK_TOKENS);
    return 'draws';
  } catch (error) {
    return error.name === 'EmptyDrawingError' ? 'empty' : 'throws';
  }
}`;

async function chromiumVerdict(source: string): Promise<Verdict> {
  return (await page.evaluate(`(${DRAW_IN_PAGE})(${JSON.stringify(source)})`)) as Verdict;
}

describe('mermaid block corpus', () => {
  for (const fixture of MERMAID_FIXTURES) {
    it(`${fixture.name}: ${fixture.verdict} in Node and in Chromium`, async () => {
      const node = await nodeVerdict(fixture.source);
      const inChromium = await chromiumVerdict(fixture.source);
      expect({ node: node.verdict, chromium: inChromium }).toEqual({ node: fixture.verdict, chromium: fixture.verdict });
      if (fixture.explains) expect(node.stderr).toMatch(fixture.explains);
    });
  }
});
