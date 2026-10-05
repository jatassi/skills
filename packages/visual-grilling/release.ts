// The file-touching steps of the release workflow (.github/workflows/release.yml).
// See docs/adr/0002-installs-pinned-to-release-tags.md.
//
//   node release.ts next --bump patch|minor|major [--root <repo>]
//     Prints the version after the one both plugin manifests agree on, with
//     that part bumped and the parts after it reset.
//
//   node release.ts manifests --version X.Y.Z [--check] [--root <repo>]
//     Bumps `version` in plugin.json and .claude-plugin/plugin.json, and pins
//     the marketplace entry's source to the tag vX.Y.Z. Refuses, changing
//     nothing, unless X.Y.Z is newer than the version both manifests agree on.
//     With --check it only checks, and writes nothing.
//
//   node release.ts notes --dist <dir> --notes <file>
//     Prints the GitHub Release body: the notes, if any, then each output's size.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { kib, type OutputSize, outputSizes } from './build/sizes.ts';

const REPO = 'jatassi/skills';
const PLUGIN = 'milliways';
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

const BUMPS = ['major', 'minor', 'patch'] as const;
type Bump = (typeof BUMPS)[number];

/** The plugin manifests and the X.Y.Z version they agree on. */
function readPlugins(root: string) {
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
  return { plugins, current, currentVersion };
}

function nextVersion(root: string, bump: string): string {
  const part = BUMPS.indexOf(bump as Bump);
  if (part === -1) throw new ReleaseError(`bump must be one of ${BUMPS.join(', ')}, got "${bump}"`);
  const { currentVersion } = readPlugins(root);
  return currentVersion.map((n, i) => (i < part ? n : i === part ? n + 1 : 0)).join('.');
}

function bumpAndPin(root: string, version: string, check: boolean): void {
  const next = parseVersion(version);
  if (!next) throw new ReleaseError(`version must be X.Y.Z (no "v", no pre-release), got "${version}"`);

  // Read and check everything before writing anything.
  const { plugins, current, currentVersion } = readPlugins(root);
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
  const notes = readFileSync(notesFile, 'utf8').trim();
  return [
    ...(notes ? [notes, ''] : []),
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
    bump: { type: 'string' },
    check: { type: 'boolean', default: false },
    root: { type: 'string' },
    dist: { type: 'string' },
    notes: { type: 'string' },
  },
});

try {
  const [command] = positionals;
  const root = resolve(values.root ?? join(import.meta.dirname, '../..'));
  if (command === 'next' && values.bump) {
    process.stdout.write(`${nextVersion(root, values.bump)}\n`);
  } else if (command === 'manifests' && values.version) {
    bumpAndPin(root, values.version, values.check);
  } else if (command === 'notes' && values.dist && values.notes) {
    process.stdout.write(releaseBody(resolve(values.dist), values.notes));
  } else {
    console.error(
      'usage: node release.ts next --bump patch|minor|major [--root <repo>]\n       node release.ts manifests --version X.Y.Z [--check] [--root <repo>]\n       node release.ts notes --dist <dir> --notes <file>',
    );
    process.exit(2);
  }
} catch (error) {
  if (!(error instanceof ReleaseError)) throw error;
  console.error(`release: ${error.message}`);
  process.exit(1);
}
