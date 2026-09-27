// The CLI: `present`, `await` and `end`. It finds, starts or contacts the
// session's server and prints what the agent reads. It stays small: all the
// heavy work happens in the warm server.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { AwaitResponse, PresentRejection, PresentResponse } from '../core/protocol.ts';
import { formatRoundError, formatRoundNote } from '../core/round.ts';
import {
  isValidSessionId,
  preparePrivateSessionDir,
  readServerInfo,
  sessionDir,
  sessionPaths,
  type ServerInfo,
  type SessionPaths,
} from '../core/session.ts';
import { call, isAlive, serverState, sweepDeadSessions, type HttpResponse } from './servers.ts';

const DEFAULT_AWAIT_SECONDS = 90;
const SERVER_START_MS = 10_000;
const STOP_MS = 5_000;

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
                       Does nothing when the session has no folder.

Flags:
  --session <id>       The grilling session. Defaults to $CLAUDE_CODE_SESSION_ID, then
                       $CODEX_SESSION_ID; without either, the first present prints
                       "session: <id>" to pass here.
  --no-open            present: don't open the default browser (open the link yourself,
                       e.g. in the Claude Code desktop Browser pane).
  --timeout <seconds>  await: how long to wait (default ${DEFAULT_AWAIT_SECONDS}; "5m" and "30s" work too).

await's first line names the outcome:
  submitted · round N · <title>   the submission follows          exit 0
  pending · round N · re-run await  the timeout ran out            exit 0
  superseded · round N answered in the terminal                  exit 0
  ended · <reason>                the server is gone              exit 1

present prints rejections to stderr and exits 1. It prints notes (an unknown code
language, shown as plain text) to stderr as "…: note: …" and still shows the round.

Exit codes: 0 ok, 1 rejected round or failure, 2 usage error.

Round-file guide: ${resolve(distDir, '..', 'round-file.md')}
`;
}

// ---------------------------------------------------------------- session id

function resolveSession(flag: string | undefined, allowGenerate: boolean): { id: string; generated: boolean } {
  const id = flag ?? (process.env.CLAUDE_CODE_SESSION_ID || process.env.CODEX_SESSION_ID);
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
  // Every present clears away other sessions whose server is gone.
  const swept = sweepDeadSessions(session.id);
  try {
    const paths = sessionPaths(sessionDir(session.id));
    const newSession = !existsSync(paths.dir);
    preparePrivateSessionDir(paths);
    let { info: server, started } = await ensureServer(paths, options.distDir);
    let response;
    try {
      response = await call(server.port, '/control/present', { source });
    } catch {
      // The server went away between the check and the call (the idle
      // shutdown, which also deletes the folder, say): start again once.
      preparePrivateSessionDir(paths);
      ({ info: server, started } = await ensureServer(paths, options.distDir));
      response = await call(server.port, '/control/present', { source });
    }
    if (response.status === 422) {
      const { errors } = response.body as PresentRejection;
      for (const error of errors) io.err(formatRoundError(file, error));
      // A rejected first round leaves no grilling session behind.
      if (newSession) await stopServer(server, paths);
      return EXIT_FAILURE;
    }
    if (response.status !== 200) throw serverError(response);

    const { url, notes } = response.body as PresentResponse;
    for (const note of notes) io.err(formatRoundNote(file, note));
    if (session.generated) io.out(`session: ${session.id}`);
    io.out(url);
    // A new or restarted server has a new link; any open tab can't follow it.
    if (started && options.open) openBrowser(url);
    return EXIT_OK;
  } finally {
    await swept;
  }
}

/** Finds the session's server, or starts one in its folder (which restarts a dead one). */
async function ensureServer(paths: SessionPaths, distDir: string): Promise<{ info: ServerInfo; started: boolean }> {
  const existing = readServerInfo(paths);
  if (existing) {
    const state = await serverState(existing);
    if (state === 'running') return { info: existing, started: false };
    if (state === 'unresponsive') {
      throw new Error(`the grilling server (pid ${existing.pid}) is not responding; try again in a moment`);
    }
  }

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
    if (info && info.pid === child.pid && (await serverState(info)) === 'running') return { info, started: true };
    await sleep(50);
  }
  throw new Error(`the server did not start within ${SERVER_START_MS / 1000} s`);
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

  if (!existsSync(paths.dir)) {
    io.out(`ended · grilling session ${session.id} is over (ended, idle, or never presented)`);
    return EXIT_FAILURE;
  }
  const server = readServerInfo(paths);
  const state = server ? await serverState(server) : 'dead';
  if (!server || state === 'dead') {
    io.out('ended · the server stopped unexpectedly (the next present restarts it)');
    return EXIT_FAILURE;
  }
  if (state === 'unresponsive') throw new Error(`the grilling server (pid ${server.pid}) is not responding`);

  let response;
  try {
    response = await call(server.port, '/control/await', { timeoutMs });
  } catch {
    io.out('ended · the server stopped while waiting (the next present restarts it)');
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
  const { id } = resolveSession(options.session, false);
  const paths = sessionPaths(sessionDir(id));
  if (!existsSync(paths.dir)) return EXIT_OK;

  const server = readServerInfo(paths);
  if (server && (await serverState(server)) !== 'dead') await stopServer(server, paths);
  rmSync(paths.dir, { recursive: true, force: true });
  io.out(`session ${id} ended`);
  return EXIT_OK;
}

// -------------------------------------------------------------------- helpers

/**
 * Asks the server to end the session, then waits for it to exit and its folder
 * to go. A server that doesn't answer or doesn't exit in time is terminated.
 */
async function stopServer(server: ServerInfo, paths: SessionPaths): Promise<void> {
  const answered = await call(server.port, '/control/end', {}, STOP_MS).then(
    () => true,
    () => false,
  );
  const deadline = Date.now() + (answered ? STOP_MS : 0);
  while (Date.now() < deadline && isAlive(server.pid)) await sleep(50);
  if (isAlive(server.pid)) {
    try {
      process.kill(server.pid, 'SIGKILL');
    } catch {
      // It exited after all.
    }
  }
  rmSync(paths.dir, { recursive: true, force: true });
}

function serverError(response: HttpResponse): Error {
  const detail =
    typeof response.body === 'object' && response.body && 'error' in response.body
      ? String((response.body as { error: unknown }).error)
      : `HTTP ${response.status}`;
  return new Error(detail);
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}
