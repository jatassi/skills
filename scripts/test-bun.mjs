// Runs the vendored Bun scripts' upstream tests. Not part of `npm test`: Bun is
// not a workspace dependency, and this needs Bun installed (CI installs it with
// oven-sh/setup-bun; cloud environments install it in their setup script).
//
// Finds every skills/*/scripts/package.json that has a "test" script, so the
// skill folder can be renamed without touching this. `--root <dir>` scans
// another checkout, to run the tests against a copy.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const at = args.indexOf('--root')
const root = resolve(at >= 0 ? args[at + 1] : join(dirname(fileURLToPath(import.meta.url)), '..'))

const packages = readdirSync(join(root, 'skills'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(root, 'skills', entry.name, 'scripts'))
  .filter((dir) => existsSync(join(dir, 'package.json')))
  .filter((dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts?.test)

if (packages.length === 0) {
  console.error(`No skills/*/scripts/package.json with a test script under ${root}`)
  process.exit(1)
}

try {
  execFileSync('bun', ['--version'], { stdio: 'ignore' })
} catch {
  console.error('Bun is required for the vendored script tests: https://bun.sh')
  process.exit(1)
}

for (const dir of packages) {
  console.log(`\n== ${dir}`)
  try {
    execFileSync('bun', ['install', '--frozen-lockfile'], { cwd: dir, stdio: 'inherit' })
    execFileSync('bun', ['run', 'test'], { cwd: dir, stdio: 'inherit' })
  } catch {
    process.exit(1)
  }
}
