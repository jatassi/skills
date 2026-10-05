# The dev workspaces' npm root is packages/, so the plugin root lists no dependencies

The repo root is the plugin root, and when Claude Code caches a plugin it installs the npm dependencies listed by the `package.json` and lockfile at that root ([Node.js package dependencies](https://code.claude.com/docs/en/plugins/loading#node-js-package-dependencies)). The install needs both files, accepts only registry packages, and runs with lifecycle scripts disabled. v2.0.0 kept the dev workspaces' `package.json` and `package-lock.json` there. The installer read the workspace links as runtime dependencies, refused them as folder links, and left a note on every install ([#113](https://github.com/jatassi/skills/issues/113)). None of them are runtime dependencies: visual-grilling ships a prebuilt `dist/`, and every shipped script is dependency-free Node or Bun.

So the workspaces' npm root is now `packages/`, with its own `package.json` and lockfile. The root keeps a `package.json` that has the dev scripts but lists no dependencies, and a lockfile with nothing in it. A root `npm ci` or `npm install` runs the same command in `packages/` from a `postinstall` script, so CI and the README's commands still run from the root. The installer finds nothing to install and leaves no note, and it never runs that `postinstall`.

## Considered Options

- **Point the marketplace entry at a plugin subfolder** (a `git-subdir` source), moving `skills/`, `agents/` and the manifest under it. Rejected: it moves every skill and changes the vendor tooling's paths, while the Agent Plugins manifest at the root and skills.sh expect the skills where they are.
- **Drop the root lockfile** and keep only a root `package.json`. The installer then skips the install without a note, but `npm ci` from the root fails, and CI runs `npm ci` from the root.
- **A setting that turns the dependency install off.** The same docs page says no setting or environment variable disables it.

## Consequences

- Add or update dev dependencies in `packages/`: `npm install <pkg> --prefix packages --workspace <name>`, `npm update --prefix packages`.
- Tools from the workspaces run through `packages/`. `npx playwright` from the root would fetch an unpinned Playwright, so the root has a `playwright` script that runs the pinned one.
- The root `package.json` and `package-lock.json` must keep listing no dependencies. Adding one brings back the install, and the note when the install can't run. The root `postinstall` fails while the root lists one, so CI's `npm ci` catches it.
