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
  await sandbox?.dispose(['o1']);
});

interface Block {
  kind: 'mermaid' | 'dot' | 'vega-lite';
  title: string;
  source: string;
}

/** One question showing every block given, presented and opened on the dark theme. */
async function open(blocks: Block[]): Promise<Page> {
  sandbox = new Sandbox('o1');
  const fences = blocks.map(({ kind, title, source }, index) => `\`\`\`${kind} id=b${index + 1} title="${title}"\n${source}\n\`\`\``);
  const round = `# Overrides\n\n❓ **Q1** - **Look**: Which look?\n\n${fences.join('\n\n')}\n\n➡️ This one.\n`;
  const presented = await sandbox.cli(['present', sandbox.writeRound('round.md', round), '--no-open']);
  expect(presented.stderr).toBe('');
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  page.setDefaultTimeout(10_000);
  await page.goto(presented.stdout.trim());
  for (const { title } of blocks) await pageExpect(page.getByRole('figure', { name: title }).locator('svg').first()).toBeVisible();
  return page;
}

const chart = (config: object) =>
  JSON.stringify({
    data: { values: [{ runtime: 'Bun', ms: 60 }, { runtime: 'Node', ms: 120 }] },
    mark: 'bar',
    title: 'Cold start',
    encoding: { x: { field: 'runtime', type: 'nominal', title: 'runtime' }, y: { field: 'ms', type: 'quantitative', title: 'ms' } },
    config,
  });

/** Overrides written for white paper: dark text straight on the backdrop. */
const UNREADABLE: Block[] = [
  {
    kind: 'mermaid',
    title: 'Paper flow',
    source:
      "%%{init: {'themeVariables': {'primaryColor': 'transparent', 'primaryTextColor': '#222222', 'textColor': '#222222', 'lineColor': '#333333'}}}%%\nflowchart LR\n  a[Browser] --> b[Server] --> c[Agent]",
  },
  {
    kind: 'dot',
    title: 'Paper graph',
    source: 'digraph {\n  node [shape=plaintext, fontcolor="#222222"]\n  edge [color="#333333", fontcolor="#333333"]\n  browser -> server [label="calls"]\n  server -> agent [label="asks"]\n}',
  },
  {
    kind: 'vega-lite',
    title: 'Paper chart',
    source: chart({ axis: { labelColor: '#333333', titleColor: '#222222' }, title: { color: '#222222' } }),
  },
];

const backdrop = (page: Page, title: string) =>
  page.getByRole('figure', { name: title }).locator('.block-content').evaluate((element) => getComputedStyle(element).backgroundColor);

describe('theme overrides', () => {
  it('gives an overridden Mermaid, DOT or Vega-Lite block unreadable on dark the light backdrop, with a manual toggle', async () => {
    const page = await open(UNREADABLE);
    for (const { title } of UNREADABLE) {
      const toggle = page.getByRole('button', { name: `Light backdrop for ${title}` });
      await pageExpect(toggle).toHaveAttribute('aria-pressed', 'true');
      await pageExpect.poll(() => backdrop(page, title)).toBe('rgb(255, 255, 255)');

      await toggle.click();
      await pageExpect(toggle).toHaveAttribute('aria-pressed', 'false');
      await pageExpect.poll(() => backdrop(page, title)).not.toBe('rgb(255, 255, 255)');
      await toggle.click();
      await pageExpect(toggle).toHaveAttribute('aria-pressed', 'true');
      await pageExpect.poll(() => backdrop(page, title)).toBe('rgb(255, 255, 255)');
    }

    // On the backdrop the block draws with the light tokens: the chart's axis lines take the light --line.
    const domain = page.getByRole('figure', { name: 'Paper chart' }).locator('.role-axis-domain :is(line, path)').first();
    await pageExpect.poll(() => domain.getAttribute('stroke')).toBe('#d7dbe2');

    // The light theme needs no backdrop toggle; back on dark the backdrop returns.
    await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
    await pageExpect(page.getByRole('button', { name: 'Light backdrop for Paper flow' })).toBeHidden();
    await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
    await pageExpect(page.getByRole('button', { name: 'Light backdrop for Paper flow' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('merges a readable override over the page settings and keeps it on the dark backdrop', async () => {
    const page = await open([
      {
        kind: 'mermaid',
        title: 'Brand flow',
        source: "%%{init: {'themeVariables': {'primaryColor': '#fde68a', 'primaryTextColor': '#1f2937'}}}%%\nflowchart LR\n  a[Browser] --> b[Server]",
      },
      { kind: 'dot', title: 'Brand graph', source: 'digraph {\n  a [label="Browser", fillcolor="#fde68a", fontcolor="#1f2937"]\n  a -> b\n}' },
      { kind: 'vega-lite', title: 'Brand chart', source: chart({ mark: { color: '#ff7f0e' } }) },
    ]);

    const flow = page.getByRole('figure', { name: 'Brand flow' });
    // The agent's node colour, and the page's --muted (#a0a8b6) for everything it left alone.
    await pageExpect.poll(() => flow.locator('.node :is(rect, path)').first().evaluate((shape) => getComputedStyle(shape).fill)).toBe('rgb(253, 230, 138)');
    expect(await flow.locator('.flowchart-link').first().evaluate((path) => getComputedStyle(path).stroke)).toBe('rgb(160, 168, 182)');

    const graph = page.getByRole('figure', { name: 'Brand graph' });
    expect(await graph.locator('.node polygon, .node ellipse').first().getAttribute('fill')).toBe('#fde68a');
    expect(await graph.locator('.edge path').first().getAttribute('stroke')).toBe('#a0a8b6');

    const bars = page.getByRole('figure', { name: 'Brand chart' });
    expect(await bars.locator('.mark-rect path').first().getAttribute('fill')).toBe('#ff7f0e');
    expect(await bars.locator('.role-axis-label text').first().getAttribute('fill')).toBe('#a0a8b6');

    for (const title of ['Brand flow', 'Brand graph', 'Brand chart']) {
      // Judged readable: the toggle is offered, but off.
      await pageExpect(page.getByRole('button', { name: `Light backdrop for ${title}` })).toHaveAttribute('aria-pressed', 'false');
      expect(await backdrop(page, title)).not.toBe('rgb(255, 255, 255)');
    }
  });

  it('redraws a block without an override on theme toggle, and never gives it the backdrop', async () => {
    const page = await open([
      { kind: 'mermaid', title: 'Plain flow', source: 'flowchart LR\n  a[Browser] --> b[Server]' },
      { kind: 'dot', title: 'Plain graph', source: 'digraph { a -> b [label="calls"] }' },
      { kind: 'vega-lite', title: 'Plain chart', source: JSON.stringify({ ...JSON.parse(chart({})), config: undefined }) },
    ]);
    const nodeFill = () =>
      page.getByRole('figure', { name: 'Plain graph' }).locator('.node polygon, .node ellipse').first().getAttribute('fill');
    expect(await nodeFill()).toBe('#151820');

    await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
    await pageExpect.poll(nodeFill).toBe('#ffffff');
    await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
    await pageExpect.poll(nodeFill).toBe('#151820');

    for (const title of ['Plain flow', 'Plain graph', 'Plain chart']) {
      await pageExpect(page.getByRole('button', { name: `Light backdrop for ${title}` })).toBeHidden();
      await pageExpect(page.getByRole('figure', { name: title })).not.toHaveClass(/light-backdrop/);
    }
  });
});
