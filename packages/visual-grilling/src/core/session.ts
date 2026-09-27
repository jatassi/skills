// The grilling session's folder on disk, shared by the CLI and the server.
//
//   <os.tmpdir()>/visual-grilling/<session-id>/
//     rounds/round-N.md        the round files as presented
//     submissions/round-N.json the structured round submissions
//     server.json              how the CLI finds the server

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DIR_MODE = 0o700;
export const FILE_MODE = 0o600;

export interface ServerInfo {
  port: number;
  pid: number;
  /** When the server process started, in ms since the epoch. */
  startTime: number;
}

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isValidSessionId(id: string): boolean {
  return SESSION_ID.test(id);
}

export function sessionsRoot(): string {
  return join(tmpdir(), 'visual-grilling');
}

export function sessionPaths(dir: string) {
  return {
    dir,
    rounds: join(dir, 'rounds'),
    submissions: join(dir, 'submissions'),
    serverJson: join(dir, 'server.json'),
    round: (n: number) => join(dir, 'rounds', `round-${n}.md`),
    submission: (n: number) => join(dir, 'submissions', `round-${n}.json`),
  };
}

export type SessionPaths = ReturnType<typeof sessionPaths>;

export function sessionDir(id: string): string {
  return join(sessionsRoot(), id);
}

export function makeDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: DIR_MODE });
}

/** Writes a file with owner-only access, via a rename so readers never see half of it. */
export function writePrivateFile(file: string, content: string): void {
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, content, { mode: FILE_MODE });
  renameSync(temp, file);
}

export function readServerInfo(paths: SessionPaths): ServerInfo | undefined {
  try {
    const info = JSON.parse(readFileSync(paths.serverJson, 'utf8')) as ServerInfo;
    return Number.isInteger(info.port) && Number.isInteger(info.pid) ? info : undefined;
  } catch {
    return undefined;
  }
}
