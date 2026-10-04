// The trust-ladder CLI, driven at its command line against scratch repos
// whose autonomy document is built from setup-milliways' real template, with a
// fake gh on PATH serving fixture merge histories.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const CLI = join(ROOT, 'skills', 'trust-ladder', 'scripts', 'trust-ladder.mjs');
const FAKE_GH = join(HERE, '..', 'support', 'fake-gh.mjs');
const TEMPLATE = readFileSync(join(ROOT, 'skills', 'setup-milliways', 'templates', 'autonomy.md'), 'utf8');
const WIN = process.platform === 'win32';
const scratch = mkdtempSync(join(tmpdir(), 'trust-ladder-'));
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));

const NOW = '2026-10-04T12:00:00.000Z';
const DAY = 86_400_000;
const ago = (days) => new Date(Date.parse(NOW) - days * DAY).toISOString();
const sha = (n) => createHash('sha1').update(String(n)).digest('hex');
const REPO = 'acme/widgets';

let n = 0;
const realGit = spawnSync(WIN ? 'where' : 'which', ['git'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim();

// A bin directory holding a gh that runs the fake, plus git.
function bin() {
  const dir = join(scratch, `bin-${n++}`);
  mkdirSync(dir);
  const shim = (name, body) => {
    const p = join(dir, WIN ? `${name}.cmd` : name);
    writeFileSync(p, WIN ? `@echo off\r\n${body}\r\n` : `#!/bin/sh\n${body}\n`);
    chmodSync(p, 0o755);
  };
  if (!WIN) shim('git', `exec "${realGit}" "$@"`);
  shim('gh', WIN ? `"${process.execPath}" "${FAKE_GH}" %*` : `exec "${process.execPath}" "${FAKE_GH}" "$@"`);
  return WIN ? [dir, dirname(realGit)].join(delimiter) : dir;
}

function run(args, { fixture, env = {} }) {
  const fixturePath = join(scratch, `fixture-${n++}.json`);
  const log = join(scratch, `gh-log-${n++}.jsonl`);
  writeFileSync(fixturePath, JSON.stringify(fixture));
  writeFileSync(log, '');
  const base = { PATH: bin(), HOME: scratch, USERPROFILE: scratch, FAKE_GH: fixturePath, FAKE_GH_LOG: log };
  for (const k of ['SystemRoot', 'PATHEXT', 'TEMP', 'TMP']) if (process.env[k]) base[k] = process.env[k];
  const r = spawnSync(process.execPath, [CLI, ...args], { env: { ...base, ...env }, encoding: 'utf8' });
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, calls };
}

// The autonomy template with its Areas rows and Rules values replaced.
function autonomy(areas, { window = 7, streak = 10 } = {}) {
  const rows = areas.map(([area, globs, rung]) => `| ${area} | ${globs.map((g) => `\`${g}\``).join(', ')} | ${rung} |`);
  const text = TEMPLATE.replace('| everything | `**` | chef |', rows.join('\n'))
    .replace('| clean-window-days | 7 |', `| clean-window-days | ${window} |`)
    .replace('| promotion-streak | 10 |', `| promotion-streak | ${streak} |`);
  assert.notEqual(text, TEMPLATE, 'the template changed shape');
  return text;
}

// A scratch repo whose autonomy document went through `history`: a list of
// [isoDate, documentText] commits, oldest first. No history: not a git repo.
function kitchen(history, { working } = {}) {
  const dir = join(scratch, `repo-${n++}`);
  mkdirSync(join(dir, 'docs', 'agents'), { recursive: true });
  const doc = join(dir, 'docs', 'agents', 'autonomy.md');
  if (history.length) {
    spawnSync('git', ['init', '-q', dir]);
    for (const [date, text] of history) {
      writeFileSync(doc, text);
      const env = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
      spawnSync('git', ['-C', dir, 'add', '-A'], { env });
      const c = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'autonomy'], { env });
      assert.equal(c.status, 0, String(c.stderr));
    }
  }
  if (working !== undefined) writeFileSync(doc, working);
  return dir;
}

function merged(number, { at, files = ['lib/a.js'], labels = [], title = `feat: change ${number}`, body = '', additions = 10, deletions = 2 }) {
  return {
    number, title, body, state: 'MERGED', baseRefName: 'main',
    url: `https://github.com/${REPO}/pull/${number}`,
    author: { login: 'agent' },
    createdAt: new Date(Date.parse(at) - 3_600_000).toISOString(),
    mergedAt: at,
    mergeCommit: { oid: sha(number) },
    labels: labels.map((name) => ({ name })),
    files: files.map((path) => ({ path, additions: 1, deletions: 0 })),
    additions, deletions,
  };
}

