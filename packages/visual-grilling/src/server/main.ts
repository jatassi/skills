// The session's detached local server: serves the round page, takes the
// page's round submission, and answers the CLI's control calls.
//
// Started by the CLI as `node server.mjs <session-dir>`. It binds 127.0.0.1 on
// port 0 and writes server.json so the CLI can find it. It ends on `end` or
// after the idle limit, deleting the session folder either way.

import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AwaitRequest,
  AwaitResponse,
  PageEvents,
  PingResponse,
  PresentRequest,
  PresentResponse,
  RoundIndex,
} from '../core/protocol.ts';
import { parseRound, type Round } from '../core/round.ts';
import { makeDir, sessionPaths, writePrivateFile, type ServerInfo } from '../core/session.ts';
import {
  buildRecord,
  checkWarning,
  cropImages,
  renderSubmission,
  type PageSubmission,
  type PageWarning,
  type SubmissionRecord,
} from '../core/submission.ts';
import { DrawCheck } from './draw-check.ts';
import { frameDocument, FRAME_ASSETS } from './frame.ts';
import { BASE_HEADERS, FRAME_HEADERS, guardRequest, ROUND_PAGE_HEADERS } from './guards.ts';
import { idleLimitMs, watchIdle } from './idle.ts';
import { pageRound } from './render.ts';

const MAX_BODY = 1024 * 1024;
// A round submission carries weak matches' crops as PNG data URLs.
const MAX_SUBMISSION_BODY = 16 * 1024 * 1024;
/** Warnings kept per round: past this, the round's blocks are just noisy. */
const MAX_WARNINGS = 50;

const sessionDirArg = process.argv[2];
if (!sessionDirArg) {
  process.stderr.write('usage: node server.mjs <session-dir>\n');
  process.exit(2);
}
const paths = sessionPaths(sessionDirArg);
const pageDir = join(dirname(fileURLToPath(import.meta.url)), 'page');
const drawCheck = new DrawCheck(pageDir);
const frameDir = join(dirname(fileURLToPath(import.meta.url)), 'frame');

// ------------------------------------------------------------------- state

const rounds = new Map<number, Round>();
const records = new Map<number, SubmissionRecord>();
/** Page-only failures reported for rounds not yet submitted; they ride the submission. */
const pageWarnings = new Map<number, PageWarning[]>();
let latest = 0;

interface Waiter {
  round: number;
  settle: (response: AwaitResponse) => void;
}
const waiters = new Set<Waiter>();
const eventClients = new Set<ServerResponse>();
let port = 0;
let ending = false;
/** When this process started: with the pid, it tells this server from a reused pid. */
const startTime = Math.round(performance.timeOrigin);

// A waiting `await` is activity; an open event stream alone is not, so a
// forgotten tab doesn't keep the server running.
const idle = watchIdle(idleLimitMs(), () => waiters.size > 0, () => shutdown('idle'));

loadSession();

function loadSession(): void {
  makeDir(paths.rounds);
  makeDir(paths.submissions);
  makeDir(paths.crops);
  for (const name of readdirSync(paths.rounds)) {
    const n = Number(/^round-(\d+)\.md$/.exec(name)?.[1]);
    if (!n) continue;
    const parsed = parseRound(readFileSync(paths.round(n), 'utf8'));
    if (!parsed.ok) continue;
    rounds.set(n, parsed.round);
    latest = Math.max(latest, n);
    try {
      records.set(n, JSON.parse(readFileSync(paths.submission(n), 'utf8')) as SubmissionRecord);
    } catch {
      // Not submitted yet.
    }
  }
}

// ------------------------------------------------------------------ routes

