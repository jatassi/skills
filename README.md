# milliways

Agent skills, packaged both as a [Claude Code plugin](https://code.claude.com/docs/en/plugins) and as an [Agent Plugin](https://agent-plugins.org/specification).

## Skills

| Skill | What it does |
| --- | --- |
| [`auto-grill`](skills/auto-grill/SKILL.md) | A relentless interview where an agent stand-in answers in your place. |
| [`visual-grilling`](skills/visual-grilling/SKILL.md) | Grilling with each round shown as a page in the browser, answered and commented on there. Needs Node `^22.22.2 \|\| ^24.15.0 \|\| >=26`. |
| [`to-spec-and-tickets`](skills/to-spec-and-tickets/SKILL.md) | Take a build-graph parent: spec it in a comment on the parent, then cut it into linked, blocked sub-issues. |
| [`setup-milliways`](skills/setup-milliways/SKILL.md) | Make a repo a kitchen: the `docs/agents` config and its index, the one root `AGENTS.md` line, the GitHub labels and a model-role table detected from your harness. Safe to re-run. |
| [`how`](skills/how/SKILL.md) | Explain how a part of the codebase works, with explorer and explainer subagents. Vendored from [pstack](https://github.com/cursor/plugins/tree/main/pstack). |

### From Matt Pocock's skills

Vendored from [mattpocock/skills](https://github.com/mattpocock/skills), its Engineering and Productivity buckets. `ask-matt` and `setup-matt-pocock-skills` are left out: `make-it-so` and `setup-milliways` replace them. Skills marked * are model-invocable here, unlike upstream, so `make-it-so`'s playbooks can call them. Skills that read the issue tracker or triage labels find them through the `docs/agents/AGENTS.md` index that `setup-milliways` writes.

| Skill | What it does |
| --- | --- |
| [`code-review`](skills/code-review/SKILL.md) | Review a diff on two axes, the repo's standards and the originating spec, in parallel subagents. |
| [`codebase-design`](skills/codebase-design/SKILL.md) | Shared vocabulary for designing deep modules, seams and testable interfaces. |
| [`diagnosing-bugs`](skills/diagnosing-bugs/SKILL.md) | A diagnosis loop for hard bugs and performance regressions. |
| [`domain-modeling`](skills/domain-modeling/SKILL.md) | Build and sharpen the domain model: `GLOSSARY.md` terms and ADRs. |
| [`grill-me`](skills/grill-me/SKILL.md) | A relentless interview to sharpen a plan or design. |
| [`grill-with-docs`](skills/grill-with-docs/SKILL.md) * | A relentless interview that also writes ADRs and glossary entries as it goes. |
| [`grilling`](skills/grilling/SKILL.md) | Grill you about a plan, a round of numbered questions at a time. |
| [`handoff`](skills/handoff/SKILL.md) | Compact the conversation into a handoff document for another agent. |
| [`implement`](skills/implement/SKILL.md) * | Implement a piece of work from a spec or tickets, test-first, then review it. |
| [`implement-spec`](skills/implement-spec/SKILL.md) | Implement a whole spec and its tickets on one integration branch, with subagents per ticket. |
| [`improve-codebase-architecture`](skills/improve-codebase-architecture/SKILL.md) | Find deepening opportunities, report them as an HTML page, then grill through the one you pick. |
| [`pr`](skills/pr/SKILL.md) | Write a pull request body. |
| [`prototype`](skills/prototype/SKILL.md) | Build a throwaway prototype to answer a design question. |
| [`research`](skills/research/SKILL.md) | Investigate a question against primary sources and save the findings in the repo. |
| [`retro`](skills/retro/SKILL.md) | Run a retrospective on a coding session. |
| [`tdd`](skills/tdd/SKILL.md) | Test-driven development, red-green-refactor. |
| [`teach`](skills/teach/SKILL.md) | Teach you a skill or concept across sessions, within this workspace. |
| [`to-questionnaire`](skills/to-questionnaire/SKILL.md) | Turn a decision you can't answer alone into a questionnaire for someone else. |
| [`to-spec`](skills/to-spec/SKILL.md) * | Turn the conversation into a spec on the issue tracker. |
| [`to-tickets`](skills/to-tickets/SKILL.md) * | Break a plan or spec into tracer-bullet tickets with blocking edges. |
| [`triage`](skills/triage/SKILL.md) | Move issues and external pull requests through the triage labels, and write agent-ready briefs. |
| [`wait-what`](skills/wait-what/SKILL.md) | Re-pitch a message that didn't land. |
| [`wayfinder`](skills/wayfinder/SKILL.md) * | Plan work bigger than one session as a map of decision tickets, and resolve them one at a time. |
| [`wizard`](skills/wizard/SKILL.md) | Generate an interactive bash wizard for steps only a human can do. |
| [`writing-for-agents`](skills/writing-for-agents/SKILL.md) | How to write skills, `AGENTS.md` and any document an agent reads. |

Vendored skills are pinned to an upstream commit and changed only by the rewrites in [`vendor/substitutions.json`](vendor/substitutions.json) and the forks declared in [`vendor/forks.json`](vendor/forks.json) ([ADR 0004](docs/adr/0004-vendoring-pinned-upstreams-with-declared-forks.md)). Upstream licences are in [`LICENSES/`](LICENSES) and attributions in [`NOTICE`](NOTICE).

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
├── skills/                      # Shared by both formats; vendored skills sit beside our own
│   └── <skill>/SKILL.md
├── vendor/                      # upstream.json, substitutions.json, forks.json, checks.json
├── LICENSES/                    # upstream licences, vendored verbatim
├── NOTICE                       # upstream attributions
└── packages/                    # dev-only workspaces: visual-grilling's source, the vendor CLI
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

### Vendored skills

The vendor CLI in `packages/vendor/` keeps vendored skills equal to their pinned upstream after the substitution table, except for declared forks. [ADR 0004](docs/adr/0004-vendoring-pinned-upstreams-with-declared-forks.md) has the file formats and the full rules.

```
npm run vendor -- check                                  # fail on any undeclared divergence or check violation
npm run vendor -- sync                                   # re-derive every upstream at its pin (after editing vendor/*.json)
npm run vendor -- sync --to HEAD                         # move every pin to upstream HEAD, merging into forks
npm run vendor -- sync --upstream <name> --to <sha>      # move one pin to one commit
npm run vendor -- sync --overwrite                       # restore files that diverged without a declared fork
```

- **To vendor a skill**, add it under `include` in `vendor/upstream.json` and run `sync`.
- **To change a vendored file**, prefer a rule in `vendor/substitutions.json`. When the change isn't mechanical, edit the file and declare it in `vendor/forks.json` with its `kind` (`policy` or `port-feature`) and `why`.
- `packages/vendor`'s tests, which end with `check`, run whenever `vendor/`, `skills/`, `agents/`, `LICENSES/`, `NOTICE` or `.gitattributes` changes.
- **After a sync**, review the diff. Resolve any `CONFLICT` it printed, and include or exclude each new upstream skill it lists for triage.

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
