// Bundles the repo's round-file parser into the mod, so the mod checks a
// round exactly as `present` does. Run from anywhere after `npm ci` at the
// repo root: node spikes/visual-grilling-mod/build.mjs
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

await build({
  entryPoints: [join(here, '../../packages/visual-grilling/src/core/round.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  outfile: join(here, 'hooks/round-parser.mjs'),
  logLevel: 'info',
})
