---
name: setup-benny
description: Configure Benny and prepare its triage and repro routines. Use when installing Benny or changing its Slack, tracker, repository, routing, control, model, or budget settings.
disable-model-invocation: true
---

# Set up Benny

Benny ships as a dormant automation pack inside pstack. The plugin exposes only pstack's normal skill root; this file and the two operational files are not slash skills.

The human enters setup by pointing Claude Code at the pack's `FOR_AGENTS.md`. The bootstrap flow copies the whole pack into the target repository, then reads this file directly at `.claude/automations/benny/skills/setup-benny/SKILL.md`.

Benny needs external configuration and two live Claude Code routines.

Do not create or update a routine until the user explicitly asks. Never put a secret value in plugin files, prompts, or committed configuration.

## 1. Copy the pack and enable shared pstack skills

Do this before asking for Benny configuration and before requesting either routine.

Ask which repository will run the routines. The source pack is the directory containing `FOR_AGENTS.md`. The destination is `<target-repository>/.claude/automations/benny/`.

Merge the entire source pack into the destination:

1. Create the destination when it is absent.
2. Copy every source file to the same relative path.
3. Preserve destination-only files. Never delete unrelated files during install or refresh.
4. Keep user-owned configuration, feature maps, and routing maps outside the destination. Never overwrite them.
5. When an existing source-managed file differs, inspect the diff and merge without discarding local edits. If ownership is ambiguous, stop and ask before replacing it.
6. Verify that the destination contains `FOR_AGENTS.md`, this setup file, both operational files, their references, and the templates.

If this file is already being read from the target destination, treat the copy as complete and run the same verification before continuing.

Add pstack to the target repository's `.claude/settings.json` for local sessions. If the file or `.claude` directory does not exist, create it.

Merge this entry into the existing JSON:

```json
{
	"extraKnownMarketplaces": {
		"jatassi": {
			"source": { "source": "github", "repo": "jatassi/skills" }
		}
	},
	"enabledPlugins": {
		"pstack@jatassi": true
	}
}
```

Preserve every unrelated top-level setting and every other plugin entry. If `enabledPlugins` already has `pstack@jatassi`, change only its value. Keep the file strict JSON, with no comments or trailing commas. Validate the file after editing it.

Routines run as cloud sessions, which do not install plugins from `.claude/settings.json`. On Pro and Max plans, ask the user to add pstack under Project settings > Plugins in the Claude Code Project that will run both routines, with the target repository in that Project. Projects aren't on Team or Enterprise plans yet. There, ask an Owner to install pstack for every cloud session through server-managed settings, by adding the `extraKnownMarketplaces` and `enabledPlugins` entries above at Organization settings > Claude Code > Managed settings.

Have the user start a fresh cloud session for this check. On Pro and Max, that is a new cloud thread the Project conversation starts. On Team and Enterprise, it is a new cloud session at claude.ai/code with the target repository. In it, confirm that Claude Code named pstack's install folder at session start ("pstack is installed at ..."). These skills set `disable-model-invocation: true`, so they don't appear in the session's skill list and the Skill tool refuses them. Confirm instead that each has a `SKILL.md` at `skills/<name>/SKILL.md` under that folder:

- `how`
- `why`
- `tdd`
- `unslop`
- `principle-separate-before-serializing-shared-state`
- `principle-minimize-reader-load`
- `principle-guard-the-context-window`
- `principle-sequence-verifiable-units`
- `principle-fix-root-causes`
- `principle-prove-it-works`

Do not count a skill loaded from the current session or a user-scoped plugin. The check must show that a fresh thread in that Project receives pstack through Project settings > Plugins, or, on Team and Enterprise, that a fresh cloud session receives it through server-managed settings.

