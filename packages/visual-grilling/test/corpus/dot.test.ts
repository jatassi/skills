// The DOT block corpus: every fixture goes through the Node draw check (a real
// `present`) and through the same chunk in Chromium, and the two verdicts
// (draws / throws / empty) must agree with each other and with the fixture.
// Then every fixture that draws goes on one round page, each listed part is
// clicked in comment mode, and the submission must name it by the fixture's
// anchor term.

import { chromium, expect as pageExpect, type Browser, type Page } from 'playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Sandbox } from '../support/harness.ts';
import { DOT_FIXTURES, type Target, type Verdict } from './dot-fixtures.ts';

let browser: Browser;
let page: Page;
let sandbox: Sandbox;

/**
 * How long the anchors round waits for a figure's own draw before treating
 * the click as ready. The default 5 s assertion timeout is tight for the
 * first draw's WASM chunk load on a busy machine; this stays well inside the
 * test's own overall timeout.
 */
const DRAW_TIMEOUT_MS = 30_000;

beforeAll(async () => {
  sandbox = new Sandbox('dotc');
  const presented = await sandbox.cli([
    'present',
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
  await sandbox?.dispose(['dotc']);
});

function fence(id: string, source: string): string {
  return `\`\`\`\`dot id=${id}\n${source}\n\`\`\`\``;
}

async function nodeVerdict(source: string): Promise<{ verdict: Verdict; stderr: string }> {
  const round = `❓ **Q1** - **Fixture**: One block.\n\n${fence('fixture', source)}\n\n➡️ Draw it.\n`;
  const result = await sandbox.cli(['present', sandbox.writeRound('fixture.md', round), '--no-open']);
  if (result.code === 0) return { verdict: 'draws', stderr: '' };
  expect(result.stderr).toContain('illustration "fixture" (dot)');
  return { verdict: /came out empty/.test(result.stderr) ? 'empty' : 'throws', stderr: result.stderr };
}

// Written as a string: vitest would rewrite a dynamic import() in a function.
const DRAW_IN_PAGE = `async (text) => {
  const chunk = await import('/assets/graphviz.js');
  try {
    await chunk.drawDot('corpus-' + Math.random().toString(36).slice(2), text, chunk.DARK_TOKENS);
    return 'draws';
  } catch (error) {
    return error.name === 'EmptyDrawingError' ? 'empty' : 'throws';
  }
}`;

async function chromiumVerdict(source: string): Promise<Verdict> {
  return (await page.evaluate(`(${DRAW_IN_PAGE})(${JSON.stringify(source)})`)) as Verdict;
}

describe('dot block corpus', () => {
  for (const fixture of DOT_FIXTURES) {
    it(`${fixture.name}: ${fixture.verdict} in Node and in Chromium`, async () => {
      const node = await nodeVerdict(fixture.source);
      const inChromium = await chromiumVerdict(fixture.source);
      expect({ node: node.verdict, chromium: inChromium }).toEqual({ node: fixture.verdict, chromium: fixture.verdict });
    });
  }

  it('names every listed part by its anchor term in the submission', async () => {
    const drawn = DOT_FIXTURES.filter((fixture) => fixture.anchors);
    const fences = drawn.map((fixture, i) => fence(`f${i + 1}`, fixture.source));
    const round = `# Corpus\n\n❓ **Q1** - **Anchors**: Every part.\n\n${fences.join('\n\n')}\n\n➡️ Yes.\n`;
    const presented = await sandbox.cli(['present', sandbox.writeRound('anchors.md', round), '--no-open']);
    expect(presented.stderr).toBe('');

    const round1 = await browser.newPage({ viewport: { width: 700, height: 900 } });
    await round1.goto(presented.stdout.trim());
    // M does nothing until the round has loaded.
    await pageExpect(round1.getByRole('figure', { name: 'f1' })).toBeVisible({ timeout: DRAW_TIMEOUT_MS });
    await round1.keyboard.press('m');

    const expected: string[] = [];
    for (const [i, fixture] of drawn.entries()) {
      const figure = round1.getByRole('figure', { name: `f${i + 1}` });
      // Real draw, not a stub: the first figure loads and WASM-compiles the
      // ~1.5 MB Graphviz chunk, which can take much longer than the default
      // 5 s assertion timeout when the machine is busy (this is what a click
      // right after would otherwise race). Later figures reuse the already
      // loaded chunk, so this rarely needs the extra room, but every figure
      // gets it for the same reason: only its own rendered SVG says it's
      // ready to be clicked.
      await pageExpect(figure.locator('svg g.graph')).toBeVisible({ timeout: DRAW_TIMEOUT_MS });
      for (const { click, term } of fixture.anchors!) {
        await figure.scrollIntoViewIfNeeded();
        const [x, y] = await figure.evaluate(pointOn, click);
        await round1.mouse.click(x!, y!);
        await figure.getByRole('textbox', { name: `Comment on ${term}` }).fill('c');
        await figure.getByRole('button', { name: 'Add comment' }).click();
        expected.push(`dot "f${i + 1}" → ${term}: "c"`);
      }
    }

    const waiting = sandbox.cli(['await', '--timeout', '30']);
    await round1.getByRole('button', { name: 'Accept' }).click();
    await round1.getByRole('tab', { name: 'Review' }).click();
    await round1.getByRole('button', { name: 'Submit round' }).click();
    const result = await waiting;
    const comments = result.stdout
      .split('\n')
      .filter((text) => text.startsWith('   comment '))
      .map((text) => text.replace(/^ {3}comment \d+ · /, ''));
    expect(comments).toEqual(expected);
  }, 120_000);
});

/**
 * A viewport point on the target: halfway along an edge's path, in a
 * cluster's bottom-left corner, on a node's label (or the middle of its
 * shape), on the graph's label.
 * Runs in the page.
 */
function pointOn(figure: HTMLElement, target: Target): [number, number] {
  const svg = figure.querySelector('svg')!;
  const centre = (element: Element): [number, number] => {
    const box = element.getBoundingClientRect();
    return [box.x + box.width / 2, box.y + box.height / 2];
  };
  if ('graphLabel' in target) {
    const label = [...svg.querySelectorAll('g.graph > text')].find((text) => text.textContent === target.graphLabel);
    return centre(label!);
  }
  const group = [...svg.querySelectorAll('g.node, g.edge, g.cluster')].find(
    (g) => g.querySelector(':scope > title')?.textContent === target.title,
  )!;
  if (group.classList.contains('edge')) {
    const path = group.querySelector('path')!;
    const point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM()!);
    return [point.x, point.y];
  }
  if (group.classList.contains('cluster')) {
    // Inside the frame, clear of the label and of whatever is drawn in it.
    const box = group.querySelector('polygon, path')!.getBoundingClientRect();
    return [box.x + 6, box.bottom - 6];
  }
  return centre(group.querySelector('text') ?? group.querySelector('polygon, ellipse, path')!);
}
