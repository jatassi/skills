// The setup-milliways CLI, driven at its command line against scratch repos.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'skills', 'setup-milliways', 'scripts', 'setup-milliways.mjs');
const WIN = process.platform === 'win32';
const scratch = mkdtempSync(join(tmpdir(), 'setup-milliways-'));
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 5 }));

const DOCS = ['issue-tracker', 'triage-labels', 'domain', 'models', 'verification', 'autonomy', 'garden'];
const ROOT_LINE = 'Start every non-trivial task with the `make-it-so` skill. Kitchen config: `docs/agents/AGENTS.md`.';

let n = 0;
const realGit = spawnSync(WIN ? 'where' : 'which', ['git'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim();

// A bin directory holding only what the test puts there, plus git. On POSIX
// git is a shim, so nothing else from git's directory leaks onto PATH.
function bin(tools = {}) {
  const dir = join(scratch, `bin-${n++}`);
  mkdirSync(dir);
  const shim = (name, body) => {
    const p = join(dir, WIN ? `${name}.cmd` : name);
    writeFileSync(p, WIN ? `@echo off\r\n${body}\r\n` : `#!/bin/sh\n${body}\n`);
    chmodSync(p, 0o755);
  };
  if (!WIN) shim('git', `exec "${realGit}" "$@"`);
  for (const [name, body] of Object.entries(tools)) shim(name, body);
  return WIN ? [dir, dirname(realGit)].join(delimiter) : dir;
}

function run(args, { env = {}, path = bin() } = {}) {
  const base = { PATH: path, HOME: scratch, USERPROFILE: scratch };
  for (const k of ['SystemRoot', 'PATHEXT', 'TEMP', 'TMP']) if (process.env[k]) base[k] = process.env[k];
  const r = spawnSync(process.execPath, [CLI, ...args], { env: { ...base, ...env }, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, lines: r.stdout.trim().split('\n').filter(Boolean) };
}

function repo(files = {}, { remote = 'https://github.com/acme/widgets.git' } = {}) {
  const dir = join(scratch, `repo-${n++}`);
  mkdirSync(dir);
  spawnSync('git', ['init', '-q', dir]);
  if (remote) spawnSync('git', ['-C', dir, 'remote', 'add', 'origin', remote]);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const read = (dir, path) => readFileSync(join(dir, path), 'utf8');
const detect = (dir, opts) => JSON.parse(run(['detect', '--repo', dir], opts).stdout);

function snapshot(dir) {
  const out = {};
  for (const p of ['AGENTS.md', 'docs/agents/AGENTS.md', ...DOCS.map((d) => `docs/agents/${d}.md`)])
    out[p] = existsSync(join(dir, p)) ? read(dir, p) : null;
  return out;
}

describe('a scratch repo becomes a kitchen', () => {
  const dir = repo({
    'AGENTS.md': '# Widgets\n\nUse pnpm.\n',
    'CLAUDE.md': 'Always run the linter.\n',
    'CONTEXT.md': '# Glossary\n\n**Widget**: a thing.\n',
  });
  const found = detect(dir);
  const result = run(['write', '--repo', dir, '--families', 'anthropic']);

  test('detect reports the GitHub repo, the CLAUDE.md and the CONTEXT.md', () => {
    assert.equal(found.github, 'acme/widgets');
    assert.deepEqual(found.claudeMd, ['CLAUDE.md']);
    assert.deepEqual(found.context, [{ from: 'CONTEXT.md', to: 'GLOSSARY.md', conflict: false }]);
    assert.equal(found.agentsMd.rootLine, false);
    assert.deepEqual(found.docsAgents.missing, DOCS.map((d) => `docs/agents/${d}.md`));
  });

  test('write succeeds', () => assert.equal(result.status, 0, result.stderr));

  test('the root AGENTS.md gains exactly the one directive line, above what was there', () => {
    assert.equal(read(dir, 'AGENTS.md'), `${ROOT_LINE}\n\n# Widgets\n\nUse pnpm.\n`);
    assert.ok(result.lines.includes('added root line to AGENTS.md'));
  });

  test('every config document is written and listed in the docs/agents index', () => {
    const index = read(dir, 'docs/agents/AGENTS.md');
    for (const d of DOCS) {
      assert.ok(existsSync(join(dir, 'docs/agents', `${d}.md`)), d);
      assert.ok(result.lines.includes(`created docs/agents/${d}.md`), d);
      assert.match(index, new RegExp(`^\\| [^|]+ \\| \\[${d}\\.md\\]\\(${d}\\.md\\) \\| .+ \\|$`, 'm'));
    }
    assert.ok(result.lines.includes('created docs/agents/AGENTS.md'));
  });

  test('the issue tracker names the repo and the wayfinder operations', () => {
    const text = read(dir, 'docs/agents/issue-tracker.md');
    assert.match(text, /acme\/widgets/);
    assert.match(text, /wayfinder:map/);
  });

  test('the issue tracker gives cloud threads a REST path on the repo', () => {
    const text = read(dir, 'docs/agents/issue-tracker.md');
    assert.match(text, /^## Cloud threads: REST through `gh api`$/m);
    assert.match(text, /This GraphQL query is not enabled for this session/);
    assert.match(text, /gh api repos\/acme\/widgets\/issues --method POST/);
    assert.match(text, /gh api repos\/acme\/widgets\/pulls --method POST/);
  });

  test('CONTEXT.md is renamed GLOSSARY.md, content intact', () => {
    assert.equal(existsSync(join(dir, 'CONTEXT.md')), false);
    assert.equal(read(dir, 'GLOSSARY.md'), '# Glossary\n\n**Widget**: a thing.\n');
    assert.ok(result.lines.includes('renamed CONTEXT.md -> GLOSSARY.md'));
  });

  test('CLAUDE.md is left for the agent to offer folding', () => {
    assert.equal(read(dir, 'CLAUDE.md'), 'Always run the linter.\n');
  });

  test('the autonomy document follows its schema', () => {
    const text = read(dir, 'docs/agents/autonomy.md');
    const table = (heading) => {
      const body = text.split(`\n## ${heading}\n`)[1].split('\n## ')[0];
      return body
        .split('\n')
        .filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l))
        .slice(1)
        .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
    };
    assert.deepEqual(table('Areas'), [['everything', '`**`', 'chef']]);
    assert.deepEqual(table('Rules'), [
      ['clean-window-days', '7'],
      ['promotion-streak', '10'],
    ]);
    assert.match(text, /\n## One-way doors\n[\s\S]*\n### Paths\n[\s\S]*\n- `[^`]+`\n[\s\S]*\n### Changes\n/);
  });
});

describe('the models document', () => {
  const roles = (dir) =>
    Object.fromEntries(
      read(dir, 'docs/agents/models.md')
        .split('\n## Roles\n')[1]
        .split('\n## ')[0]
        .split('\n')
        .filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l))
        .slice(1)
        .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
        .map(([role, model, effort]) => [role, { model, effort }]),
    );

  test('names tiers only, with the default roles, when only anthropic is reachable', () => {
    const dir = repo();
    run(['write', '--repo', dir, '--families', 'anthropic']);
    const text = read(dir, 'docs/agents/models.md');
    assert.doesNotMatch(text, /\d+\.\d+|claude-|gpt-|gemini-\d/i);
    assert.match(text, /^Detected families: anthropic$/m);
    const r = roles(dir);
    assert.deepEqual(r.judgment, { model: 'opus', effort: 'high' });
    assert.deepEqual(r['hardest-code'], { model: 'opus', effort: 'high' });
    assert.equal(r.code.model, 'sonnet');
    assert.equal(r.explorer.model, 'sonnet');
    assert.equal(r.verifier.model, 'opus');
    assert.equal(r['review-panel'].model, 'opus, opus, opus');
    assert.equal(r.interrogate.model, 'opus, opus, opus');
    assert.equal(r['verifier-diff-audit'], undefined);
    assert.ok(Object.values(r).every(({ model }) => !/fable/.test(model)));
  });

  test('gives a detected second family one diff-audit lane and one interrogate seat', () => {
    const dir = repo();
    const path = bin({ codex: 'exit 0' });
    const found = detect(dir, { path });
    assert.deepEqual(found.families, ['openai']);
    run(['write', '--repo', dir], { path, env: { CLAUDECODE: '1' } });
    const text = read(dir, 'docs/agents/models.md');
    assert.match(text, /^Detected harness: claude-code$/m);
    assert.match(text, /^Detected families: anthropic, openai$/m);
    const r = roles(dir);
    assert.equal(r['verifier-diff-audit'].model, 'codex:sol');
    assert.equal(r.interrogate.model, 'opus, opus, codex:sol');
    assert.equal(r['review-panel'].model, 'opus, opus, opus');
    assert.doesNotMatch(text, /\d+\.\d+/);
  });

  test('detects the harness from the environment', () => {
    const dir = repo();
    assert.deepEqual(detect(dir, { env: { CLAUDE_CODE_REMOTE: 'true' } }).harness, { name: 'claude-code', family: 'anthropic', cloud: true });
    assert.deepEqual(detect(dir, { env: { CODEX_SANDBOX: 'seatbelt' } }).families, ['openai']);
    assert.deepEqual(detect(dir, { env: { GEMINI_CLI: '1' } }).harness.name, 'gemini-cli');
    assert.deepEqual(detect(dir).harness.name, 'unknown');
  });

  test('under a Codex harness, the second family is one other than openai', () => {
    const dir = repo();
    const codexOnly = detect(dir, { path: bin({ codex: 'exit 0' }), env: { CODEX_SANDBOX: 'seatbelt' } });
    assert.equal(codexOnly.secondFamily, null);
    const withClaude = detect(dir, { path: bin({ codex: 'exit 0', claude: 'exit 0' }), env: { CODEX_SANDBOX: 'seatbelt' } });
    assert.equal(withClaude.secondFamily, 'anthropic');
    run(['write', '--repo', dir], { path: bin({ codex: 'exit 0' }), env: { CODEX_SANDBOX: 'seatbelt' } });
    const r = roles(dir);
    assert.equal(r['verifier-diff-audit'], undefined);
    assert.equal(r.interrogate.model, 'opus, opus, opus');
  });

  test('rejects an option given without its value', () => {
    for (const args of [['detect', '--repo'], ['write', '--families'], ['write', '--repo', '--dry-run']]) {
      const r = run(args);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, new RegExp(`${args[1]} needs a value`));
      assert.equal(r.stdout, '');
    }
  });

  test('rejects an unknown family', () => {
    const r = run(['write', '--repo', repo(), '--families', 'anthropic,acme']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unknown family: acme/);
  });
});

describe('a second run', () => {
  test('changes nothing the user edited by hand, and fills only what is missing', () => {
    const dir = repo({ 'AGENTS.md': '# Widgets\n' });
    run(['write', '--repo', dir, '--families', 'anthropic']);
    const edit = (p, f) => writeFileSync(join(dir, p), f(read(dir, p)));
    edit('AGENTS.md', (t) => t + '\nMy own note.\n');
    edit('docs/agents/models.md', (t) => t.replace('| judgment | opus |', '| judgment | fable |'));
    edit('docs/agents/autonomy.md', (t) => t.replace('| everything | `**` | chef |', '| api | `src/api/**` | gated |\n| everything | `**` | chef |'));
    // As if verification.md were new in this version of setup-milliways.
    edit('docs/agents/AGENTS.md', (t) =>
      t
        .replace('| Garden |', '| My garden |')
        .split('\n')
        .filter((l) => !l.includes('(verification.md)'))
        .join('\n'),
    );
    rmSync(join(dir, 'docs/agents/verification.md'));
    const before = snapshot(dir);

    const r = run(['write', '--repo', dir, '--families', 'anthropic']);
    assert.equal(r.status, 0, r.stderr);
    const after = snapshot(dir);
    for (const p of Object.keys(before)) if (p !== 'docs/agents/verification.md' && p !== 'docs/agents/AGENTS.md') assert.equal(after[p], before[p], p);
    assert.ok(r.lines.includes('kept root line in AGENTS.md'));
    assert.ok(r.lines.includes('created docs/agents/verification.md'));
    assert.ok(r.lines.includes('indexed docs/agents/verification.md'));
    // The index keeps the hand edit and has one row per document.
    assert.match(after['docs/agents/AGENTS.md'], /\| My garden \|/);
    assert.equal(after['docs/agents/AGENTS.md'].match(/\(verification\.md\)/g).length, 1);

    const third = run(['write', '--repo', dir, '--families', 'anthropic']);
    assert.deepEqual(snapshot(dir), after);
    assert.ok(third.lines.every((l) => l.startsWith('kept ')), third.stdout);
  });

  test('flags the models document as stale when the detected families changed', () => {
    const dir = repo();
    run(['write', '--repo', dir, '--families', 'anthropic']);
    const before = read(dir, 'docs/agents/models.md');
    const r = run(['write', '--repo', dir, '--families', 'anthropic,openai']);
    assert.ok(r.lines.includes('stale docs/agents/models.md: detected anthropic, openai; the document records anthropic'), r.stdout);
    assert.equal(read(dir, 'docs/agents/models.md'), before);
  });

  test('keeps a reworded directive line, and adds the line when AGENTS.md only mentions make-it-so', () => {
    const reworded = repo({ 'AGENTS.md': 'Begin with make-it-so; config is in docs/agents/AGENTS.md.\n' });
    assert.ok(run(['write', '--repo', reworded, '--families', 'anthropic']).lines.includes('kept root line in AGENTS.md'));
    assert.equal(read(reworded, 'AGENTS.md'), 'Begin with make-it-so; config is in docs/agents/AGENTS.md.\n');
    const mention = repo({ 'AGENTS.md': 'We tried make-it-so once.\n' });
    run(['write', '--repo', mention, '--families', 'anthropic']);
    assert.equal(read(mention, 'AGENTS.md'), `${ROOT_LINE}\n\nWe tried make-it-so once.\n`);
  });

  test('a dry run changes nothing', () => {
    const dir = repo({ 'CONTEXT.md': 'x\n' });
    const r = run(['write', '--repo', dir, '--dry-run', '--families', 'anthropic']);
    assert.ok(r.lines.includes('would create AGENTS.md'));
    assert.ok(r.lines.includes('would rename CONTEXT.md -> GLOSSARY.md'));
    assert.equal(existsSync(join(dir, 'AGENTS.md')), false);
    assert.equal(existsSync(join(dir, 'docs')), false);
    assert.equal(read(dir, 'CONTEXT.md'), 'x\n');
  });

  test('never renames a CONTEXT.md over an existing GLOSSARY.md', () => {
    const dir = repo({ 'CONTEXT.md': 'old\n', 'GLOSSARY.md': 'new\n' });
    const r = run(['write', '--repo', dir, '--families', 'anthropic']);
    assert.ok(r.lines.includes('conflict CONTEXT.md: GLOSSARY.md already exists'));
    assert.equal(read(dir, 'CONTEXT.md'), 'old\n');
    assert.equal(read(dir, 'GLOSSARY.md'), 'new\n');
  });

  test('rewrites map links only to glossaries that were renamed', () => {
    const dir = repo({
      'CONTEXT-MAP.md': '- [a](src/a/CONTEXT.md)\n- [b](./src/b/CONTEXT.md)\n',
      'src/a/CONTEXT.md': 'a\n',
      'src/b/CONTEXT.md': 'b\n',
      'src/b/GLOSSARY.md': 'b already\n',
    });
    const r = run(['write', '--repo', dir, '--families', 'anthropic']);
    assert.ok(r.lines.includes('conflict src/b/CONTEXT.md: src/b/GLOSSARY.md already exists'));
    assert.equal(read(dir, 'GLOSSARY-MAP.md'), '- [a](src/a/GLOSSARY.md)\n- [b](./src/b/CONTEXT.md)\n');
  });

  test('keeps CRLF line endings in the files it edits', () => {
    const dir = repo({ 'AGENTS.md': '# Widgets\r\n\r\nUse pnpm.\r\n' });
    run(['write', '--repo', dir, '--families', 'anthropic']);
    assert.equal(read(dir, 'AGENTS.md'), `${ROOT_LINE}\r\n\r\n# Widgets\r\n\r\nUse pnpm.\r\n`);
    const index = join(dir, 'docs/agents/AGENTS.md');
    writeFileSync(index, readFileSync(index, 'utf8').split('\n').filter((l) => !l.includes('(garden.md)')).join('\r\n'));
    rmSync(join(dir, 'docs/agents/garden.md'));
    run(['write', '--repo', dir, '--families', 'anthropic']);
    const text = read(dir, 'docs/agents/AGENTS.md');
    assert.match(text, /\(garden\.md\)/);
    assert.doesNotMatch(text, /[^\r]\n/);
  });

  test('adds a missing row to the index table, not to a later table', () => {
    const dir = repo();
    run(['write', '--repo', dir, '--families', 'anthropic']);
    const index = join(dir, 'docs/agents/AGENTS.md');
    const without = readFileSync(index, 'utf8').split('\n').filter((l) => !l.includes('(garden.md)')).join('\n');
    writeFileSync(index, without + '\n## Owners\n\n| Area | Owner |\n| ---- | ----- |\n| api | me |\n');
    rmSync(join(dir, 'docs/agents/garden.md'));
    run(['write', '--repo', dir, '--families', 'anthropic']);
    const lines = readFileSync(index, 'utf8').split('\n');
    const garden = lines.findIndex((l) => l.includes('(garden.md)'));
    assert.ok(lines[garden - 1].includes('(autonomy.md)'), lines.join('\n'));
    assert.ok(garden < lines.indexOf('## Owners'));
  });

  test('renames a CONTEXT-MAP.md and the glossaries it points to', () => {
    const dir = repo({ 'CONTEXT-MAP.md': '- [ordering](src/ordering/CONTEXT.md)\n', 'src/ordering/CONTEXT.md': 'o\n' });
    const r = run(['write', '--repo', dir, '--families', 'anthropic']);
    assert.ok(r.lines.includes('renamed src/ordering/CONTEXT.md -> src/ordering/GLOSSARY.md'));
    assert.equal(read(dir, 'GLOSSARY-MAP.md'), '- [ordering](src/ordering/GLOSSARY.md)\n');
    assert.equal(read(dir, 'src/ordering/GLOSSARY.md'), 'o\n');
  });
});

describe('labels', { skip: WIN && 'the fake gh is a POSIX shell script' }, () => {
  function fakeGh(existing) {
    const log = join(scratch, `gh-${n++}.log`);
    const json = JSON.stringify(existing.map((name) => ({ name })));
    const path = bin({
      gh: `echo "$*" >> "${log}"\nif [ "$1 $2" = "label list" ]; then echo '${json}'; fi`,
    });
    return { path, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []) };
  }

  test('creates every missing kitchen label and keeps the ones that exist', () => {
    const dir = repo();
    const gh = fakeGh(['garden', 'needs-triage']);
    const r = run(['labels', '--repo', dir], { path: gh.path });
    assert.equal(r.status, 0, r.stderr);
    const created = gh.calls().filter((c) => c.startsWith('label create')).map((c) => c.split(' ')[2]);
    assert.deepEqual(created.sort(), [
      'door:one-way',
      'live-ui-verified',
      'needs-info',
      'prototype',
      'ready-for-agent',
      'ready-for-human',
      'type-check-only',
      'unit-test-verified',
      'verifier-blocked',
      'verifier-failed',
      'wayfinder:grilling',
      'wayfinder:map',
      'wayfinder:prototype',
      'wayfinder:research',
      'wayfinder:task',
      'wontfix',
    ]);
    assert.ok(r.lines.includes('kept label garden'));
    assert.ok(r.lines.includes('created label door:one-way'));
  });

  test('uses the triage label strings from triage-labels.md', () => {
    const dir = repo();
    run(['write', '--repo', dir, '--families', 'anthropic']);
    const p = join(dir, 'docs/agents/triage-labels.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace(/^\|\s*`needs-triage`\s*\|\s*`needs-triage`\s*\|/m, '| `needs-triage` | `bug:triage` |'));
    const gh = fakeGh([]);
    run(['labels', '--repo', dir], { path: gh.path });
    const created = gh.calls().filter((c) => c.startsWith('label create')).map((c) => c.split(' ')[2]);
    assert.ok(created.includes('bug:triage'));
    assert.ok(!created.includes('needs-triage'));
  });

  test('treats an existing label in another case as the same label', () => {
    const gh = fakeGh(['Garden', 'DOOR:ONE-WAY']);
    const r = run(['labels', '--repo', repo()], { path: gh.path });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.lines.includes('kept label Garden'));
    assert.ok(r.lines.includes('kept label DOOR:ONE-WAY'));
    const created = gh.calls().filter((c) => c.startsWith('label create')).map((c) => c.split(' ')[2]);
    assert.ok(!created.includes('garden') && !created.includes('door:one-way'));
    assert.ok(created.includes('prototype'));
  });

  test('a dry run creates nothing', () => {
    const gh = fakeGh([]);
    const r = run(['labels', '--repo', repo(), '--dry-run'], { path: gh.path });
    assert.ok(r.lines.includes('would create label garden'));
    assert.deepEqual(gh.calls().filter((c) => c.startsWith('label create')), []);
  });
});
