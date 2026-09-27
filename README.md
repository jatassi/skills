# jatassi-skills

Agent skills, packaged both as a [Claude Code plugin](https://code.claude.com/docs/en/plugins) and as an [Agent Plugin](https://agent-plugins.org/specification).

## Skills

| Skill | What it does |
| --- | --- |
| [`auto-grill`](skills/auto-grill/SKILL.md) | A relentless interview where an agent stand-in answers in your place. |
| [`to-spec-and-tickets`](skills/to-spec-and-tickets/SKILL.md) | Take a build-graph parent: spec it in a comment on the parent, then cut it into linked, blocked sub-issues. |
| [`implement-loop`](skills/implement-loop/SKILL.md) | Orchestrate the implementation of a large task with several sub-tasks. |

## Install

### Claude Code

```
/plugin marketplace add jatassi/skills
/plugin install jatassi-skills@jatassi
```

### Agent Plugins clients

Point your client at this repository; the manifest is [`plugin.json`](plugin.json) at the root.

## Layout

```
.
├── plugin.json                  # Agent Plugins manifest
├── .claude-plugin/
│   ├── plugin.json              # Claude Code plugin manifest
│   └── marketplace.json         # Claude Code marketplace (this repo = one plugin)
└── skills/                      # Shared by both formats
    └── <skill>/SKILL.md
```

Keep `version` in `plugin.json` and `.claude-plugin/plugin.json` in sync when releasing.

## Development

`visual-grilling`'s CLI, server and round page are built from the TypeScript workspace in `packages/visual-grilling/`, outside the shipped skill folder.

```
npm install
npx playwright install chromium   # once, for the round page tests
npm test                          # type-check, build into packages/visual-grilling/.test-dist, run every test against it
```
