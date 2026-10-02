// Agent-HTML frames at the HTTP seam: the frame document and its headers, the
// frame scripts, and what frames send back (warnings, crops) riding the
// submission.

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { postJson, rawRequest, Sandbox } from '../support/harness.ts';

const SANDBOX_FLAGS =
  'allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads';
const FRAME_CSP =
  "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; script-src * data: blob: 'unsafe-inline' 'unsafe-eval'; " +
  "style-src * data: blob: 'unsafe-inline'; img-src * data: blob:; font-src * data: blob:; connect-src * data: blob:; " +
  `media-src * data: blob:; sandbox ${SANDBOX_FLAGS}`;

// A 1×1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const ROUND = `# Frames

❓ **Q1** - **Banner**: Too loud?

\`\`\`html id=banner title="Error banner"
<div data-anchor="banner" class="p-2">Upload failed <button>Retry</button></div>
\`\`\`

\`\`\`table id=compare
| A | B |
|---|---|
| 1 | 2 |
\`\`\`

➡️ Tone it down.

❓ **Q2** - **Plain**: No Tailwind here.

\`\`\`html id=plain tailwind=false
<!doctype html>
<html lang="en"><head><title>Plain</title></head><body><p>plain</p></body></html>
\`\`\`

➡️ Fine.

❓ **Q3** - **Layout**: Tabs or drawer?

- **A** - Tabs

  \`\`\`html
  <nav data-anchor="tabs" class="flex gap-2">Tabs</nav>
  \`\`\`

- **B** - Drawer

  \`\`\`html tailwind=false
  <aside>Drawer</aside>
  \`\`\`

- **C** - Neither

➡️ **A** Tabs.
`;

let sandbox: Sandbox;
let port: number;
let url: string;

beforeEach(async () => {
  sandbox = new Sandbox('f1');
  const result = await sandbox.cli(['present', '--agent', 'Claude Code', sandbox.writeRound('round.md', ROUND), '--no-open']);
  expect(result).toMatchObject({ code: 0, stderr: '' });
  url = result.stdout.trim();
  port = Number(new URL(url).port);
});

afterEach(async () => {
  await sandbox?.dispose(['f1']);
});

function unsureAnswers(extra: Record<string, unknown> = {}) {
  return {
    round: 1,
    answers: [
      { question: 1, mode: 'unsure', ...extra },
      { question: 2, mode: 'unsure' },
    ],
  };
}

/** A weak comment on the banner, as the page sends it. */
function weakComment(fields: Record<string, unknown> = {}) {
  return {
    illustration: { id: 'banner', kind: 'html', title: 'Error banner' },
    target: { kind: 'area', ref: null, label: null, via: 'position only', weak: true },
    clicked: { tag: 'body', role: null, text: '' },
    within: null,
    near: ['Retry'],
    position: { x: 72, y: 40 },
    selector: 'body',
    box: null,
    text: 'too loud',
    ...fields,
  };
}

