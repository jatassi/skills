// Reads upstream trees at exact commits, through a bare clone per upstream
// kept in a cache folder. A commit's tree never changes, so a cached commit is
// never fetched again. Blobs are read from git's object store, not a checkout,
// so line endings and bytes are exactly upstream's on every platform.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Blob {
  bytes: Buffer;
  executable: boolean;
}

/** Every file of a commit, by repo-relative POSIX path. */
export type Tree = Map<string, Blob>;

export class GitError extends Error {}

function git(args: string[], input?: Buffer | string): Buffer {
  const result = spawnSync('git', args, { input, maxBuffer: 1 << 30 });
  if (result.error) throw new GitError(`git ${args[0]}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new GitError(`git ${args.join(' ')} exited ${result.status}: ${result.stderr.toString().trim()}`);
  }
  return result.stdout;
}

export class Upstreams {
  private readonly trees = new Map<string, Tree>();
  private readonly cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  /** The commit an upstream's default branch points at now. */
  resolveHead(repo: string): string {
    const line = git(['ls-remote', repo, 'HEAD']).toString().split('\n')[0] ?? '';
    const sha = line.split('\t')[0] ?? '';
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new GitError(`could not resolve HEAD of ${repo}`);
    return sha;
  }

  tree(repo: string, commit: string): Tree {
    const key = `${repo}@${commit}`;
    let tree = this.trees.get(key);
    if (!tree) {
      const store = this.fetch(repo, commit);
      tree = readTree(store, commit);
      this.trees.set(key, tree);
    }
    return tree;
  }

  private fetch(repo: string, commit: string): string {
    const store = join(this.cacheDir, `${createHash('sha256').update(repo).digest('hex').slice(0, 16)}.git`);
    if (!existsSync(join(store, 'HEAD'))) {
      mkdirSync(store, { recursive: true });
      git(['init', '--quiet', '--bare', store]);
    }
    const has = () => spawnSync('git', ['-C', store, 'cat-file', '-e', `${commit}^{commit}`]).status === 0;
    if (has()) return store;
    try {
      // GitHub serves any commit by SHA.
      git(['-C', store, 'fetch', '--quiet', '--no-tags', '--depth=1', repo, commit]);
    } catch {
      // Servers that only serve branch tips: fetch the branches whole.
      git(['-C', store, 'fetch', '--quiet', '--no-tags', repo, '+refs/heads/*:refs/upstream/*']);
    }
    if (!has()) throw new GitError(`${repo} has no commit ${commit}`);
    return store;
  }
}

function readTree(store: string, commit: string): Tree {
  const entries = git(['-C', store, 'ls-tree', '-r', '-z', '--full-tree', commit])
    .toString()
    .split('\0')
    .filter(Boolean)
    .flatMap((entry) => {
      const tab = entry.indexOf('\t');
      const [mode, type, oid] = entry.slice(0, tab).split(' ');
      // Submodules have no bytes here; symlinks are carried as their target text.
      return type === 'blob' ? [{ mode: mode!, oid: oid!, path: entry.slice(tab + 1) }] : [];
    });
  const out = git(['-C', store, 'cat-file', '--batch'], entries.map((e) => e.oid).join('\n') + '\n');
  const tree: Tree = new Map();
  let at = 0;
  for (const entry of entries) {
    const newline = out.indexOf(0x0a, at);
    const size = Number(out.subarray(at, newline).toString().split(' ')[2]);
    const start = newline + 1;
    tree.set(entry.path, { bytes: Buffer.from(out.subarray(start, start + size)), executable: entry.mode === '100755' });
    at = start + size + 1;
  }
  return tree;
}

/**
 * Three-way merge of one file's text: the local fork, the derived old
 * upstream, and the derived new upstream. A conflict comes back with git's
 * `<<<<<<< local` / `>>>>>>> upstream` markers.
 */
export function merge3(local: Buffer, base: Buffer, next: Buffer): { clean: boolean; bytes: Buffer } {
  const scratch = mkdtempSync(join(tmpdir(), 'milliways-merge-'));
  try {
    const files = { local, base, upstream: next };
    for (const [name, bytes] of Object.entries(files)) writeFileSync(join(scratch, name), bytes);
    const args = ['merge-file', '-p', '-L', 'local', '-L', 'base', '-L', 'upstream', 'local', 'base', 'upstream'];
    try {
      return { clean: true, bytes: execFileSync('git', args, { cwd: scratch, stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (error) {
      const { status, stdout } = error as { status: number | null; stdout?: Buffer };
      // git merge-file exits with the number of conflicts, capped at 127.
      if (status === null || status < 1 || status > 127 || !stdout) throw error;
      return { clean: false, bytes: stdout };
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
