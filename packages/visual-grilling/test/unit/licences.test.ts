import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAllowed, LicenceError, packageRoots, thirdPartyLicences, vizWasmEntries } from '../../build/licences.ts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vg-licences-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function pkg(name: string, manifest: Record<string, unknown>, files: Record<string, string> = {}): string {
  const dir = join(root, 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.2.3', ...manifest }));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  return dir;
}

describe('licence expressions', () => {
  it.each([
    ['MIT', true],
    ['BlueOak-1.0.0', true],
    ['(MPL-2.0 OR Apache-2.0)', true],
    ['GPL-3.0 OR MIT', true],
    ['MIT AND ISC', true],
    ['MIT AND GPL-3.0', false],
    ['GPL-3.0', false],
    ['Apache-2.0 WITH LLVM-exception', false],
    ['SEE LICENSE IN LICENSE', false],
    ['(MIT', false],
  ])('%s → %s', (expression, allowed) => {
    expect(isAllowed(expression)).toBe(allowed);
  });
});

describe('packageRoots', () => {
  it('finds the named package above each bundled file, once', () => {
    const dir = pkg('lib', { license: 'MIT' }, { 'dist/esm/package.json': '{"type":"module"}', 'dist/esm/a.js': '', 'dist/b.js': '' });
    const roots = packageRoots([join(dir, 'dist/esm/a.js'), join(dir, 'dist/b.js'), join(root, 'src/own.ts')]);
    expect(roots).toEqual([dir]);
  });
});

