import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { postJson, Sandbox } from '../support/harness.ts';

let sandbox: Sandbox;

afterEach(async () => {
  await sandbox?.dispose(['d1']);
});

const FAILING_ROUND = `# Diagrams

❓ **Q1** - **Flow**: Which flow?

\`\`\`mermaid id=flow
flowchart LR
  a --> b
\`\`\`

\`\`\`mermaid id=clash
flowchart LR
  a_b --> c
  a --> b_c
\`\`\`

➡️ Yes.

❓ **Q2** - **Plan**: When?

\`\`\`mermaid id=plan title="Plan"
gantt
  dateFormat YYYY-MM-DD
  Alpha :a1, 2026-01-05, 3d
  Beta :b1, 2026-01-12, 2d, extra
\`\`\`

\`\`\`mermaid id=typo
flowchart LR
  a -->
\`\`\`

\`\`\`mermaid id=blank
sequenceDiagram
\`\`\`

\`\`\`mermaid id=named
flowchart LR
  a e1@--> b
  e1 --> c
\`\`\`

\`\`\`mermaid id=chosen
flowchart LR
  a L_b_c_0@--> b
  b --> c
\`\`\`

➡️ Yes.
`;

const GOOD_ROUND = `# Diagrams

❓ **Q1** - **Flow**: Which flow?

\`\`\`mermaid id=flow title="Request flow"
flowchart LR
  a[Browser] --> b[Server]
  class b recommended
\`\`\`

➡️ Yes.

❓ **Q2** - **States**: Which states?

\`\`\`mermaid id=states
stateDiagram-v2
  [*] --> Open
  Open --> Done
\`\`\`

➡️ Yes.
`;

describe('the draw check at present', () => {
  it('draws every Mermaid block and rejects the ones that throw or come out empty, explaining known failures', async () => {
    sandbox = new Sandbox('d1');
    const file = sandbox.writeRound('round.md', FAILING_ROUND);
    const result = await sandbox.cli(['present', '--agent', 'Claude Code', file, '--no-open']);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    const lines = result.stderr.trimEnd().split('\n');
    expect(lines).toHaveLength(6);
    // Explained failures point at the line to fix.
    expect(lines[0]).toMatch(
      new RegExp(
        `^${esc(file)}:10 · Q1 · illustration "clash" \\(mermaid\\): the edges "a_b --> c" and "a --> b_c" both get the id "L_a_b_c_0" because node ids contain "_"; rename those nodes without "_"`,
      ),
    );
    expect(lines[1]).toMatch(
      new RegExp(
        `^${esc(file)}:24 · Q2 · illustration "plan" \\(mermaid\\): task "Beta" has 4 metadata items after its tags; a task takes at most three \\(id, start, end or duration\\)`,
      ),
    );
    expect(lines[2]).toMatch(new RegExp(`^${esc(file)}:29 · Q2 · illustration "typo" \\(mermaid\\): Mermaid failed to draw it: Parse error on line`));
    expect(lines[3]).toBe(`${file}:32 · Q2 · illustration "blank" (mermaid): the diagram came out empty (nothing drawn)`);
    expect(lines[4]).toMatch(
      new RegExp(
        `^${esc(file)}:38 · Q2 · illustration "named" \\(mermaid\\): "e1" is used as a node in "e1 --> c" but is already the id of the edge "a --> b" \\(e1@\\)`,
      ),
    );
    expect(lines[5]).toMatch(
      new RegExp(
        `^${esc(file)}:44 · Q2 · illustration "chosen" \\(mermaid\\): the edge id "L_b_c_0" given to "a --> b" is the id Mermaid generates for "b --> c"; choose an edge id that doesn't start with "L_"`,
      ),
    );
    // Nothing is shown: a rejected first round leaves no session behind.
    expect(existsSync(sandbox.sessionDir('d1'))).toBe(false);
  });

  it('shows a round whose blocks all draw', async () => {
    sandbox = new Sandbox('d1');
    const result = await sandbox.cli(['present', '--agent', 'Claude Code', sandbox.writeRound('round.md', GOOD_ROUND), '--no-open']);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(existsSync(join(sandbox.sessionDir('d1'), 'rounds', 'round-1.md'))).toBe(true);
  });
});

describe('blocks that fail only on the page', () => {
  it('ride the submission as warnings, one per block, without waking await', async () => {
    sandbox = new Sandbox('d1');
    const url = (await sandbox.cli(['present', '--agent', 'Claude Code', sandbox.writeRound('round.md', GOOD_ROUND), '--no-open'])).stdout.trim();
    const warn = (body: unknown) => postJson(`${url}api/rounds/1/warnings`, body);

    expect((await warn({ question: 2, illustration: 'states', kind: 'draw', message: 'Could not\nlay out' })).status).toBe(200);
    // A theme redraw that fails again reports the same block again.
    expect((await warn({ question: 2, illustration: 'states', kind: 'draw', message: 'again' })).status).toBe(200);

    const early = await sandbox.cli(['await', '--timeout', '0.5']);
    expect(early.stdout).toBe('pending · round 1 · re-run await\n');

    expect((await postJson(`${url}api/rounds/1/submission`, { round: 1, answers: [{ question: 1, mode: 'accepted' }] })).status).toBe(200);
    const result = await sandbox.cli(['await', '--timeout', '5']);
    expect(result.code).toBe(0);
    const recordPath = join(sandbox.sessionDir('d1'), 'submissions', 'round-1.json');
    expect(result.stdout).toBe(`submitted · round 1 · Diagrams · 1 warning
record: ${recordPath}

Q1 Flow
   accepted: Yes.
Q2 States
   no answer (sent as unsure)
   ⚠ mermaid "states" failed to draw on the page: Could not lay out

summary:
Q1 Flow · accepted
Q2 States · no answer · 1 warning
`);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    expect(record.questions[1].warnings).toEqual([
      { kind: 'draw', illustration: { id: 'states', lang: 'mermaid' }, message: 'Could not\nlay out' },
    ]);
  });

  it('refuses a warning that names no block of the round, or comes after the submission', async () => {
    sandbox = new Sandbox('d1');
    const url = (await sandbox.cli(['present', '--agent', 'Claude Code', sandbox.writeRound('round.md', GOOD_ROUND), '--no-open'])).stdout.trim();
    const warn = (round: number, body: unknown) => postJson(`${url}api/rounds/${round}/warnings`, body);

    const unknownBlock = await warn(1, { question: 1, illustration: 'states', kind: 'draw', message: 'x' });
    expect(unknownBlock.status).toBe(400);
    expect(await unknownBlock.json()).toEqual({ error: 'Q1 has no illustration "states"' });
    expect((await warn(1, { question: 9, illustration: 'flow', kind: 'draw', message: 'x' })).status).toBe(400);
    expect((await warn(1, { question: 1, illustration: 'flow', kind: 'draw', message: ' ' })).status).toBe(400);
    expect((await warn(2, { question: 1, illustration: 'flow', kind: 'draw', message: 'x' })).status).toBe(404);

    await postJson(`${url}api/rounds/1/submission`, { round: 1, answers: [] });
    expect((await warn(1, { question: 1, illustration: 'flow', kind: 'draw', message: 'x' })).status).toBe(409);
  });
});

function esc(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
