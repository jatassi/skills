// The security guards, as raw HTTP against the built server, and the session
// folder checks that `present` makes before it trusts the folder.

import { chmodSync, existsSync, mkdirSync, readdirSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { postJson, rawRequest, Sandbox, STORAGE_ROUND, type RawResponse } from '../support/harness.ts';

const ROUND_PAGE_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const SUBMISSION = JSON.stringify({ round: 1, answers: [{ question: 1, mode: 'accepted' }] });
const posix = process.platform !== 'win32';

let sandbox: Sandbox;
const sessions: string[] = [];

afterEach(async () => {
  await sandbox?.dispose(sessions.splice(0));
});

async function presented(id: string): Promise<{ box: Sandbox; port: number; url: string }> {
  sandbox = new Sandbox(id);
  sessions.push(id);
  const result = await sandbox.cli(['present', '--agent', 'Claude Code', sandbox.writeRound('round.md', STORAGE_ROUND), '--no-open']);
  expect(result).toMatchObject({ code: 0, stderr: '' });
  const url = result.stdout.trim();
  return { box: sandbox, port: Number(new URL(url).port), url };
}

function expectNoCors(response: RawResponse): void {
  expect(Object.keys(response.headers).filter((name) => name.startsWith('access-control-'))).toEqual([]);
}

describe('Host guard', () => {
  let port: number;
  beforeEach(async () => {
    ({ port } = await presented('h1'));
  });

  it.each(['127.0.0.1', 'localhost', 'LOCALHOST'])('serves the page to Host %s:<port>', async (host) => {
    const response = await rawRequest(port, 'GET', '/', { host: `${host}:${port}` });
    expect(response.status).toBe(200);
  });

  it.each([
    ['another name', (p: number) => `evil.example:${p}`],
    ['a rebinding name', (p: number) => `localhost.evil.example:${p}`],
    ['the wrong port', (p: number) => `127.0.0.1:${p + 1}`],
    ['no port', () => '127.0.0.1'],
    ['the IPv6 loopback', (p: number) => `[::1]:${p}`],
  ])('rejects %s', async (_, host) => {
    for (const [method, path] of [
      ['GET', '/'],
      ['GET', '/api/rounds/latest'],
      ['GET', '/events'],
      ['POST', '/api/rounds/1/submission'],
      ['POST', '/control/ping'],
    ] as const) {
      const response = await rawRequest(port, method, path, {
        host: host(port),
        origin: method === 'POST' && path.startsWith('/api') ? `http://127.0.0.1:${port}` : null,
        'content-type': 'application/json',
      }, method === 'POST' ? '{}' : '');
      expect(response.status, `${method} ${path}`).toBe(403);
      expect(response.body).toContain('Host');
    }
  });

  it('rejects a request with no Host', async () => {
    const response = await rawRequest(port, 'GET', '/', { host: null });
    expect(response.status).toBe(400);
  });
});

describe('page writes', () => {
  let port: number;
  let url: string;
  let box: Sandbox;
  beforeEach(async () => {
    ({ port, url, box } = await presented('w1'));
  });

  const submit = (headers: Record<string, string | null>, body = SUBMISSION) =>
    rawRequest(port, 'POST', '/api/rounds/1/submission', headers, body);

  it('accepts JSON from exactly the round page origin', async () => {
    const response = await submit({
      origin: `http://127.0.0.1:${port}`,
      'content-type': 'application/json; charset=utf-8',
    });
    expect(response.status).toBe(200);
    expectNoCors(response);
  });

  it('accepts JSON from the page opened at localhost', async () => {
    const response = await submit({
      host: `localhost:${port}`,
      origin: `http://localhost:${port}`,
      'content-type': 'application/json',
    });
    expect(response.status).toBe(200);
    expectNoCors(response);
  });

  it.each([
    ['Host 127.0.0.1 with a localhost Origin', '127.0.0.1', 'localhost'],
    ['Host localhost with a 127.0.0.1 Origin', 'localhost', '127.0.0.1'],
  ])('rejects a mismatched pair: %s', async (_, host, origin) => {
    const response = await submit({
      host: `${host}:${port}`,
      origin: `http://${origin}:${port}`,
      'content-type': 'application/json',
    });
    expect(response.status).toBe(403);
    expect((await box.cli(['await', '--timeout', '0'])).stdout).toBe('pending · round 1 · re-run await\n');
  });

  it.each([
    ['no Origin', null],
    ['a null Origin', 'null'],
    ['a localhost Origin', 'http://localhost:PORT'],
    ['another site', 'https://evil.example'],
    ['another port', 'http://127.0.0.1:1'],
    ['https', 'https://127.0.0.1:PORT'],
    ['a trailing slash', 'http://127.0.0.1:PORT/'],
  ])('rejects %s and records nothing', async (_, origin) => {
    const response = await submit({
      origin: origin?.replace('PORT', String(port)) ?? null,
      'content-type': 'application/json',
    });
    expect(response.status).toBe(403);
    expect(response.body).toContain('Origin');
    expectNoCors(response);
    expect((await box.cli(['await', '--timeout', '0'])).stdout).toBe('pending · round 1 · re-run await\n');
  });

  it.each([
    ['text/plain', 'text/plain'],
    ['a form', 'application/x-www-form-urlencoded'],
    ['multipart', 'multipart/form-data; boundary=x'],
    ['a JSON look-alike', 'application/json-seq'],
    ['no Content-Type', null],
  ])('rejects %s and records nothing', async (_, contentType) => {
    const response = await submit({ origin: `http://127.0.0.1:${port}`, 'content-type': contentType });
    expect(response.status).toBe(415);
    expectNoCors(response);
    expect((await box.cli(['await', '--timeout', '0'])).stdout).toBe('pending · round 1 · re-run await\n');
  });

  it('never answers a preflight', async () => {
    const response = await rawRequest(port, 'OPTIONS', '/api/rounds/1/submission', {
      origin: 'https://evil.example',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    });
    expect(response.status).toBe(405);
    expectNoCors(response);
  });

  it('sends no CORS headers anywhere', async () => {
    for (const path of ['/', '/assets/app.js', '/api/rounds/latest']) {
      expectNoCors(await rawRequest(port, 'GET', path, { origin: 'https://evil.example' }));
    }
    // The page's own writes still work (the harness sends the page's origin).
    expect((await postJson(`${url}api/rounds/1/submission`, JSON.parse(SUBMISSION))).status).toBe(200);
  });
});

describe('control routes', () => {
  let port: number;
  let box: Sandbox;
  beforeEach(async () => {
    ({ port, box } = await presented('c1'));
  });

  const ROUTES = ['/control/present', '/control/await', '/control/end', '/control/ping'];

  it.each(ROUTES)('%s is POST-only', async (route) => {
    for (const method of ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']) {
      const response = await rawRequest(port, method, route);
      expect(response.status, method).toBe(405);
      expectNoCors(response);
    }
  });

  it.each([
    ['an Origin', { origin: 'https://evil.example' }],
    ["the page's own Origin", { origin: 'http://127.0.0.1:PORT' }],
    ['a null Origin', { origin: 'null' }],
    ['Sec-Fetch-Site', { 'sec-fetch-site': 'same-origin' }],
    ['Sec-Fetch-Mode', { 'sec-fetch-mode': 'no-cors' }],
    ['Sec-Fetch-Dest', { 'sec-fetch-dest': 'empty' }],
    ['Sec-Fetch-User', { 'Sec-Fetch-User': '?1' }],
  ])('rejects a request carrying %s', async (_, extra) => {
    const headers = Object.fromEntries(
      Object.entries(extra).map(([name, value]) => [name, value.replace('PORT', String(port))]),
    );
    for (const [route, body] of [
      ['/control/await', '{"timeoutMs":0}'],
      ['/control/present', JSON.stringify({ source: STORAGE_ROUND })],
      ['/control/end', '{}'],
      ['/control/ping', '{}'],
    ] as const) {
      const response = await rawRequest(port, 'POST', route, { 'content-type': 'application/json', ...headers }, body);
      expect(response.status, route).toBe(403);
      expectNoCors(response);
    }
    // None of them took effect: the server is up, still on round 1, and not ended.
    const { pid } = box.serverInfo('c1');
    expect(process.kill(pid, 0)).toBe(true);
    expect(readdirSync(join(box.sessionDir('c1'), 'rounds'))).toEqual(['round-1.md']);
    expect((await box.cli(['await', '--timeout', '0'])).stdout).toBe('pending · round 1 · re-run await\n');
  });

  it.each(['/x/../control/end', '/%2e%2e/control/end', '/api/%2E%2E/control/end', '/./control/end'])(
    'sees through a dotted path to a control route: GET %s',
    async (path) => {
      const response = await rawRequest(port, 'GET', path);
      expect(response.status).toBe(405);
      expect(process.kill(box.serverInfo('c1').pid, 0)).toBe(true);
      expect(existsSync(box.sessionDir('c1'))).toBe(true);
    },
  );

  it('answers the CLI, which sends neither', async () => {
    const response = await rawRequest(port, 'POST', '/control/await', { 'content-type': 'application/json' }, '{"timeoutMs":0}');
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ outcome: 'pending' });
  });
});

