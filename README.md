# jatassi-skills

Agent skills, packaged both as a [Claude Code plugin](https://code.claude.com/docs/en/plugins) and as an [Agent Plugin](https://agent-plugins.org/specification).

## Skills

| Skill | What it does |
| --- | --- |
| [`auto-grill`](skills/auto-grill/SKILL.md) | A relentless interview where an agent stand-in answers in your place. |
| [`visual-grilling`](skills/visual-grilling/SKILL.md) | Grilling with each round shown as a page in the browser, answered and commented on there. Needs Node `^22.22.2 \|\| ^24.15.0 \|\| >=26`. |
| [`to-spec-and-tickets`](skills/to-spec-and-tickets/SKILL.md) | Take a build-graph parent: spec it in a comment on the parent, then cut it into linked, blocked sub-issues. |
| [`implement-loop`](skills/implement-loop/SKILL.md) | Orchestrate the implementation of a large task with several sub-tasks. |

## Install

### Claude Code

```
/plugin marketplace add jatassi/skills
/plugin install jatassi-skills@jatassi
```

The marketplace pins the plugin to the latest release tag, so Claude Code installs exactly the build that release tested, not whatever is on `main`.

### Agent Plugins clients

Point your client at this repository; the manifest is [`plugin.json`](plugin.json) at the root. These clients read `main`, which carries the latest release's `visual-grilling` build; between releases, the skill text on `main` can be newer than that build.

## Layout

```
.
├── plugin.json                  # Agent Plugins manifest
├── .claude-plugin/
│   ├── plugin.json              # Claude Code plugin manifest
│   └── marketplace.json         # Claude Code marketplace (this repo = one plugin)
├── .github/workflows/           # release.yml, the only workflow: cuts a release by hand
├── hooks/hooks.json             # Codex SessionEnd hook for visual-grilling (Claude Code also loads it)
└── skills/                      # Shared by both formats
    └── <skill>/SKILL.md
```

## Development

`visual-grilling`'s CLI, server and round page are built from the TypeScript workspace in `packages/visual-grilling/`, outside the shipped skill folder.

```
npm install
npx playwright install chromium   # once, for the round page tests
npm test                          # type-check, build into packages/visual-grilling/.test-dist, run every test against it
npm run try                       # build into skills/visual-grilling/dist/, then: claude --plugin-dir .
```

Never commit the `npm run try` output: `dist/` is gitignored, and only a release commits it. After the first release `dist/` is tracked, so a try build shows up as changes to it; discard them with `git restore skills/visual-grilling/dist`. The build prints each output's size, writes `dist/THIRD_PARTY_LICENSES.md`, and fails on a bundled package whose licence is missing or not allowed.

## Releasing

Only the [Release workflow](.github/workflows/release.yml) commits `skills/visual-grilling/dist/`, and there is no CI on pull requests or pushes ([ADR 0002](docs/adr/0002-installs-pinned-to-release-tags.md)). There is no CHANGELOG; the notes go on the GitHub Release.

1. Run `npm update` within the pinned majors, then `npm test`, and land the result on `main`.
2. Run **Release** on `main` with a `version` (`X.Y.Z`, newer than the current one) and the release `notes`. The Actions tab's `notes` box takes one line; for Markdown over several lines, dispatch from the terminal:

   ```
   gh workflow run release.yml --ref main -f version=1.2.3 -f notes="$(cat notes.md)"
   ```

The workflow runs `npm test` on Ubuntu, macOS and Windows at Node 22.22.2 (browser tests on Ubuntu only), builds into `dist/` and checks the build is byte-for-byte the bundle the tests ran against, bumps `version` in both `plugin.json` manifests, pins the marketplace entry to `vX.Y.Z`, commits that to `main`, tags it `vX.Y.Z`, and creates a GitHub Release with the notes and each output's size. If `main` moved while the tests ran, the push fails and nothing is released; run it again.
