# benny automation intent

## what i want to automate

i want two claude code routines that work together in one slack issue channel.

### routine 1: triage issue reports

- trigger: i want this routine to run hourly, read the top-level reports posted in my configured source slack channel within a configured lookback window through the slack connector, skip reports that already have a verdict or a triage claim, claim each remaining report with a reaction before working it, and keep each report's original thread coordinates.
- behavior: i want it to read the thread and attachments, classify the report as a bug or performance issue, feature request, question or feedback, or reroute, and trace the likely owning layer before routing.
- tracker: i want it to search my configured tracker for duplicates, update a confident duplicate, and create a ticket only for a clear net-new bug.
- tools: i want slack channel read, thread reply, and reaction access, my configured tracker integration, and my optional routing map.
- outcome: i want exactly one reply in the source thread with a short verdict and `[benny:bug]`, `[benny:performance]`, or `[benny:other]`. a bug or performance marker may include the tracker url.
- boundary: i never want this routine to post a root message in the source channel.

### routine 2: reproduce and fix confirmed bugs

- trigger: i want this routine to scan the same lookback window on its own hourly run, or use another supported trigger chosen during setup. i want it to take only reports whose original thread already carries the trusted triage marker and whose root has no repro claim, and to claim each with a reaction before working it. a report still waiting for its marker stays unclaimed for a later run.
- gates: i want it to stop when someone clearly owns the fix. if an existing pull request or merged commit may fix the report, i want verification instead of a competing change.
- behavior: i want it to use my configured control adapter and feature map, reproduce the exact symptom twice through the real ui, and capture screenshots, video, and a read-only state cross-check.
- fix: i want it to verify existing pull requests without authoring over them. after a confirmed repro, it may attempt one bounded root-cause fix, use tdd when the test is cheap, smoke the blast radius, and open a draft pull request only when before-and-after proof passes.
- tools: i want slack channel read, thread reply, and reaction access, repository and history access, draft pull request creation, my configured tracker, and my control adapter.
- outcome: i want evidence and a verified result in the source or optional operations threads, plus an optional draft pull request. updates should be concise.
- boundary: i never want this routine to post a root message in the source channel.

### shared rules

- i want the source channel and root thread coordinates to stay immutable for the whole run.
- i treat utility and debug bots as evidence, not delegation or fix ownership.
- i allow subagents to help, but they cannot post to slack or receive slack credentials.
- routines act as me, so slack connector posts appear as my account. i want triage to post as a distinct slack bot through `BENNY_SLACK_BOT_TOKEN`, kept as a network secret on the routines' cloud environment (on team and enterprise, an environment variable there), or else as my own account, in which case i never post benny markers or claim reactions by hand.
- i want this entire pack committed at `.claude/automations/benny/` in the target repository. its `SKILL.md` files are direct routine instructions, not registered plugin skills.
- i want pstack enabled for the routines through Project settings > Plugins in the claude code project that runs them (on team and enterprise, through an owner's server-managed settings), and through the target repository's committed `.claude/settings.json` for local sessions, only for shared dependencies such as `how`, `why`, `tdd`, `unslop`, and the required principle skills.
- i want each live routine prompt to read its committed operational file directly. i do not want plugin cache paths, copied excerpts, or slash-skill discovery.
- i keep user-owned configuration, feature maps, routing maps, and secrets outside `.claude/automations/benny/` so pack refreshes cannot overwrite them.
- i want both routines to fail closed when channel coordinates, tracker access, the control adapter, or the feature map are missing or uncertain.
- i want draft pull requests only. do not merge or deploy.

### my configuration

- source slack channel: `<channel>`
- optional operations channel: `<channel or none>`
- repository and default branch: `<repo>`, `<branch>`
- tracker: `<type, team, project, labels, intake status>`
- routing map: `<path or none>`
- triage identity: `<slack bot through BENNY_SLACK_BOT_TOKEN, or my own slack user>`
- control skill: `<configured skill or adapter>`
- feature map: `<committed same-repo path outside the copied pack, or behavior to paraphrase>`
- models: `<triage, reproduce, code, media review>`
- status emoji strings: `<seen, triage claim, repro claim, reproducing, reproduced, blocked, fixing, failed, pull request opened>`
- budgets: `<polling, lookback, verdict wait, follow-up, repro, rejection, fix>`
- optional bot token capability: `<none, triage identity, file download, or editable operations status>`

start from [`configuration.example.yaml`](./templates/configuration.example.yaml) and [`feature-map.example.md`](./skills/reproduce-and-fix-issues/references/feature-map.example.md). copy and fill them outside this pack, for example under `.claude/benny/`. keep secret values in a secret manager or environment.

## for the agent

the human enters setup by pointing claude code at this file. do not look for or invoke a discovered benny slash skill.

1. ask which repository will run the routines.
2. treat the directory containing this `FOR_AGENTS.md` as the source pack.
3. merge the entire source pack into `<target-repository>/.claude/automations/benny/`.
4. preserve every destination-only file. never delete unrelated files or overwrite user-owned configuration, feature maps, or routing maps.
5. when an existing destination file at a source-managed path differs, review the diff and merge without discarding local edits. if ownership is ambiguous, stop and ask before replacing it.
6. verify that the copied `FOR_AGENTS.md` and `skills/setup-benny/SKILL.md` exist in the target repository.
7. read and follow `.claude/automations/benny/skills/setup-benny/SKILL.md` directly from the target repository.

i want you to merge this entry into the target repository's `.claude/settings.json` for local sessions:

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

preserve every unrelated setting and plugin. keep the file strict json, with no comments or trailing commas.

routines do not install plugins from `.claude/settings.json`. i want pstack added under Project settings > Plugins in the claude code project that will run the routines, with the target repository in that project. projects are on pro and max. on team and enterprise, i want an owner to install pstack for every cloud session through server-managed settings instead. i want verification from a new cloud thread that the project conversation starts for the check, or on team and enterprise a new cloud session. confirm that claude code names pstack's install folder at the session's start ("pstack is installed at ...") and that the `SKILL.md` of pstack's `how`, `why`, `tdd`, `unslop`, and the principle skills used by benny is under it. do not count skills loaded from the current session or a user-scoped install.

if no route gets pstack to the routines (a claude code project's threads, server-managed settings, or, for the claude tag route, the source channel as a claude tag plugin), or any shared dependency is missing, stop and explain what failed. do not add `.claude/automations/benny/skills/` to a plugin manifest or expect its files to appear in the slash-skill list.

tell me that `.claude/settings.json`, `.claude/automations/benny/`, and any referenced secret-free configuration must be committed before either routine is enabled. do not create or update a routine until i explicitly ask.

for first-time creation, write one request for triage and one for repro and fix, and have me send each in that project's conversation, so both run as its threads. on team and enterprise, i send each with `/schedule` or create it at claude.ai/code/routines. complete the review of the first routine on its page, opened from the project's Routines tab or claude.ai/code/routines, before starting the second.

paraphrase this intent and the finished configuration into each request. the triage prompt must read and follow `.claude/automations/benny/skills/triage-issue-reports/SKILL.md`. the repro prompt must read and follow `.claude/automations/benny/skills/reproduce-and-fix-issues/SKILL.md`. use these repo-relative paths only after you confirm they are committed on the default branch of the repository where the routine will run.

for existing routines, do not use the project conversation or `/schedule` to inspect or update them. validate the configuration, then use the concise field checklist in the copied setup file so i can edit each routine directly on its page. do not create duplicates.
