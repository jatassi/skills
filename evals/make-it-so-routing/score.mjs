#!/usr/bin/env node
// Prints the per-split score of a routing run and each misroute.
// usage: node evals/make-it-so-routing/score.mjs <result.json>
// The result comes from: claude plugin eval . --ablation none --keep-temp --json <result.json>
// (--keep-temp keeps the traces this reads the chosen route from).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const result = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const label = (c) => {
  const yaml = readFileSync(join(result.suite.root, c.dir, 'case.yaml'), 'utf8');
  return [yaml.match(/^tags: \[(\w+)/m)[1], yaml.match(/^expected_outcome: (.+)$/m)[1]];
};

const chosenRoute = (tracePath) => {
  let text = '';
  try {
    for (const line of readFileSync(tracePath, 'utf8').split('\n')) {
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.type !== 'assistant') continue;
      for (const block of event.message.content) if (block.type === 'text') text = block.text;
    }
  } catch {
    return '(no trace)';
  }
  return text.match(/ROUTE:\s*[*`]*(?:milliways:)?([\w-]+)[*`.]*\s*$/)?.[1] ?? '(no route)';
};

const splits = {};
let errors = 0;
for (const c of result.cases) {
  const [split, expected] = label(c);
  for (const run of c.arms.with) {
    const s = (splits[split] ??= { pass: 0, total: 0 });
    s.total++;
    if (run.error) errors++;
    if (run.passed) s.pass++;
    else console.log(`miss  ${split.padEnd(7)} ${c.name.padEnd(24)} want ${expected.padEnd(17)} got ${chosenRoute(run.tracePath)}`);
  }
}
for (const [split, { pass, total }] of Object.entries(splits)) console.log(`${split} ${pass}/${total}`);
console.log(`runs with errors: ${errors}, cost $${result.costUsd.toFixed(2)}`);
