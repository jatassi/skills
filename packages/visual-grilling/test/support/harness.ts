// Drives the built bundle (npm test builds it into .test-dist) the way an
// agent does: real CLI processes against a temp TMPDIR, plus raw HTTP to the
// server where a test stands in for the page.

import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const DIST = resolve(import.meta.dirname, '../../.test-dist');
export const CLI = join(DIST, 'cli.mjs');

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class Sandbox {
  readonly tmp: string;
  readonly env: NodeJS.ProcessEnv;

  constructor(sessionId?: string) {
    this.tmp = realpathSync(mkdtempSync(join(tmpdir(), 'vg-test-')));
    const env: NodeJS.ProcessEnv = { ...process.env, TMPDIR: this.tmp, TEMP: this.tmp, TMP: this.tmp };
    delete env.CLAUDE_CODE_SESSION_ID;
    delete env.CODEX_SESSION_ID;
    if (sessionId) env.CLAUDE_CODE_SESSION_ID = sessionId;
    this.env = env;
  }

  sessionDir(id: string): string {
    return join(this.tmp, 'visual-grilling', id);
  }

  writeRound(name: string, content: string): string {
    const file = join(this.tmp, name);
    writeFileSync(file, content);
    return file;
  }

  cli(args: string[], nodeArgs: string[] = []): Promise<CliResult> {
    return new Promise((done) => {
      execFile(
        process.execPath,
        [...nodeArgs, CLI, ...args],
        { env: this.env, cwd: this.tmp, timeout: 60_000 },
        (error, stdout, stderr) => {
          const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
          done({ code, stdout, stderr });
        },
      );
    });
  }

  serverInfo(id: string): { port: number; pid: number; startTime: number } {
    return JSON.parse(readFileSync(join(this.sessionDir(id), 'server.json'), 'utf8'));
  }

  /** Stops any server this sandbox started and removes its temp folder. */
  async dispose(sessions: string[]): Promise<void> {
    for (const id of sessions) await this.cli(['end', '--session', id]);
    rmSync(this.tmp, { recursive: true, force: true });
  }
}

/** POSTs JSON to the server the way the round page does. */
export async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function waitFor(check: () => boolean, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out waiting');
    await new Promise((done) => setTimeout(done, 25));
  }
}

export const STORAGE_ROUND = `# Storage choices

❓ **Q1** - **Where are rounds saved?**: Rounds need a home for the session.

- **A** - Session folder in \`$TMPDIR\`
- **B** - The repository

➡️ **A** because it is cleaned up with the session.

---

❓ **Q2** - **Which runtime?**: Cold start matters.

- **A** - Node
- **B** - Bun

➡️ **A**

---

❓ **Q3** - **Retention?**: How long do we keep them?

➡️ Delete them when the session ends. Nothing else needs them.

---

❓ **Q4** - **Submit control placement**: Where does Submit live?

➡️ In the sticky bar.

---

❓ **Q5** - **Tree column**: Show the design tree?

➡️ Yes, beside the questions.

---

❓ **Q6** - **Retry policy**: How many retries before we give up on a flaky upload?

➡️ Retry three times with exponential backoff and jitter, then surface the error to the user with a retry button. Anything more hides real outages.
`;
