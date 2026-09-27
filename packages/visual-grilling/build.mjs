// Builds the shipped bundle: node build.mjs --out <dir>
//
//   <out>/cli.mjs            Node version check, then loads lib/cli-main.mjs
//   <out>/lib/cli-main.mjs   the CLI
//   <out>/server.mjs         the detached local server
//   <out>/page/              the round page (index.html, app.js, app.css)

import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) {
  console.error('usage: node build.mjs --out <dir>');
  process.exit(2);
}
const out = resolve(values.out);
rmSync(out, { recursive: true, force: true });

const node = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  legalComments: 'none',
  logLevel: 'warning',
};

await Promise.all([
  // Must stay parseable by old Node: esbuild fails the build on newer syntax.
  esbuild.build({
    entryPoints: [join(here, 'src/cli/entry.js')],
    outfile: join(out, 'cli.mjs'),
    bundle: false,
    format: 'esm',
    platform: 'node',
    target: 'node14',
    logLevel: 'warning',
  }),
  esbuild.build({ ...node, entryPoints: [join(here, 'src/cli/main.ts')], outfile: join(out, 'lib/cli-main.mjs') }),
  esbuild.build({ ...node, entryPoints: [join(here, 'src/server/main.ts')], outfile: join(out, 'server.mjs') }),
  esbuild.build({
    entryPoints: [join(here, 'src/page/app.ts')],
    outfile: join(out, 'page/app.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    logLevel: 'warning',
  }),
]);

mkdirSync(join(out, 'page'), { recursive: true });
for (const file of ['index.html', 'app.css']) {
  copyFileSync(join(here, 'src/page', file), join(out, 'page', file));
}

for (const file of walk(out)) {
  const size = statSync(file).size;
  console.log(`${relative(out, file).padEnd(24)} ${(size / 1024).toFixed(1).padStart(8)} KiB`);
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}
