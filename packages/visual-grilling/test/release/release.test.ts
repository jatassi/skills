// release.ts, the steps of the release workflow (.github/workflows/release.yml)
// that touch files: run as the workflow runs it, against a temp copy of the
// repo's manifests and a temp dist folder.

import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(import.meta.dirname, '../../release.ts');
const REPO = resolve(import.meta.dirname, '../../../..');
const MANIFESTS = ['plugin.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json'];

function release(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    execFile(process.execPath, [SCRIPT, ...args], (error, stdout, stderr) => {
      done({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr });
    });
  });
}

let root: string;
const read = (file: string) => readFileSync(join(root, file), 'utf8');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vg-release-'));
  mkdirSync(join(root, '.claude-plugin'));
  for (const file of MANIFESTS) writeFileSync(join(root, file), readFileSync(join(REPO, file), 'utf8'));
  // Whatever the repo's current release is, start these tests from 1.0.0.
  for (const file of ['plugin.json', '.claude-plugin/plugin.json']) {
    writeFileSync(join(root, file), read(file).replace(/"version": "[^"]*"/, '"version": "1.0.0"'));
  }
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('next', () => {
  it.each([
    ['patch', '1.0.1'],
    ['minor', '1.1.0'],
    ['major', '2.0.0'],
  ])('bumps the %s part', async (bump, version) => {
    expect(await release(['next', '--root', root, '--bump', bump])).toMatchObject({ code: 0, stdout: `${version}\n` });
  });

  it('resets the parts after the bumped one', async () => {
    for (const file of ['plugin.json', '.claude-plugin/plugin.json']) {
      writeFileSync(join(root, file), read(file).replace('"version": "1.0.0"', '"version": "1.2.3"'));
    }
    expect((await release(['next', '--root', root, '--bump', 'minor'])).stdout).toBe('1.3.0\n');
    expect((await release(['next', '--root', root, '--bump', 'major'])).stdout).toBe('2.0.0\n');
  });

  it('refuses an unknown bump', async () => {
    const result = await release(['next', '--root', root, '--bump', 'huge']);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/bump must be one of major, minor, patch, got "huge"/);
  });

  it('refuses manifests whose versions disagree', async () => {
    writeFileSync(join(root, 'plugin.json'), read('plugin.json').replace('"version": "1.0.0"', '"version": "1.1.0"'));
    const result = await release(['next', '--root', root, '--bump', 'patch']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('plugin.json is at 1.1.0 but .claude-plugin/plugin.json is at 1.0.0');
  });
});

describe('manifests', () => {
  it('bumps both plugin manifests and pins the marketplace to the tag', async () => {
    const before = Object.fromEntries(MANIFESTS.map((file) => [file, read(file)]));
    const result = await release(['manifests', '--root', root, '--version', '1.2.0']);
    expect(result).toMatchObject({ code: 0 });

    for (const file of ['plugin.json', '.claude-plugin/plugin.json']) {
      expect(JSON.parse(read(file)).version).toBe('1.2.0');
      // Only the version line changes.
      expect(read(file)).toBe(before[file]!.replace('"version": "1.0.0"', '"version": "1.2.0"'));
    }

    const marketplace = JSON.parse(read('.claude-plugin/marketplace.json'));
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0].name).toBe('milliways');
    // An https url, not a github source: Claude Code clones a github source
    // over SSH whenever SSH looks configured, and an SSH key GitHub refuses
    // then fails the install (issue #113). A public https clone needs no key.
    expect(marketplace.plugins[0].source).toEqual({
      source: 'url',
      url: 'https://github.com/jatassi/skills.git',
      ref: 'v1.2.0',
    });
    expect(read('.claude-plugin/marketplace.json').endsWith('}\n')).toBe(true);
  });

  it('moves an existing pin to the new tag', async () => {
    expect((await release(['manifests', '--root', root, '--version', '1.2.0'])).code).toBe(0);
    expect((await release(['manifests', '--root', root, '--version', '1.2.1'])).code).toBe(0);
    expect(JSON.parse(read('.claude-plugin/marketplace.json')).plugins[0].source.ref).toBe('v1.2.1');
    expect(JSON.parse(read('plugin.json')).version).toBe('1.2.1');
  });

  it.each([
    ['v1.2.0', /version must be X\.Y\.Z/],
    ['1.2', /version must be X\.Y\.Z/],
    ['1.2.0-rc.1', /version must be X\.Y\.Z/],
    ['01.2.0', /version must be X\.Y\.Z/],
    ['1.0.0', /1\.0\.0 is not newer than the current version 1\.0\.0/],
    ['0.9.9', /0\.9\.9 is not newer than the current version 1\.0\.0/],
  ])('refuses version %s and changes nothing', async (version, message) => {
    const before = MANIFESTS.map(read);
    const result = await release(['manifests', '--root', root, '--version', version]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(message);
    expect(MANIFESTS.map(read)).toEqual(before);
  });

  it('only checks with --check', async () => {
    const before = MANIFESTS.map(read);
    expect((await release(['manifests', '--root', root, '--version', '1.2.0', '--check'])).code).toBe(0);
    expect(MANIFESTS.map(read)).toEqual(before);
    const refused = await release(['manifests', '--root', root, '--version', '1.0.0', '--check']);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toMatch(/not newer/);
  });

  it('refuses a current version that is not X.Y.Z', async () => {
    for (const file of ['plugin.json', '.claude-plugin/plugin.json']) {
      writeFileSync(join(root, file), read(file).replace('"version": "1.0.0"', '"version": "1.0.0-beta"'));
    }
    const result = await release(['manifests', '--root', root, '--version', '2.0.0']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('plugin.json has version "1.0.0-beta", not X.Y.Z; fix it by hand first');
  });

  it('refuses manifests whose versions disagree', async () => {
    writeFileSync(join(root, 'plugin.json'), read('plugin.json').replace('"version": "1.0.0"', '"version": "1.1.0"'));
    const before = MANIFESTS.map(read);
    const result = await release(['manifests', '--root', root, '--version', '2.0.0']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('plugin.json is at 1.1.0 but .claude-plugin/plugin.json is at 1.0.0');
    expect(MANIFESTS.map(read)).toEqual(before);
  });
});

describe('notes', () => {
  it('prints the notes, then each output with its size', async () => {
    const dist = join(root, 'dist');
    mkdirSync(join(dist, 'page'), { recursive: true });
    writeFileSync(join(dist, 'cli.mjs'), 'x'.repeat(2048));
    writeFileSync(join(dist, 'page/app.js'), 'x'.repeat(1536));
    const notes = join(root, 'notes.md');
    writeFileSync(notes, 'Fixes the thing.\n');

    const result = await release(['notes', '--dist', dist, '--notes', notes]);
    expect(result).toMatchObject({ code: 0 });
    expect(result.stdout).toBe(
      [
        'Fixes the thing.',
        '',
        '## Bundle sizes',
        '',
        '| output | size |',
        '| --- | ---: |',
        '| `cli.mjs` | 2.0 KiB |',
        '| `page/app.js` | 1.5 KiB |',
        '',
      ].join('\n'),
    );
  });

  it('leaves out empty notes', async () => {
    const dist = join(root, 'dist');
    mkdirSync(dist);
    writeFileSync(join(dist, 'cli.mjs'), 'x'.repeat(1024));
    const notes = join(root, 'notes.md');
    writeFileSync(notes, '\n');

    const result = await release(['notes', '--dist', dist, '--notes', notes]);
    expect(result).toMatchObject({ code: 0 });
    expect(result.stdout).toBe(['## Bundle sizes', '', '| output | size |', '| --- | ---: |', '| `cli.mjs` | 1.0 KiB |', ''].join('\n'));
  });

  it('refuses an empty or missing dist folder', async () => {
    const notes = join(root, 'notes.md');
    writeFileSync(notes, 'n\n');
    const result = await release(['notes', '--dist', join(root, 'nope'), '--notes', notes]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/no build output in/);
  });
});
