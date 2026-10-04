# milliways

Agent skills, packaged both as a [Claude Code plugin](https://code.claude.com/docs/en/plugins) and as an [Agent Plugin](https://agent-plugins.org/specification).

## Skills

| Skill | What it does |
| --- | --- |
| [`auto-grill`](skills/auto-grill/SKILL.md) | A relentless interview where an agent stand-in answers in your place. |
| [`visual-grilling`](skills/visual-grilling/SKILL.md) | Grilling with each round shown as a page in the browser, answered and commented on there. Needs Node `^22.22.2 \|\| ^24.15.0 \|\| >=26`. |
| [`to-spec-and-tickets`](skills/to-spec-and-tickets/SKILL.md) | Take a build-graph parent: spec it in a comment on the parent, then cut it into linked, blocked sub-issues. |
| [`setup-milliways`](skills/setup-milliways/SKILL.md) | Make a repo a kitchen: the `docs/agents` config and its index, the one root `AGENTS.md` line, the GitHub labels and a model-role table detected from your harness. Safe to re-run. |
| [`trust-ladder`](skills/trust-ladder/SKILL.md) | Score each area of a kitchen on the trust ladder from its merged pull requests: clean streaks, unclean merges, promotions and demotions due, and yesterday's merges ranked by risk, as JSON. |

### From pstack

Vendored from [pstack](https://github.com/cursor/plugins/tree/main/pstack), with the four [cursor-team-kit](https://github.com/cursor/plugins/tree/main/cursor-team-kit) skills it depends on, ported from Cursor to Claude Code. Model roles come from the `docs/agents/models.md` that `setup-milliways` writes. Its two agents, `poteto-agent` and `comment-sicko`, are in [`agents/`](agents) and dispatch as `milliways:<name>`. Left out: `bro` (Matt's `wait-what` covers it), `setup-pstack` (replaced by `setup-milliways`), `make-bot-ui` and the Benny automations (Cursor-only), and the `orch` CLI (the orchestrate ledger lives in GitHub). The skills `make-it-so`'s playbooks call are model-invocable here, unlike upstream.

| Skill | What it does |
| --- | --- |
| [`make-it-so`](skills/make-it-so/SKILL.md) | The kitchen's router, pstack's `poteto-mode` renamed: it routes the task (prototype what running can answer, grill what only the chef holds, wayfinder what outgrows one context), binds the thread to a playbook, and holds it to pstack's principles and subagent defaults. The playbooks call Matt's skills where they own the job, end with a reflect step that files `garden` issues, and gate autopilot merges on the trust ladder. |
| [`architect`](skills/architect/SKILL.md) | Sketch types, signatures and module structure before code, then stay in the loop while it is filled in. |
| [`arena`](skills/arena/SKILL.md) | Run N candidates at the same task, pick a base and graft the best parts of the rest into it. |
| [`automate-me`](skills/automate-me/SKILL.md) | Draft or revise your personal `-mode` skill from how you work. |
| [`benchmark-checklist`](skills/benchmark-checklist/SKILL.md) | Vet a performance measurement before you report or act on it. |
| [`blast-radius`](skills/blast-radius/SKILL.md) | Find what a change could break beyond the diff, and prove the fact it is safe because of. |
| [`correct`](skills/correct/SKILL.md) | Find the mistakes agents keep repeating in a repo and make each one impossible. |
| [`create-verification-skill`](skills/create-verification-skill/SKILL.md) | Generate a project-local skill that drives your app the way a user does. |
| [`explain`](skills/explain/SKILL.md) | Explain a body of work plainly, built on `how` and `why`. pstack calls it `teach`. |
| [`figure-it-out`](skills/figure-it-out/SKILL.md) | Design an auditable playbook when no narrower one fits. |
| [`how`](skills/how/SKILL.md) | Explain how a part of the codebase works, with explorer and explainer subagents. |
| [`interrogate`](skills/interrogate/SKILL.md) | Adversarial review of a change by several reviewers from independent angles. |
| [`maintain-verification-skill`](skills/maintain-verification-skill/SKILL.md) | Keep a project's verification skill and feature map honest. |
| [`no-comments`](skills/no-comments/SKILL.md) | Run the `comment-sicko` agent over a diff, fix accepted findings and encode claimed constraints. |
| [`recall`](skills/recall/SKILL.md) | Reconstruct your recent working context from your chat history and the shared record. |
| [`reflect`](skills/reflect/SKILL.md) | Review the session transcript with three subagents and route each learning to a skill edit. |
| [`show-me-your-work`](skills/show-me-your-work/SKILL.md) | Keep a reviewable decision trail for long-running or unattended work. |
| [`swarm`](skills/swarm/SKILL.md) | Fan out N parallel workers in their own worktrees, drain them and return one report. |
| [`tdd-bug-fix`](skills/tdd-bug-fix/SKILL.md) | Fix a bug test-first when there is a cheap local test target. pstack calls it `tdd`. |
| [`technical-writing`](skills/technical-writing/SKILL.md) | A layered technical-writing standard for docs, RFCs, readmes and PR descriptions. |
| [`typescript-best-practices`](skills/typescript-best-practices/SKILL.md) | TypeScript best practices. |
| [`unslop`](skills/unslop/SKILL.md) | Cut AI tells from any writing. |
| [`why`](skills/why/SKILL.md) | Find out why something is the way it is, from every evidence source the session can reach. |
| `principle-*` | pstack's 24 engineering principles, one leaf skill each, indexed from `make-it-so`. |
| [`deslop`](skills/deslop/SKILL.md) | Remove AI-generated code slop. From cursor-team-kit. |
| [`control-ui`](skills/control-ui/SKILL.md) | Build or adapt a local browser harness to drive and inspect a UI. From cursor-team-kit. |
| [`control-cli`](skills/control-cli/SKILL.md) | Build or adapt a local harness to drive and profile a CLI or TUI. From cursor-team-kit. |
| [`make-pr-easy-to-review`](skills/make-pr-easy-to-review/SKILL.md) | Prepare a PR for review without changing its behaviour. From cursor-team-kit. |

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
| [`pr`](skills/pr/SKILL.md) | Open a pull request with the kitchen's PR anatomy, or a draft prototype PR for the chef to pick a variant. |
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
├── agents/                      # Claude Code subagents (vendored from pstack), dispatched as milliways:<name>
├── vendor/                      # upstream.json, substitutions.json, forks.json, checks.json
├── LICENSES/                    # upstream licences, vendored verbatim
├── NOTICE                       # upstream attributions
└── packages/                    # dev-only workspaces: visual-grilling's source, the vendor CLI
```

## Development

`visual-grilling`'s CLI, server and round page are built from the TypeScript workspace in `packages/visual-grilling/`, outside the shipped skill folder. `setup-milliways`'s CLI ships as plain Node in `skills/setup-milliways/scripts/`, and its tests live in `packages/setup-milliways/`; `trust-ladder`'s scorer is the same, in `skills/trust-ladder/scripts/` with tests in `packages/trust-ladder/`.

```
npm install
npx playwright install chromium   # once, for the round page tests
npm test                          # test only the workspaces changed since the merge-base with dev
npm run test:all                  # every workspace: visual-grilling type-checks, builds into .test-dist and tests that; setup-milliways and trust-ladder test their CLIs
npm run test:bun                  # pstack's vendored Bun scripts and their upstream tests; needs Bun, not part of npm test
npm run try                       # build into skills/visual-grilling/dist/, then: claude --plugin-dir .
```

`npm test` picks workspaces with [`scripts/test.mjs`](scripts/test.mjs): a workspace at `packages/<name>` runs when `packages/<name>/` or `skills/<name>/` changed, or a prefix listed in its package.json `testPaths`. Changing root `package.json` or the lockfile runs everything, unless the change only adds a workspace, which then runs alone. `--dry-run` prints the pick without running it.

The vendored pstack scripts run on Bun. `npm run test:bun` finds every `skills/*/scripts/package.json` with a test script and runs it; the Release workflow does the same on Ubuntu for pull requests into `main`. Cloud environments that use these scripts must install Bun in their setup script.

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
