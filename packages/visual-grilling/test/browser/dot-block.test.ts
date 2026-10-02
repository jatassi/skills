import { chromium, expect as pageExpect, type Browser, type Locator, type Page } from 'playwright/test';
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
  await sandbox?.dispose(['g1']);
});

const chain = (n: number) => `digraph {\n  ${Array.from({ length: n }, (_, i) => `n${i}`).join(' -> ')}\n}`;

function round(blocks: { id: string; title: string; source: string }[]): string {
  const fences = blocks.map(({ id, title, source }) => `\`\`\`dot id=${id} title="${title}"\n${source}\n\`\`\``);
  return `# Graphs\n\n❓ **Q1** - **Deps**: Which dependencies?\n\n${fences.join('\n\n')}\n\n➡️ Yes.\n`;
}

async function open(source: string, setup?: (page: Page) => Promise<unknown>): Promise<Page> {
  const presented = await sandbox.cli(['present', '--agent', 'Claude Code', sandbox.writeRound('round.md', source), '--no-open']);
  expect(presented.stderr).toBe('');
  const page = await browser.newPage({ viewport: { width: 640, height: 900 } });
  await setup?.(page);
  await page.goto(presented.stdout.trim());
  return page;
}

/** The fill and stroke a user sees on a node's or edge's shape, by its Graphviz title. */
async function paint(page: Page, figure: string, title: string): Promise<{ fill: string; stroke: string }> {
  return page.getByRole('figure', { name: figure }).evaluate((element, title) => {
    const group = [...element.querySelectorAll('g.node, g.edge')].find((g) => g.querySelector(':scope > title')?.textContent === title)!;
    const shape = group.querySelector('ellipse, polygon, path')!;
    const style = getComputedStyle(shape);
    return { fill: style.fill, stroke: style.stroke };
  }, title);
}

/** A label Graphviz drew (not the <title> it also writes). */
function label(scope: Locator, text: string): Locator {
  return scope.locator('svg text').filter({ hasText: new RegExp(`^${text}$`) });
}

async function height(locator: ReturnType<Page['locator']>): Promise<number> {
  return (await locator.boundingBox())!.height;
}

