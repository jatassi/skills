// The CLI: `present`, `await` and `end`. It finds, starts or contacts the
// session's server and prints what the agent reads. It stays small: all the
// heavy work happens in the warm server.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type {
  AwaitResponse,
  PingResponse,
  PresentRejection,
  PresentResponse,
} from '../core/protocol.ts';
import { formatRoundError } from '../core/round.ts';
import {
  isValidSessionId,
  preparePrivateSessionDir,
  readServerInfo,
  sessionDir,
  sessionPaths,
  type ServerInfo,
  type SessionPaths,
} from '../core/session.ts';

const DEFAULT_AWAIT_SECONDS = 90;
const SERVER_START_MS = 10_000;

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

class UsageError extends Error {}

interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
}

const io: Io = {
  out: (text) => process.stdout.write(text.endsWith('\n') ? text : `${text}\n`),
  err: (text) => process.stderr.write(text.endsWith('\n') ? text : `${text}\n`),
};

/** Runs one CLI invocation and returns the exit code. `entryUrl` is cli.mjs's own URL. */
export async function run(argv: string[], entryUrl: string): Promise<number> {
  const distDir = dirname(fileURLToPath(entryUrl));
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        session: { type: 'string' },
        'no-open': { type: 'boolean' },
        timeout: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
    const [command, ...rest] = positionals;
    if (values.help || command === undefined || command === 'help') {
      io.out(usage(distDir));
      return values.help || command === 'help' ? EXIT_OK : EXIT_USAGE;
    }
    switch (command) {
      case 'present': {
        if (rest.length !== 1) throw new UsageError('present takes exactly one round file');
        return await present(rest[0]!, { session: values.session, open: !values['no-open'], distDir });
      }
      case 'await':
        return await awaitSubmission({ session: values.session, timeout: values.timeout });
      case 'end':
        return await end({ session: values.session });
      default:
        throw new UsageError(`unknown command "${command}"`);
    }
  } catch (error) {
    if (error instanceof UsageError || (error as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
      io.err(`visual-grilling: ${(error as Error).message}\nRun with --help for usage.`);
      return EXIT_USAGE;
    }
    io.err(`visual-grilling: ${(error as Error).message}`);
    return EXIT_FAILURE;
  }
}

function usage(distDir: string): string {
  return `Usage: node cli.mjs <command> [flags]

Commands:
  present <round.md>   Check and show a round; prints the round page's link.
  await                Wait for the round submission; prints it for the agent.
  end                  Stop the server and delete the grilling session's files.

Flags:
  --session <id>       The grilling session. Defaults to $CLAUDE_CODE_SESSION_ID;
                       without it, the first present prints "session: <id>" to pass here.
  --no-open            present: don't open the default browser (open the link yourself,
                       e.g. in the Claude Code desktop Browser pane).
  --timeout <seconds>  await: how long to wait (default ${DEFAULT_AWAIT_SECONDS}; "5m" and "30s" work too).

await's first line names the outcome:
  submitted · round N · <title>   the submission follows          exit 0
  pending · round N · re-run await  the timeout ran out            exit 0
  superseded · round N answered in the terminal                  exit 0
  ended · <reason>                the server is gone              exit 1

Exit codes: 0 ok, 1 rejected round or failure, 2 usage error.

Round-file guide: ${resolve(distDir, '..', 'round-file.md')}
`;
}

// ---------------------------------------------------------------- session id

function resolveSession(flag: string | undefined, allowGenerate: boolean): { id: string; generated: boolean } {
  const id = flag ?? process.env.CLAUDE_CODE_SESSION_ID;
  if (id !== undefined && id !== '') {
    if (!isValidSessionId(id)) throw new UsageError(`"${id}" is not a usable session id`);
    return { id, generated: false };
  }
  if (!allowGenerate) {
    throw new UsageError('no grilling session: pass --session <id> (the id the first present printed)');
  }
  return { id: randomBytes(6).toString('hex'), generated: true };
}

// ------------------------------------------------------------------ present