describe('the frame document', () => {
  it('is the agent HTML with the frame head injected, sandboxed by its own CSP', async () => {
    const response = await rawRequest(port, 'GET', '/frame/r1/banner');
    expect(response.status).toBe(200);
    expect(response.headers['content-security-policy']).toBe(FRAME_CSP);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(Object.keys(response.headers).filter((name) => name.startsWith('access-control-'))).toEqual([]);

    const { body } = response;
    expect(body).toContain('<html data-vg-theme="dark">');
    expect(body).toContain('--vg-surface: #151820;');
    expect(body).toContain('--color-surface: var(--vg-surface);');
    // The frame script comes before Tailwind and the agent's HTML, both inline: nothing for the frame to fetch.
    expect(body).not.toContain('<script src=');
    const order = ['<script id="vg-inject">', '<script id="vg-tailwind">', '<div data-anchor="banner"'].map((part) =>
      body.indexOf(part),
    );
    expect(order.every((at) => at > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('starts in the theme the page asks for, and leaves Tailwind out when the fence says tailwind=false', async () => {
    const { status, body } = await rawRequest(port, 'GET', '/frame/r1/plain?theme=light');
    expect(status).toBe(200);
    expect(body).toContain('<html data-vg-theme="light">');
    expect(body).toContain('<script id="vg-inject">');
    expect(body).not.toContain('tailwind');
    expect(body).toContain('<html lang="en"><head><title>Plain</title></head><body><p>plain</p></body></html>');
  });

  it("serves an option's mockup at /frame/r<N>/q<M>/<option>, with the same head and sandbox", async () => {
    const tabs = await rawRequest(port, 'GET', '/frame/r1/q3/A');
    expect(tabs.status).toBe(200);
    expect(tabs.headers['content-security-policy']).toBe(FRAME_CSP);
    expect(tabs.body).toContain('<html data-vg-theme="dark">');
    expect(tabs.body).toContain('<script id="vg-inject">');
    expect(tabs.body).toContain('<script id="vg-tailwind">');
    expect(tabs.body).toContain('<nav data-anchor="tabs" class="flex gap-2">Tabs</nav>');

    const drawer = await rawRequest(port, 'GET', '/frame/r1/q3/B?theme=light');
    expect(drawer.status).toBe(200);
    expect(drawer.body).toContain('<html data-vg-theme="light">');
    expect(drawer.body).not.toContain('tailwind');
    expect(drawer.body).toContain('<aside>Drawer</aside>');
  });

  it("gives the page each mockup's frame path", async () => {
    const round = (await (await fetch(`${url}api/rounds/1`)).json()) as {
      questions: { options: { letter: string; mockup?: { frame: string } }[] }[];
    };
    expect(round.questions[2]!.options.map((option) => option.mockup?.frame)).toEqual([
      '/frame/r1/q3/A',
      '/frame/r1/q3/B',
      undefined,
    ]);
  });

  it.each([
    ['an option with no mockup', '/frame/r1/q3/C'],
    ['an unknown option', '/frame/r1/q3/D'],
    ['a question with no options', '/frame/r1/q1/A'],
    ['an unknown question', '/frame/r1/q9/A'],
    ['a lower-case option', '/frame/r1/q3/a'],
    ['a question number with a leading zero', '/frame/r1/q03/A'],
  ])('has no mockup frame for %s', async (_, path) => {
    expect((await rawRequest(port, 'GET', path)).status).toBe(404);
  });

  it.each([
    ['an unknown illustration', '/frame/r1/nope'],
    ['an illustration that is not html', '/frame/r1/compare'],
    ['an unknown round', '/frame/r2/banner'],
    ['a malformed id', '/frame/r1/Banner'],
  ])('is not found for %s', async (_, path) => {
    expect((await rawRequest(port, 'GET', path)).status).toBe(404);
  });

  it('serves no frame scripts by URL: every frame has them inline', async () => {
    for (const file of ['inject.js', 'tailwind.js', 'app.js', '..%2Fserver.mjs']) {
      expect((await rawRequest(port, 'GET', `/frame/assets/${file}`)).status, file).toBe(404);
    }
  });

  it("refuses writes from a frame's opaque origin", async () => {
    const response = await rawRequest(
      port,
      'POST',
      '/api/rounds/1/warnings',
      { origin: 'null', 'content-type': 'application/json' },
      JSON.stringify({ question: 1, illustration: 'banner', kind: 'script', message: 'forged' }),
    );
    expect(response.status).toBe(403);
  });
});

describe('warnings', () => {
  it('ride the next submission under their question, without ending await early', async () => {
    const warn = (body: unknown) => postJson(`${url}api/rounds/1/warnings`, body);
    expect((await warn({ question: 1, illustration: 'banner', kind: 'script', message: 'Uncaught Error: boom' })).status).toBe(200);
    // The same warning twice counts once.
    await warn({ question: 1, illustration: 'banner', kind: 'script', message: 'Uncaught Error: boom' });
    await warn({ question: 1, illustration: 'compare', kind: 'draw', message: 'no table\nat all' });
    expect((await warn({ question: 3, option: 'B', kind: 'script', message: 'Uncaught TypeError: nope' })).status).toBe(200);
    await warn({ question: 3, option: 'B', kind: 'script', message: 'Uncaught TypeError: nope' });
    await warn({ question: 3, option: 'A', kind: 'draw', message: 'frame failed' });

    const early = await sandbox.cli(['await', '--timeout', '1']);
    expect(early.stdout.split('\n')[0]).toBe('pending · round 1 · re-run await');

    expect((await postJson(`${url}api/rounds/1/submission`, unsureAnswers())).status).toBe(200);
    const result = await sandbox.cli(['await', '--timeout', '5']);
    expect(result.stdout.split('\n')[0]).toBe('submitted · round 1 · Frames · 4 warnings');
    expect(result.stdout).toContain(`Q1 Banner
   unsure
   ⚠ html "banner" script error: Uncaught Error: boom
   ⚠ table "compare" failed to draw on the page: no table at all
Q2 Plain
   unsure
Q3 Layout
   no answer (sent as unsure)
   ⚠ mockup B script error: Uncaught TypeError: nope
   ⚠ mockup A failed to draw on the page: frame failed
`);
    expect(result.stdout).toContain('Q1 Banner · unsure · 2 warnings\n');
    expect(result.stdout).toContain('Q3 Layout · no answer · 2 warnings\n');
    const record = JSON.parse(readFileSync(`${sandbox.sessionDir('f1')}/submissions/round-1.json`, 'utf8'));
    expect(record.questions[2].warnings[0]).toEqual({ kind: 'script', option: 'B', message: 'Uncaught TypeError: nope' });
  });

  it.each([
    [{ question: 4, illustration: 'banner', kind: 'script', message: 'x' }, 'no Q4'],
    [{ question: 1, illustration: 'plain', kind: 'script', message: 'x' }, 'no illustration "plain"'],
    [{ question: 1, illustration: 'compare', kind: 'script', message: 'x' }, 'only html illustrations run scripts'],
    [{ question: 1, illustration: 'banner', kind: 'other', message: 'x' }, 'unknown warning kind'],
    [{ question: 1, illustration: 'banner', kind: 'script', message: '' }, 'message'],
    [{ question: 3, option: 'C', kind: 'script', message: 'x' }, 'option C has no mockup'],
    [{ question: 1, option: 'A', kind: 'script', message: 'x' }, 'option A has no mockup'],
    [{ question: 3, kind: 'script', message: 'x' }, 'a warning names an illustration or an option'],
  ])('rejects a warning that does not fit the round: %j', async (body, error) => {
    const response = await postJson(`${url}api/rounds/1/warnings`, body);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain(error);
  });
});

describe('crops', () => {
  it('are saved as crops/rN-qM-cK.png and named in the comment line', async () => {
    const answers = unsureAnswers({ comments: [weakComment(), weakComment({ text: 'second', cropImage: PNG })] });
    expect((await postJson(`${url}api/rounds/1/submission`, answers)).status).toBe(200);
    const result = await sandbox.cli(['await', '--timeout', '5']);

    const crop = join(sandbox.sessionDir('f1'), 'crops', 'r1-q1-c2.png');
    expect(result.stdout).toContain(
      '   comment 1 · html "Error banner" → empty area  [near "Retry"; at 72% across, 40% down]: "too loud"\n',
    );
    expect(result.stdout).toContain(
      `   comment 2 · html "Error banner" → empty area  [near "Retry"; at 72% across, 40% down; crop ${crop}]: "second"\n`,
    );
    expect(readFileSync(crop).equals(Buffer.from(PNG.split(',')[1]!, 'base64'))).toBe(true);
    if (process.platform !== 'win32') expect(statSync(crop).mode & 0o777).toBe(0o600);

    const record = JSON.parse(readFileSync(`${sandbox.sessionDir('f1')}/submissions/round-1.json`, 'utf8'));
    expect(record.questions[0].comments[1].crop).toBe(crop);
    expect(record.questions[0].comments[1].cropImage).toBeUndefined();
  });

  it.each([
    ['not a PNG data URL', 'data:image/jpeg;base64,/9j/'],
    ['not a PNG inside', 'data:image/png;base64,aGVsbG8='],
  ])('rejects a crop that is %s', async (_, cropImage) => {
    const response = await postJson(`${url}api/rounds/1/submission`, unsureAnswers({ comments: [weakComment({ cropImage })] }));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain('Q1 comment 1: cropImage');
  });
});
