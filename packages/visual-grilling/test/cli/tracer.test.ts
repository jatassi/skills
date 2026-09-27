import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isAlive, postJson, Sandbox, STORAGE_ROUND, waitFor } from '../support/harness.ts';

const URL_LINE = /^http:\/\/127\.0\.0\.1:(\d+)\/$/;

let sandbox: Sandbox;
const sessions: string[] = [];

function open(sessionId?: string): Sandbox {
  sandbox = new Sandbox(sessionId);
  if (sessionId) sessions.push(sessionId);
  return sandbox;
}

afterEach(async () => {
  await sandbox?.dispose(sessions.splice(0));
});

const EVERY_MODE = {
  round: 1,
  answers: [
    { question: 1, mode: 'accepted' },
    { question: 2, mode: 'picked', option: 'B' },
    { question: 3, mode: 'own', text: 'keep them until the repo is cleaned' },
    { question: 4, mode: 'unsure' },
    { question: 5, mode: 'none' },
    { question: 6, mode: 'accepted' },
  ],
};

describe('present', () => {
  it('saves the round, starts a server on 127.0.0.1 and prints its link', async () => {
    const box = open('s1');
    const result = await box.cli(['present', box.writeRound('round.md', STORAGE_ROUND), '--no-open']);

    expect(result).toMatchObject({ code: 0, stderr: '' });
    const lines = result.stdout.trim().split('\n');
    expect(lines).toHaveLength(1);
    const port = Number(URL_LINE.exec(lines[0]!)?.[1]);

    const dir = box.sessionDir('s1');
    expect(readFileSync(join(dir, 'rounds', 'round-1.md'), 'utf8')).toBe(STORAGE_ROUND);
    const info = box.serverInfo('s1');
    expect(info.port).toBe(port);
    expect(isAlive(info.pid)).toBe(true);
    expect(info.startTime).toBeGreaterThan(Date.now() - 60_000);

    const page = await fetch(lines[0]!);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('/assets/app.js');
  });

  it('reuses the server for later rounds and numbers them on', async () => {
    const box = open('s2');
    const file = box.writeRound('round.md', STORAGE_ROUND);
    const first = await box.cli(['present', file, '--no-open']);
    const { pid } = box.serverInfo('s2');
    const second = await box.cli(['present', file, '--no-open']);

    expect(second.stdout).toBe(first.stdout);
    expect(box.serverInfo('s2').pid).toBe(pid);
    expect(existsSync(join(box.sessionDir('s2'), 'rounds', 'round-2.md'))).toBe(true);
    const latest = await (await fetch(`${first.stdout.trim()}api/rounds/latest`)).json();
    expect(latest.number).toBe(2);
  });

  it('generates a session id when the environment has none and prints it', async () => {
    const box = open();
    const result = await box.cli(['present', box.writeRound('round.md', STORAGE_ROUND), '--no-open']);

    expect(result.code).toBe(0);
    const [sessionLine, urlLine] = result.stdout.trim().split('\n');
    const id = /^session: ([0-9a-f]+)$/.exec(sessionLine!)?.[1];
    expect(id).toBeDefined();
    sessions.push(id!);
    expect(urlLine).toMatch(URL_LINE);
    expect(existsSync(join(box.sessionDir(id!), 'server.json'))).toBe(true);

    const waited = await box.cli(['await', '--timeout', '0', '--session', id!]);
    expect(waited.stdout).toBe('pending · round 1 · re-run await\n');
  });

  it('rejects a round without a recommendation and shows nothing', async () => {
    const box = open('s3');
    const file = box.writeRound(
      'round.md',
      '❓ **Q1** - **Where?**: Somewhere.\n\n❓ **Q2** - **When?**: Soon.\n\n➡️ Now.\n',
    );
    const result = await box.cli(['present', file, '--no-open']);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`${file}:1 · Q1: missing ➡️ recommendation\n`);
    // A rejected first round leaves no session folder or server behind.
    expect(existsSync(box.sessionDir('s3'))).toBe(false);
  });
});

