# benny

benny gives you two claude code routines for slack issue reports. one triages each report. the other reproduces confirmed bugs and may prepare a small draft fix.

the files in this directory are dormant setup and automation sources. they do not appear as slash skills.

## set it up

1. point claude code at [`FOR_AGENTS.md`](./FOR_AGENTS.md) and name the target repository.
2. let setup merge this whole directory into the target at `.claude/automations/benny/`. it must preserve destination-only files and review conflicts instead of overwriting local edits.
3. let setup enable pstack in the target repository's `.claude/settings.json` for shared dependencies in local sessions:

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

4. keep user-owned configuration outside the copied pack, for example in `.claude/benny/`. adapt [`configuration.example.yaml`](./templates/configuration.example.yaml) and [`feature-map.example.md`](./skills/reproduce-and-fix-issues/references/feature-map.example.md).
5. commit `.claude/settings.json`, `.claude/automations/benny/`, and any secret-free configuration before enabling either routine.
6. ask a claude code project with the target repository and pstack under Project settings > Plugins for each new routine and review it on its page, or update existing routines on their pages. projects are on pro and max. on team and enterprise, an owner installs pstack for every cloud session through server-managed settings, and you create each routine with `/schedule` or at claude.ai/code/routines. then send a harmless test report and verify every source-channel post stays in the original thread.
