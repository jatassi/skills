// Builds the shipped bundle: node build.mjs --out <dir>
//
//   <out>/cli.mjs            Node version check, then loads lib/cli-main.mjs
//   <out>/lib/cli-main.mjs   the CLI
//   <out>/server.mjs         the detached local server
//   <out>/page/              the round page (index.html, app.js, app.css)
//   <out>/page/mermaid.js    the Mermaid+ELK chunk: the page loads it lazily, and
//                            the server imports it for the draw check
//   <out>/page/graphviz.js   the Graphviz (@viz-js/viz) chunk, shared the same way
//   <out>/page/vega-lite.js  the Vega + Vega-Lite chunk, used the same way
//   <out>/page/code.js       the Shiki + @pierre/diffs chunk, loaded the same way
//   <out>/frame/             sandboxed agent-HTML frames: inject.js (the frame
//                            script) and tailwind.js (@tailwindcss/browser)
//   <out>/THIRD_PARTY_LICENSES.md
//                            every bundled package's licence; the build fails
//                            on a missing or disallowed one (build/licences.ts)
//
// Dead weight is trimmed by the plugins in build/trim.ts. The build prints
// each output's size; there is no size ceiling.

import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { packageRoots, thirdPartyLicences, vizWasmEntries } from './build/licences.ts';
import { jsdomTrim, shikiCore } from './build/trim.ts';

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) {
  console.error('usage: node build.mjs --out <dir>');
  process.exit(2);
}
const out = resolve(values.out);
rmSync(out, { recursive: true, force: true });

const browser = {
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
};

const node = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
};

const results = await Promise.all([
  // Must stay parseable by old Node: esbuild fails the build on newer syntax.
  esbuild.build({
    entryPoints: [join(here, 'src/cli/entry.js')],
    outfile: join(out, 'cli.mjs'),
    bundle: false,
    format: 'esm',
    platform: 'node',
    target: 'node14',
    logLevel: 'warning',
    metafile: true,
  }),
  esbuild.build({ ...node, entryPoints: [join(here, 'src/cli/main.ts')], outfile: join(out, 'lib/cli-main.mjs') }),
  esbuild.build({
    ...node,
    entryPoints: [join(here, 'src/server/main.ts')],
    outfile: join(out, 'server.mjs'),
    // jsdom and its dependencies are CommonJS and require Node built-ins.
    banner: { js: "import { createRequire as __vgCreateRequire } from 'node:module'; const require = __vgCreateRequire(import.meta.url);" },
    plugins: [jsdomTrim],
    // Mostly jsdom, so minifying halves it. Names are kept: jsdom's wrappers
    // and stack traces read better with them, for ~2% of the size.
    minify: true,
    keepNames: true,
  }),
  esbuild.build({ ...browser, entryPoints: [join(here, 'src/page/app.ts')], outfile: join(out, 'page/app.js') }),
  // One copy of each drawing library: the page imports these chunks by URL,
  // and the server imports the same files (Mermaid's under jsdom).
  esbuild.build({ ...browser, entryPoints: [join(here, 'src/chunks/mermaid.ts')], outfile: join(out, 'page/mermaid.js') }),
  esbuild.build({ ...browser, entryPoints: [join(here, 'src/chunks/graphviz.ts')], outfile: join(out, 'page/graphviz.js') }),
  esbuild.build({ ...browser, entryPoints: [join(here, 'src/chunks/vega-lite.ts')], outfile: join(out, 'page/vega-lite.js') }),
  esbuild.build({
    ...browser,
    entryPoints: [join(here, 'src/frame/inject.ts')],
    outfile: join(out, 'frame/inject.js'),
    format: 'iife',
  }),
  esbuild.build({ ...browser, entryPoints: [join(here, 'src/chunks/code.ts')], outfile: join(out, 'page/code.js'), plugins: [shikiCore(join(here, 'src/chunks/shiki.ts'))] }),
]);

// Served from the local server into every frame (unless tailwind=false), never from a CDN.
const require = createRequire(import.meta.url);
const tailwind = require.resolve('@tailwindcss/browser');
copyFileSync(tailwind, join(out, 'frame/tailwind.js'));

mkdirSync(join(out, 'page'), { recursive: true });
for (const file of ['index.html', 'app.css']) {
  copyFileSync(join(here, 'src/page', file), join(out, 'page', file));
}

// Every npm package with code in an output, plus the C libraries compiled
// into @viz-js/viz's WebAssembly. Fails the build on a missing or disallowed
// licence.
const bundled = results.flatMap((result) => Object.keys(result.metafile.inputs)).map((input) => resolve(input));
const [vizDir] = packageRoots([require.resolve('@viz-js/viz')]);
writeFileSync(
  join(out, 'THIRD_PARTY_LICENSES.md'),
  thirdPartyLicences(packageRoots([...bundled, tailwind]), {
    explicit: vizWasmEntries(readFileSync(join(vizDir, 'lib/provenance.json'), 'utf8')),
    // Its licence file is the MIT licence; its package.json has no `license`.
    undeclared: { 'khroma@2.1.0': 'MIT' },
  }),
);

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