describe('vizWasmEntries', () => {
  it('reads the Graphviz and expat versions from the provenance', () => {
    const sources = [
      'https://github.com/libexpat/libexpat/releases/download/R_2_8_4/expat-2.8.4.tar.gz',
      'https://gitlab.com/api/v4/projects/1/packages/generic/graphviz-releases/16.0.0/graphviz-16.0.0.tar.gz',
    ];
    const provenance = JSON.stringify(['pkg:docker/emscripten/emsdk@5.0.7?platform=linux%2Famd64', ...sources]);
    expect(vizWasmEntries(provenance).map((entry) => [entry.name, entry.version, entry.licence])).toEqual([
      ['Graphviz', '16.0.0', 'EPL-2.0'],
      ['expat', '2.8.4', 'MIT'],
      ['Emscripten', '5.0.7', 'MIT OR NCSA'],
    ]);
    expect(() => vizWasmEntries('{}')).toThrow(/Graphviz version not found/);
  });

  it('keeps the Emscripten entry, unversioned, when the provenance names no emsdk', () => {
    const provenance = JSON.stringify([
      'https://github.com/libexpat/libexpat/releases/download/R_2_8_4/expat-2.8.4.tar.gz',
      'https://gitlab.com/api/v4/projects/1/packages/generic/graphviz-releases/16.0.0/graphviz-16.0.0.tar.gz',
    ]);
    const emscripten = vizWasmEntries(provenance).find((entry) => entry.name === 'Emscripten');
    expect(emscripten?.version).toBe('unknown');
  });

  it('writes the Emscripten entry as allowed, with its MIT text', () => {
    const provenance = JSON.stringify([
      'pkg:docker/emscripten/emsdk@5.0.7',
      'https://github.com/libexpat/libexpat/releases/download/R_2_8_4/expat-2.8.4.tar.gz',
      'https://gitlab.com/api/v4/projects/1/packages/generic/graphviz-releases/16.0.0/graphviz-16.0.0.tar.gz',
    ]);
    const text = thirdPartyLicences([], { explicit: vizWasmEntries(provenance) });
    expect(text).toMatch(/## Emscripten@5\.0\.7\n\nLicence: MIT OR NCSA\n\n.*University of Illinois\/NCSA/);
    expect(text).toContain('Copyright (c) 2010-2014 Emscripten authors');
  });
});

describe('thirdPartyLicences', () => {
  it('writes each package with its licence text, sorted', () => {
    const b = pkg('b-lib', { license: 'ISC' }, { LICENSE: 'ISC text' });
    const a = pkg('a-lib', { license: 'MIT' }, { 'LICENSE.md': 'MIT text' });
    const text = thirdPartyLicences([b, a]);
    expect(text.indexOf('## a-lib@1.2.3')).toBeLessThan(text.indexOf('## b-lib@1.2.3'));
    expect(text).toContain('Licence: MIT');
    expect(text).toContain('MIT text');
    expect(text).toContain('ISC text');
  });

  it('includes NOTICE files for Apache packages', () => {
    const dir = pkg('apache-lib', { license: 'Apache-2.0' }, { LICENSE: 'Apache text', NOTICE: 'Copyright Someone' });
    expect(thirdPartyLicences([dir])).toContain('NOTICE:\n\n```text\nCopyright Someone');
  });

  it('adds a source line for EPL packages, from the repository', () => {
    const dir = pkg('epl-lib', { license: 'EPL-2.0', repository: { url: 'git+https://github.com/org/epl-lib.git' } });
    expect(thirdPartyLicences([dir])).toContain('Source available at https://github.com/org/epl-lib @ 1.2.3');
  });

  it('writes explicit entries, with a source line when EPL', () => {
    const text = thirdPartyLicences([], {
      explicit: [
        { name: 'Graphviz', version: '16.0.0', licence: 'EPL-2.0', note: 'In the wasm.', source: 'https://gitlab.com/graphviz/graphviz', text: 'EPL' },
        { name: 'expat', version: '2.8.4', licence: 'MIT', note: 'In the wasm.', source: 'https://github.com/libexpat/libexpat', text: 'MIT' },
      ],
    });
    expect(text).toContain('## Graphviz@16.0.0');
    expect(text).toContain('Source available at https://gitlab.com/graphviz/graphviz @ 16.0.0');
    expect(text).toContain('## expat@2.8.4');
    expect(text).not.toContain('libexpat @');
  });

  it('reads the legacy licences array', () => {
    const dir = pkg('old-lib', { licenses: [{ type: 'MIT' }] });
    expect(thirdPartyLicences([dir])).toContain('Licence: MIT');
  });

  it('writes the standard text, with the author, for a package that ships no licence file', () => {
    const dir = pkg('bare-isc', { license: 'ISC', author: 'Ada <ada@example.com>' });
    const text = thirdPartyLicences([dir]);
    expect(text).toContain('ships no licence file; the standard ISC text');
    expect(text).toContain('Copyright (c) Ada <ada@example.com>\n\nPermission to use, copy, modify');
  });

  it.each([
    ['git+ssh://git@github.com/org/epl-lib.git', 'https://github.com/org/epl-lib'],
    ['git@gitlab.com:org/epl-lib.git', 'https://gitlab.com/org/epl-lib'],
    ['github:org/epl-lib', 'https://github.com/org/epl-lib'],
    ['org/epl-lib', 'https://github.com/org/epl-lib'],
  ])('reads the EPL source from repository %s', (repository, url) => {
    const dir = pkg('epl-lib', { license: 'EPL-2.0', repository }, { LICENSE: 'EPL' });
    expect(thirdPartyLicences([dir])).toContain(`Source available at ${url} @ 1.2.3`);
  });

  it('reads SPDX ids in any case', () => {
    const dir = pkg('lower', { license: 'apache-2.0' });
    expect(thirdPartyLicences([dir])).toContain('Licence: Apache-2.0');
  });

  it('takes a pinned licence for a package that declares none', () => {
    const dir = pkg('bare', {}, { license: 'The MIT License' });
    expect(thirdPartyLicences([dir], { undeclared: { 'bare@1.2.3': 'MIT' } })).toContain('Licence: MIT (from its licence file');
    expect(() => thirdPartyLicences([dir], { undeclared: { 'bare@1.0.0': 'MIT' } })).toThrow(LicenceError);
  });

  it('fences a licence text that contains backticks', () => {
    const dir = pkg('ticks', { license: 'MIT' }, { LICENSE: 'a ```b``` c' });
    expect(thirdPartyLicences([dir])).toContain('````text\na ```b``` c\n````');
  });

  it('fails on a missing or disallowed licence, naming every offender', () => {
    const none = pkg('no-licence', {});
    const gpl = pkg('gpl-lib', { license: 'GPL-3.0' });
    const ok = pkg('ok-lib', { license: 'MIT' });
    let error: unknown;
    try {
      thirdPartyLicences([none, gpl, ok]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(LicenceError);
    expect((error as LicenceError).problems).toEqual([
      'no-licence@1.2.3: declares no licence',
      'gpl-lib@1.2.3: licence "GPL-3.0" is not allowed',
    ]);
  });
});
