// Writes THIRD_PARTY_LICENSES.md for the shipped bundle: one entry per
// bundled package with its licence text, the NOTICE files of Apache-2.0
// packages, and "source available at" lines for EPL-2.0 items. Code compiled
// into a package without being an npm package itself (Graphviz and expat
// inside @viz-js/viz's wasm) is passed in as an explicit entry.
//
// It throws, listing every offender at once, on a package that declares no
// licence or one outside the allowed set.
//
// Run by build.mjs through Node's type stripping: erasable TypeScript only.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** SPDX ids the bundle may carry. */
export const ALLOWED_LICENCES: readonly string[] = [
  'MIT',
  'MIT-0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'EPL-2.0',
  'MPL-2.0',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'Unlicense',
];

/** A licensed item that is not an npm package of its own. */
export interface ExplicitEntry {
  name: string;
  version: string;
  /** An SPDX expression, checked like a package's. */
  licence: string;
  /** Where the entry's code ships, e.g. "compiled into @viz-js/viz's WebAssembly". */
  note: string;
  /** Upstream source, e.g. "https://gitlab.com/graphviz/graphviz". */
  source: string;
  /** The licence text; a link is enough when the upstream ships none separately. */
  text: string;
}

export class LicenceError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`third-party licences:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
    this.problems = problems;
  }
}

/**
 * The root folders of the npm packages that the given bundled files belong
 * to, deduplicated: for each file under a node_modules folder, the nearest
 * package.json above it that has a name and a version.
 */
export function packageRoots(files: Iterable<string>): string[] {
  const roots = new Set<string>();
  for (const file of files) {
    if (!inNodeModules(file)) continue;
    const root = packageRoot(file);
    if (root) roots.add(root);
  }
  return [...roots];
}

const inNodeModules = (path: string): boolean => path.split(/[\\/]/).includes('node_modules');

function packageRoot(file: string): string | undefined {
  for (let dir = dirname(file); inNodeModules(dir); dir = dirname(dir)) {
    const manifest = join(dir, 'package.json');
    if (!existsSync(manifest)) continue;
    const json = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown; version?: unknown };
    if (typeof json.name === 'string' && typeof json.version === 'string') return dir;
  }
  return undefined;
}

interface Manifest {
  name: string;
  version: string;
  author?: unknown;
  license?: unknown;
  licenses?: unknown;
  repository?: unknown;
  homepage?: unknown;
}

export interface LicenceOptions {
  /** Licensed items that are not npm packages of their own. */
  explicit?: ExplicitEntry[];
  /**
   * Licences, by `name@version`, for packages whose package.json declares
   * none but whose licence file is clear. Pinned to a version, so an upgrade
   * has to be looked at again.
   */
  undeclared?: Record<string, string>;
}

/** The whole THIRD_PARTY_LICENSES.md for these package folders and entries. */
export function thirdPartyLicences(packageDirs: Iterable<string>, options: LicenceOptions = {}): string {
  const { explicit = [], undeclared = {} } = options;
  const problems: string[] = [];
  const sections: { key: string; body: string }[] = [];
  const seen = new Set<string>();

  for (const dir of packageDirs) {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest;
    const key = `${manifest.name}@${manifest.version}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const declared = declaredLicence(manifest);
    const fromFile = declared ? undefined : undeclared[key];
    const licence = canonical(declared ?? fromFile);
    if (!licence) {
      problems.push(`${key}: declares no licence`);
      continue;
    }
    if (!isAllowed(licence)) {
      problems.push(`${key}: licence "${licence}" is not allowed`);
      continue;
    }
    const lines = [`## ${key}`, '', `Licence: ${licence}${fromFile ? ' (from its licence file; its package.json declares none)' : ''}`];
    if (mentions(licence, 'EPL-2.0')) {
      lines.push('', `Source available at ${repositoryUrl(manifest) ?? `https://www.npmjs.com/package/${manifest.name}`} @ ${manifest.version}`);
    }
    const texts = filesMatching(dir, /^(licen[cs]e|copying)/i);
    if (texts.length === 0) {
      const standard = STANDARD_TEXTS[licence];
      if (standard) {
        lines.push('', `The package ships no licence file; the standard ${licence} text, with the holder named from its package.json:`);
        lines.push('', fenced(`Copyright (c) ${authorOf(manifest)}\n\n${standard}`));
      } else {
        lines.push('', '(The package ships no licence file.)');
      }
    }
    for (const text of texts) lines.push('', fenced(text));
    if (mentions(licence, 'Apache-2.0')) {
      for (const notice of filesMatching(dir, /^notice/i)) lines.push('', 'NOTICE:', '', fenced(notice));
    }
    sections.push({ key, body: lines.join('\n') });
  }

  for (const entry of explicit) {
    const key = `${entry.name}@${entry.version}`;
    const licence = canonical(entry.licence)!;
    if (!isAllowed(licence)) {
      problems.push(`${key}: licence "${licence}" is not allowed`);
      continue;
    }
    const lines = [`## ${key}`, '', `Licence: ${licence}`, '', entry.note];
    if (mentions(licence, 'EPL-2.0')) lines.push('', `Source available at ${entry.source} @ ${entry.version}`);
    lines.push('', fenced(entry.text));
    sections.push({ key, body: lines.join('\n') });
  }

  if (problems.length > 0) throw new LicenceError(problems);

  sections.sort((a, b) => a.key.localeCompare(b.key));
  return [
    '# Third-party licences',
    '',
    'The visual-grilling bundle (`cli.mjs`, `server.mjs`, `page/` and `frame/`) includes the following third-party software.',
    '',
    ...sections.map((section) => `${section.body}\n`),
  ].join('\n');
}

