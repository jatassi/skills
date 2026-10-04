#!/usr/bin/env node
// Root test runner. `npm test` runs only the workspaces whose files changed
// against the merge-base with origin/dev (committed, staged, unstaged and
// untracked), so an agent touching one skill doesn't pay for the whole
// visual-grilling suite. `npm run test:all` (and CI) runs every workspace.
//
// A workspace at packages/<name> owns packages/<name>/** and skills/<name>/**,
// plus any path prefixes listed in its package.json "testPaths" (for a
// workspace whose tests cover files outside those two folders).
//
// Root package.json and package-lock.json count as shared tooling, which runs
// every workspace, unless the change only adds workspaces: then just the new
// ones run. A change to this runner always runs every workspace.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const USAGE = `usage: node scripts/test.mjs [--all] [--dry-run]
  (no flags)  test the workspaces changed since the merge-base with dev
  --all       test every workspace
  --dry-run   print which workspaces would run, run nothing`;
const BASES = ['origin/dev', 'dev'];

const flags = process.argv.slice(2);
const unknown = flags.filter((f) => f !== '--all' && f !== '--dry-run');
if (unknown.length) {
  const help = unknown.includes('--help') || unknown.includes('-h');
  console.error(help ? USAGE : `unknown argument: ${unknown[0]}\n${USAGE}`);
  process.exit(help ? 0 : 2);
}

const rootPkg = JSON.parse(readFileSync('package.json', 'utf8'));
const workspaces = rootPkg.workspaces ?? [];

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
}

function lines(out) {
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

function mergeBase() {
  for (const ref of BASES) {
    try {
      return git('merge-base', 'HEAD', ref).trim();
    } catch {}
  }
  return null;
}

function changedFiles(base) {
  return new Set([
    ...lines(git('diff', '--name-only', base, 'HEAD')),
    ...lines(git('diff', '--name-only', 'HEAD')),
    ...lines(git('ls-files', '--others', '--exclude-standard')),
  ]);
}

function atBase(base, path) {
  try {
    return JSON.parse(git('show', `${base}:${path}`));
  } catch {
    return null;
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const without = (obj, key) => {
  const { [key]: _, ...rest } = obj ?? {};
  return rest;
};

// The workspaces a root package.json / package-lock.json change adds, or null
// when the change does anything else (which makes it shared tooling).
function addedWorkspaces(base, changed) {
  const oldPkg = atBase(base, 'package.json');
  if (!oldPkg) return null;
  const oldWs = oldPkg.workspaces ?? [];
  if (changed.has('package.json')) {
    if (!same(without(oldPkg, 'workspaces'), without(rootPkg, 'workspaces'))) return null;
    if (oldWs.some((ws) => !workspaces.includes(ws))) return null;
  }
  const added = workspaces.filter((ws) => !oldWs.includes(ws));
  if (changed.has('package-lock.json')) {
    const oldLock = atBase(base, 'package-lock.json');
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    if (!oldLock || !same(without(oldLock, 'packages'), without(lock, 'packages'))) return null;
    const pkgs = lock.packages ?? {};
    // The root entry may change only in its workspaces list, and every other
    // existing entry must be untouched. New entries (the new workspace, its
    // link, and dependencies only it brings) are fine.
    for (const [key, entry] of Object.entries(oldLock.packages ?? {})) {
      const ok = key === '' ? same(without(entry, 'workspaces'), without(pkgs[''], 'workspaces')) : same(entry, pkgs[key]);
      if (!ok) return null;
    }
  }
  return added;
}

function selectWorkspaces() {
  if (flags.includes('--all')) return { picked: workspaces, why: '--all' };
  const base = mergeBase();
  if (!base) return { picked: workspaces, why: `no merge-base with ${BASES.join(' or ')}` };
  const changed = changedFiles(base);
  if (changed.has('scripts/test.mjs')) return { picked: workspaces, why: 'the test runner changed' };
  let added = [];
  if (changed.has('package.json') || changed.has('package-lock.json')) {
    added = addedWorkspaces(base, changed);
    if (!added) return { picked: workspaces, why: 'root package.json or package-lock.json changed beyond adding workspaces' };
  }
  const picked = workspaces.filter((ws) => {
    if (added.includes(ws)) return true;
    const extra = JSON.parse(readFileSync(join(ws, 'package.json'), 'utf8')).testPaths ?? [];
    const owned = [`${ws}/`, `skills/${basename(ws)}/`, ...extra];
    return [...changed].some((f) => owned.some((p) => f.startsWith(p)));
  });
  return { picked, why: 'changed since merge-base with dev' };
}

const { picked, why } = selectWorkspaces();
const skipped = workspaces.filter((ws) => !picked.includes(ws));
console.log(`test: running [${picked.join(', ') || 'none'}] (${why})`);
if (skipped.length) console.log(`test: skipping [${skipped.join(', ')}]: unchanged, nothing to re-test`);
if (flags.includes('--dry-run')) process.exit(0);

for (const ws of picked) {
  const r = spawnSync('npm', ['test', '--workspace', ws], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