describe('await', () => {
  it('prints pending when the timeout runs out', async () => {
    const box = open('a1');
    await box.cli(['present', box.writeRound('round.md', STORAGE_ROUND), '--no-open']);
    const started = Date.now();
    const result = await box.cli(['await', '--timeout', '1']);

    expect(result).toEqual({ code: 0, stdout: 'pending · round 1 · re-run await\n', stderr: '' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });

  it('prints the round submission in every answer mode and saves the record', async () => {
    const box = open('a2');
    const url = (await box.cli(['present', box.writeRound('round.md', STORAGE_ROUND), '--no-open'])).stdout.trim();

    const waiting = box.cli(['await', '--timeout', '30']);
    await new Promise((done) => setTimeout(done, 300));
    const response = await postJson(`${url}api/rounds/1/submission`, EVERY_MODE);
    expect(response.status).toBe(200);
    const result = await waiting;

    const recordPath = join(box.sessionDir('a2'), 'submissions', 'round-1.json');
    expect(result.code).toBe(0);
    expect(result.stdout.replace(recordPath, '<record>')).toBe(`submitted · round 1 · Storage choices
record: <record>

Q1 Where are rounds saved?
   accepted: A · Session folder in \`$TMPDIR\`
Q2 Which runtime?
   picked B: Bun
Q3 Retention?
   own answer: "keep them until the repo is cleaned"
Q4 Submit control placement
   unsure
Q5 Tree column
   no answer (sent as unsure)
Q6 Retry policy
   accepted: Retry three times with exponential backoff and jitter, then surface the error…

summary:
Q1 Where are rounds saved? · accepted A
Q2 Which runtime? · picked B
Q3 Retention? · own answer
Q4 Submit control placement · unsure
Q5 Tree column · no answer
Q6 Retry policy · accepted
`);

    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    expect(record).toMatchObject({
      round: 1,
      title: 'Storage choices',
      questions: [
        { number: 1, verdict: { mode: 'accepted', option: 'A', label: 'Session folder in `$TMPDIR`' } },
        { number: 2, verdict: { mode: 'picked', option: 'B', label: 'Bun' } },
        { number: 3, verdict: { mode: 'own', text: 'keep them until the repo is cleaned' } },
        { number: 4, verdict: { mode: 'unsure' } },
        { number: 5, verdict: { mode: 'none' } },
        { number: 6, verdict: { mode: 'accepted' } },
      ],
    });
    expect(record.questions[5].verdict.recommendation).toMatch(/^Retry three times .* real outages\.$/);

    // A later await on a submitted round prints it again at once.
    const again = await box.cli(['await', '--timeout', '30']);
    expect(again.stdout).toBe(result.stdout);
  });

  it('refuses a second submission of the same round', async () => {
    const box = open('a3');
    const url = (await box.cli(['present', box.writeRound('round.md', STORAGE_ROUND), '--no-open'])).stdout.trim();
    expect((await postJson(`${url}api/rounds/1/submission`, EVERY_MODE)).status).toBe(200);
    expect((await postJson(`${url}api/rounds/1/submission`, EVERY_MODE)).status).toBe(409);
  });

  it('prints ended and exits 1 when no server is running', async () => {
    const box = open('a4');
    const result = await box.cli(['await', '--timeout', '1']);
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/^ended · /);
  });
});

describe('end', () => {
  it('stops the server and deletes the session folder', async () => {
    const box = open('e1');
    await box.cli(['present', box.writeRound('round.md', STORAGE_ROUND), '--no-open']);
    const { pid } = box.serverInfo('e1');

    const result = await box.cli(['end']);
    expect(result.code).toBe(0);
    expect(existsSync(box.sessionDir('e1'))).toBe(false);
    await waitFor(() => !isAlive(pid));
  });

  it('does nothing when the session has no folder', async () => {
    const box = open('e2');
    expect(await box.cli(['end'])).toEqual({ code: 0, stdout: '', stderr: '' });
  });
});

describe('session folder', () => {
  it.skipIf(process.platform === 'win32')('is private to the user', async () => {
    const box = open('f1');
    await box.cli(['present', box.writeRound('round.md', STORAGE_ROUND), '--no-open']);
    const dir = box.sessionDir('f1');
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, 'server.json')).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, 'rounds', 'round-1.md')).mode & 0o777).toBe(0o600);
  });
});

describe('Node version check', () => {
  it('refuses an unsupported Node before doing anything else', async () => {
    const box = open('n1');
    const fake = `data:text/javascript,Object.defineProperty(process.versions,'node',{value:'22.22.1'})`;
    const result = await box.cli(['present', box.writeRound('round.md', STORAGE_ROUND)], ['--import', fake]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('^22.22.2 || ^24.15.0 || >=26');
    expect(result.stderr).toContain('found 22.22.1');
    expect(existsSync(box.sessionDir('n1'))).toBe(false);
  });

  it.each(['22.22.2', '22.23.0', '24.15.0', '26.0.0'])('accepts Node %s', async (version) => {
    const box = open('n2');
    const fake = `data:text/javascript,Object.defineProperty(process.versions,'node',{value:'${version}'})`;
    const result = await box.cli(['--help'], ['--import', fake]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage:');
  });
});