describe('round page headers', () => {
  it('serves the page with its CSP, no referrer and nosniff', async () => {
    const { port } = await presented('r1');
    const response = await rawRequest(port, 'GET', '/');
    expect(response.status).toBe(200);
    expect(response.headers['content-security-policy']).toBe(ROUND_PAGE_CSP);
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sends no referrer and nosniff with every other response too, and lets none of them be framed', async () => {
    const { port } = await presented('r2');
    for (const path of ['/assets/app.js', '/assets/app.css', '/api/rounds/latest', '/nothing-here']) {
      const response = await rawRequest(port, 'GET', path);
      expect(response.headers['referrer-policy'], path).toBe('no-referrer');
      expect(response.headers['x-content-type-options'], path).toBe('nosniff');
      expect(response.headers['content-security-policy'], path).toBe("frame-ancestors 'none'");
    }
  });
});

describe.skipIf(!posix)('session folder checks', () => {
  function fresh(id: string): Sandbox {
    sandbox = new Sandbox(id);
    sessions.push(id);
    return sandbox;
  }

  async function presentIn(box: Sandbox) {
    return box.cli(['present', '--agent', 'Claude Code', box.writeRound('round.md', STORAGE_ROUND), '--no-open']);
  }

  function expectRefused(result: { code: number; stdout: string; stderr: string }, path: string, reason: RegExp) {
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(path);
    expect(result.stderr).toMatch(reason);
  }

  it('creates visual-grilling/, the session folder and its subfolders 0700, and every file 0600', async () => {
    const { box, url } = await presented('m1');
    await postJson(`${url}api/rounds/1/submission`, JSON.parse(SUBMISSION));
    const root = join(box.tmp, 'visual-grilling');
    const dir = box.sessionDir('m1');
    for (const folder of [root, dir, join(dir, 'rounds'), join(dir, 'submissions')]) {
      expect(statSync(folder).mode & 0o777, folder).toBe(0o700);
    }
    for (const file of ['server.json', 'rounds/round-1.md', 'submissions/round-1.json']) {
      expect(statSync(join(dir, file)).mode & 0o777, file).toBe(0o600);
    }
  });

  it('refuses when visual-grilling/ is a symlink', async () => {
    const box = fresh('m2');
    const elsewhere = join(box.tmp, 'elsewhere');
    mkdirSync(elsewhere, { mode: 0o700 });
    symlinkSync(elsewhere, join(box.tmp, 'visual-grilling'));

    expectRefused(await presentIn(box), join(box.tmp, 'visual-grilling'), /symlink/);
    expect(readdirSync(elsewhere)).toEqual([]);
  });

  it('refuses when the session folder is a symlink', async () => {
    const box = fresh('m3');
    const elsewhere = join(box.tmp, 'elsewhere');
    mkdirSync(elsewhere, { mode: 0o700 });
    mkdirSync(join(box.tmp, 'visual-grilling'), { mode: 0o700 });
    symlinkSync(elsewhere, box.sessionDir('m3'));

    expectRefused(await presentIn(box), box.sessionDir('m3'), /symlink/);
    expect(readdirSync(elsewhere)).toEqual([]);
  });

  it('refuses when visual-grilling/ is a file', async () => {
    const box = fresh('m4');
    box.writeRound('visual-grilling', 'planted');
    expectRefused(await presentIn(box), join(box.tmp, 'visual-grilling'), /not a directory/);
  });

  it.each([0o755, 0o750, 0o705, 0o770, 0o777])('refuses visual-grilling/ with mode %o', async (mode) => {
    const box = fresh('m5');
    const root = join(box.tmp, 'visual-grilling');
    mkdirSync(root);
    chmodSync(root, mode);

    expectRefused(await presentIn(box), root, /group or other/);
    expect(existsSync(box.sessionDir('m5'))).toBe(false);
  });

  it.each([0o755, 0o710, 0o701])('refuses a session folder with mode %o', async (mode) => {
    const box = fresh('m6');
    mkdirSync(join(box.tmp, 'visual-grilling'), { mode: 0o700 });
    mkdirSync(box.sessionDir('m6'));
    chmodSync(box.sessionDir('m6'), mode);

    expectRefused(await presentIn(box), box.sessionDir('m6'), /group or other/);
    expect(existsSync(join(box.sessionDir('m6'), 'server.json'))).toBe(false);
  });

  it('makes the temp folder itself when it is missing', async () => {
    const box = fresh('m8');
    const missing = join(box.tmp, 'not-yet');
    Object.assign(box.env, { TMPDIR: missing, TEMP: missing, TMP: missing });
    expect((await presentIn(box)).code).toBe(0);
    expect(statSync(join(missing, 'visual-grilling', 'm8')).mode & 0o777).toBe(0o700);
    expect((await box.cli(['end'])).code).toBe(0);
  });

  it('accepts folders that already exist and pass the checks', async () => {
    const box = fresh('m7');
    mkdirSync(join(box.tmp, 'visual-grilling'), { mode: 0o700 });
    mkdirSync(box.sessionDir('m7'), { mode: 0o700 });
    expect((await presentIn(box)).code).toBe(0);
  });
});