If no route gets pstack to the routines (a Project's threads, server-managed settings, or, for the Claude Tag route, the source channel as a Claude Tag plugin), or any shared dependency is missing, stop and explain the failure.

The Benny files are read directly from `.claude/automations/benny/`. Do not add that directory to a plugin manifest or expect its `SKILL.md` files to appear in the slash-skill list.

Tell the user that `.claude/settings.json`, `.claude/automations/benny/`, and any referenced secret-free configuration must be committed before either routine is enabled. Do not commit them unless the user asks.

Once this check passes, live routine prompts may read the committed operational files by their stable repository-relative paths. They must not embed a plugin cache path or copy the file contents.

## 2. Adapt the configuration

Open these copied examples:

- `../../templates/configuration.example.yaml`
- `../reproduce-and-fix-issues/references/feature-map.example.md`

Create user-owned copies outside `.claude/automations/benny/`. These are configuration files, not pack files. Example locations:

- Project config, such as `.claude/benny/configuration.yaml`
- Project feature map, such as `.claude/benny/feature-map.md`
- Project routing map, such as `.claude/benny/routing.md`
- User config, such as `~/.config/benny/configuration.yaml`
- User feature map, such as `~/.config/benny/feature-map.md`

Fill one feature-map section for every user-facing feature the routine may reproduce. Keep it at the user point of view. Do not freeze implementation details or current code paths in the map.

Do not edit the copied examples. Pack refreshes may update source-managed files after conflict review, but they must never touch the user-owned copies.

Prefer committed, secret-free files in the target repository when a fresh routine checkout must read them. Otherwise paraphrase the required values into the live prompt. Reference a repository file only after you confirm that the file is committed on the default branch of the repository where the routine runs.

Use stable repository-relative paths for committed pack and configuration files. Never reference the plugin source directory or a plugin cache path from a live routine.

## 3. Fill the required choices

Ask for or confirm:

- Source Slack channel ID
- Optional operations or status channel ID
- Repository URL and default branch
- Triage identity or Slack user ID
- Issue tracker type, team, project, labels, and intake status
- Tracker adapter skill or MCP actions
- Optional routing map path
- Required control skill name
- Required user-facing feature-map path
- Status emoji strings, plus the triage and repro claim reactions as Slack reaction names (such as `compass`), not Unicode characters
- Pull request URL format
- Polling, lookback, and effort budgets
- Model and effort for triage, repro, code work, and media review

Use only models shown as available in the routine form's model selector or `/model`. Do not guess a model and do not carry over a private default.

The source channel, triage identity, repository, tracker adapter, control skill, and feature map must be explicit. Fail setup if any required value stays ambiguous.

Use pstack's `unslop` skill on the final routine names and prompt shims before saving them. `unslop` sets `disable-model-invocation: true`, so Claude Code refuses it through the Skill tool. Don't call it for `unslop`. Read its SKILL.md in full, at `skills/unslop/SKILL.md` in pstack's install folder, which Claude Code names at session start ("pstack is installed at ...").

## 4. Check integration capabilities

The triage routine needs:

- Read access to the configured source Slack channel and its threads
- Thread-reply access in that channel
- Reaction add and read access in that channel, as the triage identity
- Attachment metadata and file download access when reports include media
- Search, read, create, and update access through the configured issue-tracker adapter

The repro routine needs:

- Read access to the configured source Slack channel and its threads
- Thread-reply access in the source channel
- Reaction add and read access in the source channel
- Optional post and edit access in the configured operations channel
- Repository read and history access
- A pull request action that can open a draft pull request
- The configured control-adapter skill

Prefer configured Slack connector actions for reads and posts. Routines act as their owner, so connector posts and reactions appear as the routine owner's Slack account. Choose the triage identity, the account whose markers repro trusts:

- A Slack bot. Triage adds its claim reactions and posts its verdicts through `BENNY_SLACK_BOT_TOKEN`. Set `slack.triage_uses_bot_token` to `true` and `slack.triage_identity_user_id` to the bot's Slack user ID.
- The routine owner. Leave `slack.triage_uses_bot_token` at `false` and set `slack.triage_identity_user_id` to the owner's own Slack user ID. Repro then trusts every marker that account posts, so tell the user never to post a Benny marker or add a Benny claim reaction by hand.

The optional `BENNY_SLACK_BOT_TOKEN` may also fill a narrow gap such as editing one operations status message or downloading an attachment. Keep it as a network secret named `BENNY_SLACK_BOT_TOKEN` on the cloud environment the routines run in, with Slack's hosts (`slack.com`, plus `files.slack.com` for downloads) as its allowed websites, never in YAML. The agent proxy adds it to every request the session sends to those hosts, a worker's included, and the session never sees the value. Because of that, no worker in that session can be kept from Slack's API. With the secret configured, both routines keep every step in the coordinator, per their hard rules, and check 6 passes only when the run spawned no worker. Network secrets are on Pro and Max plans. On Team and Enterprise, an environment variable of that name on the environment holds it instead, and anyone who uses that environment can read it.

Every routine run is a cloud session, where the GitHub proxy rejects GraphQL, so `gh pr ...` and `gh issue ...` fail. Build the pull request action, and any GitHub Issues tracker adapter, on the session's GitHub MCP tools (`mcp__github__*`) or `gh api` REST.

Do not use undocumented integration endpoints.

## 5. Prepare the routing map

If the user wants reroutes or owner pings:

1. Copy `../triage-issue-reports/references/routing.example.md` outside `.claude/automations/benny/`.
2. Replace every placeholder with public or organization-local values.
3. Keep owner pings off by default.
4. Allow a ping only for a configured feature owner or a confirmed likely regression author.

If no routing map is configured, triage may classify a report but must not guess a destination or owner.

## 6. Verify the control adapter

Read `../reproduce-and-fix-issues/references/control-adapter.md` and the user's completed feature map.

Confirm that the named skill can:

- Bring up the target app
- Navigate every mapped feature through the real UI
- Exercise mapped states through declared adapter actions
- Inspect state without forcing the result
- Capture screenshots
- Start and stop a recording
- Clean up its processes and temporary data

If any capability is missing, leave the repro routine disabled. It must fail closed rather than claim a reproduction it did not perform.

## 7. Prepare the live routines

Ask whether this is first-time creation or configuration of existing routines.

Read `../../FOR_AGENTS.md` from the copied pack as the primary user-intent source for either path. Use it to understand the two triggers, tools, instructions, outcomes, and shared rules.

### First-time creation

Create one routine at a time.

For each routine:

1. Read the matching copied prompt template as secondary internal source material.
2. Turn `FOR_AGENTS.md`, the finished Benny configuration, and the template intent into a complete natural-language request.
3. Tell the live prompt to read and follow its exact committed operational file under `.claude/automations/benny/`.
4. Use the stable repository-relative path, not a plugin source or cache path. Do not copy the operational file contents into the live prompt.
5. Name the configured Slack channel ID, the repository, and the needed connectors explicitly in the request.
6. Confirm that the copied pack and any referenced configuration files are committed on the default branch of the same repository where the routine will run.
7. Ask the user to send the request in the conversation of the Project whose threads load pstack. Routines Claude creates there run as threads of that Project. On Team and Enterprise, have the user send it with `/schedule` in the Claude Code CLI instead, or create the routine from it at claude.ai/code/routines. Until section 8 passes, set `slack.source_channel_id` in the configuration the routine reads, and the channel named in the request, to a test channel, so no scheduled run reads live traffic first.
8. Have the user open the saved routine from the Project's Routines tab (on Team and Enterprise, from claude.ai/code/routines), check its name, prompt, repository, environment, model, connectors, and trigger, and switch it off.
9. Finish the review of this routine before starting the next one.

Write this complete triage intent into the request, filled from configuration:

- Name `benny-triage`.
- Read and follow `.claude/automations/benny/skills/triage-issue-reports/SKILL.md` for every run.
- Trigger hourly on a schedule. Read the top-level reports posted in the configured source Slack channel in the last `budgets.lookback_hours` through the Slack connector. Skip reports that already carry a verdict or the triage claim reaction.
- Claim each remaining report with the triage claim reaction before working it. Add the claim and post the verdict as the configured triage identity.
- Read the triggering thread and reply only inside it.
- Use the configured issue-tracker integration.
- Classify, inspect evidence, trace cause, dedupe, and create only clear new bugs.
- End one thread-only verdict with the configured `[benny:bug]`, `[benny:performance]`, or `[benny:other]` marker and optional tracker URL.
- Never post a source-channel root message.

After the triage review is complete, write this complete repro and fix intent into the second request:

- Name `benny-reproduce`.
- Read and follow `.claude/automations/benny/skills/reproduce-and-fix-issues/SKILL.md` for every run.
- Trigger hourly on a schedule over the same lookback window in the configured source Slack channel. Take only reports that already carry a trusted bug or performance marker and no repro claim reaction, and claim each with that reaction before working it. Leave a report with no verdict yet for a later run.
- Use the configured repository and default branch.
- Read the source thread and reply only inside it.
- Include pull request creation and the configured tracker, control-adapter, and feature-map requirements. Paraphrase mapped user paths and states unless you confirm an eligible committed file in the same repository.
- Wait for a trusted triage marker before acting.
- Reproduce the exact symptom twice through the mapped real UI and capture evidence.
- Verify an existing fix without authoring over it.
- Attempt an optional bounded fix only after confirmed repro, then open a draft pull request when proof and checks pass.
- Never post a source-channel root message.

A Slack app or workflow can instead fire an API trigger, added on the routine's page, with the report's channel and timestamps as the fire text. On Team and Enterprise plans, Claude Tag can watch the source channel instead, with pstack attached to that channel as a Claude Tag plugin.

A triage claim reaction with no verdict after its run ended marks a run that stopped mid-report, for example on a usage limit. Removing that reaction hands the report to the next run while the report is still inside the lookback window.

Do not create either routine yourself, with `/schedule` or any other tool. On Pro and Max, only routines created from the Project load its plugins.

### Existing routines

Do not use the Project conversation or `/schedule` to search for, inspect, or update existing routines.

Finish configuration, routing, control-adapter, and feature-map validation. Then give the user this concise edit checklist.

For the existing triage routine, update:

- Name
- Direct instruction to read `.claude/automations/benny/skills/triage-issue-reports/SKILL.md`
- Hourly schedule trigger, lookback window, and source channel
- Slack channel read, thread reply, and reaction capabilities
- Issue-tracker integration
- Paraphrased triage instructions, claim reaction, thread-only rule, and Benny verdict markers

For the existing repro routine, update:

- Name
- Direct instruction to read `.claude/automations/benny/skills/reproduce-and-fix-issues/SKILL.md`
- Matching hourly schedule trigger, lookback window, and source channel
- Repository and default branch
- Slack channel read, thread reply, and reaction capabilities
- Pull request action
- Tracker, control-adapter, and feature-map requirements
- Paraphrased marker wait, claim reaction, evidence, verification, and bounded-fix instructions

Ask the user to update each existing routine directly on its page, opened from the Project's Routines tab (on Team and Enterprise, from claude.ai/code/routines). Do not create replacements or duplicates.

### Creation boundary

Never call a direct routine backend service or backend routine tool. Never use a browser URL that carries draft fields. Never build or open a `claude-cli://` deep link. For new routines, the only finish path is the Project's routine creation (on Team and Enterprise, the user's own `/schedule` or claude.ai/code/routines creation) followed by the user's review on the routine's page.