function declaredLicence(manifest: Manifest): string | undefined {
  if (typeof manifest.license === 'string' && manifest.license.trim()) return manifest.license.trim();
  const legacy = manifest.license ?? manifest.licenses;
  const list = Array.isArray(legacy) ? legacy : legacy ? [legacy] : [];
  const types = list
    .map((item: unknown) => (item && typeof item === 'object' ? (item as { type?: unknown }).type : item))
    .filter((type): type is string => typeof type === 'string' && type.trim() !== '');
  if (types.length === 0) return undefined;
  return types.length === 1 ? types[0] : `(${types.join(' OR ')})`;
}

/** SPDX ids are case-insensitive: spell the allowed ones the canonical way. */
function canonical(expression: string | undefined): string | undefined {
  return expression?.replace(/[^\s()]+/g, (id) => ALLOWED_LICENCES.find((allowed) => allowed.toLowerCase() === id.toLowerCase()) ?? id);
}

/**
 * Whether an SPDX expression can be honoured with allowed licences alone:
 * both sides of AND must be allowed, either side of OR.
 */
export function isAllowed(expression: string): boolean {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let at = 0;
  const peek = (): string | undefined => tokens[at];
  const or = (): boolean => {
    let result = and();
    while (peek()?.toUpperCase() === 'OR') {
      at++;
      result = and() || result;
    }
    return result;
  };
  const and = (): boolean => {
    let result = term();
    while (peek()?.toUpperCase() === 'AND') {
      at++;
      result = term() && result;
    }
    return result;
  };
  const term = (): boolean => {
    const token = tokens[at++];
    if (token === '(') {
      const result = or();
      if (tokens[at++] !== ')') throw new Error(`unbalanced licence expression "${expression}"`);
      return result;
    }
    // A licence exception ("WITH …") is a licence of its own that isn't in the set.
    if (peek()?.toUpperCase() === 'WITH') {
      at += 2;
      return false;
    }
    return token !== undefined && ALLOWED_LICENCES.includes(canonical(token)!);
  };
  try {
    const result = or();
    return at === tokens.length && result;
  } catch {
    return false;
  }
}

function mentions(expression: string, id: string): boolean {
  return (expression.match(/[^\s()]+/g) ?? ([] as string[])).includes(id);
}

function repositoryUrl(manifest: Manifest): string | undefined {
  const repository = manifest.repository;
  const raw = typeof repository === 'string' ? repository : (repository as { url?: unknown } | undefined)?.url;
  if (typeof raw !== 'string') return typeof manifest.homepage === 'string' ? manifest.homepage : undefined;
  // npm's shorthands: "user/repo", "github:user/repo", "gitlab:…", "bitbucket:…".
  const shorthand = /^(?:(github|gitlab|bitbucket):)?([\w.-]+\/[\w.-]+)$/.exec(raw);
  if (shorthand) return `https://${shorthand[1] === 'bitbucket' ? 'bitbucket.org' : `${shorthand[1] ?? 'github'}.com`}/${shorthand[2]}`;
  return raw
    .replace(/^git\+/, '')
    .replace(/^(?:git|ssh):\/\/(?:[^@/]+@)?/, 'https://')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\.git$/, '');
}

