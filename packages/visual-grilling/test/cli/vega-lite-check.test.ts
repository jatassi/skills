import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Sandbox } from '../support/harness.ts';

let sandbox: Sandbox;

afterEach(async () => {
  await sandbox?.dispose(['v1']);
});

const ROWS = '"values": [{"runtime": "Bun", "ms": 60}, {"runtime": "Node", "ms": 120}]';
const BARS = '"mark": "bar", "encoding": {"x": {"field": "runtime", "type": "nominal"}, "y": {"field": "ms", "type": "quantitative"}}';

const FAILING_ROUND = `# Charts

❓ **Q1** - **Speed**: Which runtime?

\`\`\`vega-lite id=typo
{
  "data": {${ROWS}},
  "mark": "bar",,
}
\`\`\`

\`\`\`vega-lite id=remote
{
  "data": {
    "url": "https://example.com/data.json"
  },
  ${BARS}
}
\`\`\`

\`\`\`vega-lite id=raw
{"$schema": "https://vega.github.io/schema/vega/v6.json", "marks": []}
\`\`\`

➡️ Yes.

❓ **Q2** - **Cost**: How much?

\`\`\`vega-lite id=badexpr
{"data": {${ROWS}}, "transform": [{"calculate": "datum.ms +* 2", "as": "x2"}], ${BARS}}
\`\`\`

\`\`\`vega-lite id=missing
{"data": {${ROWS}}, "transform": [{"calculate": "datum.cost.usd", "as": "usd"}], ${BARS}}
\`\`\`

\`\`\`vega-lite id=nothing
{"data": {${ROWS}}, "transform": [{"filter": "datum.ms > 1000"}], ${BARS}}
\`\`\`

\`\`\`vega-lite id=csv
{"data": {"values": "runtime,ms\\nBun,60", "format": {"type": "csv"}}, ${BARS}}
\`\`\`

➡️ Yes.
`;

describe('the draw check for vega-lite blocks', () => {
  it('rejects charts that are not JSON, load URL data, are raw Vega, throw or come out empty', async () => {
    sandbox = new Sandbox('v1');
    const file = sandbox.writeRound('round.md', FAILING_ROUND);
    const result = await sandbox.cli(['present', file, '--no-open']);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    const lines = result.stderr.trimEnd().split('\n');
    expect(lines).toEqual([
      expect.stringMatching(new RegExp(`^${esc(file)}:8 · Q1 · illustration "typo" \\(vega-lite\\): the chart must be JSON: `)),
      `${file}:15 · Q1 · illustration "remote" (vega-lite): data must be inline in data.values; URL data ("https://example.com/data.json") is never loaded`,
      `${file}:21 · Q1 · illustration "raw" (vega-lite): raw Vega is not supported: write a Vega-Lite spec (mark, layer, concat, facet or repeat)`,
      `${file}:29 · Q2 · illustration "badexpr" (vega-lite): Vega-Lite failed to draw it: Unexpected token *`,
      `${file}:33 · Q2 · illustration "missing" (vega-lite): Vega-Lite failed to draw it: Cannot read properties of undefined (reading 'usd')`,
      `${file}:37 · Q2 · illustration "nothing" (vega-lite): the chart came out empty (no marks drawn)`,
      `${file}:42 · Q2 · illustration "csv" (vega-lite): inline CSV can't be parsed under the page's security policy; write data.values as JSON rows`,
    ]);
    expect(existsSync(sandbox.sessionDir('v1'))).toBe(false);
  });

  it('shows a round whose charts all draw, with or without their own $schema and config', async () => {
    sandbox = new Sandbox('v1');
    const round = `# Charts

❓ **Q1** - **Speed**: Which runtime?

\`\`\`vega-lite id=speed title="Cold start"
{"data": {${ROWS}}, ${BARS}}
\`\`\`

\`\`\`vega-lite id=own
{"$schema": "https://vega.github.io/schema/vega-lite/v5.json", "config": {"mark": {"color": "#ff00ff"}}, "data": {${ROWS}}, ${BARS}}
\`\`\`

➡️ Bun.
`;
    const result = await sandbox.cli(['present', sandbox.writeRound('round.md', round), '--no-open']);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });
});

function esc(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
