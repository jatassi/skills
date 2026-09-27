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

const chain = (n: number) =>
  `flowchart TD\n  ${Array.from({ length: n }, (_, i) => `n${i}[Step ${i}]`).join(' --> ')}`;

function round(blocks: { id: string; title: string; source: string }[]): string {
  const fences = blocks.map(({ id, title, source }) => `\`\`\`mermaid id=${id} title="${title}"\n${source}\n\`\`\``);
  return `# Diagrams\n\n❓ **Q1** - **Flow**: Which flow?\n\n${fences.join('\n\n')}\n\n➡️ Yes.\n`;
}

async function open(source: string, setup?: (page: Page) => Promise<unknown>): Promise<Page> {
  const presented = await sandbox.cli(['present', sandbox.writeRound('round.md', source), '--no-open']);
  expect(presented.stderr).toBe('');
  const page = await browser.newPage({ viewport: { width: 640, height: 900 } });
  await setup?.(page);
  await page.goto(presented.stdout.trim());
  return page;
}

/**
 * The colour a user sees behind a label: the fill of the topmost drawn shape
 * under the label's centre, whatever element structure Mermaid used.
 */
async function colourBehind(page: Page, figure: string, label: string): Promise<string> {
  const box = (await page.getByRole('figure', { name: figure }).getByText(label, { exact: true }).boundingBox())!;
  return page.evaluate(
    ([x, y]) => {
      const shape = document
        .elementsFromPoint(x!, y!)
        .find((element) => element instanceof SVGGeometryElement && getComputedStyle(element).fill !== 'none');
      return shape ? getComputedStyle(shape).fill : 'none';
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
}

async function height(locator: ReturnType<Page['locator']>): Promise<number> {
  return (await locator.boundingBox())!.height;
}

describe('mermaid block', () => {
  it('draws through the block registry with the page tokens and preset marks, and redraws when the theme flips', async () => {
    sandbox = new Sandbox('m1');
    const page = await open(
      round([
        {
          id: 'flow',
          title: 'Request flow',
          source: 'flowchart LR\n  a[Browser] --> b[Server] --> c[Agent]\n  class c recommended\n  b:::risk',
        },
      ]),
    );
    const figure = page.getByRole('figure', { name: 'Request flow' });
    await pageExpect(figure.getByRole('document').first()).toBeVisible();
    await pageExpect(figure).toContainText('Browser');

    const darkPlain = await colourBehind(page, 'Request flow', 'Browser');
    const recommended = await colourBehind(page, 'Request flow', 'Agent');
    const risk = await colourBehind(page, 'Request flow', 'Server');
    // The page's dark panel token (--panel, #151820) fills a plain node; the marks tint theirs.
    expect(darkPlain).toBe('rgb(21, 24, 32)');
    expect(new Set([darkPlain, recommended, risk]).size).toBe(3);

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
    });
    await pageExpect.poll(() => colourBehind(page, 'Request flow', 'Browser')).toBe('rgb(255, 255, 255)');
  });

  it("keeps the preset marks when the agent's own themeCSS overrides the page's", async () => {
    sandbox = new Sandbox('m1');
    const page = await open(
      round([
        { id: 'plain', title: 'Plain', source: 'flowchart LR\n  a[Browser] --> c[Agent]\n  class c recommended' },
        {
          id: 'custom',
          title: 'Custom',
          source: '%%{init: {"themeCSS": ".edgeLabel { font-style: italic; }"}}%%\nflowchart LR\n  a[Browser] --> c[Agent]\n  class c recommended',
        },
      ]),
    );
    await pageExpect(page.getByRole('figure', { name: 'Custom' }).getByText('Agent', { exact: true })).toBeVisible();
    await pageExpect(page.getByRole('figure', { name: 'Plain' }).getByText('Agent', { exact: true })).toBeVisible();
    const preset = await colourBehind(page, 'Plain', 'Agent');
    expect(preset).not.toBe(await colourBehind(page, 'Plain', 'Browser'));
    expect(await colourBehind(page, 'Custom', 'Agent')).toBe(preset);
  });

  it('caps a diagram well over min(50vh, 440px) behind a fade and "Show full diagram"', async () => {
    sandbox = new Sandbox('m1');
    const page = await open(
      round([
        { id: 'short', title: 'Short', source: 'flowchart LR\n  a --> b' },
        { id: 'tall', title: 'Tall', source: chain(16) },
      ]),
    );
    const tall = page.getByRole('figure', { name: 'Tall' });
    const short = page.getByRole('figure', { name: 'Short' });
    await pageExpect(tall.getByRole('document').first()).toBeVisible();
    await pageExpect(short.getByRole('document').first()).toBeVisible();

    await pageExpect(short.getByRole('button', { name: 'Show full diagram' })).toBeHidden();
    const show = tall.getByRole('button', { name: 'Show full diagram' });
    await pageExpect(show).toBeVisible();
    // Cut: the frame is shorter than the diagram it holds.
    const drawing = tall.getByRole('document').first();
    const full = await height(drawing);
    expect(full).toBeGreaterThan(660);
    expect(await height(tall)).toBeLessThan(440 + 120);

    await show.click();
    await pageExpect(tall.getByRole('button', { name: 'Show less' })).toBeVisible();
    expect(await height(tall)).toBeGreaterThan(full);
  });

  it('shows a diagram within 1.5× the cap whole', async () => {
    sandbox = new Sandbox('m1');
    const page = await open(round([{ id: 'mid', title: 'Mid', source: chain(6) }]));
    const figure = page.getByRole('figure', { name: 'Mid' });
    await pageExpect(figure.getByRole('document').first()).toBeVisible();
    const drawn = await height(figure.getByRole('document').first());
    // The fixture must sit between the cap and 1.5× it to test anything.
    expect(drawn).toBeGreaterThan(440);
    expect(drawn).toBeLessThanOrEqual(660);
    await pageExpect(figure.getByRole('button', { name: 'Show full diagram' })).toBeHidden();
    expect(await height(figure)).toBeGreaterThan(drawn);
  });

  it('shows a page-only failure in its frame and sends it with the submission as a warning', async () => {
    sandbox = new Sandbox('m1');
    const page = await open(round([{ id: 'flow', title: 'Request flow', source: 'flowchart LR\n  a --> b' }]), (page) =>
      // Stands in for a block that draws in Node but not in this browser.
      page.route('**/assets/mermaid.js', (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body: 'export const TOKEN_NAMES = []; export async function drawMermaid() { throw new Error("layout exploded on the page"); }',
        }),
      ),
    );
    const figure = page.getByRole('figure', { name: 'Request flow' });
    await pageExpect(figure.getByRole('alert')).toContainText('This mermaid failed to draw');
    await pageExpect(figure.getByRole('alert')).toContainText('layout exploded on the page');

    const waiting = sandbox.cli(['await', '--timeout', '30']);
    await page.getByRole('button', { name: 'Accept' }).click();
    await page.getByRole('tab', { name: 'Review' }).click();
    await page.getByRole('button', { name: 'Submit round' }).click();
    const result = await waiting;
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')[0]).toBe('submitted · round 1 · Diagrams · 1 warning');
    expect(result.stdout).toContain('   ⚠ mermaid "flow" failed to draw on the page: layout exploded on the page\n');
  });
});
