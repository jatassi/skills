// The grilling session lifecycle: which session a call belongs to, supersede
// by `present` and `end`, `ended`, the idle shutdown, the sweep and the restart.

import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { crash, isAlive, postJson, Sandbox, type CliResult, STORAGE_ROUND, waitFor } from '../support/harness.ts';

const IDLE_ENV = 'VISUAL_GRILLING_IDLE_MS';
const FOLLOW_UP = '# Follow-ups\n\n❓ **Q7** - **Anything else?**: Last one.\n\n➡️ No.\n';

let sandbox: Sandbox | undefined;
const sessions: string[] = [];

function open(sessionId?: string): Sandbox {
  sandbox = new Sandbox(sessionId);
  if (sessionId) sessions.push(sessionId);
  return sandbox;
}

afterEach(async () => {
  await sandbox?.dispose(sessions.splice(0));
  sandbox = undefined;
});

async function present(box: Sandbox, args: string[] = [], content = STORAGE_ROUND): Promise<string> {
  const result = await box.cli(['present', box.writeRound(`round-${Date.now()}.md`, content), '--no-open', ...args]);
  expect(result).toMatchObject({ code: 0, stderr: '' });
  return result.stdout.trim().split('\n').at(-1)!;
}

/** Starts `await` and gives it time to reach the server before the test acts. */
async function startAwait(box: Sandbox, args: string[] = []): Promise<{ result: Promise<CliResult> }> {
  const result = box.cli(['await', '--timeout', '30', ...args]);
  await new Promise((done) => setTimeout(done, 400));
  return { result };
}

describe('session id', () => {
  it('lets --session override the environment', async () => {
    const box = open('from-env');
    sessions.push('from-flag');
    await present(box, ['--session', 'from-flag']);

    expect(existsSync(box.sessionDir('from-flag'))).toBe(true);
    expect(existsSync(box.sessionDir('from-env'))).toBe(false);
  });

  it('reads CODEX_SESSION_ID when CLAUDE_CODE_SESSION_ID is absent', async () => {
    const box = open();
    box.env.CODEX_SESSION_ID = 'codex-1';
    sessions.push('codex-1');
    const result = await box.cli(['present', box.writeRound('round.md', STORAGE_ROUND), '--no-open']);

    expect(result.stdout).not.toContain('session:');
    expect(existsSync(box.sessionDir('codex-1'))).toBe(true);
  });

  it('prefers CLAUDE_CODE_SESSION_ID over CODEX_SESSION_ID', async () => {
    const box = open('claude-1');
    box.env.CODEX_SESSION_ID = 'codex-2';
    await present(box);

    expect(existsSync(box.sessionDir('claude-1'))).toBe(true);
    expect(existsSync(box.sessionDir('codex-2'))).toBe(false);
  });

  it('never lets two sessions share a folder, a server or a port', async () => {
    const box = open();
    sessions.push('one', 'two');
    const [urlOne, urlTwo] = await Promise.all([
      present(box, ['--session', 'one']),
      present(box, ['--session', 'two']),
    ]);
    const one = box.serverInfo('one');
    const two = box.serverInfo('two');

    expect(urlOne).not.toBe(urlTwo);
    expect(one.port).not.toBe(two.port);
    expect(one.pid).not.toBe(two.pid);
    // Each session's await sees only its own round.
    await postJson(`${urlOne}api/rounds/1/submission`, { round: 1, answers: [] });
    expect((await box.cli(['await', '--timeout', '0', '--session', 'one'])).stdout).toMatch(/^submitted · round 1/);
    expect((await box.cli(['await', '--timeout', '0', '--session', 'two'])).stdout).toBe(
      'pending · round 1 · re-run await\n',
    );
  });
});