async function present(
  file: string,
  options: { session: string | undefined; open: boolean; distDir: string },
): Promise<number> {
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    throw new UsageError(`can't read round file ${file}`);
  }

  const session = resolveSession(options.session, true);
  const paths = sessionPaths(sessionDir(session.id));
  const newSession = !existsSync(paths.dir);
  preparePrivateSessionDir(paths);
  const server = await ensureServer(paths, options.distDir);
  const response = await call(server.port, '/control/present', { source });
  if (response.status === 422) {
    const { errors } = response.body as PresentRejection;
    for (const error of errors) io.err(formatRoundError(file, error));
    // A rejected first round leaves no grilling session behind.
    if (newSession) await stopServer(server, paths);
    return EXIT_FAILURE;
  }
  if (response.status !== 200) throw serverError(response);

  const { round, url } = response.body as PresentResponse;
  if (session.generated) io.out(`session: ${session.id}`);
  io.out(url);
  if (round === 1 && options.open) openBrowser(url);
  return EXIT_OK;
}

async function ensureServer(paths: SessionPaths, distDir: string): Promise<ServerInfo> {
  const existing = readServerInfo(paths);
  if (existing && (await ping(existing))) return existing;

  rmSync(paths.serverJson, { force: true });
  const child = spawn(process.execPath, [join(distDir, 'server.mjs'), paths.dir], {
    cwd: tmpdir(),
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  const deadline = Date.now() + SERVER_START_MS;
  while (Date.now() < deadline) {
    const info = readServerInfo(paths);
    if (info && info.pid === child.pid && (await ping(info))) return info;
    await sleep(50);
  }
  throw new Error(`the server did not start within ${SERVER_START_MS / 1000} s`);
}

async function ping(info: ServerInfo): Promise<boolean> {
  try {
    const response = await call(info.port, '/control/ping', {});
    return response.status === 200 && (response.body as PingResponse).pid === info.pid;
  } catch {
    return false;
  }
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(command, args as string[], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      windowsVerbatimArguments: process.platform === 'win32',
    });
    child.on('error', () => {});
    child.unref();
  } catch {
    // The link is printed either way.
  }
}

// -------------------------------------------------------------------- await

async function awaitSubmission(options: { session: string | undefined; timeout: string | undefined }): Promise<number> {
  const timeoutMs = parseTimeout(options.timeout);
  const session = resolveSession(options.session, false);
  const paths = sessionPaths(sessionDir(session.id));

  const server = readServerInfo(paths);
  if (!server || !(await ping(server))) {
    io.out('ended · no grilling server is running for this session');
    return EXIT_FAILURE;
  }

  let response;
  try {
    response = await call(server.port, '/control/await', { timeoutMs });
  } catch {
    io.out('ended · the server stopped while waiting');
    return EXIT_FAILURE;
  }
  if (response.status !== 200) throw serverError(response);
  io.out((response.body as AwaitResponse).text);
  return EXIT_OK;
}

function parseTimeout(value: string | undefined): number {
  if (value === undefined) return DEFAULT_AWAIT_SECONDS * 1000;
  const match = /^(\d+(?:\.\d+)?)(s|m)?$/.exec(value.trim());
  if (!match) throw new UsageError(`--timeout takes seconds, like 90, 30s or 5m (got "${value}")`);
  const seconds = Number(match[1]) * (match[2] === 'm' ? 60 : 1);
  return Math.round(seconds * 1000);
}

// ---------------------------------------------------------------------- end

async function end(options: { session: string | undefined }): Promise<number> {
  const session = resolveSession(options.session, false);
  const paths = sessionPaths(sessionDir(session.id));
  if (!existsSync(paths.dir)) return EXIT_OK;

  const server = readServerInfo(paths);
  if (server && (await ping(server))) await stopServer(server, paths);
  rmSync(paths.dir, { recursive: true, force: true });
  io.out(`session ${session.id} ended`);
  return EXIT_OK;
}

// -------------------------------------------------------------------- helpers

/** Asks the server to end the session, then waits for it to exit and its folder to go. */
async function stopServer(server: ServerInfo, paths: SessionPaths): Promise<void> {
  await call(server.port, '/control/end', {}).catch(() => undefined);
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && isAlive(server.pid)) await sleep(50);
  rmSync(paths.dir, { recursive: true, force: true });
}

interface Response {
  status: number;
  body: unknown;
}

function call(port: number, route: string, body: unknown): Promise<Response> {
  const payload = JSON.stringify(body);
  return new Promise((resolvePromise, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: route,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown = text;
          try {
            parsed = JSON.parse(text);
          } catch {
            // Keep the raw text for the error message.
          }
          resolvePromise({ status: res.statusCode ?? 0, body: parsed });
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

function serverError(response: Response): Error {
  const detail =
    typeof response.body === 'object' && response.body && 'error' in response.body
      ? String((response.body as { error: unknown }).error)
      : `HTTP ${response.status}`;
  return new Error(detail);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: string }).code === 'EPERM';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}
