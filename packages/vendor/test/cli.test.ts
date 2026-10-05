import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const CLI = fileURLToPath(new URL('../cli.ts', import.meta.url));

const USAGE = `usage: node packages/vendor/cli.ts check [--root <repo>] [--cache <dir>]
       node packages/vendor/cli.ts sync [--upstream <name>] [--to <sha>|HEAD] [--overwrite] [--root <repo>] [--cache <dir>]
`;

test('--help prints the usage to stdout and exits 0', () => {
  const result = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });

  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.stdout).toBe(USAGE);
});
