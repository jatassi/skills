# Installs are pinned to release tags; only the release workflow commits bundles

> Releases now run on every merge to `main` rather than by hand: see [ADR 0003](0003-every-merge-to-main-is-a-release.md).

The marketplace entry for `jatassi-skills` pins its source to the latest release tag (`source: { source: "github", repo: "jatassi/skills", ref: "vX.Y.Z" }`), and only the manually triggered release workflow writes `skills/visual-grilling/dist/`. That workflow runs the full test command on Ubuntu, macOS and Windows at the minimum Node, builds, bumps both plugin manifests, sets the pin, commits and tags. We chose this because `visual-grilling` ships prebuilt bundles alongside skill text that keeps changing on `main`. An unpinned install clones the default branch and could pair new skill text with an old or untested build. Pinning makes what installs exactly what was tested.

## Considered Options

- **No pin; `main` always installable**, guarded by a test that the committed `dist/` matches a fresh build. Rejected: every source change drags a 20+ MB rebuild into a commit, and the bundle is only as tested as the last local run.
- **`dist/` only on tag commits, `main` source-only.** Rejected: Agent Plugins clients read the default branch and would get a skill with no bundles.
- **The maintainer builds and commits locally**, with CI only verifying. Rejected: the shipped bytes would depend on a dev machine, and version, tag and build could drift apart.

## Consequences

- The pin covers the whole plugin, so `auto-grill` and the other skills also reach Claude Code users only through releases.
- `main` still carries the latest release's `dist/` for Agent Plugins clients. Between releases, their skill text can be newer than that build.
- Local builds go to a gitignored folder by default. `npm run try` writes `dist/` for trying the plugin with `claude --plugin-dir .`, and that output is discarded, never committed.