function opened(number, { created, title, body = '', state = 'OPEN' }) {
  return {
    number, title, body, state, baseRefName: 'main',
    url: `https://github.com/${REPO}/pull/${number}`,
    author: { login: 'agent' }, createdAt: created, mergedAt: null, mergeCommit: null,
    labels: [], files: [], additions: 1, deletions: 1,
  };
}

function garden(number, { created, body, title = 'garden: workaround' }) {
  return { number, title, body, url: `https://github.com/${REPO}/issues/${number}`, createdAt: created, labels: [{ name: 'garden' }] };
}

const fixtureOf = (prs, issues = []) => ({ repo: { nameWithOwner: REPO, defaultBranchRef: { name: 'main' } }, prs, issues });
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const area = (out, name) => out.areas.find((a) => a.area === name);

// ---------------------------------------------------------------- the main kitchen

const AREAS_CHEF = [
  ['api', ['src/api/**'], 'chef'],
  ['web', ['src/web/**'], 'chef'],
  ['docs', ['docs/**', '*.md'], 'chef'],
  ['infra', ['infra/**'], 'chef'],
  ['everything', ['**'], 'chef'],
];
const AREAS_NOW = AREAS_CHEF.map(([a, g, r]) => [a, g, a === 'docs' || a === 'infra' ? 'gated' : r]);
const GATED_AT = ago(40);

const prs = [
  // api: ten settled clean merges, then one still inside its window.
  ...range(101, 110).map((k) => merged(k, { at: ago(130 - k), files: [`src/api/${k}.ts`] })),
  merged(111, { at: ago(2), files: ['src/api/late.ts'] }),

  // web: a revert inside seven days, then nine clean merges.
  merged(200, { at: ago(40), files: ['src/web/a.tsx'] }),
  merged(201, { at: ago(25), files: ['src/web/b.tsx'] }),
  opened(202, { created: ago(23), title: 'Revert "feat: change 201"', body: `Reverts ${REPO}#201` }),
  ...range(203, 211).map((k) => merged(k, { at: ago(223 - k), files: [`src/web/${k}.tsx`] })),

  // everything: a fix-forward PR, a link after the window, a closing keyword
  // that isn't a fix-forward, and a reference to another repo's #305.
  merged(300, { at: ago(30), files: ['lib/x.js'] }),
  { ...merged(301, { at: ago(29), files: ['lib/x.js'], title: 'fix: null check', body: 'Fix-forward: #300 missed a null check.' }), createdAt: ago(29.5) },
  merged(302, { at: ago(30), files: ['lib/y.js'] }),
  merged(303, { at: ago(20), files: ['lib/z.js'] }),
  opened(304, { created: ago(19), title: 'fix: tidy', body: 'Fixes #303' }),
  merged(305, { at: ago(20), files: ['lib/w.js'] }),
  opened(306, { created: ago(19), title: 'Revert "something"', body: 'Reverts #300 by accident', state: 'CLOSED' }),
  // A revert whose quoted title and context mention #303: only #308 is reverted.
  merged(308, { at: ago(20), files: ['lib/v.js'], title: 'feat: follow-up to #303' }),
  opened(309, { created: ago(19), title: 'Revert "feat: follow-up to #303"', body: `Reverts ${REPO}#308\n\nContext: #303.` }),

  // docs: an unclean merge from before the area was gated.
  merged(400, { at: ago(50), files: ['docs/guide.md'] }),
  opened(401, { created: ago(49), title: 'Revert "feat: change 400"', body: `This reverts commit ${sha(400)}.` }),

  // infra: gated, then two unclean merges, by garden issue.
  merged(500, { at: ago(10), files: ['infra/main.tf'] }),
  merged(501, { at: ago(9), files: ['infra/net.tf'] }),

  // Yesterday's merges, for the digest.
  merged(600, { at: ago(0.5), files: ['db/migrations/001.sql'], labels: ['unit-test-verified'], additions: 40, deletions: 2 }),
  merged(601, {
    at: ago(0.2), files: ['src/api/auth.ts'], labels: ['door:one-way', 'live-ui-verified'],
    body: '## Merge danger\n\nBlast radius: high. Every signed-in request.', additions: 600, deletions: 100,
  }),
  merged(602, { at: ago(0.8), files: ['README.md'], labels: ['live-ui-verified'], additions: 3, deletions: 0 }),
  merged(603, { at: ago(1.5), files: ['lib/q.js'] }),

  // Too old for the lookback.
  merged(700, { at: ago(200), files: ['src/web/old.tsx'] }),
];

