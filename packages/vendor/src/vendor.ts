// The vendoring mechanism: pinned upstreams in, vendored tree and report out.
//
// Every vendored file is its upstream file at the pinned commit, mapped to its
// local path and passed through the substitution table, unless vendor/forks.json
// declares it a fork. check() verifies exactly that, plus the lint rules;
// sync() moves pins and carries forks forward with a three-way merge.

import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { type Config, type Include, type Upstream, within, writePin } from './config.ts';
import { derive, type Derived, isBinary, isTriaged, watchedSkills } from './derive.ts';
import { merge3, type Upstreams } from './git.ts';
import { lintText, type Violation } from './lint.ts';

export type { Violation } from './lint.ts';

/** Local files under one include, by repo-relative POSIX path. */
function localFiles(root: string, include: Include): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const visit = (rel: string) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return;
    if (statSync(abs).isDirectory()) {
      for (const name of readdirSync(abs).sort()) visit(`${rel}/${name}`);
    } else {
      files.set(rel, readFileSync(abs));
    }
  };
  visit(include.local);
  return files;
}

const ownerOf = (upstream: Upstream, path: string) => upstream.includes.find((include) => within(path, include.local));

const sameBytes = (a: Buffer | undefined, b: Buffer | undefined) => (a === undefined ? b === undefined : b !== undefined && a.equals(b));

export interface CheckReport {
  violations: Violation[];
  files: number;
  forks: number;
}

export function check(config: Config, upstreams: Upstreams): CheckReport {
  const violations: Violation[] = [];
  let files = 0;
  for (const upstream of config.upstreams) {
    const derived = derive(upstream, upstreams.tree(upstream.repo, upstream.commit), config.substitutions);
    const local = new Map(upstream.includes.flatMap((include) => [...localFiles(config.root, include)]));
    files += local.size;
    for (const path of new Set([...derived.keys(), ...local.keys()])) {
      const want = derived.get(path)?.bytes;
      const have = local.get(path);
      const fork = config.forks.get(path);
      if (sameBytes(want, have)) {
        if (fork) violations.push({ path, rule: 'stale-fork', message: `declared a ${fork.kind} fork in vendor/forks.json but matches ${upstream.name}; delete the entry` });
      } else if (!fork) {
        const how = !have ? 'is missing' : !want ? `is not in ${upstream.name}` : `differs from ${upstream.name}`;
        violations.push({ path, rule: 'undeclared-divergence', message: `${how} at ${upstream.commit.slice(0, 12)} after substitutions; declare a fork in vendor/forks.json, or rerun sync --overwrite to restore it` });
      }
      const include = ownerOf(upstream, path);
      if (have && include && !include.verbatim && !isBinary(have)) {
        violations.push(...lintText(path, have.toString('utf8'), config.checks, config.root));
      }
    }
  }
  for (const path of config.forks.keys()) {
    if (!config.upstreams.some((upstream) => ownerOf(upstream, path))) {
      violations.push({ path, rule: 'unknown-fork', message: 'declared in vendor/forks.json but not under any include in vendor/upstream.json' });
    }
  }
  return { violations, files, forks: config.forks.size };
}

export interface UpstreamSync {
  name: string;
  from: string;
  to: string;
  added: string[];
  updated: string[];
  deleted: string[];
  /** Forks that upstream changed, merged cleanly. */
  merged: string[];
  /** Forks that upstream left alone. */
  kept: string[];
  /** Forks that upstream changed and the merge couldn't settle; written with markers. */
  conflicts: { path: string; reason: string }[];
  /** Upstream skill folders new since the old pin, neither included nor excluded. */
  newSkills: string[];
}

export interface SyncReport {
  upstreams: UpstreamSync[];
  /** Vendored files that differ from their old derived form with no declared fork. */
  undeclared: { path: string; upstream: string }[];
  /** False when undeclared divergence stopped the sync before it wrote anything. */
  written: boolean;
}

