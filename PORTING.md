# Porting pstack to Claude Code

This repo is poteto's [pstack](https://github.com/cursor/plugins/tree/main/pstack) ported from Cursor to Claude Code. Everything that is not Cursor-specific is byte-for-byte upstream. This file records what changed and why, so the next upstream sync can repeat it.

## Pins

| Source | Commit | Imported as |
| --- | --- | --- |
| `cursor/plugins` `pstack/` | `df581122cde17e6e27686b5a448bde23e4ad4318` | commit `22c405b` (verbatim) |
| `cursor/plugins` `cursor-team-kit/skills/{deslop,control-cli,control-ui}` and `cursor-team-kit/LICENSE` (as `LICENSE-cursor-team-kit`) | `df3fb154fb982fb83f649de8646d4af6a0cb16b3` | commit `98a8f5c` (verbatim) |

## Syncing upstream

`git diff 98a8f5c` shows the whole port. Commits `22c405b` and `98a8f5c` are verbatim, so every upstream blob at the pins already exists here, and `git apply --3way` merges upstream changes around the port's edits.

To sync to a `cursor/plugins` commit `<new>`, run these in a `cursor/plugins` clone:

```sh
git diff df581122cde17e6e27686b5a448bde23e4ad4318 <new> --relative=pstack -- pstack > pstack.patch
git diff df3fb154fb982fb83f649de8646d4af6a0cb16b3 <new> --relative=cursor-team-kit -- \
  cursor-team-kit/skills/deslop cursor-team-kit/skills/control-cli cursor-team-kit/skills/control-ui cursor-team-kit/LICENSE > kit.patch
sed -i -E '/^(diff --git|--- a\/|\+\+\+ b\/)/s#references/bugbot-triage\.md#references/review-bot-triage.md#g' pstack.patch
sed -i -E '/^(diff --git|--- a\/|\+\+\+ b\/)/s#([ab])/LICENSE($| )#\1/LICENSE-cursor-team-kit\2#g' kit.patch
```

Then run `git apply --3way pstack.patch` and `git apply --3way kit.patch` in this repo. Lines the port never touched merge cleanly. Hunks that touch ported lines come back as conflicts, so resolve each by applying the concept map and the standard wording below. Then update the Pins table to `<new>`.

## Packaging

- `.cursor-plugin/plugin.json` became `.claude-plugin/plugin.json`. `homepage` and `repository` point at `https://github.com/jatassi/skills`. `logo`, `category`, `tags`, `skills`, and `agents` are gone. Claude Code reads `skills/` and `agents/` by default, and category and tags live on the marketplace entry. `assets/logo.png` stays as upstream shipped it, though nothing references it now.
- `.claude-plugin/marketplace.json` lists the plugin from the repo root under the `jatassi` marketplace. Install with `/plugin install pstack --marketplace jatassi/skills`. `claude plugin validate --strict .` passes.
- Plugin skills are namespaced (`/pstack:poteto-mode`). The `/` menu also finds a plugin skill by its bare name, so the text keeps upstream's `/poteto-mode`.
- `hooks/hooks.json` and `hooks/pstack-root.sh` are new. At session start, and at the start of every `pstack:*` subagent, they add one line naming pstack's install folder. Cursor lets an agent find a plugin's files on its own. Claude Code substitutes `${CLAUDE_PLUGIN_ROOT}` in a plugin's skill, command, and agent bodies as it loads them, but not in an output style or in a file opened with Read. So the output style, and every agent or session that reads a pstack SKILL.md with Read, needs the line. A `general-purpose` subagent gets no hook line, so its brief carries the path.
- `output-styles/poteto-mode.md` is new. It replaces Cursor's Custom Mode (`mode: true`, `icon`, `color`, `reminder` in the skill frontmatter). It carries the mode's reminder on every turn. The user turns it on by running `/output-style` and picking `pstack:Poteto Mode` (in the desktop app, by setting `outputStyle` in `.claude/settings.local.json`), which is saved for the project until they switch back to `Default`. It reaches a cloud session only where the session has pstack.