const server = createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    if (!res.headersSent) sendJson(res, 500, { error: (error as Error).message });
    else res.end();
  });
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const route = url.pathname;
  const rejection = guardRequest(req, route, port);
  if (rejection) return sendJson(res, rejection.status, { error: rejection.error });
  // Every accepted CLI call and page request counts as activity, except ping:
  // other sessions' sweeps ping this server, and that mustn't keep it alive.
  if (route !== '/control/ping') idle.touch();

  if (route.startsWith('/control/')) {
    const body = await readJson(req);
    switch (route) {
      case '/control/ping': {
        const identity: PingResponse = { pid: process.pid, startTime };
        return sendJson(res, 200, identity);
      }
      case '/control/present':
        return await present(res, body as PresentRequest);
      case '/control/await':
        return awaitRound(req, res, body as AwaitRequest);
      case '/control/end':
        sendJson(res, 200, {});
        res.on('finish', () => shutdown('end'));
        return;
    }
    return sendJson(res, 404, { error: 'no such route' });
  }

  if (req.method === 'GET') {
    if (route === '/') return sendFile(res, 'index.html', ROUND_PAGE_HEADERS);
    const asset = /^\/assets\/([a-z0-9-]+\.(?:js|css))$/.exec(route);
    if (asset) return sendFile(res, asset[1]!);
    if (route === '/events') return openEvents(req, res);
    const frameAsset = /^\/frame\/assets\/([a-z0-9-]+\.js)$/.exec(route);
    if (frameAsset && (FRAME_ASSETS as readonly string[]).includes(frameAsset[1]!)) {
      return sendFile(res, frameAsset[1]!, BASE_HEADERS, frameDir);
    }
    const frameRoute = /^\/frame\/r(\d+)\/([a-z0-9][a-z0-9-]*)$/.exec(route);
    if (frameRoute) return sendFrame(res, Number(frameRoute[1]), frameRoute[2]!, url.searchParams.get('theme'));
    if (route === '/api/rounds') return sendJson(res, 200, roundIndex());
    const roundRoute = /^\/api\/rounds\/(latest|\d+)$/.exec(route);
    if (roundRoute) {
      const n = roundRoute[1] === 'latest' ? latest : Number(roundRoute[1]);
      const round = rounds.get(n);
      if (!round) return sendJson(res, 404, { error: 'no such round' });
      return sendJson(res, 200, pageRound(n, round, records.get(n), answeredInTerminal(n)));
    }
  }

  const submitRoute = /^\/api\/rounds\/(\d+)\/submission$/.exec(route);
  if (submitRoute && req.method === 'POST') {
    return submit(res, Number(submitRoute[1]), (await readJson(req, MAX_SUBMISSION_BODY)) as PageSubmission);
  }
  const warningRoute = /^\/api\/rounds\/(\d+)\/warnings$/.exec(route);
  if (warningRoute && req.method === 'POST') {
    return reportWarning(res, Number(warningRoute[1]), await readJson(req));
  }

  // The guard already checked it's a page write; being here was the activity.
  if (route === '/api/activity' && req.method === 'POST') {
    await readJson(req);
    return sendJson(res, 200, {});
  }

  sendJson(res, 404, { error: 'not found' });
}

async function present(res: ServerResponse, body: PresentRequest): Promise<void> {
  const parsed = parseRound(String(body.source ?? ''));
  if (!parsed.ok) return sendJson(res, 422, { errors: parsed.errors });
  const drawErrors = await drawCheck.check(parsed.round);
  if (drawErrors.length > 0) return sendJson(res, 422, { errors: drawErrors });

  // A new round means the user answered the open one in the terminal.
  closeOpenRound();
  const n = latest + 1;
  writePrivateFile(paths.round(n), body.source);
  rounds.set(n, parsed.round);
  latest = n;
  broadcast('round', { round: n });
  const response: PresentResponse = { round: n, url: `http://127.0.0.1:${port}/` };
  sendJson(res, 200, response);
}

function awaitRound(req: IncomingMessage, res: ServerResponse, body: AwaitRequest): void {
  const n = latest;
  if (!rounds.has(n)) return sendJson(res, 409, { error: 'no round has been presented yet' });
  const record = records.get(n);
  if (record) return sendJson(res, 200, submittedResponse(record));

  const timeoutMs = Math.max(0, Math.min(Number(body.timeoutMs) || 0, 24 * 60 * 60 * 1000));
  const waiter: Waiter = {
    round: n,
    settle: (response) => {
      clearTimeout(timer);
      waiters.delete(waiter);
      sendJson(res, 200, response);
    },
  };
  const timer = setTimeout(
    () => waiter.settle({ outcome: 'pending', text: `pending · round ${n} · re-run await` }),
    timeoutMs,
  );
  waiters.add(waiter);
  req.on('close', () => {
    if (!res.writableEnded) {
      clearTimeout(timer);
      waiters.delete(waiter);
    }
  });
}

function submit(res: ServerResponse, n: number, body: PageSubmission): void {
  const round = rounds.get(n);
  if (!round) return sendJson(res, 404, { error: 'no such round' });
  if (records.has(n)) return sendJson(res, 409, { error: `round ${n} was already submitted` });
  if (answeredInTerminal(n)) return sendJson(res, 409, { error: `round ${n} was answered in the terminal` });

  let record: SubmissionRecord;
  let crops: Map<string, Buffer>;
  try {
    crops = cropImages(body);
    record = buildRecord(n, round, body, new Date(), pageWarnings.get(n));
  } catch (error) {
    return sendJson(res, 400, { error: (error as Error).message });
  }
  for (const question of record.questions) {
    question.comments.forEach((comment, index) => {
      const png = crops.get(`${question.number}:${index + 1}`);
      if (!png) return;
      comment.crop = paths.crop(n, question.number, index + 1);
      writePrivateFile(comment.crop, png);
    });
  }
  writePrivateFile(paths.submission(n), `${JSON.stringify(record, null, 2)}\n`);
  records.set(n, record);
  pageWarnings.delete(n);
  for (const waiter of [...waiters]) {
    if (waiter.round === n) waiter.settle(submittedResponse(record));
  }
  sendJson(res, 200, {});
}

