import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { postJson, Sandbox } from '../support/harness.ts';

let sandbox: Sandbox;

afterEach(async () => {
  await sandbox?.dispose(['c1']);
});

const ROUND = `# Tools

❓ **Q1** - **Which install path?**: Compare them.

\`\`\`table id=compare title="Compare"
| Tool | Install |
|---|---|
| MCP server | \`npx\` |
| CLI | **brew** |
\`\`\`

- **A** - MCP server
- **B** - CLI
  \`\`\`html
  <button data-anchor="install">Install</button>
  \`\`\`

➡️ **A**

❓ **Q2** - **Anything else?**: Push back here.

➡️ No.
`;

/** A comment as the page sends it: the anchor it resolved plus the text. */
function comment(fields: Record<string, unknown>) {
  return {
    illustration: { id: 'compare', kind: 'table', title: 'Compare' },
    target: { kind: 'cell', ref: 'row "MCP server", column "Install"', label: null, via: 'table', weak: false },
    clicked: { tag: 'td', role: null, text: 'npx' },
    within: null,
    near: [],
    position: { x: 62, y: 48 },
    selector: 'table.block-table > tbody > tr:nth-of-type(1) > td:nth-of-type(2)',
    box: { x: 120, y: 40, w: 90, h: 30 },
    text: 'does this need Node?',
    ...fields,
  };
}

async function present(): Promise<string> {
  sandbox = new Sandbox('c1');
  return (await sandbox.cli(['present', sandbox.writeRound('round.md', ROUND), '--no-open'])).stdout.trim();
}

describe('anchored comments', () => {
  it('come back as lines under their question, with the full record saved as JSON', async () => {
    const url = await present();
    const waiting = sandbox.cli(['await', '--timeout', '30']);
    await new Promise((done) => setTimeout(done, 300));
    const response = await postJson(`${url}api/rounds/1/submission`, {
      round: 1,
      answers: [
        {
          question: 1,
          mode: 'accepted',
          comments: [
            // The page's claim about kind and title is replaced by the round's.
            comment({ illustration: { id: 'compare', kind: 'html', title: 'Forged' } }),
            comment({
              illustration: undefined,
              option: 'B',
              target: { kind: 'button', ref: 'install', label: 'Install', via: 'data-anchor', weak: false },
              text: 'too small',
            }),
          ],
        },
        {
          question: 2,
          mode: 'none',
          comments: [],
        },
      ],
    });
    expect(response.status).toBe(200);

    const result = await waiting;
    expect(result.code).toBe(0);
    const recordPath = /^record: (.+)$/m.exec(result.stdout)![1]!;
    expect(result.stdout).toBe(`submitted · round 1 · Tools
record: ${recordPath}

Q1 Which install path?
   accepted: A · MCP server
   comment 1 · table "Compare" → cell row "MCP server", column "Install": "does this need Node?"
   comment 2 · mockup B → button install "Install": "too small"
Q2 Anything else?
   no answer (sent as unsure)

summary:
Q1 Which install path? · accepted A · 2 comments
Q2 Anything else? · no answer
`);

    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    expect(record.questions[0].comments[0]).toEqual({
      question: 1,
      illustration: { id: 'compare', kind: 'table', title: 'Compare' },
      target: { kind: 'cell', ref: 'row "MCP server", column "Install"', label: null, via: 'table', weak: false },
      clicked: { tag: 'td', role: null, text: 'npx' },
      within: null,
      near: [],
      position: { x: 62, y: 48 },
      selector: 'table.block-table > tbody > tr:nth-of-type(1) > td:nth-of-type(2)',
      box: { x: 120, y: 40, w: 90, h: 30 },
      text: 'does this need Node?',
    });
    expect(record.questions[0].comments[1]).toMatchObject({ option: 'B' });
    expect(record.questions[0].comments[1].illustration).toBeUndefined();

    // The submitted round carries its comments back to the page.
    const round = await (await fetch(`${url}api/rounds/1`)).json();
    expect(round.comments[1]).toHaveLength(2);
    expect(round.comments[2]).toEqual([]);
  });

  it('with no verdict make the answer "comments only", which stays open', async () => {
    const url = await present();
    const response = await postJson(`${url}api/rounds/1/submission`, {
      round: 1,
      answers: [
        {
          question: 1,
          mode: 'none',
          comments: [
            comment({
              target: { kind: 'unlabeled table', ref: null, label: null, via: 'position only', weak: true },
              clicked: { tag: 'table', role: null, text: '' },
              near: ['Install'],
              position: { x: 3, y: 97 },
              text: 'rows are cramped',
            }),
          ],
        },
      ],
    });
    expect(response.status).toBe(200);

    const result = await sandbox.cli(['await', '--timeout', '5']);
    expect(result.stdout).toContain(`Q1 Which install path?
   comments only, no verdict
   comment 1 · table "Compare" → unlabeled table  [clicked <table>; near "Install"; at 3% across, 97% down]: "rows are cramped"
`);
    expect(result.stdout).toContain('Q1 Which install path? · comments only · 1 comment\n');
    const record = JSON.parse(readFileSync(/^record: (.+)$/m.exec(result.stdout)![1]!, 'utf8'));
    expect(record.questions[0].verdict).toEqual({ mode: 'comments' });
  });

  it.each([
    ['an unknown illustration', comment({ illustration: { id: 'nope' } }), 'Q1 comment 1: Q1 has no illustration "nope"'],
    ['an option with no mockup', comment({ option: 'A' }), 'Q1 comment 1: option A has no mockup'],
    ['empty text', comment({ text: '  ' }), 'Q1 comment 1: text is empty'],
    ['a target that is not an object', comment({ target: 'cell' }), 'Q1 comment 1: target must be an object'],
    ['a position that is not a number', comment({ position: { x: '1', y: 2 } }), 'Q1 comment 1: position.x must be a number'],
  ])('reject %s', async (_name, bad, error) => {
    const url = await present();
    const response = await postJson(`${url}api/rounds/1/submission`, {
      round: 1,
      answers: [{ question: 1, mode: 'accepted', comments: [bad] }],
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
  });
});
