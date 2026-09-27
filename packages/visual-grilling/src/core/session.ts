// The grilling session's folder on disk, shared by the CLI and the server.
//
//   <os.tmpdir()>/visual-grilling/<session-id>/
//     rounds/round-N.md        the round files as presented
//     submissions/round-N.json the structured round submissions
//     server.json              how the CLI finds the server

import { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

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

/**
 * Makes `visual-grilling/` and the session folder if they are missing, then
 * refuses (throws) unless each is safe to trust with the session's files.
 *
 * On POSIX each must be a real directory (not a symlink), owned by the current
 * uid, with no group or other access, so another local user can neither plant
 * the folder nor read it. Windows relies on the per-user %TEMP% ACL instead.
 */
export function preparePrivateSessionDir(paths: SessionPaths): void {
  for (const dir of [dirname(paths.dir), paths.dir]) {
    try {
      mkdirSync(dir, { mode: DIR_MODE });
    } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') throw error;
    }
    if (process.platform !== 'win32') checkPrivateDir(dir);
  }
}

function checkPrivateDir(dir: string): void {
  const stat = lstatSync(dir);
  const refuse = (reason: string) => {
    throw new Error(`refusing to use ${dir}: ${reason}`);
  };
  if (stat.isSymbolicLink()) refuse('it is a symlink, not a real directory; remove it and present again');
  if (!stat.isDirectory()) refuse('it is not a directory; remove it and present again');
  const uid = process.getuid!();
  if (stat.uid !== uid) refuse(`it is owned by uid ${stat.uid}, not the current user (uid ${uid})`);
  if ((stat.mode & 0o077) !== 0) {
    const mode = (stat.mode & 0o777).toString(8).padStart(4, '0');
    refuse(`its mode ${mode} allows group or other access; it must be 0700 (chmod 700 it, or remove it)`);
  }
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
