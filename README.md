# milliways

Agent skills, packaged both as a [Claude Code plugin](https://code.claude.com/docs/en/plugins) and as an [Agent Plugin](https://agent-plugins.org/specification).

## Skills

| Skill | What it does |
| --- | --- |
| [`auto-grill`](skills/auto-grill/SKILL.md) | A relentless interview where an agent stand-in answers in your place. |
| [`visual-grilling`](skills/visual-grilling/SKILL.md) | Grilling with each round shown as a page in the browser, answered and commented on there. Needs Node `^22.22.2 \|\| ^24.15.0 \|\| >=26`. |
| [`to-spec-and-tickets`](skills/to-spec-and-tickets/SKILL.md) | Take a build-graph parent: spec it in a comment on the parent, then cut it into linked, blocked sub-issues. |
| [`setup-milliways`](skills/setup-milliways/SKILL.md) | Make a repo a kitchen: the `docs/agents` config and its index, the one root `AGENTS.md` line, the GitHub labels and a model-role table detected from your harness. Safe to re-run. |

## Install

### Claude Code

```
/plugin marketplace add jatassi/skills
/plugin install milliways@jatassi
```

Skills are namespaced `milliways:`, so `visual-grilling` runs as `milliways:visual-grilling`. The plugin used to be called `jatassi-skills`; if you have that installed, uninstall it (`/plugin uninstall jatassi-skills@jatassi`) and install `milliways` in its place.

The marketplace pins the plugin to the latest release tag, so Claude Code installs exactly the build that release tested, not whatever is on `main`.

### skills.sh

```
npx skills add jatassi/skills
```

This installs every skill in the repo into any agent the [`skills` CLI](https://skills.sh) supports. Update later with `npx skills update`.

### Agent Plugins clients

Point your client at this repository; the manifest is [`plugin.json`](plugin.json) at the root.

skills.sh and Agent Plugins clients read `main`, and every merge to `main` is a release, so they get the same build as Claude Code. The exception is the few minutes while a release is building, when the skill text on `main` can be newer than the `visual-grilling` build.

## Layout

```
.
├── plugin.json                  # Agent Plugins manifest
├── .claude-plugin/
│   ├── plugin.json              # Claude Code plugin manifest
│   └── marketplace.json         # Claude Code marketplace (this repo = one plugin)
├── .github/workflows/           # release.yml, the only workflow: tests pull requests, releases merges to main
└── skills/                      # Shared by both formats
    └── <skill>/SKILL.md
```

## Development

`visual-grilling`'s CLI, server and round page are built from the TypeScript workspace in `packages/visual-grilling/`, outside the shipped skill folder. `setup-milliways`'s CLI ships as plain Node in `skills/setup-milliways/scripts/`, and its tests live in `packages/setup-milliways/`.

```
npm install
npx playwright install chromium   # once, for the round page tests
npm test                          # test only the workspaces changed since the merge-base with dev
npm run test:all                  # every workspace: visual-grilling type-checks, builds into .test-dist and tests that; setup-milliways tests its CLI
npm run try                       # build into skills/visual-grilling/dist/, then: claude --plugin-dir .
```

`npm test` picks workspaces with [`scripts/test.mjs`](scripts/test.mjs): a workspace at `packages/<name>` runs when `packages/<name>/` or `skills/<name>/` changed, or a prefix listed in its package.json `testPaths`. Shared tooling changes run everything.

Work on `dev`, not `main`. Never commit the `npm run try` output: `dist/` is gitignored, and only a release commits it. After the first release `dist/` is tracked, so a try build shows up as changes to it; discard them with `git restore skills/visual-grilling/dist`. The build prints each output's size, writes `dist/THIRD_PARTY_LICENSES.md`, and fails on a bundled package whose licence is missing or not allowed.

## Releasing

Every merge to `main` is a release ([ADR 0003](docs/adr/0003-every-merge-to-main-is-a-release.md)). Only the [Release workflow](.github/workflows/release.yml) commits `skills/visual-grilling/dist/` ([ADR 0002](docs/adr/0002-installs-pinned-to-release-tags.md)). There is no CHANGELOG; the notes go on the GitHub Release.

1. Land changes on `dev`. Run `npm update` within the pinned majors from time to time, with `npm test`.
2. Open a pull request from `dev` into `main`. Its description becomes the release notes. Label it `release:minor` or `release:major` for more than a patch bump.
3. Wait for the `npm test` checks (Ubuntu, macOS and Windows at Node 22.22.2; browser tests on Ubuntu only), make sure `main` hasn't moved since they ran, and merge with a merge commit.

The merge's run finds the bundle the pull request tested for exactly the merged tree, builds into `dist/` and checks the build is byte-for-byte that bundle, bumps `version` in both `plugin.json` manifests, pins the marketplace entry to `vX.Y.Z`, commits that to `main`, tags it `vX.Y.Z`, creates a GitHub Release (your notes, each output's size, then GitHub's list of changes), and fast-forwards `dev` to the release commit.

If the release fails after a merge (for example because `main` moved and the merged tree was never tested), run **Release** by hand on `main`. It tests `main` as it is and then releases it:

```
gh workflow run release.yml --ref main -f bump=patch -f notes="$(cat notes.md)"
```
