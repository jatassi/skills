// The built bundle (npm test builds it into .test-dist) and the trims that
// shape it.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compactStyleProperties } from '../../build/trim.ts';
import { DIST } from '../support/harness.ts';

describe('THIRD_PARTY_LICENSES.md', () => {
  const text = readFileSync(join(DIST, 'THIRD_PARTY_LICENSES.md'), 'utf8');

  it('names Graphviz (EPL-2.0) and expat (MIT) from the Graphviz wasm', () => {
    expect(text).toMatch(/## Graphviz@[\d.]+\n\nLicence: EPL-2.0/);
    expect(text).toMatch(/Source available at https:\/\/gitlab\.com\/graphviz\/graphviz @ [\d.]+/);
    expect(text).toMatch(/## expat@[\d.]+\n\nLicence: MIT/);
    expect(text).toMatch(/## Emscripten@[\d.]+\n\nLicence: MIT OR NCSA/);
  });

  it('gives the EPL package elkjs a source line', () => {
    expect(text).toMatch(/## elkjs@[\d.]+\n\nLicence: EPL-2.0\n\nSource available at https:\/\/github\.com\/kieler\/elkjs @ [\d.]+/);
  });

  it('covers a package from each output', () => {
    for (const name of ['jsdom', 'mermaid', 'vega-lite', '@viz-js/viz', 'shiki', '@pierre/diffs', 'html-to-image', '@tailwindcss/browser']) {
      expect(text).toContain(`## ${name}@`);
    }
  });

  it('leaves out what the trims drop', () => {
    expect(text).not.toContain('## undici@');
    expect(text).not.toContain('## @shikijs/engine-oniguruma@');
  });
});

describe('compactStyleProperties', () => {
  const require = createRequire(import.meta.url);
  const source = readFileSync(join(require.resolve('jsdom'), '../generated/idl/CSSStyleProperties.js'), 'utf8');

  it('defines the same accessors by a loop', () => {
    const compact = compactStyleProperties(source);
    expect(compact.length).toBeLessThan(source.length / 10);
    expect(compact).toContain('"-webkit-align-content"');
    expect(compact).toContain('"zIndex"');
    expect(compact).not.toContain('get zIndex()');
  });

  it('fails when an accessor is not in the shape it knows', () => {
    const changed = source.replace('return utils.tryWrapperForImpl($impl["zIndex"]);', 'return $impl["zIndex"];');
    expect(changed).not.toBe(source);
    expect(() => compactStyleProperties(changed)).toThrow(/accessor "zIndex" is not in the expected shape/);
  });
});
