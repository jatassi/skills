// Talking to grilling session servers, and telling a running one from a dead one.
//
// A server is identified by pid plus process start time, both in its
// server.json. It is running only if that pid is alive *and* the server on the
// recorded port answers ping with the same pid and start time: a pid the OS
// reused for another process, or a port another process took, both count as
// dead.

import { lstatSync, readdirSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import type { PingResponse } from '../core/protocol.ts';
import { isValidSessionId, readServerInfo, sessionPaths, sessionsRoot, type ServerInfo } from '../core/session.ts';

/** How long a ping may take before the server counts as unresponsive rather than dead. */
const PING_TIMEOUT_MS = 3_000;

/**
 * A session folder with no server.json is left alone this long: its server may
 * be starting (the CLI removes server.json before spawning a new one).
 */
const STARTING_GRACE_MS = 60_000;

export interface HttpResponse {
  status: number;
  body: unknown;
}

class TimeoutError extends Error {}

/** POSTs JSON to a control route. With `timeoutMs`, rejects with TimeoutError when no answer comes. */
export function call(port: number, route: string, body: unknown, timeoutMs?: number): Promise<HttpResponse> {
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
    if (timeoutMs !== undefined) {
      req.setTimeout(timeoutMs, () => req.destroy(new TimeoutError(`no answer within ${timeoutMs} ms`)));
    }
    req.on('error', reject);
    req.end(payload);
  });
}

type ServerState = 'running' | 'dead' | 'unresponsive';

export async function serverState(info: ServerInfo, pingTimeoutMs = PING_TIMEOUT_MS): Promise<ServerState> {
  if (!isAlive(info.pid)) return 'dead';
  try {
    const response = await call(info.port, '/control/ping', {}, pingTimeoutMs);
    const identity = response.body as Partial<PingResponse>;
    return response.status === 200 && identity.pid === info.pid && identity.startTime === info.startTime
      ? 'running'
      : 'dead';
  } catch (error) {
    // Something holds the port but doesn't answer: maybe our server, busy.
    return error instanceof TimeoutError ? 'unresponsive' : 'dead';
  }
}

/**
 * Deletes every other grilling session's folder whose server is not running.
 * A folder whose server doesn't answer in time is kept; so is a young folder
 * with no server.json yet, and one that changed while it was being checked
 * (its own CLI is restarting the server). Never follows a symlink.
 */
export async function sweepDeadSessions(ownId: string): Promise<void> {
  const root = sessionsRoot();
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return;
  }
  await Promise.all(
    names
      .filter((name) => name !== ownId && isValidSessionId(name))
      .map(async (name) => {
        const dir = join(root, name);
        try {
          const stat = lstatSync(dir);
          if (!stat.isDirectory()) return;
          const info = readServerInfo(sessionPaths(dir));
          if (info ? (await serverState(info)) !== 'dead' : Date.now() - stat.mtimeMs < STARTING_GRACE_MS) return;
          if (lstatSync(dir).mtimeMs !== stat.mtimeMs) return;
          rmSync(dir, { recursive: true, force: true });
        } catch {
          // Another CLI got there first, or the folder isn't ours to delete.
        }
      }),
  );
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: string }).code === 'EPERM';
  }
}
