#!/usr/bin/env node
// Root test runner. `npm test` runs only the workspaces whose files changed
// against the merge-base with origin/dev (committed, staged, unstaged and
// untracked), so an agent touching one skill doesn't pay for the whole
// visual-grilling suite. `npm run test:all` (and CI) runs every workspace.
//
// A workspace at packages/<name> owns packages/<name>/** and skills/<name>/**,
// plus any path prefixes listed in its package.json "testPaths" (for a
// workspace whose tests cover files outside those two folders). A change to
// shared tooling runs every workspace.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const SHARED = ['package.json', 'package-lock.json', 'scripts/test.mjs'];
const BASES = ['origin/dev', 'dev'];

const workspaces = JSON.parse(readFileSync('package.json', 'utf8')).workspaces ?? [];

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function lines(out) {
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

function changedFiles() {
  let base = null;
  for (const ref of BASES) {
    try {
      base = git('merge-base', 'HEAD', ref).trim();
      break;
    } catch {}
  }
  if (!base) return null;
  return new Set([
    ...lines(git('diff', '--name-only', base, 'HEAD')),
    ...lines(git('diff', '--name-only', 'HEAD')),
    ...lines(git('ls-files', '--others', '--exclude-standard')),
  ]);
}

function selectWorkspaces() {
  if (process.argv.includes('--all')) return { picked: workspaces, why: '--all' };
  const changed = changedFiles();
  if (!changed) return { picked: workspaces, why: `no merge-base with ${BASES.join(' or ')}` };
  if (SHARED.some((f) => changed.has(f))) return { picked: workspaces, why: 'shared tooling changed' };
  const picked = workspaces.filter((ws) => {
    const extra = JSON.parse(readFileSync(join(ws, 'package.json'), 'utf8')).testPaths ?? [];
    const owned = [`${ws}/`, `skills/${basename(ws)}/`, ...extra];
    return [...changed].some((f) => owned.some((p) => f.startsWith(p)));
  });
  return { picked, why: 'changed since merge-base with dev' };
}

const { picked, why } = selectWorkspaces();
const skipped = workspaces.filter((ws) => !picked.includes(ws));
console.log(`test: running [${picked.join(', ') || 'none'}] (${why})`);
if (skipped.length) console.log(`test: skipping [${skipped.join(', ')}]; run \`npm run test:all\` for everything`);

for (const ws of picked) {
  const r = spawnSync('npm', ['test', '--workspace', ws], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