describe('dot block', () => {
  it('draws through the block registry with the page tokens and preset marks, and redraws when the theme flips', async () => {
    sandbox = new Sandbox('g1');
    const page = await open(
      round([
        {
          id: 'deps',
          title: 'Dependencies',
          source: 'digraph {\n  web -> api -> db\n  api [class=recommended]\n  db [class=risk]\n  web -> db [class=risk]\n  cache [class=muted]\n}',
        },
      ]),
    );
    const figure = page.getByRole('figure', { name: 'Dependencies' });
    await pageExpect(label(figure, 'web')).toBeVisible();

    const plain = await paint(page, 'Dependencies', 'web');
    const recommended = await paint(page, 'Dependencies', 'api');
    const risk = await paint(page, 'Dependencies', 'db');
    // The page's dark panel token fills a plain node; the marks tint theirs.
    expect(plain).toEqual({ fill: 'rgb(21, 24, 32)', stroke: 'rgb(160, 168, 182)' });
    expect(recommended.stroke).toBe('rgb(73, 194, 122)');
    expect(risk.stroke).toBe('rgb(240, 101, 91)');
    expect(new Set([plain.fill, recommended.fill, risk.fill]).size).toBe(3);
    expect((await paint(page, 'Dependencies', 'web->db')).stroke).toBe('rgb(240, 101, 91)');
    expect((await paint(page, 'Dependencies', 'web->api')).stroke).toBe('rgb(160, 168, 182)');
    const muted = await figure.evaluate((element) => {
      const group = [...element.querySelectorAll('g.node')].find((g) => g.querySelector('title')?.textContent === 'cache')!;
      return getComputedStyle(group).opacity;
    });
    expect(muted).toBe('0.55');

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
    });
    await pageExpect.poll(async () => (await paint(page, 'Dependencies', 'web')).fill).toBe('rgb(255, 255, 255)');
  });

  it("lets the source's own colours and layout win over the page's", async () => {
    sandbox = new Sandbox('g1');
    const page = await open(
      round([
        {
          id: 'own',
          title: 'Own colours',
          source: 'digraph {\n  a [class=recommended, fillcolor="#ff0000", color="#0000ff"]\n  b [color="#00ff00"]\n  a -> b\n}',
        },
        { id: 'ring', title: 'Ring', source: 'digraph {\n  layout=circo\n  a -> b -> c -> d -> a\n}' },
      ]),
    );
    await pageExpect(label(page.getByRole('figure', { name: 'Own colours' }), 'a')).toBeVisible();
    expect(await paint(page, 'Own colours', 'a')).toEqual({ fill: 'rgb(255, 0, 0)', stroke: 'rgb(0, 0, 255)' });
    expect((await paint(page, 'Own colours', 'b')).stroke).toBe('rgb(0, 255, 0)');

    // circo puts the four nodes on a circle; dot would stack them in one column.
    const ring = page.getByRole('figure', { name: 'Ring' });
    await pageExpect(label(ring, 'a')).toBeVisible();
    const xs = await Promise.all(['a', 'b', 'c', 'd'].map(async (name) => (await label(ring, name).boundingBox())!.x));
    expect(new Set(xs.map(Math.round)).size).toBeGreaterThan(1);
  });

  it('caps a graph well over min(50vh, 440px) behind a fade and "Show full diagram"', async () => {
    sandbox = new Sandbox('g1');
    const page = await open(
      round([
        { id: 'short', title: 'Short', source: 'digraph { a -> b }' },
        { id: 'tall', title: 'Tall', source: chain(14) },
      ]),
    );
    const tall = page.getByRole('figure', { name: 'Tall' });
    const short = page.getByRole('figure', { name: 'Short' });
    await pageExpect(label(tall, 'n0')).toBeVisible();
    await pageExpect(label(short, 'a')).toBeVisible();

    await pageExpect(short.getByRole('button', { name: 'Show full diagram' })).toBeHidden();
    const show = tall.getByRole('button', { name: 'Show full diagram' });
    await pageExpect(show).toBeVisible();
    const full = await height(tall.locator('svg'));
    expect(full).toBeGreaterThan(660);
    expect(await height(tall)).toBeLessThan(440 + 120);

    await show.click();
    await pageExpect(tall.getByRole('button', { name: 'Show less' })).toBeVisible();
    expect(await height(tall)).toBeGreaterThan(full);
  });

  it('draws links without their targets, so a click stays on the page', async () => {
    sandbox = new Sandbox('g1');
    const page = await open(round([{ id: 'docs', title: 'Docs', source: 'digraph { docs [URL="https://example.com", tooltip="Docs"] }' }]));
    const figure = page.getByRole('figure', { name: 'Docs' });
    await pageExpect(label(figure, 'docs')).toBeVisible();
    expect(await figure.locator('[href], [*|href]').count()).toBe(0);
  });

  it('shows a page-only failure in its frame and sends it with the submission as a warning', async () => {
    sandbox = new Sandbox('g1');
    const page = await open(round([{ id: 'deps', title: 'Dependencies', source: 'digraph { a -> b }' }]), (page) =>
      // Stands in for a block that draws in Node but not in this browser.
      page.route('**/assets/graphviz.js', (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body: 'export const TOKEN_NAMES = []; export async function drawDot() { throw new Error("wasm refused on the page"); }',
        }),
      ),
    );
    const figure = page.getByRole('figure', { name: 'Dependencies' });
    await pageExpect(figure.getByRole('alert')).toContainText('This dot failed to draw: wasm refused on the page');

    const waiting = sandbox.cli(['await', '--timeout', '30']);
    await page.getByRole('button', { name: 'Accept' }).click();
    await page.getByRole('tab', { name: 'Review' }).click();
    await page.getByRole('button', { name: 'Submit round' }).click();
    const result = await waiting;
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')[0]).toBe('submitted · round 1 · Graphs · 1 warning');
    expect(result.stdout).toContain('   ⚠ dot "deps" failed to draw on the page: wasm refused on the page\n');
  });
});
