// Vendors pinned upstream skills into this plugin. See
// docs/adr/0004-vendoring-pinned-upstreams-with-declared-forks.md and the
// README's Development section.
//
//   node packages/vendor/cli.ts check
//     Derives every upstream at its pin and fails (exit 1) on any violation:
//     an undeclared divergence, a stale or unknown fork, a denylisted line
//     (Cursor-isms, pinned model versions, CLAUDE.md), an agent type outside
//     the plugin's namespace, a playbook naming a missing skill, or a leftover
//     conflict marker.
//
//   node packages/vendor/cli.ts sync [--upstream <name>] [--to <sha>|HEAD] [--overwrite]
//     Moves the named upstream (or every upstream) to --to, or re-derives it
//     at its pin when --to is left out, writes the vendored tree, moves the
//     pin, and then runs check. Forks that upstream changed are three-way
//     merged; a conflict is written with markers. Stops before writing
//     anything if a vendored file has diverged without a declared fork, unless
//     --overwrite restores it. Exit 1 when anything needs a human: undeclared
//     divergence, a conflict, or a check violation.
//
// Both take --root <repo> (default: this repo) and --cache <dir> (default:
// node_modules/.cache/milliways-vendor under the root). Exit 2 is a usage or
// configuration error.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ConfigError, loadConfig } from './src/config.ts';
import { DeriveError } from './src/derive.ts';
import { GitError, Upstreams } from './src/git.ts';
import { check, type CheckReport, sync, type SyncReport } from './src/vendor.ts';

const USAGE = `usage: node packages/vendor/cli.ts check [--root <repo>] [--cache <dir>]
       node packages/vendor/cli.ts sync [--upstream <name>] [--to <sha>|HEAD] [--overwrite] [--root <repo>] [--cache <dir>]`;

class UsageError extends Error {}

function printCheck(report: CheckReport) {
  if (report.violations.length === 0) {
    console.log(`check: ok (${report.files} vendored files, ${report.forks} declared forks)`);
    return;
  }
  console.log(`check: ${report.violations.length} violation${report.violations.length === 1 ? '' : 's'}`);
  for (const v of report.violations) {
    console.log(`  ${v.path}${v.line ? `:${v.line}` : ''} [${v.rule}] ${v.message}`);
  }
}

function printSync(report: SyncReport) {
  for (const u of report.upstreams) {
    const moved = u.from === u.to ? `at ${u.from.slice(0, 12)}` : `${u.from.slice(0, 12)} -> ${u.to.slice(0, 12)}`;
    console.log(`${u.name} ${moved}`);
    const list = (label: string, paths: string[]) => paths.forEach((path) => console.log(`  ${label}: ${path}`));
    list('added', u.added);
    list('updated', u.updated);
    list('deleted', u.deleted);
    list('merged into fork', u.merged);
    list('fork kept', u.kept);
    for (const c of u.conflicts) console.log(`  CONFLICT: ${c.path}: ${c.reason}`);
    list('new upstream skill to triage (include or exclude it in vendor/upstream.json)', u.newSkills);
  }
  if (report.undeclared.length) {
    console.log('\nsync stopped, nothing written: vendored files differ from upstream with no fork declared in vendor/forks.json.');
    console.log('Declare each as a fork (kind and why), or rerun with --overwrite to restore it:');
    for (const { path, upstream } of report.undeclared) console.log(`  ${path} (${upstream})`);
  }
}

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: { type: 'string' },
      cache: { type: 'string' },
      upstream: { type: 'string' },
      to: { type: 'string' },
      overwrite: { type: 'boolean', default: false },
    },
  });
  const [command, ...rest] = positionals;
  if (rest.length || (command !== 'check' && command !== 'sync')) throw new UsageError(USAGE);
  const root = resolve(values.root ?? join(dirname(fileURLToPath(import.meta.url)), '../..'));
  const upstreams = new Upstreams(resolve(values.cache ?? join(root, 'node_modules/.cache/milliways-vendor')));
  let config = loadConfig(root);

  if (command === 'check') {
    if (values.upstream || values.to || values.overwrite) throw new UsageError(USAGE);
    const report = check(config, upstreams);
    printCheck(report);
    return report.violations.length ? 1 : 0;
  }

  const chosen = values.upstream ? config.upstreams.filter((u) => u.name === values.upstream) : config.upstreams;
  if (chosen.length === 0) throw new UsageError(`no upstream "${values.upstream}"; vendor/upstream.json has ${config.upstreams.map((u) => u.name).join(', ')}`);
  if (values.to && values.to !== 'HEAD' && !/^[0-9a-f]{40}$/.test(values.to)) throw new UsageError('--to takes a full 40-character commit SHA or HEAD');
  if (values.to && values.to !== 'HEAD' && chosen.length > 1) throw new UsageError('--to <sha> needs --upstream');
  const targets = new Map(chosen.map((u) => [u.name, values.to === 'HEAD' ? upstreams.resolveHead(u.repo) : (values.to ?? u.commit)]));
  const report = sync(config, upstreams, { targets, overwrite: values.overwrite });
  printSync(report);
  if (!report.written) return 1;
  config = loadConfig(root);
  const verdict = check(config, upstreams);
  printCheck(verdict);
  return verdict.violations.length || report.upstreams.some((u) => u.conflicts.length) ? 1 : 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError || error instanceof ConfigError || error instanceof DeriveError || error instanceof GitError) {
    console.error(error.message);
    process.exitCode = 2;
  } else if ((error as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