describe('supersede', () => {
  it('marks the open round answered in the terminal when the next round is presented', async () => {
    const box = open('sp1');
    const url = await present(box);
    const waiting = await startAwait(box);

    await present(box, [], FOLLOW_UP);
    expect(await waiting.result).toEqual({
      code: 0,
      stdout: 'superseded · round 1 answered in the terminal\n',
      stderr: '',
    });

    const first = await (await fetch(`${url}api/rounds/1`)).json();
    expect(first.answeredInTerminal).toBe(true);
    const second = await (await fetch(`${url}api/rounds/2`)).json();
    expect(second.answeredInTerminal).toBeUndefined();
    // The page can no longer submit a round that was answered in the terminal.
    expect((await postJson(`${url}api/rounds/1/submission`, { round: 1, answers: [] })).status).toBe(409);
  });

  it('leaves a submitted round alone when the next round is presented', async () => {
    const box = open('sp2');
    const url = await present(box);
    await postJson(`${url}api/rounds/1/submission`, { round: 1, answers: [] });
    await present(box, [], FOLLOW_UP);

    const first = await (await fetch(`${url}api/rounds/1`)).json();
    expect(first.answeredInTerminal).toBeUndefined();
    expect(first.submitted).toBeDefined();
  });

  it('supersedes a waiting await on end, then stops the server and deletes the folder', async () => {
    const box = open('sp3');
    await present(box);
    const { pid } = box.serverInfo('sp3');
    const waiting = await startAwait(box);

    const ended = await box.cli(['end']);
    expect(ended.code).toBe(0);
    expect(await waiting.result).toEqual({
      code: 0,
      stdout: 'superseded · round 1 answered in the terminal\n',
      stderr: '',
    });
    expect(existsSync(box.sessionDir('sp3'))).toBe(false);
    await waitFor(() => !isAlive(pid));
  });

  it.skipIf(process.platform === 'win32')('stops a server that no longer answers on end', async () => {
    const box = open('sp4');
    await present(box);
    const { pid } = box.serverInfo('sp4');
    process.kill(pid, 'SIGSTOP');

    expect((await box.cli(['end'])).code).toBe(0);
    await waitFor(() => !isAlive(pid));
    expect(existsSync(box.sessionDir('sp4'))).toBe(false);
  });
});

describe('ended', () => {
  it('exits 1 when the server goes away unasked during await', async () => {
    const box = open('en1');
    await present(box);
    const { pid } = box.serverInfo('en1');
    const waiting = await startAwait(box);

    process.kill(pid, 'SIGKILL');
    const result = await waiting.result;
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^ended · the server stopped/);
  });

  it('exits 1 when await runs against a server that is already gone', async () => {
    const box = open('en2');
    await present(box);
    const { pid } = box.serverInfo('en2');
    await crash(pid);

    const result = await box.cli(['await', '--timeout', '1']);
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^ended · the server stopped/);
  });

  it('exits 1 when await runs after the session ended', async () => {
    const box = open('en3');
    await present(box);
    await box.cli(['end']);

    const result = await box.cli(['await', '--timeout', '1']);
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^ended · /);
  });
});

describe('idle shutdown', () => {
  it('stops the server and deletes the folder after the idle limit', async () => {
    const box = open('id1');
    box.env[IDLE_ENV] = '800';
    const url = await present(box);
    const { pid } = box.serverInfo('id1');

    // An open event stream alone doesn't keep a forgotten tab's server alive.
    const events = await fetch(`${url}events`);
    const reader = events.body!.getReader();
    const decoder = new TextDecoder();
    let received = '';
    while (!received.includes('event: finished')) {
      const { value, done } = await reader.read();
      if (done) break;
      received += decoder.decode(value);
    }

    expect(received).toContain('event: finished');
    await waitFor(() => !isAlive(pid));
    expect(existsSync(box.sessionDir('id1'))).toBe(false);

    const result = await box.cli(['await', '--timeout', '1']);
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^ended · /);
  });

  it('counts a waiting await and page interactions as activity', async () => {
    const box = open('id2');
    box.env[IDLE_ENV] = '800';
    const url = await present(box);
    const { pid } = box.serverInfo('id2');

    // A waiting await spans two idle limits.
    const waited = await box.cli(['await', '--timeout', '2']);
    expect(waited.stdout).toBe('pending · round 1 · re-run await\n');
    expect(isAlive(pid)).toBe(true);

    // So do page interactions, one every 300 ms for 2 s.
    for (let i = 0; i < 7; i++) {
      expect((await postJson(`${url}api/activity`, {})).ok).toBe(true);
      await new Promise((done) => setTimeout(done, 300));
    }
    expect(isAlive(pid)).toBe(true);

    await waitFor(() => !isAlive(pid));
    expect(existsSync(box.sessionDir('id2'))).toBe(false);
  });

  it("doesn't count pings as activity, so other sessions' sweeps don't keep it alive", async () => {
    const box = open('id3');
    box.env[IDLE_ENV] = '800';
    const url = await present(box);
    const { pid } = box.serverInfo('id3');

    const pinging = setInterval(() => void fetch(`${url}control/ping`, { method: 'POST' }).catch(() => {}), 100);
    try {
      await waitFor(() => !isAlive(pid));
    } finally {
      clearInterval(pinging);
    }
    expect(existsSync(box.sessionDir('id3'))).toBe(false);
  });
});

