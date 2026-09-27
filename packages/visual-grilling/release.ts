// The file-touching steps of the release workflow (.github/workflows/release.yml).
// See docs/adr/0002-installs-pinned-to-release-tags.md.
//
//   node release.ts manifests --version X.Y.Z [--check] [--root <repo>]
//     Bumps `version` in plugin.json and .claude-plugin/plugin.json, and pins
//     the marketplace entry's source to the tag vX.Y.Z. Refuses, changing
//     nothing, unless X.Y.Z is newer than the version both manifests agree on.
//     With --check it only checks, and writes nothing.
//
//   node release.ts notes --dist <dir> --notes <file>
//     Prints the GitHub Release body: the notes, then each output's size.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { kib, type OutputSize, outputSizes } from './build/sizes.ts';

const REPO = 'jatassi/skills';
const PLUGIN = 'jatassi-skills';
const PLUGIN_MANIFESTS = ['plugin.json', '.claude-plugin/plugin.json'];
const MARKETPLACE = '.claude-plugin/marketplace.json';
const VERSION_LINE = /"version": "([^"]*)"/;

class ReleaseError extends Error {}

/** A release version, X.Y.Z with no pre-release or build part. */
type Version = [major: number, minor: number, patch: number];

function parseVersion(text: string): Version | undefined {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function isNewer(next: Version, current: Version): boolean {
  const diff = next.map((part, i) => part - current[i]!).find((d) => d !== 0);
  return diff !== undefined && diff > 0;
}

function bumpAndPin(root: string, version: string, check: boolean): void {
  const next = parseVersion(version);
  if (!next) throw new ReleaseError(`version must be X.Y.Z (no "v", no pre-release), got "${version}"`);

  // Read and check everything before writing anything.
  const plugins = PLUGIN_MANIFESTS.map((file) => {
    const text = readFileSync(join(root, file), 'utf8');
    const current = VERSION_LINE.exec(text)?.[1];
    if (current === undefined || current !== JSON.parse(text).version) {
      throw new ReleaseError(`${file} has no single top-level "version" line`);
    }
    return { file, text, current };
  });
  const [{ file, current }, ...rest] = plugins as [(typeof plugins)[number], ...typeof plugins];
  for (const other of rest) {
    if (other.current !== current) {
      throw new ReleaseError(`${file} is at ${current} but ${other.file} is at ${other.current}; fix them by hand first`);
    }
  }
  const currentVersion = parseVersion(current);
  if (!currentVersion) throw new ReleaseError(`${file} has version "${current}", not X.Y.Z; fix it by hand first`);
  if (!isNewer(next, currentVersion)) throw new ReleaseError(`${version} is not newer than the current version ${current}`);

  const marketplace = JSON.parse(readFileSync(join(root, MARKETPLACE), 'utf8'));
  const entry = marketplace.plugins?.find((plugin: { name?: string }) => plugin.name === PLUGIN);
  if (!entry) throw new ReleaseError(`${MARKETPLACE} has no "${PLUGIN}" plugin entry`);
  if (check) return;

  entry.source = { source: 'github', repo: REPO, ref: `v${version}` };
  for (const { file, text } of plugins) {
    writeFileSync(join(root, file), text.replace(VERSION_LINE, `"version": "${version}"`));
  }
  writeFileSync(join(root, MARKETPLACE), `${JSON.stringify(marketplace, null, 2)}\n`);
}

function releaseBody(dist: string, notesFile: string): string {
  let sizes: OutputSize[] = [];
  try {
    sizes = outputSizes(dist);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (sizes.length === 0) throw new ReleaseError(`no build output in ${dist}`);
  return [
    readFileSync(notesFile, 'utf8').trimEnd(),
    '',
    '## Bundle sizes',
    '',
    '| output | size |',
    '| --- | ---: |',
    ...sizes.map(({ path, bytes }) => `| \`${path}\` | ${kib(bytes)} |`),
    '',
  ].join('\n');
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    version: { type: 'string' },
    check: { type: 'boolean', default: false },
    root: { type: 'string' },
    dist: { type: 'string' },
    notes: { type: 'string' },
  },
});

try {
  const [command] = positionals;
  if (command === 'manifests' && values.version) {
    bumpAndPin(resolve(values.root ?? join(import.meta.dirname, '../..')), values.version, values.check);
  } else if (command === 'notes' && values.dist && values.notes) {
    process.stdout.write(releaseBody(resolve(values.dist), values.notes));
  } else {
    console.error(
      'usage: node release.ts manifests --version X.Y.Z [--check] [--root <repo>]\n       node release.ts notes --dist <dir> --notes <file>',
    );
    process.exit(2);
  }
} catch (error) {
  if (!(error instanceof ReleaseError)) throw error;
  console.error(`release: ${error.message}`);
  process.exit(1);
}