export interface SyncOptions {
  /** Upstream name -> commit to move to. Upstreams not named stay at their pins. */
  targets: Map<string, string>;
  /** Restore undeclared divergences to their derived form instead of stopping. */
  overwrite?: boolean;
}

type Action = { path: string; write?: { bytes: Buffer; executable: boolean } };

export function sync(config: Config, upstreams: Upstreams, options: SyncOptions): SyncReport {
  const report: SyncReport = { upstreams: [], undeclared: [], written: false };
  const actions: Action[] = [];
  const pins: [string, string][] = [];
  for (const upstream of config.upstreams) {
    const to = options.targets.get(upstream.name);
    if (!to) continue;
    const oldTree = upstreams.tree(upstream.repo, upstream.commit);
    const newTree = upstreams.tree(upstream.repo, to);
    const next = derive({ ...upstream, commit: to }, newTree, config.substitutions);
    // An include added since the pin, with nothing vendored yet, is fresh:
    // it has no old form, so nothing in it can have diverged.
    const local = new Map<string, Buffer>();
    const old: Derived = new Map();
    for (const include of upstream.includes) {
      const files = localFiles(config.root, include);
      if (files.size === 0) continue;
      for (const [path, bytes] of files) local.set(path, bytes);
      const before = derive({ ...upstream, includes: [include] }, oldTree, config.substitutions);
      for (const [path, file] of before) old.set(path, file);
    }
    const result: UpstreamSync = {
      name: upstream.name, from: upstream.commit, to,
      added: [], updated: [], deleted: [], merged: [], kept: [], conflicts: [], newSkills: [],
    };
    for (const path of [...new Set([...old.keys(), ...next.keys(), ...local.keys()])].sort()) {
      const was = old.get(path);
      const now = next.get(path);
      const have = local.get(path);
      if (!config.forks.has(path)) {
        if (!sameBytes(have, was?.bytes) && !options.overwrite) report.undeclared.push({ path, upstream: upstream.name });
        if (now && !sameBytes(have, now.bytes)) {
          (have ? result.updated : result.added).push(path);
          actions.push({ path, write: now });
        } else if (!now && have) {
          result.deleted.push(path);
          actions.push({ path });
        }
      } else if (sameBytes(was?.bytes, now?.bytes)) {
        result.kept.push(path);
      } else if (!now) {
        result.conflicts.push({ path, reason: 'upstream deleted this forked file; keep it as port-only or delete it and its fork entry' });
      } else if (!have) {
        result.conflicts.push({ path, reason: 'upstream changed this file, which the fork deletes; check the fork still holds' });
      } else {
        const merged = merge3(have, was?.bytes ?? Buffer.alloc(0), now.bytes);
        if (merged.clean) result.merged.push(path);
        else result.conflicts.push({ path, reason: 'upstream changed lines the fork changed; resolve the conflict markers' });
        if (!merged.bytes.equals(have)) actions.push({ path, write: { bytes: merged.bytes, executable: now.executable } });
      }
    }
    const before = watchedSkills(upstream, oldTree);
    result.newSkills = [...watchedSkills(upstream, newTree)].filter((skill) => !before.has(skill) && !isTriaged(upstream, skill)).sort();
    report.upstreams.push(result);
    if (to !== upstream.commit) pins.push([upstream.name, to]);
  }
  if (report.undeclared.length) return report;

  for (const { path, write } of actions) {
    const abs = join(config.root, path);
    if (write) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, write.bytes);
      if (process.platform !== 'win32') chmodSync(abs, write.executable ? 0o755 : 0o644);
    } else {
      unlinkSync(abs);
      pruneEmptyDirs(config.root, dirname(abs));
    }
  }
  for (const [name, commit] of pins) writePin(config.root, name, commit);
  report.written = true;
  return report;
}

function pruneEmptyDirs(root: string, dir: string) {
  while (relative(root, dir) && !relative(root, dir).startsWith('..') && existsSync(dir) && readdirSync(dir).length === 0) {
    rmdirSync(dir);
    dir = dirname(dir);
  }
}
