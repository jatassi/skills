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
  await sandbox?.dispose(['k1']);
});

const ROUND = [
  '# Server start',
  '',
  '❓ **Q1** - **Bind address**: Should the server bind loopback only?',
  '',
  '```ts id=start title="Start" file="src/server.ts" startLine=40 highlight=41',
  'export function start(port: number) {',
  '  const server = listen(port);',
  '  return server;',
  '}',
  '```',
  '',
  '```diff id=change title="Proposed change"',
  'diff --git a/src/server.ts b/src/server.ts',
  '--- a/src/server.ts',
  '+++ b/src/server.ts',
  '@@ -40,3 +40,4 @@ export function start(port: number) {',
  ' export function start(port: number) {',
  '-  const server = listen(port);',
  '+  const server = listen(port, "127.0.0.1");',
  '+  log(server);',
  '   return server;',
  'diff --git a/README.md b/README.md',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1 +1 @@',
  '-# Server',
  '+# Local server',
  '```',
  '',
  '```code id=page title="Page" lang=html',
  '<main class="app">Hi</main>',
  '```',
  '',
  '➡️ Yes, loopback only.',
  '',
].join('\n');

async function open(): Promise<Page> {
  sandbox = new Sandbox('k1');
  const presented = await sandbox.cli(['present', '--agent', 'Claude Code', sandbox.writeRound('round.md', ROUND), '--no-open']);
  expect(presented.stderr).toBe('');
  const page = await browser.newPage({ viewport: { width: 700, height: 1000 } });
  await page.goto(presented.stdout.trim());
  return page;
}

/** The colour the user sees on a piece of text. */
function colour(text: Locator): Promise<string> {
  return text.evaluate((element) => getComputedStyle(element).color);
}

describe('code block', () => {
  it("shows the file, its own line numbers and the highlighted lines, coloured by the page's theme", async () => {
    const page = await open();
    const start = page.getByRole('figure', { name: 'Start' });
    await pageExpect(start).toContainText('src/server.ts');
    await pageExpect(start).toContainText('40export function start');
    await pageExpect(start).toContainText('43}');
    // Highlighted lines are <mark>ed, the way the page shows highlighted text.
    await pageExpect(start.locator('mark')).toHaveText('  const server = listen(port);');

    // Highlighted: a keyword is coloured differently from plain text, and the
    // theme flip recolours it.
    const keyword = start.getByText('export', { exact: true });
    const plain = start.getByText('server', { exact: true }).first();
    const dark = await colour(keyword);
    expect(dark).not.toBe(await colour(plain));
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await pageExpect.poll(() => colour(start.getByText('export', { exact: true }))).not.toBe(dark);

    // `code lang=html` highlights a reserved language.
    const html = page.getByRole('figure', { name: 'Page' });
    await pageExpect(html).toContainText('<main class="app">Hi</main>');
    expect(await colour(html.getByText('main', { exact: true }).first())).not.toBe(await colour(html));
  });

  it('draws a diff over several files like a pull request, themed by the page', async () => {
    const page = await open();
    const change = page.getByRole('figure', { name: 'Proposed change' });
    await pageExpect(change).toContainText('src/server.ts');
    await pageExpect(change).toContainText('README.md');
    await pageExpect(change).toContainText('log(server);');
    await pageExpect(change).toContainText('# Local server');

    const keyword = change.getByText('const', { exact: true }).first();
    const dark = await colour(keyword);
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await pageExpect.poll(() => colour(change.getByText('const', { exact: true }).first())).not.toBe(dark);
  });

  it('names a commented line by file and line, and a diff line by file, side and line', async () => {
    const page = await open();
    const start = page.getByRole('figure', { name: 'Start' });
    const change = page.getByRole('figure', { name: 'Proposed change' });
    await pageExpect(start).toContainText('return server;');
    await pageExpect(change).toContainText('# Local server');
    await page.keyboard.press('m');

    await start.getByText('return server;').click();
    await start.getByRole('textbox', { name: 'Comment on line 42 of src/server.ts "return server;"' }).fill('return the address too?');
    await start.getByRole('button', { name: 'Add comment' }).click();

    await change.getByText('listen(port);').click();
    await change
      .getByRole('textbox', { name: 'Comment on old line 41 of src/server.ts "const server = listen(port);"' })
      .fill('this is the bug');
    await change.getByRole('button', { name: 'Add comment' }).click();

    await change.getByText('log(server);').click();
    await change.getByRole('textbox', { name: 'Comment on new line 42 of src/server.ts "log(server);"' }).fill('drop the log');
    await change.getByRole('button', { name: 'Add comment' }).click();

    await change.getByText('return server;').click();
    await change.getByRole('textbox', { name: 'Comment on context line 43 of src/server.ts (old 42) "return server;"' }).fill('unchanged');
    await change.getByRole('button', { name: 'Add comment' }).click();

    await change.getByText('# Local server').click();
    await change.getByRole('textbox', { name: 'Comment on new line 1 of README.md "# Local server"' }).fill('fine');
    await change.getByRole('button', { name: 'Add comment' }).click();

    await page.getByRole('button', { name: 'Accept' }).click();
    await page.getByRole('tab', { name: 'Review' }).click();
    const waiting = sandbox.cli(['await', '--timeout', '30']);
    await page.getByRole('button', { name: 'Submit round' }).click();
    const result = await waiting;
    expect(result.stdout).toContain(`Q1 Bind address
   accepted: Yes, loopback only.
   comment 1 · code "Start" → line 42 of src/server.ts "return server;": "return the address too?"
   comment 2 · diff "Proposed change" → old line 41 of src/server.ts "const server = listen(port);": "this is the bug"
   comment 3 · diff "Proposed change" → new line 42 of src/server.ts "log(server);": "drop the log"
   comment 4 · diff "Proposed change" → context line 43 of src/server.ts (old 42) "return server;": "unchanged"
   comment 5 · diff "Proposed change" → new line 1 of README.md "# Local server": "fine"
`);
  });
});