const issues = [
  garden(900, { created: ago(22), body: `Workaround from https://github.com/${REPO}/pull/302` }),
  garden(901, { created: ago(19), body: 'Same as other/repo#305' }),
  garden(902, { created: ago(8), body: 'Retry loop added in #500 to dodge a flaky apply.' }),
  garden(903, { created: ago(7), body: `Hard-coded region in ${sha(501).slice(0, 7)}` }),
];

const FIXTURE = fixtureOf(prs, issues);
const DIR = kitchen([[ago(60), autonomy(AREAS_CHEF)], [GATED_AT, autonomy(AREAS_NOW)]]);

describe('scoring a kitchen', () => {
  const r = run(['score', '--repo', DIR, '--now', NOW], { fixture: FIXTURE });
  const out = r.status === 0 ? JSON.parse(r.stdout) : null;
  const unclean = (pr) => out.unclean.find((u) => u.pr === pr);

  test('succeeds with JSON', () => assert.equal(r.status, 0, r.stderr));

  test('echoes the rules it read from the document', () => {
    assert.deepEqual(out.rules, { cleanWindowDays: 7, promotionStreak: 10 });
    assert.equal(out.repo, REPO);
    assert.equal(out.now, NOW);
  });

  test('ten consecutive clean merges make a promotion due; a pending merge neither counts nor breaks', () => {
    assert.equal(area(out, 'api').streak, 10);
    assert.equal(area(out, 'api').pending, 2);
    const promo = out.promotions.find((p) => p.area === 'api');
    assert.ok(promo);
    assert.equal(promo.streak, 10);
    assert.deepEqual(promo.prs, range(101, 110));
  });

  test('a revert inside seven days makes a merge unclean and restarts the streak', () => {
    assert.deepEqual(unclean(201).links, [{ kind: 'revert', number: 202, url: `https://github.com/${REPO}/pull/202`, createdAt: ago(23) }]);
    assert.deepEqual(unclean(201).areas, ['web']);
    assert.equal(area(out, 'web').streak, 9);
    assert.equal(out.promotions.find((p) => p.area === 'web'), undefined);
  });

  test('a fix-forward PR makes a merge unclean', () => {
    assert.deepEqual(unclean(300).links.map((l) => [l.kind, l.number]), [['fix-forward', 301]]);
  });

  test('a garden issue makes a merge unclean, by number or by merge commit', () => {
    assert.deepEqual(unclean(500).links.map((l) => [l.kind, l.number]), [['garden', 902]]);
    assert.deepEqual(unclean(501).links.map((l) => [l.kind, l.number]), [['garden', 903]]);
  });

  test('a revert links only to the merge it names as reverted', () => {
    assert.deepEqual(unclean(308).links.map((l) => [l.kind, l.number]), [['revert', 309]]);
    assert.equal(unclean(303), undefined);
  });

  test('a revert found by merge commit SHA counts', () => {
    assert.deepEqual(unclean(400).links.map((l) => [l.kind, l.number]), [['revert', 401]]);
  });

  test('a link after seven days, a closing keyword, another repo and a closed PR do not count', () => {
    for (const pr of [302, 303, 305]) assert.equal(unclean(pr), undefined, `#${pr}`);
    assert.deepEqual(unclean(300).links.map((l) => l.number), [301]);
  });

  test('an unclean merge in a gated area makes a demotion due', () => {
    assert.deepEqual(out.demotions, [{ area: 'infra', prs: [500, 501] }]);
  });

  test('an unclean merge from before the area was gated does not demote it', () => {
    assert.equal(area(out, 'docs').rung, 'gated');
    assert.equal(area(out, 'docs').gatedSince, GATED_AT);
    assert.equal(area(out, 'web').gatedSince, null);
  });

  test('every area is reported in document order, with counts', () => {
    assert.deepEqual(out.areas.map((a) => a.area), ['api', 'web', 'docs', 'infra', 'everything']);
    const web = area(out, 'web');
    assert.deepEqual([web.rung, web.merges, web.unclean], ['chef', 11, [201]]);
  });

  test('merges older than the lookback are left out', () => {
    assert.equal(area(out, 'web').merges, 11);
  });

  test('the digest ranks yesterday\'s merges by risk', () => {
    assert.deepEqual(out.digest.from, ago(1));
    assert.deepEqual(out.digest.to, NOW);
    assert.deepEqual(out.digest.merges.map((m) => [m.rank, m.pr]), [[1, 601], [2, 600], [3, 602]]);
    for (const m of out.digest.merges) {
      assert.equal(m.score, Object.values(m.factors).reduce((a, b) => a + b, 0), `#${m.pr}`);
    }
  });

  test('the digest names why each merge is risky', () => {
    const [m601, m600, m602] = out.digest.merges;
    assert.deepEqual(m601.door, { oneWay: true, label: true, paths: [] });
    assert.equal(m601.blastRadius, 'high');
    assert.equal(m601.verifier, 'live-ui-verified');
    assert.deepEqual(m601.size, { additions: 600, deletions: 100, files: 1 });
    assert.deepEqual(m600.door, { oneWay: true, label: false, paths: ['db/migrations/001.sql'] });
    assert.ok(m600.factors.verifier > m601.factors.verifier);
    assert.deepEqual(m602.areas, ['docs']);
    assert.equal(m602.rung, 'gated');
    assert.equal(m602.newlyGated, true);
    assert.ok(m602.factors.newlyGated > 0);
    assert.equal(m600.newlyGated, false);
  });

  test('output is stable across runs', () => {
    const again = run(['score', '--repo', DIR, '--now', NOW], { fixture: FIXTURE });
    assert.equal(again.stdout, r.stdout);
  });

  test('history is fetched through gh with date-bounded searches', () => {
    const merged = r.calls.find((c) => c[0] === 'pr' && c.includes('merged'));
    assert.ok(merged.includes('--base') && merged[merged.indexOf('--base') + 1] === 'main');
    assert.ok(merged[merged.indexOf('--search') + 1].includes('merged:>=2026-07-06'));
    const garden = r.calls.find((c) => c[0] === 'issue');
    assert.equal(garden[garden.indexOf('--label') + 1], 'garden');
  });
});

