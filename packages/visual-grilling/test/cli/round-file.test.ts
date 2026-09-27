import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Sandbox } from '../support/harness.ts';

let sandbox: Sandbox;

afterEach(async () => {
  await sandbox?.dispose(['r1', 'r2']);
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
