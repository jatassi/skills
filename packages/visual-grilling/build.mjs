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
//   <out>/frame/             sandboxed agent-HTML frames: inject.js (the frame
//                            script) and tailwind.js (@tailwindcss/browser)
//   <out>/page/code.js       the Shiki + @pierre/diffs chunk, loaded the same way

import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
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

const browser = {
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
};

const node = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  legalComments: 'none',
  logLevel: 'warning',
};

/**
 * jsdom, bundled into the server for the draw check, reaches for files next
 * to its own sources at load time. Its default stylesheet is inlined, and its
 * sync-XHR worker (never used: drawing does no XHR) points nowhere.
 */
const jsdomFiles = {
  name: 'jsdom-files',
  setup(build) {
    build.onLoad({ filter: /jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/]css[\\/]helpers[\\/]computed-style\.js$/ }, (args) => {
      const source = readFileSync(args.path, 'utf8');
      const css = readFileSync(join(dirname(args.path), '../../../browser/default-stylesheet.css'), 'utf8');
      const inlined = source.replace(
        /fs\.readFileSync\(\s*path\.resolve\(__dirname, "\.\.\/\.\.\/\.\.\/browser\/default-stylesheet\.css"\),\s*\{ encoding: "utf-8" \}\s*\)/,
        JSON.stringify(css),
      );
      if (inlined === source) throw new Error('jsdom-files: default stylesheet read not found');
      return { contents: inlined, loader: 'js' };
    });
    build.onLoad({ filter: /jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/]xhr[\\/]XMLHttpRequest-impl\.js$/ }, (args) => {
      const source = readFileSync(args.path, 'utf8');
      const stubbed = source.replace('require.resolve("./xhr-sync-worker.js")', '"xhr-sync-worker.js is not bundled"');
      if (stubbed === source) throw new Error('jsdom-files: sync-XHR worker reference not found');
      return { contents: stubbed, loader: 'js' };
    });
  },
};

/**
 * Keeps the code chunk to Shiki's core. `shiki` (which @pierre/diffs imports)
 * becomes our cut-down stand-in with the JavaScript regex engine and only the
 * code-block grammars, the oniguruma engine and wasm are left out, and
 * @pierre/theming's collection of every Shiki and Pierre theme is stubbed: the
 * chunk draws with its own CSS-variables theme.
 */
const shikiCore = {
  name: 'shiki-core',
  setup(build) {
    const standIn = join(here, 'src/chunks/shiki.ts');
    build.onResolve({ filter: /^shiki(\/wasm|\/engine\/oniguruma)?$/ }, () => ({ path: standIn }));
    build.onLoad({ filter: /@pierre[\\/]theming[\\/]dist[\\/]themes\.js$/ }, () => ({
      contents: [
        'export { createTheme } from "./modules/createTheme.js";',
        'const none = { getThemes: () => [], getTheme: () => undefined };',
        'export const pierreThemes = none, shikiThemes = none, themes = none;',
      ].join('\n'),
      loader: 'js',
    }));
  },
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
  esbuild.build({
    ...node,
    entryPoints: [join(here, 'src/server/main.ts')],
    outfile: join(out, 'server.mjs'),
    // jsdom and its dependencies are CommonJS and require Node built-ins.
    banner: { js: "import { createRequire as __vgCreateRequire } from 'node:module'; const require = __vgCreateRequire(import.meta.url);" },
    plugins: [jsdomFiles],
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
  esbuild.build({ ...browser, entryPoints: [join(here, 'src/chunks/code.ts')], outfile: join(out, 'page/code.js'), plugins: [shikiCore] }),
]);

// Served from the local server into every frame (unless tailwind=false), never from a CDN.
const require = createRequire(import.meta.url);
copyFileSync(require.resolve('@tailwindcss/browser'), join(out, 'frame/tailwind.js'));

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