describe('options', () => {
  test('--since widens the digest', () => {
    const r = run(['score', '--repo', DIR, '--now', NOW, '--since', ago(1.9)], { fixture: FIXTURE });
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.digest.merges.map((m) => m.pr).sort(), [600, 601, 602, 603]);
  });

  test('--base overrides the default branch', () => {
    const r = run(['score', '--repo', DIR, '--now', NOW, '--base', 'dev'], { fixture: FIXTURE });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).digest.merges, []);
  });

  test('--autonomy reads the document from another path', () => {
    const doc = join(scratch, 'elsewhere.md');
    writeFileSync(doc, autonomy([['all', ['**'], 'chef']], { streak: 3 }));
    const r = run(['score', '--repo', DIR, '--now', NOW, '--autonomy', doc], { fixture: FIXTURE });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).rules.promotionStreak, 3);
  });
});

describe('thresholds come from the document', () => {
  const dir = kitchen([], { working: autonomy([['api', ['src/**'], 'chef'], ['rest', ['**'], 'chef']], { window: 2, streak: 3 }) });
  const fixture = fixtureOf(
    [...[10, 9, 8].map((d, i) => merged(10 + i, { at: ago(d), files: ['src/a.ts'] })), merged(20, { at: ago(5), files: ['src/b.ts'] })],
    [garden(30, { created: ago(2), body: 'from #20' })],
  );
  const r = run(['score', '--repo', dir, '--now', NOW], { fixture });
  const out = JSON.parse(r.stdout);

  test('a link three days later is outside a two-day window', () => {
    assert.deepEqual(out.unclean, []);
    assert.equal(area(out, 'api').streak, 4);
  });

  test('a streak of three promotes when the document says three', () => {
    assert.deepEqual(out.promotions, [{ area: 'api', streak: 4, prs: [10, 11, 12, 20] }]);
  });

  test('without git history, gated areas have no gatedSince', () => {
    assert.equal(area(out, 'api').gatedSince, null);
  });
});