describe('restart', () => {
  it('restarts a dead server in the same folder and numbers rounds on', async () => {
    const box = open('rs1');
    const url = await present(box);
    await postJson(`${url}api/rounds/1/submission`, { round: 1, answers: [{ question: 1, mode: 'accepted' }] });
    const before = box.serverInfo('rs1');
    await crash(before.pid);

    const restartedUrl = await present(box, [], FOLLOW_UP);
    const after = box.serverInfo('rs1');
    expect(after.pid).not.toBe(before.pid);
    expect(restartedUrl).toBe(`http://127.0.0.1:${after.port}/`);

    const latest = await (await fetch(`${restartedUrl}api/rounds/latest`)).json();
    expect(latest.number).toBe(2);
    const past = await (await fetch(`${restartedUrl}api/rounds/1`)).json();
    expect(past.submitted).toMatchObject({ 1: { mode: 'accepted', option: 'A' }, 2: { mode: 'none' } });
    expect((await box.cli(['await', '--timeout', '0'])).stdout).toBe('pending · round 2 · re-run await\n');
  });

  it('treats server.json pointing at a reused pid as dead', async () => {
    const box = open('rs2');
    await present(box);
    const before = box.serverInfo('rs2');
    await crash(before.pid);
    // The pid now belongs to a live process that isn't the server.
    writeFileSync(
      join(box.sessionDir('rs2'), 'server.json'),
      JSON.stringify({ ...before, pid: process.pid }),
    );

    await present(box, [], FOLLOW_UP);
    const after = box.serverInfo('rs2');
    expect(after.pid).not.toBe(process.pid);
    expect(isAlive(after.pid)).toBe(true);
  });
});

describe('sweep', () => {
  it("deletes other sessions' folders whose server is not running, and keeps the rest", async () => {
    const box = open();
    sessions.push('live', 'mine');
    await present(box, ['--session', 'live']);
    await present(box, ['--session', 'dead']);
    const dead = box.serverInfo('dead');
    await crash(dead.pid);

    // A folder whose server.json names a live pid that isn't a server (a reused pid).
    const reused = box.sessionDir('reused');
    mkdirSync(reused, { recursive: true });
    writeFileSync(join(reused, 'server.json'), JSON.stringify({ ...dead, pid: process.pid }));
    // A long-abandoned folder with no server.json, and one that is just starting.
    const stale = box.sessionDir('stale');
    mkdirSync(stale, { recursive: true });
    const old = new Date(Date.now() - 10 * 60_000);
    utimesSync(stale, old, old);
    const starting = box.sessionDir('starting');
    mkdirSync(starting, { recursive: true });

    await present(box, ['--session', 'mine']);

    expect(existsSync(box.sessionDir('dead'))).toBe(false);
    expect(existsSync(reused)).toBe(false);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(starting)).toBe(true);
    expect(existsSync(box.sessionDir('live'))).toBe(true);
    expect(existsSync(box.sessionDir('mine'))).toBe(true);
  });
});