Do not switch either routine back on until the thread-safety test passes after the routine is saved.

## 8. Test thread safety

Use a test channel or a harmless test report. Start each test run with Run now on the routine's page. If Run now does not start a run while the routine is switched off, switch it on for the test only while its configured source channel is a test channel.

Before testing, confirm that the target repository's `.claude/settings.json`, `.claude/automations/benny/`, and every referenced secret-free configuration file are committed on the branch used by the routine checkout. Confirm that both live prompts point at their exact committed operational files. If any check fails, stop. Tell the user that the routine cannot be enabled yet.

Verify:

1. Triage stores the root `thread_ts` and posts exactly one verdict as a reply.
2. The verdict contains one configured marker.
3. Repro accepts the marker only from the configured triage identity.
4. Repro keeps the same immutable source coordinates.
5. No source-channel root message appears.
6. A delegated worker cannot use any Slack write action.
7. Missing coordinates, a deleted parent, or a failed preflight produces no post and no tracker issue.
8. Claude Code names pstack's install folder at the start of each run ("pstack is installed at ..."), and the run reads its shared pstack skills from that folder.
9. Each routine adds its claim reaction to the report root before working the report, repro adds its claim only after the verdict lands, and the next run of either routine skips the claimed report.

Enable normal traffic only after all nine checks pass. Then point both routines at the live channel. Set `slack.source_channel_id` back to the live channel in the configuration the routines read, and confirm that change is committed on the default branch when it lives in a committed file. Update the channel named in each routine's prompt on its page, then switch both routines on.
