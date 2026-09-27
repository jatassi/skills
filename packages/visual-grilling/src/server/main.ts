// The session's detached local server: serves the round page, takes the
// page's round submission, and answers the CLI's control calls.
//
// Started by the CLI as `node server.mjs <session-dir>`. It binds 127.0.0.1 on
// port 0 and writes server.json so the CLI can find it.

import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AwaitRequest,
  AwaitResponse,
  PageEvents,
  PresentRequest,
  PresentResponse,
} from '../core/protocol.ts';
import { parseRound, type Round } from '../core/round.ts';
import { makeDir, sessionPaths, writePrivateFile, type ServerInfo } from '../core/session.ts';
import {
  buildRecord,
  renderSubmission,
  type PageSubmission,
  type SubmissionRecord,
} from '../core/submission.ts';
import { BASE_HEADERS, guardRequest, ROUND_PAGE_HEADERS } from './guards.ts';
import { pageRound } from './render.ts';

const MAX_BODY = 1024 * 1024;

const sessionDirArg = process.argv[2];
if (!sessionDirArg) {
  process.stderr.write('usage: node server.mjs <session-dir>\n');
  process.exit(2);
}
const paths = sessionPaths(sessionDirArg);
const pageDir = join(dirname(fileURLToPath(import.meta.url)), 'page');

// ------------------------------------------------------------------- state

const rounds = new Map<number, Round>();
const records = new Map<number, SubmissionRecord>();
let latest = 0;

interface Waiter {
  round: number;
  settle: (response: AwaitResponse) => void;
}
const waiters = new Set<Waiter>();
const eventClients = new Set<ServerResponse>();
let port = 0;
let ending = false;

loadSession();

function loadSession(): void {
  makeDir(paths.rounds);
  makeDir(paths.submissions);
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
  const rejection = guardRequest(req, port);
  if (rejection) return sendJson(res, rejection.status, { error: rejection.error });

  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const route = url.pathname;

  if (route.startsWith('/control/')) {
    const body = await readJson(req);
    switch (route) {
      case '/control/ping':
        return sendJson(res, 200, { pid: process.pid });
      case '/control/present':
        return present(res, body as PresentRequest);
      case '/control/await':
        return awaitRound(req, res, body as AwaitRequest);
      case '/control/end':
        sendJson(res, 200, {});
        res.on('finish', shutdown);
        return;
    }
    return sendJson(res, 404, { error: 'no such route' });
  }

  if (req.method === 'GET') {
    if (route === '/') return sendFile(res, 'index.html');
    const asset = /^\/assets\/([a-z0-9-]+\.(?:js|css))$/.exec(route);
    if (asset) return sendFile(res, asset[1]!);
    if (route === '/events') return openEvents(req, res);
    const roundRoute = /^\/api\/rounds\/(latest|\d+)$/.exec(route);
    if (roundRoute) {
      const n = roundRoute[1] === 'latest' ? latest : Number(roundRoute[1]);
      const round = rounds.get(n);
      if (!round) return sendJson(res, 404, { error: 'no such round' });
      return sendJson(res, 200, pageRound(n, round, records.get(n)));
    }
  }

  const submitRoute = /^\/api\/rounds\/(\d+)\/submission$/.exec(route);
  if (submitRoute && req.method === 'POST') {
    return submit(res, Number(submitRoute[1]), (await readJson(req)) as PageSubmission);
  }

  sendJson(res, 404, { error: 'not found' });
}

function present(res: ServerResponse, body: PresentRequest): void {
  const parsed = parseRound(String(body.source ?? ''));
  if (!parsed.ok) return sendJson(res, 422, { errors: parsed.errors });

  const n = latest + 1;
  writePrivateFile(paths.round(n), body.source);
  rounds.set(n, parsed.round);
  latest = n;
  // A new round means the user answered the open one in the terminal.
  supersedeWaiters();
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

  let record: SubmissionRecord;
  try {
    record = buildRecord(n, round, body, new Date());
  } catch (error) {
    return sendJson(res, 400, { error: (error as Error).message });
  }
  writePrivateFile(paths.submission(n), `${JSON.stringify(record, null, 2)}\n`);
  records.set(n, record);
  for (const waiter of [...waiters]) {
    if (waiter.round === n) waiter.settle(submittedResponse(record));
  }
  sendJson(res, 200, {});
}

function supersedeWaiters(): void {
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

function shutdown(): void {
  if (ending) return;
  ending = true;
  // `end` closes the open round the same way a new round does.
  supersedeWaiters();
  broadcast('finished', {});
  for (const client of eventClients) client.end();
  rmSync(paths.dir, { recursive: true, force: true });
  // Let the last responses flush, then go.
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 1_000);
}

// ---------------------------------------------------------------- helpers

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
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

function sendFile(res: ServerResponse, name: string): void {
  let content: Buffer;
  try {
    content = readFileSync(join(pageDir, name));
  } catch {
    return sendJson(res, 404, { error: 'not found' });
  }
  res.writeHead(200, {
    ...(name === 'index.html' ? ROUND_PAGE_HEADERS : BASE_HEADERS),
    'content-type': CONTENT_TYPES[name.split('.').pop()!] ?? 'application/octet-stream',
    'cache-control': 'no-store',
    'content-length': content.length,
  });
  res.end(content);
}

// ------------------------------------------------------------------ start

server.listen(0, '127.0.0.1', () => {
  port = (server.address() as AddressInfo).port;
  const info: ServerInfo = { port, pid: process.pid, startTime: Math.round(performance.timeOrigin) };
  writePrivateFile(paths.serverJson, `${JSON.stringify(info)}\n`);
});