/** Serves an html illustration's frame: the agent's HTML with the frame head injected, sandboxed. */
function sendFrame(res: ServerResponse, n: number, id: string, theme: string | null): void {
  const illustration = rounds
    .get(n)
    ?.questions.flatMap((question) => question.illustrations)
    .find((candidate) => candidate.id === id && candidate.kind === 'html');
  if (!illustration) return sendJson(res, 404, { error: 'no such frame' });
  const page = frameDocument(illustration.source, {
    tailwind: illustration.tailwind !== false,
    theme: theme === 'light' ? 'light' : 'dark',
  });
  res.writeHead(200, {
    ...FRAME_HEADERS,
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(page),
  });
  res.end(page);
}

/** A block that failed only on the page, or a frame's script error. It doesn't wake `await`; it rides the submission. */
function reportWarning(res: ServerResponse, n: number, body: unknown): void {
  const round = rounds.get(n);
  if (!round) return sendJson(res, 404, { error: 'no such round' });
  if (records.has(n)) return sendJson(res, 409, { error: `round ${n} was already submitted` });
  if (answeredInTerminal(n)) return sendJson(res, 409, { error: `round ${n} was answered in the terminal` });
  let warning: PageWarning;
  try {
    warning = checkWarning(round, body);
  } catch (error) {
    return sendJson(res, 400, { error: (error as Error).message });
  }
  const list = pageWarnings.get(n) ?? [];
  // One draw warning per block (a theme redraw that fails again isn't news),
  // and each distinct script error once.
  const known = list.some(
    (existing) =>
      existing.question === warning.question &&
      existing.illustration === warning.illustration &&
      existing.kind === warning.kind &&
      (warning.kind === 'draw' || existing.message === warning.message),
  );
  if (!known && list.length < MAX_WARNINGS) pageWarnings.set(n, [...list, warning]);
  sendJson(res, 200, {});
}

/**
 * A round without a submission was answered in the terminal once a later
 * round closed it. Derived rather than saved, so a restarted server gets the
 * same answer from the files. (`end` closes the latest round too, but the
 * server exits right after, so only the page hears about that.)
 */
function answeredInTerminal(n: number): boolean {
  return unsubmitted(n) && n < latest;
}

function roundIndex(): RoundIndex {
  return {
    rounds: [...rounds.keys()]
      .sort((a, b) => a - b)
      .map((n) => {
        const round = rounds.get(n)!;
        const state = records.has(n) ? 'submitted' : answeredInTerminal(n) ? 'terminal' : 'open';
        return { number: n, ...(round.title ? { title: round.title } : {}), questions: round.questions.length, state };
      }),
  };
}

function unsubmitted(n: number): boolean {
  return rounds.has(n) && !records.has(n);
}

/** Marks the open round answered in the terminal and releases every `await` on it. */
function closeOpenRound(): void {
  if (unsubmitted(latest)) broadcast('terminal', { round: latest });
  // Only the open round can still be submitted, so its warnings go with it.
  pageWarnings.clear();
  for (const waiter of [...waiters]) {
    waiter.settle({ outcome: 'superseded', text: `superseded · round ${waiter.round} answered in the terminal` });
  }
}

function submittedResponse(record: SubmissionRecord): AwaitResponse {
  return { outcome: 'submitted', text: renderSubmission(record, paths.submission(record.round)) };
}

// ------------------------------------------------------------ page events

function openEvents(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    ...BASE_HEADERS,
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
  });
  res.write(': connected\n\n');
  eventClients.add(res);
  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(keepAlive);
    eventClients.delete(res);
  });
}

function broadcast<E extends keyof PageEvents>(event: E, data: PageEvents[E]): void {
  for (const client of eventClients) client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// -------------------------------------------------------------- shutdown

function shutdown(reason: 'end' | 'idle'): void {
  if (ending) return;
  ending = true;
  if (reason === 'end') {
    // `end` closes the open round the same way a new round does.
    closeOpenRound();
  }
  broadcast('finished', {});
  for (const client of eventClients) client.end();
  rmSync(paths.dir, { recursive: true, force: true });
  // Let the last responses flush, then go.
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 1_000);
}

// ---------------------------------------------------------------- helpers

function readJson(req: IncomingMessage, limit = MAX_BODY): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('request body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...BASE_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
};

function sendFile(res: ServerResponse, name: string, headers = BASE_HEADERS, dir = pageDir): void {
  let content: Buffer;
  try {
    content = readFileSync(join(dir, name));
  } catch {
    return sendJson(res, 404, { error: 'not found' });
  }
  res.writeHead(200, {
    ...headers,
    'content-type': CONTENT_TYPES[name.split('.').pop()!] ?? 'application/octet-stream',
    'cache-control': 'no-store',
    'content-length': content.length,
  });
  res.end(content);
}

// ------------------------------------------------------------------ start

server.listen(0, '127.0.0.1', () => {
  port = (server.address() as AddressInfo).port;
  const info: ServerInfo = { port, pid: process.pid, startTime };
  writePrivateFile(paths.serverJson, `${JSON.stringify(info)}\n`);
  // Loading the libraries holds the event loop for a while; the CLI that
  // started this server is still waiting to present, so that time isn't idle.
  void drawCheck.warm().then(() => idle.touch());
});
