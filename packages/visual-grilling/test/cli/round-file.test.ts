import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { crash, Sandbox } from '../support/harness.ts';

let sandbox: Sandbox;

afterEach(async () => {
  await sandbox?.dispose(['r1', 'r2', 'r3', 'r4', 'r5']);
});

const BROKEN_ROUND = `# Broken

❓ **Q1** - **Flow**: Body.

\`\`\`mermaid title=Flow
graph LR
\`\`\`

- **A** - One
- **C** - Three

➡️ **A**

❓ **Q1** - **Again**: Body.

\`\`\`html id=card
<div data-anchor="x"></div>
<div data-anchor="x"></div>
\`\`\`

➡️ Yes.
`;

const FULL_ROUND = `# Layout

\`\`\`design-tree
- [x] Storage: session folder
- [ ] Layout Q1
\`\`\`

❓ **Q1** - **Tree placement**: Where does the tree go? <script>alert(1)</script>

\`\`\`ts id=snippet file=src/app.ts startLine=3 highlight=4
const a = 1;
const b = 2;
\`\`\`

- **A** - Column
  \`\`\`html tailwind=false
  <aside data-anchor="tree">tree</aside>
  \`\`\`
- **B** - Drawer

➡️ **A** on wide layouts.
`;

describe('present with a malformed round', () => {
  it('prints every error, exits non-zero and shows nothing', async () => {
    sandbox = new Sandbox('r1');
    const file = sandbox.writeRound('round.md', BROKEN_ROUND);
    const result = await sandbox.cli(['present', file, '--no-open']);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      [
        `${file}:5 · Q1 · illustration (mermaid): missing id; add id=<name> after the language`,
        `${file}:10 · Q1: option letters run A, B, C… with no gaps; expected B, found C`,
        `${file}:14 · Q1: duplicate Q1; the first is at line 3`,
        `${file}:18 · Q1 · illustration "card" (html): duplicate data-anchor "x"; each name must be unique in one illustration`,
        '',
      ].join('\n'),
    );
    expect(existsSync(sandbox.sessionDir('r1'))).toBe(false);
  });
});

describe('present with the full grammar', () => {
  it('carries illustrations, mockups and the design tree to the page', async () => {
    sandbox = new Sandbox('r2');
    const result = await sandbox.cli(['present', sandbox.writeRound('round.md', FULL_ROUND), '--no-open']);
    expect(result).toMatchObject({ code: 0, stderr: '' });

    const round = await (await fetch(`${result.stdout.trim()}api/rounds/latest`)).json();
    expect(round).toMatchObject({
      number: 1,
      title: 'Layout',
      designTree: [
        { label: 'Storage', settled: true, gist: 'session folder', questions: [], children: [] },
        { label: 'Layout Q1', settled: false, questions: [1], children: [] },
      ],
      questions: [
        {
          number: 1,
          title: 'Tree placement',
          illustrations: [
            {
              id: 'snippet',
              kind: 'code',
              fence: 'ts',
              source: 'const a = 1;\nconst b = 2;',
              code: { lang: 'ts', file: 'src/app.ts', startLine: 3, highlight: [[4, 4]] },
            },
          ],
          options: [
            { letter: 'A', mockup: { source: '<aside data-anchor="tree">tree</aside>', tailwind: false } },
            { letter: 'B' },
          ],
          recommendation: { option: 'A' },
        },
      ],
    });
    // Prose renders with raw HTML off.
    expect(round.questions[0].proseHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(round.questions[0].proseHtml).not.toContain('<script>');
  });
});

describe('present with a design tree that names earlier rounds', () => {
  const tree = (branches: string) => `\`\`\`design-tree\n${branches}\n\`\`\`\n\n`;
  const question = (n: number) => `❓ **Q${n}** - **Title ${n}**: Body.\n\n➡️ Yes.\n\n`;

  it('accepts any question of the session, rejects one no round has had, and says which round holds each', async () => {
    sandbox = new Sandbox('r3');
    const firstRound = sandbox.writeRound('round-1.md', question(1) + question(2));
    const first = await sandbox.cli(['present', firstRound, '--no-open']);
    expect(first).toMatchObject({ code: 0, stderr: '' });

    const unknown = sandbox.writeRound('bad.md', tree('- [ ] Q3 and Q4') + question(3));
    const rejected = await sandbox.cli(['present', unknown, '--no-open']);
    expect(rejected.code).toBe(1);
    expect(rejected.stderr).toBe(`${unknown}:2: design tree: Q4 is not in this round or an earlier one\n`);

    const second = sandbox.writeRound('round-2.md', tree('- [x] Storage Q1: folder\n- [ ] Runtime Q3') + question(3));
    expect(await sandbox.cli(['present', second, '--no-open'])).toMatchObject({ code: 0, stderr: '' });

    const round = await (await fetch(`${first.stdout.trim()}api/rounds/latest`)).json();
    expect(round).toMatchObject({
      number: 2,
      designTree: [
        { label: 'Storage Q1', settled: true, gist: 'folder', questions: [1], children: [] },
        { label: 'Runtime Q3', settled: false, questions: [3], children: [] },
      ],
      questionRounds: { 1: 1, 3: 2 },
    });
  });

  /** Presents rounds 1 and 2 (round 2's tree names round 1's Q1), then crashes the server. */
  async function twoRoundsThenCrash(id: string): Promise<void> {
    sandbox = new Sandbox(id);
    for (const [n, source] of [[1, question(1)], [2, tree('- [x] Storage Q1: folder') + question(2)]] as const) {
      const result = await sandbox.cli(['present', sandbox.writeRound(`round-${n}.md`, source), '--no-open']);
      expect(result).toMatchObject({ code: 0, stderr: '' });
    }
    await crash(sandbox.serverInfo(id).pid);
  }
  const roundFile = (id: string, n: number) => join(sandbox.sessionDir(id), 'rounds', `round-${n}.md`);

  it('reloads a round after a restart even when the round its tree names no longer parses', async () => {
    await twoRoundsThenCrash('r4');
    writeFileSync(roundFile('r4', 1), 'no longer a round\n');

    const url = (await sandbox.cli(['present', sandbox.writeRound('round-3.md', question(3)), '--no-open'])).stdout.trim();
    const round = await (await fetch(`${url}api/rounds/2`)).json();
    expect(round).toMatchObject({
      number: 2,
      designTree: [{ label: 'Storage Q1', settled: true, gist: 'folder', questions: [1], children: [] }],
    });
  });

  it('numbers the next round past every round file on disk, so an unparseable one is never overwritten', async () => {
    await twoRoundsThenCrash('r5');
    writeFileSync(roundFile('r5', 2), 'no longer a round\n');

    const result = await sandbox.cli(['present', sandbox.writeRound('round-3.md', question(3)), '--no-open']);
    expect(result).toMatchObject({ code: 0, stderr: '' });
    const latest = await (await fetch(`${result.stdout.trim()}api/rounds/latest`)).json();
    expect(latest.number).toBe(3);
    expect(readFileSync(roundFile('r5', 2), 'utf8')).toBe('no longer a round\n');
  });
});