function authorOf(manifest: Manifest): string {
  const author = manifest.author;
  const name = typeof author === 'string' ? author : (author as { name?: unknown } | undefined)?.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return `the ${manifest.name} authors${repositoryUrl(manifest) ? ` (${repositoryUrl(manifest)})` : ''}`;
}

/** Standard texts for a package that declares one of these but ships no file. */
const STANDARD_TEXTS: Record<string, string> = {
  MIT: `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
  ISC: `Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`,
};

function filesMatching(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((name) => readFileSync(join(dir, name), 'utf8').trim());
}

/** A fence longer than any backtick run in the text, so no text can close it. */
function fenced(text: string): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
}

/**
 * Graphviz (EPL-2.0), expat (MIT) and the Emscripten runtime (MIT or NCSA),
 * compiled into @viz-js/viz's WebAssembly, at the versions its
 * lib/provenance.json says it was built from.
 */
export function vizWasmEntries(provenance: string): ExplicitEntry[] {
  const version = (pattern: RegExp, what: string): string => {
    const found = pattern.exec(provenance);
    if (!found) throw new Error(`@viz-js/viz provenance: ${what} version not found`);
    return found[1]!;
  };
  const note = 'Compiled into the WebAssembly of @viz-js/viz, bundled in page/graphviz.js.';
  return [
    {
      name: 'Graphviz',
      version: version(/graphviz-releases\/[^/]+\/graphviz-([\d.]+)\.tar\.gz/, 'Graphviz'),
      licence: 'EPL-2.0',
      note,
      source: 'https://gitlab.com/graphviz/graphviz',
      text: 'Eclipse Public License - v 2.0: https://www.eclipse.org/legal/epl-2.0/',
    },
    {
      name: 'expat',
      version: version(/libexpat\/releases\/download\/[^/]+\/expat-([\d.]+)\.tar\.gz/, 'expat'),
      licence: 'MIT',
      note,
      source: 'https://github.com/libexpat/libexpat',
      text: EXPAT_LICENCE,
    },
    {
      name: 'Emscripten',
      // The emsdk image it was built with, when the provenance names one.
      version: /emscripten\/emsdk[@:]([\d.]+)/.exec(provenance)?.[1] ?? 'unknown',
      licence: 'MIT OR NCSA',
      note: 'Its runtime is compiled into the WebAssembly of @viz-js/viz and its JavaScript glue, bundled in page/graphviz.js. Emscripten is dual-licensed under the MIT licence and the University of Illinois/NCSA Open Source License; it is used here under the MIT licence.',
      source: 'https://github.com/emscripten-core/emscripten',
      text: `Copyright (c) 2010-2014 Emscripten authors, see AUTHORS file.\n\n${STANDARD_TEXTS.MIT}\n\nThe University of Illinois/NCSA Open Source License: https://github.com/emscripten-core/emscripten/blob/main/LICENSE`,
    },
  ];
}

const EXPAT_LICENCE = `Copyright (c) 1998-2000 Thai Open Source Software Center Ltd and Clark Cooper
Copyright (c) 2001-2025 Expat maintainers

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/**
 * The logo packs src/agents/logos copies marks from (src/agents/logos/SOURCES.md
 * says which logo came from where). Logos taken from vendors' own sites carry no
 * licence of their own; they are their owners' trademarks, shown to name the agent.
 */
export function agentLogoEntries(): ExplicitEntry[] {
  const note = 'Agent logos copied into page/agents/ (see src/agents/logos/SOURCES.md).';
  return [
    {
      name: '@lobehub/icons-static-svg',
      version: '1.95.1',
      licence: 'MIT',
      note,
      source: 'https://github.com/lobehub/lobe-icons',
      text: `MIT License\n\nCopyright (c) 2023 LobeHub\n\n${STANDARD_TEXTS.MIT}`,
    },
    {
      name: 'simple-icons',
      version: '16.33.0',
      licence: 'CC0-1.0',
      note: `${note} The brands they depict are their owners' trademarks.`,
      source: 'https://github.com/simple-icons/simple-icons',
      text: 'CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/',
    },
    {
      name: 'lucide (bot icon)',
      version: '0.545.0',
      licence: 'ISC',
      note: `${note} The generic "other" agent logo.`,
      source: 'https://github.com/lucide-icons/lucide',
      text: 'ISC License\n\nCopyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.\n\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.',
    },
  ];
}