## Concept map

| Cursor | Claude Code |
| --- | --- |
| `Task` tool | `Agent` tool |
| `subagent_type: generalPurpose` | `general-purpose` |
| `subagent_type: "poteto-agent"`, `"Comment Sicko"` | `pstack:poteto-agent`, `pstack:comment-sicko` |
| `readonly: true` (Ask mode) | `general-purpose` with a read-only brief (the Agent tool has no readonly flag) |
| "agent mode (readonly strips MCP)" | never a read-only built-in type (`Explore`, `Plan`) for a delegate that edits, never a custom agent whose `tools` allowlist drops MCP |
| `resume` an agent | `SendMessage` to its ID or name |
| `environment: "cloud"` | `create_session` (Claude Code Remote) from a cloud session or Project thread, with the brief as `prompt`. A local session can't start cloud sessions, so it runs the worker as a background `Agent` with `isolation: "worktree"` |
| `cloud_base_branch` | `create_session`'s `source_revision`, or the brief names the pushed branch for a local worker |
| agent `is_background: true` | `background: true` |
| `AskQuestion` | `AskUserQuestion` |
| model slug `claude-opus-5-5-xhigh` (judgment, prose, hardest work) | `model: "opus"`, `effort: "high"` |
| model slug `grok-4.7-xhigh-fast` (code roles) | `model: "opus"`, `effort: "medium"` |
| `inherit-parent` / `auto` | `inherit-parent` kept (omit `model` and `effort`, which is Claude Code's default, the main conversation's model unless `CLAUDE_CODE_SUBAGENT_MODEL` is set), `auto` (Cursor Auto) dropped |
| "different model family" | "different model", never a less capable one. With no equally capable different model, the same model in a fresh context |
| `~/.cursor/rules/pstack-models.mdc` (`alwaysApply: true`) | `~/.claude/rules/pstack-models.md` (a user rule with no `paths` loads every session) |
| `~/.cursor/projects/<slug>/agent-transcripts/` | `~/.claude/projects/<slug>/<session-id>.jsonl`, with the slug being the working directory with every non-alphanumeric character turned into `-` |
| "the system prompt names the transcripts directory" | derive it from the working directory |
| the agent store (path in the system prompt) | `~/.claude/projects/<slug>/pstack/` |
| `~/.cursor/worktrees/<repo>/<name>` | `<repo>/.claude/worktrees/<name>` |
| `~/.cursor/skills/`, `.cursor/skills/` | `~/.claude/skills/`, `.claude/skills/` |
| `~/Library/Application Support/Cursor` caches | `~/.claude/file-history/<session>/` |
| `.cursor/settings.json` plugin enablement | `.claude/settings.json` `extraKnownMarketplaces` + `enabledPlugins` (local sessions), Project settings > Plugins (Project threads, Pro and Max), server-managed settings (every cloud session, Team and Enterprise) |
| Custom Mode (Option+Enter or Alt+Enter from the `/` menu) | the Poteto Mode output style |
| Agents Window, Cursor CLI (`agent`) | Claude Code (terminal, desktop app, IDE, claude.ai/code), `claude` CLI (`claude -p` headless) |
| the Cursor sidebar's pinned chats | the session list (pinned sessions in `claude agents`, or the desktop app's sidebar) |
| cloud agent | cloud session (Claude Code on the web) |
| the Cursor dashboard | claude.ai/code |
| Cursor Project | Project in Claude Code (project conversation plus threads) |
| Automations, `/automate` | routines, `/schedule` or claude.ai/code/routines |
| `.cursor/automations/benny/`, `.cursor/benny/` (benny's target-repo paths) | `.claude/automations/benny/`, `.claude/benny/` |
| Grok Bot woken over a webhook | a routine's API trigger: `POST https://api.anthropic.com/v1/claude_code/routines/<trig_id>/fire` with `Authorization: Bearer <token>`, `anthropic-beta: experimental-cc-routine-2026-04-01`, `anthropic-version: 2023-06-01`, and body `{"text": ...}` |
| Grok Bot's routine panel, `update_state` routine create, `SendToUser` secret-request card | claude.ai/code/routines (or `/schedule`, or `create_trigger` from a cloud session), the API trigger's URL and one-time token, and the user writes the token to `<ui-dir>/.token` from their own terminal |
| Bugbot | Claude Code Review (🔴 Important, 🟡 Nit, 🟣 Pre-existing) on Team and Enterprise, the built-in `/code-review` skill elsewhere |
| the agentic security review | the `claude-code-security-review` Action, or `/security-review` locally |
| Origin (`origin pr ...`) | removed, `gh` is the only forge |
| Cursor's built-in `babysit` skill | Claude Code's built-in PR auto-fix (`/autofix-pr`) |
| Cursor's built-in `create-skill` | Anthropic's `skill-creator` skill and the skill authoring best practices |
| `cursor-team-kit` (`deslop`, `control-cli`, `control-ui`) | vendored into `skills/` |
| `cursor-team-kit` `verify-this` | Claude Code's bundled `/verify`, or the project's `verify-<app>` skill |
| `/loop` | Claude Code's bundled `/loop` (a cloud root uses `send_later`, since a paused cloud container drops `/loop` wakeups) |
| `cursor.com/docs/skills`, `cursor.com/docs/subagents`, `cursor.com/blog/projects` | `code.claude.com/docs/en/output-styles`, `.../sub-agents`, `.../claude-projects` |
| `github.com/cursor/plugins/tree/main/pstack` as "this repo" | `github.com/jatassi/skills` (upstream credited in the README) |

## Standard wording

Apply these verbatim to new upstream text that needs them.

- **Routing note.** Once near the top of a skill that runs another pstack skill and gives no path for it. "pstack's skills live beside this one, at `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md`. Most set `disable-model-invocation: true`, so Claude Code refuses them through the Skill tool. Don't call it for them. To run one, read its SKILL.md in full." A skill that names principles by their short name adds "For a principle skill named **`<x>`**, `<name>` is `principle-<x>`."
- **Install folder.** In a file read outside a loaded skill (the output style, the agents, benny). "pstack's install folder, which Claude Code names at session start ("pstack is installed at ...")".
- **Model rule.** On the first mention in a file. "`~/.claude/rules/pstack-models.md` (in a cloud session, the same lines in the repo's `.claude/rules/pstack-models.md` or the Project instructions)". Later mentions say "the rule".
- **GitHub in a cloud session.** Once in each PR playbook a cloud owner or verifier follows (babysit, shipping, opening-a-pr, autopilot-full, autopilot-stack, multi-phase-plan). "In a cloud session the GitHub proxy rejects GraphQL, so `gh pr ...` and the watcher fail there. Use the session's GitHub MCP tools (`mcp__github__*`: PR reads, review threads, resolving threads, replies, auto-merge, merge) and `gh api` REST for the rest, and wake on `subscribe_pr_activity` events instead of the watcher."

## Decisions

- **Models.** Every role runs on Opus 5.5. Code roles (Cursor's fast Grok slot) default to `opus medium`, and the hardest work, prose, judgment, and every panel seat default to `opus high`. Panels stay panels. Arena, architect, and interrogate run two `opus high` entries, so their seats differ by fresh context rather than by model. Wherever pstack asks for a different model, it never picks a less capable one. No budget matches these mixed defaults, so `/setup-pstack` offers "defaults" alongside its four budgets, and changes any role.
- **`disable-model-invocation` stays.** It means the same thing in both harnesses. The skill is user-only and its description stays out of context. In Claude Code it also makes the Skill tool refuse the skill, so skills that route to other pstack skills carry the routing note telling Claude to read the sibling SKILL.md instead. The one exception is `maintain-verification-skill`, which upstream's guide runs on a schedule. Claude Code won't run a `disable-model-invocation` skill from a scheduled task.
- **Task tools.** Playbooks open a todo list. Claude Code's task tools are off by default on Opus and Sonnet 5.5 in local sessions, so the router and the phase-driven skills fall back to a checklist in the reply, and the README says how to turn them on (`CLAUDE_CODE_ENABLE_TODO_TOOLS=1`).
- **Cloud sessions and plugins.** A cloud session doesn't install the plugins a repo enables. On Pro and Max, pstack reaches cloud work as a thread of a Project with pstack in Project settings > Plugins. The project conversation itself loads no plugins, so users start thread work with `/poteto-mode`, or put "before every task, read pstack's poteto-mode SKILL.md in full and follow it" in the Project instructions. Projects aren't on Team or Enterprise yet. There an Owner installs pstack for every cloud session through server-managed settings (`extraKnownMarketplaces` + `enabledPlugins`).
- **GitHub in cloud sessions.** The cloud GitHub proxy rejects GraphQL, so `gh pr ...` and the watcher fail there. The PR playbooks fall back to the session's GitHub MCP tools and `gh api` REST, and wake on `subscribe_pr_activity`.
- **watch-pr.** It detects Claude Code Review instead of Bugbot. A thread counts when its first comment's author is `claude` and the body carries a 🔴, 🟡, 🟣, or `bughunter-severity` marker. It counts passes per review. The review-threads query adds `pullRequestReview { id }` and `originalCommit { oid }`, and the pass key is the review id, or the comment's original commit when there is no review. A pending check whose name contains `claude code review` counts as review automation running. The JSON fields `isBugbot` and `bugbotReviewPasses` are now `isReviewBot` and `reviewBotPasses`, and the `--pretty` line's `isBugBot=` and `bugbotReviewPasses=` are now `isReviewBot=` and `reviewBotPasses=`.
- **Scripts.** `worktree-audit.sh` finds transcripts under `~/.claude/projects/` by the main checkout's exact slug, its `<slug>--claude-worktrees-*` folders, and each worktree's own slug, never a bare prefix, and caps slugs at Claude Code's 200 characters. `orch/store.ts` no longer parses Origin's `[origin] PR #` rows from `gt info`. The tools package is `@pstack/poteto-mode-tools` (was `@cursor-skill/poteto-mode-tools`).
- **benny.** Claude routines have no Slack-message trigger. Each stage runs as an hourly routine that reads a lookback window (`budgets.lookback_hours`) through the Slack connector and claims a report with a reaction before working it. Hourly runs can overlap, so claimed reports are skipped. Repro claims a report only after triage's verdict lands. Routines act as their owner. Triage posts as a distinct Slack bot through `BENNY_SLACK_BOT_TOKEN`, kept as a network secret on the routines' environment (an environment variable on Team and Enterprise). The proxy adds that secret to every request in the session, so with it configured the coordinator does every step itself. Without a bot, triage posts as the owner, who then never posts Benny markers or claim reactions by hand. On Team and Enterprise, Claude Tag watching the source channel is another route.

## Known gaps

- Origin has no Claude analog. Stacks land through `gh` only.
- Claude Code Review is Team and Enterprise. Other plans run Claude Code's built-in `/code-review` skill on the PR in its place, which reviews the diff in fresh subagents, and `review-bot-triage.md` triages its findings the same way. Each run counts as one pass. watch-pr recognizes only Claude Code Review's comments, so it neither counts nor waits on a `/code-review` run.
- A local session can't start a cloud session programmatically. `claude --cloud "<task>"` is rejected in non-interactive runs, and `create_session` exists only inside cloud sessions. So a local root runs its workers as worktree subagents on this computer, and work that must outlive the laptop needs its root in a cloud session or Project thread. The Agent tool's `isolation: "remote"` is not used, since it does not reliably start a cloud session.
- Routines start a fresh cloud session per fire. Cursor's webhook could wake the same bot conversation.
- The guide's illustrations show robots whose heads echo Cursor's cube logo. They are upstream art and stay as they are.
- pstack needs Claude Code 2.1.292 or later (the Agent tool's `effort` parameter).
