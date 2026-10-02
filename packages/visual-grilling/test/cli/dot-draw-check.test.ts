import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Sandbox } from '../support/harness.ts';

let sandbox: Sandbox;

afterEach(async () => {
  await sandbox?.dispose(['g1']);
});

const FAILING_ROUND = `# Graphs

❓ **Q1** - **Deps**: Which dependencies?

\`\`\`dot id=deps
digraph { api -> db }
\`\`\`

\`\`\`dot id=typo title="Typo"
digraph {
  api -> db
  db -> [
}
\`\`\`

➡️ Yes.

❓ **Q2** - **Layout**: Which layout?

\`\`\`dot id=blank
digraph {}
\`\`\`

\`\`\`dot id=engine
graph { layout=nope; a -- b }
\`\`\`

➡️ Yes.
`;

const GOOD_ROUND = `# Graphs

❓ **Q1** - **Deps**: Which dependencies?

\`\`\`dot id=deps title="Dependencies"
digraph {
  api [class=recommended]
  api -> db [class=risk]
}
\`\`\`

\`\`\`dot id=ring
graph { layout=circo; a -- b -- c -- a }
\`\`\`

\`\`\`dot id=caption
graph { label="Only a caption" }
\`\`\`

➡️ Yes.
`;

describe('the draw check for dot blocks', () => {
  it('rejects a DOT source that fails to draw or draws empty, pointing at the line', async () => {
    sandbox = new Sandbox('g1');
    const file = sandbox.writeRound('round.md', FAILING_ROUND);
    const result = await sandbox.cli(['present', '--agent', 'Claude Code', file, '--no-open']);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trimEnd().split('\n')).toEqual([
      `${file}:12 · Q1 · illustration "typo" (dot): Graphviz failed to draw it: syntax error in line 3 near '['`,
      `${file}:20 · Q2 · illustration "blank" (dot): the graph came out empty (nothing drawn)`,
      `${file}:24 · Q2 · illustration "engine" (dot): Graphviz failed to draw it: Layout type: "nope" not recognized. Use one of: circo dot fdp neato nop nop1 nop2 osage patchwork sfdp twopi`,
    ]);
    expect(existsSync(sandbox.sessionDir('g1'))).toBe(false);
  });

  it('shows a round whose DOT blocks all draw, with any layout the source names', async () => {
    sandbox = new Sandbox('g1');
    const result = await sandbox.cli(['present', '--agent', 'Claude Code', sandbox.writeRound('round.md', GOOD_ROUND), '--no-open']);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });
});