describe('a gated area without git history', () => {
  const doc = autonomy([['old', ['old/**'], 'gated'], ['new', ['new/**'], 'gated']], { streak: 3 });
  const dir = kitchen([], { working: doc });
  const revert = (pr, at) => opened(pr + 1, { created: at, title: 'Revert "x"', body: `Reverts #${pr}` });
  const fixture = fixtureOf([
    // old: unclean, then three clean merges that could have earned the rung.
    merged(1, { at: ago(60), files: ['old/a'] }), revert(1, ago(59)),
    ...[50, 49, 48].map((d, i) => merged(10 + i, { at: ago(d), files: ['old/b'] })),
    // new: unclean with no earning run after it.
    merged(20, { at: ago(30), files: ['new/a'] }), merged(22, { at: ago(20), files: ['new/b'] }), revert(22, ago(19)),
  ]);
  const out = JSON.parse(run(['score', '--repo', dir, '--now', NOW], { fixture }).stdout);

  test('demotes for unclean merges after the latest run of promotion-streak clean merges', () => {
    assert.deepEqual(out.demotions, [{ area: 'new', prs: [22] }]);
  });

  test('reports gatedSince as unknown', () => {
    assert.deepEqual(out.areas.map((a) => a.gatedSince), [null, null]);
  });
});

describe('a shallow clone', () => {
  const dir = join(scratch, `shallow-${n++}`);
  spawnSync('git', ['clone', '-q', '--no-local', '--depth', '1', DIR, dir]);
  test('cannot tell when an area was gated', () => {
    const out = JSON.parse(run(['score', '--repo', dir, '--now', NOW], { fixture: FIXTURE }).stdout);
    assert.equal(area(out, 'docs').gatedSince, null);
  });
});

describe('failures', () => {
  test('no autonomy document', () => {
    const dir = join(scratch, `empty-${n++}`);
    mkdirSync(dir);
    const r = run(['score', '--repo', dir, '--now', NOW], { fixture: fixtureOf([]) });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /autonomy/);
  });

  test('a rung that is neither chef nor gated', () => {
    const dir = kitchen([], { working: autonomy([['all', ['**'], 'admin']]) });
    const r = run(['score', '--repo', dir, '--now', NOW], { fixture: fixtureOf([]) });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /admin/);
  });

  test('gh failing', () => {
    const r = run(['score', '--repo', DIR, '--now', NOW], { fixture: FIXTURE, env: { FAKE_GH_FAIL: 'not logged in' } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /not logged in/);
    assert.equal(r.stdout, '');
  });

  test('an unknown option', () => {
    const r = run(['score', '--bogus'], { fixture: FIXTURE });
    assert.equal(r.status, 2);
  });

  test('--help', () => {
    const r = run(['--help'], { fixture: FIXTURE });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /score/);
  });
});
