#!/usr/bin/env node
// Root postinstall. The repo root is also the plugin root, and Claude Code
// installs the npm dependencies a plugin root's package.json and lockfile list
// (see docs/adr/0005-dev-workspaces-live-under-packages.md). So the root lists
// none, and the dev workspaces have their own root in packages/. This carries
// a root `npm ci` or `npm install` through to packages/, so both still set up
// the whole dev tree.
import { spawnSync } from 'node:child_process';

const command = process.env.npm_command === 'ci' ? 'ci' : 'install';
const r = spawnSync('npm', [command, '--prefix', 'packages'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
