// The session-end hook: the command the skill declares (frontmatter `hooks:`
// on Claude Code, the plugin's hooks.json on Codex), run the way the host runs
// it, with the hook's JSON on stdin.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DIST, isAlive, Sandbox, STORAGE_ROUND, waitFor, type CliResult } from '../support/harness.ts';

const REPO = resolve(import.meta.dirname, '../../../..');
/** Claude Code cancels SessionEnd hooks after this long. */
const BUDGET_MS = 1_500;

/** The SessionEnd command in SKILL.md's frontmatter. */
function frontmatterCommand(): string {
  const skill = readFileSync(join(REPO, 'skills/visual-grilling/SKILL.md'), 'utf8');
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)![1]!;
  const hooks = frontmatter.slice(frontmatter.indexOf('\nhooks:'));
  expect(hooks).toMatch(/^\nhooks:\n {2}SessionEnd:\n/);
  return /command: '([^']+)'/.exec(hooks)![1]!;
}

/** The SessionEnd command in the plugin's hooks.json. */
function hooksJsonCommand(): string {
  const config = JSON.parse(readFileSync(join(REPO, 'hooks/hooks.json'), 'utf8'));
  const [group] = config.hooks.SessionEnd;
  const [hook] = group.hooks;
  expect(hook.type).toBe('command');
  return hook.command;
}

let sandbox: Sandbox | undefined;
const sessions: string[] = [];

function open(): Sandbox {
  sandbox = new Sandbox();
  return sandbox;
}

afterEach(async () => {
  await sandbox?.dispose(sessions.splice(0));
  sandbox = undefined;
});

/**
 * Runs a hook command through a shell, as the host does, with the plugin
 * root pointing at a plugin whose skill's dist/ is the tested bundle.
 */
function runHook(box: Sandbox, command: string, sessionId: string): Promise<CliResult & { ms: number }> {
  const pluginRoot = join(box.tmp, 'plugin');
  const skillDir = join(pluginRoot, 'skills/visual-grilling');
  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true });
    symlinkSync(DIST, join(skillDir, 'dist'), 'junction');
  }
  const input = JSON.stringify({
    session_id: sessionId,
    transcript_path: join(box.tmp, 'transcript.jsonl'),
    cwd: box.tmp,
    hook_event_name: 'SessionEnd',
    reason: 'other',
  });
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn(command, {
      shell: process.platform === 'win32' ? 'bash' : '/bin/sh',
      cwd: box.tmp,
      env: { ...box.env, CLAUDE_PLUGIN_ROOT: pluginRoot, PLUGIN_ROOT: pluginRoot },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => done({ code: code ?? 1, stdout, stderr, ms: Date.now() - started }));
    child.stdin.end(input);
  });
}

describe.each([
  ['the skill frontmatter (Claude Code)', frontmatterCommand],
  ['hooks.json (Codex)', hooksJsonCommand],
])('the session-end hook in %s', (_where, command) => {
  it('stops the server and deletes the session folder within the budget', async () => {
    const box = open();
    sessions.push('hook-1');
    const presented = await box.cli(['present', box.writeRound('round.md', STORAGE_ROUND), '--no-open', '--session', 'hook-1']);
    expect(presented.code).toBe(0);
    const { pid } = box.serverInfo('hook-1');

    const result = await runHook(box, command(), 'hook-1');

    expect(result).toMatchObject({ code: 0, stderr: '' });
    expect(result.ms).toBeLessThan(BUDGET_MS);
    expect(existsSync(box.sessionDir('hook-1'))).toBe(false);
    await waitFor(() => !isAlive(pid), 500);
  });

  it('does nothing when no folder exists for the session', async () => {
    const box = open();
    const result = await runHook(box, command(), 'never-presented');

    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
    expect(existsSync(box.sessionDir('never-presented'))).toBe(false);
  });

  it('ends only the session named on stdin', async () => {
    const box = open();
    sessions.push('hook-mine', 'hook-other');
    await box.cli(['present', box.writeRound('a.md', STORAGE_ROUND), '--no-open', '--session', 'hook-mine']);
    await box.cli(['present', box.writeRound('b.md', STORAGE_ROUND), '--no-open', '--session', 'hook-other']);

    expect((await runHook(box, command(), 'hook-mine')).code).toBe(0);
    expect(existsSync(box.sessionDir('hook-mine'))).toBe(false);
    expect(existsSync(box.sessionDir('hook-other'))).toBe(true);
  });
});

describe('end --hook', () => {
  it.skipIf(process.platform === 'win32')('kills a server that no longer answers, within the budget', async () => {
    const box = open();
    sessions.push('hook-stuck');
    await box.cli(['present', box.writeRound('round.md', STORAGE_ROUND), '--no-open', '--session', 'hook-stuck']);
    const { pid } = box.serverInfo('hook-stuck');
    process.kill(pid, 'SIGSTOP');

    const result = await runHook(box, frontmatterCommand(), 'hook-stuck');

    expect(result.code).toBe(0);
    expect(result.ms).toBeLessThan(BUDGET_MS);
    expect(existsSync(box.sessionDir('hook-stuck'))).toBe(false);
    await waitFor(() => !isAlive(pid), 500);
  });

  it('refuses hook input without a usable session_id', async () => {
    const box = open();
    const result = await new Promise<CliResult>((done) => {
      const child = spawn(process.execPath, [join(DIST, 'cli.mjs'), 'end', '--hook'], { env: box.env });
      let stderr = '';
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.on('close', (code) => done({ code: code ?? 1, stdout: '', stderr }));
      child.stdin.end('{"reason":"other"}');
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('no usable "session_id"');
  });
});

describe('end --session', () => {
  it('does nothing when the folder is already gone', async () => {
    const box = open();
    const result = await box.cli(['end', '--session', 'long-gone']);
    expect(result).toEqual({ code: 0, stdout: '', stderr: '' });
  });
});
