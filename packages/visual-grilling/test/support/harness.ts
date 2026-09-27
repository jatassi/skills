// Drives the built bundle (npm test builds it into .test-dist) the way an
// agent does: real CLI processes against a temp TMPDIR, plus raw HTTP to the
// server where a test stands in for the page.

import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
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

  cli(args: string[], nodeArgs: string[] = [], stdin?: string): Promise<CliResult> {
    return new Promise((done) => {
      const child = execFile(
        process.execPath,
        [...nodeArgs, CLI, ...args],
        // Roomy on purpose: this spawns a real server and, on a busy machine
        // running the suite under load, the product's own 10 s server-start
        // budget (src/cli/main.ts) can take a while to be met. Give the CLI
        // itself plenty of slack rather than let this budget be what fails
        // the test.
        { env: this.env, cwd: this.tmp, timeout: 120_000 },
        (error, stdout, stderr) => {
          const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
          done({ code, stdout, stderr });
        },
      );
      if (stdin !== undefined) child.stdin!.end(stdin);
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

/** POSTs JSON to the server the way the round page does, from the page's own origin. */
export async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: new URL(url).origin },
    body: JSON.stringify(body),
  });
}

export interface RawResponse {
  status: number;
  /** Header names lower-cased; repeated headers joined with ", ". */
  headers: Record<string, string>;
  body: string;
}

/**
 * Sends one hand-written HTTP/1.1 request over a socket, so a test controls
 * every header (Host, Origin, Sec-Fetch-*) exactly. `headers` go out as given;
 * pass `host: null` to send no Host at all.
 */
export function rawRequest(
  port: number,
  method: string,
  path: string,
  headers: Record<string, string | null> = {},
  body = '',
): Promise<RawResponse> {
  const all: Record<string, string | null> = { host: `127.0.0.1:${port}`, ...headers };
  const lines = [`${method} ${path} HTTP/1.1`];
  for (const [name, value] of Object.entries(all)) if (value !== null) lines.push(`${name}: ${value}`);
  lines.push(`content-length: ${Buffer.byteLength(body)}`, 'connection: close', '', body);
  return new Promise((done, fail) => {
    const socket = connect(port, '127.0.0.1');
    const chunks: Buffer[] = [];
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('error', fail);
    socket.on('end', () => done(parseRaw(Buffer.concat(chunks).toString('utf8'))));
    // Write without half-closing: the server treats a client FIN as a hang-up
    // (which cancels a long-poll await). `connection: close` ends the exchange.
    socket.write(lines.join('\r\n'));
  });
}

function parseRaw(text: string): RawResponse {
  const split = text.indexOf('\r\n\r\n');
  if (split === -1) throw new Error(`truncated HTTP response: ${JSON.stringify(text)}`);
  const [statusLine, ...headerLines] = text.slice(0, split).split('\r\n');
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const colon = line.indexOf(':');
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers[name] = name in headers ? `${headers[name]}, ${value}` : value;
  }
  let body = text.slice(split + 4);
  if (headers['transfer-encoding'] === 'chunked') body = unchunk(body);
  return { status: Number(statusLine!.split(' ')[1]), headers, body };
}

function unchunk(text: string): string {
  let out = '';
  let rest = text;
  for (;;) {
    const eol = rest.indexOf('\r\n');
    const size = parseInt(rest.slice(0, eol), 16);
    if (!size) return out;
    out += rest.slice(eol + 2, eol + 2 + size);
    rest = rest.slice(eol + 2 + size + 2);
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Kills a process the way a crash would, and waits until it is gone. */
export async function crash(pid: number): Promise<void> {
  process.kill(pid, 'SIGKILL');
  await waitFor(() => !isAlive(pid));
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
