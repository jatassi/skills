// A stand-in for gh that serves a fixture instead of GitHub. FAKE_GH names a
// JSON file: { repo: { nameWithOwner, defaultBranchRef: { name } }, prs: [],
// issues: [] }. Each call's argv is appended to FAKE_GH_LOG as a JSON line.
// It honours the filters the scorer asks for (--state, --base, --label) and
// ignores --search, so the scorer's own date filtering is what's tested.

import { appendFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (process.env.FAKE_GH_LOG) appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + '\n');
if (process.env.FAKE_GH_FAIL) {
  process.stderr.write(process.env.FAKE_GH_FAIL + '\n');
  process.exit(1);
}

const fixture = JSON.parse(readFileSync(process.env.FAKE_GH, 'utf8'));
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const pick = (items) => {
  const fields = (flag('--json') ?? '').split(',').filter(Boolean);
  return items.map((item) => Object.fromEntries(fields.filter((f) => f in item).map((f) => [f, item[f]])));
};
const out = (value) => process.stdout.write(JSON.stringify(value) + '\n');

const [noun, verb] = args;
if (noun === 'repo' && verb === 'view') out(pick([fixture.repo])[0]);
else if (noun === 'pr' && verb === 'list') {
  const state = flag('--state') ?? 'open';
  const base = flag('--base');
  const prs = (fixture.prs ?? []).filter(
    (p) => (state === 'all' || p.state === state.toUpperCase()) && (base === undefined || p.baseRefName === base),
  );
  out(pick(prs));
} else if (noun === 'issue' && verb === 'list') {
  const label = flag('--label');
  out(pick((fixture.issues ?? []).filter((i) => !label || i.labels.some((l) => l.name === label))));
} else {
  process.stderr.write(`fake gh: unhandled ${args.join(' ')}\n`);
  process.exit(1);
}
