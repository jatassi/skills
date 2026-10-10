# Set up pstack

In this page you install the plugin, pick which models pstack uses, and run your first task. Setup is one command plus a short conversation.

## Install the plugin

In Claude Code, run:

```text
/plugin install pstack --marketplace jatassi/skills
```

Claude Code asks you to approve the marketplace and choose an install scope, then confirms the plugin is installed. pstack needs Claude Code v2.1.292 or later, which added the Agent tool's `effort` parameter.

Each skill's full name carries the plugin prefix, such as `/pstack:poteto-mode`. The `/` menu also finds a skill by its bare name, which is how this guide writes them.

pstack's playbooks open a todo list through Claude Code's task tools. On Opus 5.5, Sonnet 5.5, and other newer models, a local session leaves those tools out unless you opt in. Export `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` before you start Claude Code, for example `CLAUDE_CODE_ENABLE_TODO_TOOLS=1 claude`. Cloud and background sessions already have them.

## Pick your models

Run:

```text
/setup-pstack
```

[`/setup-pstack`](../../skills/setup-pstack/SKILL.md) detects the models you have access to, asks for a reasoning budget, shows you each role (code delegates, judgment, the review panels), and asks what you want. Answer the questions. It writes `~/.claude/rules/pstack-models.md`, a small rule every pstack skill reads. Cloud sessions, including a Project's cloud threads, don't read `~/.claude`, so setup also offers to put the same lines in a repository's `.claude/rules/pstack-models.md` or in Project instructions.

The defaults run Opus at `high` reasoning for judgment and `medium` for code, so no budget matches them exactly. Answer "defaults" to keep them. A budget sets every role to one level. `unlimited` lifts each model to its highest tier, up to `max`. `large` sets `xhigh`. `medium` and `small` lower the reasoning and spend fewer tokens.

You only override what you care about. A role with no line in the rule keeps the skill's default. To restore a default, delete that role's line. A rerun of `/setup-pstack` keeps any role whose model differs from the default. When a default changes, a rule written before the change still pins the old default, so delete those role lines, or delete the file, then run `/setup-pstack` again.

You might be wondering how to keep a role on the model you picked with `/model`. Set a role to `inherit-parent` and pstack omits the subagent `model` and `effort` fields, so the subagent inherits your parent session's model and effort. `inherit-parent` isn't a model alias. For a panel role the value is a list, and one subagent runs per entry, so the list length sets the panel size. Setup also configures `swarm workers`, the default model for every `/swarm` worker unless a race names a model for each arm.

## Accept the verification offer, or don't

At the end of setup, `/setup-pstack` looks for a way to prove app behavior in your project, either a `verify-*` skill or an existing harness. If it finds neither, it offers once to generate one with [`/create-verification-skill`](../../skills/create-verification-skill/SKILL.md).

Say yes and it writes `.claude/skills/verify-<app>/`, a project-local skill that teaches agents to drive your app the way a user does. It proves the skill works once before handing it over. Say no and setup moves on. You can run `/create-verification-skill` yourself any time. [Verify and ship](./06-verify-and-ship.md#create-a-project-verification-skill) covers it in depth.

If you're new to pstack, say yes. An agent that can check its own work keeps going until the check passes. An agent that can't hands every result back to you to check by hand. Of everything in this guide, the verification skill pays off the most.

After setup, start a new chat. The model rule applies to new sessions.

## Keep the cost in check

pstack spends extra tokens on subagents and review panels. That's the price of the rigor. To spend fewer:

- Rerun `/setup-pstack` and pick a smaller reasoning budget or cheaper models. A strong model in the main chat with cheaper, faster models in the code roles is a good split.
- Set a role to `inherit-parent` so it runs on the chat's own model.
- Shorten a panel list. Each entry runs one subagent.
- Save `/poteto-mode` for work that needs rigor. A small, obvious edit doesn't.

## Run your first task

Pick something real but small, and describe it the way you'd describe it to a colleague:

```text
/poteto-mode add a --json flag to this command. text output stays byte-identical. verify both.
```

Watch the todo list. Its first items are the matched playbook's steps copied in, the Feature playbook for this prompt. If `/poteto-mode` skips a step, the step stays in the list with `skip: <reason>`, so you can see what it chose not to do.

From here you can type normal follow-ups. To keep `/poteto-mode` on for the whole chat, run `/output-style` and pick `pstack:Poteto Mode`. That makes it an [output style](https://code.claude.com/docs/en/output-styles), which stays in context on every turn until you switch back to `Default`. The choice is saved for the project. The style works in the terminal, the desktop app, and the IDE extensions. In the desktop app, set `"outputStyle": "pstack:Poteto Mode"` in `.claude/settings.local.json` instead. It reaches a cloud session only when the session has pstack, such as a Project thread with pstack in Project settings > Plugins. Plain `/poteto-mode` adds the skill to one message, and it fades as the chat moves on.

Next: [Route work through `/poteto-mode`](./02-poteto-mode.md).
