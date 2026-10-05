#!/usr/bin/env node
// Root postinstall. The repo root is also the plugin root, and Claude Code
// installs the npm dependencies a plugin root's package.json and lockfile list
// (see docs/adr/0005-dev-workspaces-live-under-packages.md). So the root lists
// none, and the dev workspaces have their own root in packages/. This carries
// a root `npm ci` or `npm install` through to packages/, so both still set up
// the whole dev tree. It fails while the root lists a dependency, so CI's
// `npm ci` catches one (`npm install <pkg>` doesn't run this script).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const root = JSON.parse(readFileSync('package.json', 'utf8'));
const listed = FIELDS.flatMap((field) => Object.keys(root[field] ?? {}).map((name) => `${field}.${name}`));
if (listed.length) {
  console.error(
    `The root package.json must list no dependencies, but lists ${listed.join(', ')}.\n` +
      'Claude Code would install them with the plugin. Remove them, and add dev dependencies to a workspace:\n' +
      '  npm install <pkg> --prefix packages --workspace <name>',
  );
  process.exit(1);
}

const command = process.env.npm_command === 'ci' ? 'ci' : 'install';
const r = spawnSync('npm', [command, '--prefix', 'packages'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
