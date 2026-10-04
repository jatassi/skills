// Small fixture upstreams (real git repos in a temp folder) and a fixture
// plugin root, for driving the CLI the way the maintainer does.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '../cli.ts');

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

function writeFiles(dir: string, files: Record<string, string | null>) {
  for (const [path, text] of Object.entries(files)) {
    const abs = join(dir, path);
    if (text === null) {
      rmSync(abs, { force: true });
    } else {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
    }
  }
}

export class FixtureUpstream {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    git(dir, 'init', '--quiet', '--initial-branch=main');
  }

  /** Commits the files (null deletes one) and returns the commit SHA. */
  commit(files: Record<string, string | null>): string {
    writeFiles(this.dir, files);
    git(this.dir, 'add', '--all');
    git(this.dir, 'commit', '--quiet', '--allow-empty', '-m', 'change');
    return git(this.dir, 'rev-parse', 'HEAD');
  }
}

export interface RunResult {
  status: number;
  out: string;
}

export class Fixture {
  readonly base = mkdtempSync(join(tmpdir(), 'milliways-vendor-test-'));
  readonly root = join(this.base, 'plugin');
  readonly cache = join(this.base, 'cache');

  upstream(name: string): FixtureUpstream {
    return new FixtureUpstream(join(this.base, 'upstreams', name));
  }

  /** Writes the plugin root's files; vendor/*.json values are serialized. */
  write(files: Record<string, string | object | null>) {
    writeFiles(
      this.root,
      Object.fromEntries(Object.entries(files).map(([path, value]) => [path, typeof value === 'object' && value !== null ? `${JSON.stringify(value, null, 2)}\n` : value])),
    );
  }

  read(path: string): string | undefined {
    const abs = join(this.root, path);
    return existsSync(abs) ? readFileSync(abs, 'utf8') : undefined;
  }

  json(path: string): any {
    return JSON.parse(this.read(path)!);
  }

  run(...args: string[]): RunResult {
    const result = spawnSync(process.execPath, [CLI, ...args, '--root', this.root, '--cache', this.cache], { encoding: 'utf8' });
    return { status: result.status ?? -1, out: `${result.stdout}${result.stderr}` };
  }

  cleanup() {
    rmSync(this.base, { recursive: true, force: true });
  }
}

/** Fixture check rules: one of each kind, independent of the real vendor/checks.json. */
export const CHECKS = {
  denylist: [
    { rule: 'cursor-ism', regex: '\\bAskQuestion\\b', hint: 'use AskUserQuestion' },
    { rule: 'model-version', regex: '\\bclaude-(?:opus|sonnet|haiku|fable)-\\d', hint: 'name the tier, not a version' },
    { rule: 'claude-md', token: 'CLAUDE.md', hint: 'kitchens use AGENTS.md only' },
  ],
  builtinAgentTypes: ['general-purpose', 'Explore'],
  namespace: 'milliways',
  playbooks: '^skills/[^/]+/playbooks/.+\\.md$',
  skillReferences: ['\\*\\*([a-z0-9-]+)\\*\\* skill'],
};

export const SUBSTITUTIONS = {
  substitutions: [{ pattern: 'the Task tool', replacement: 'the Agent tool', why: 'Claude Code spawns subagents with Agent' }],
};
