---
name: setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Detects your available models and writes an always-applied rule that overrides the skill defaults. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Write `~/.claude/rules/pstack-models.md` (in a cloud session, the same lines in the repo's `.claude/rules/pstack-models.md` or the Project instructions), an always-applied rule that sets pstack's model per role.

## Steps

### 1. Detect available models

Enumerate the models you can pass in an `Agent` call in this session, which the `Agent` tool's `model` parameter lists (`sonnet`, `opus`, `haiku`, `fable`). That is the dependable source. If the user has shared what `/model` shows for their account, prefer it, since it shows which of these the account can run (a grayed-out row is not available). If you cannot detect any, ask the user to run `/model` and paste the models they have access to. Never write a real model you have not confirmed is available. The alias `inherit-parent` is always valid even though it is not a detected model.

### 2. Load current state

The default role-to-model mapping is the rule shape shown in step 5 below. If the rule already exists, read it and treat its `# budget` line and its role values as the current choices. Otherwise start from those defaults. A line whose role is not in step 5, such as `how critics`, is from a retired role. Drop it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Prefer AskUserQuestion over free text. Offer these four options with these exact labels, and name the current budget when the rule records one. With no rule, say that the skill defaults run judgment roles at `high` and code roles at `medium`, so no budget matches them exactly, and that the user can keep them by answering "defaults". Record that choice as `# budget: defaults`.

- `unlimited — max reasoning`
- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply it.** Build the working table from the skill defaults, and on a re-run keep any role you changed by family, list, or alias (`inherit-parent`). `unlimited`, `large`, `medium`, and `small` set the effort of every real model, panel entries included, to `max`, `xhigh`, `high`, or `medium`. The effort is the word after the model, on the ladder `max` > `xhigh` > `high` > `medium` > `low`. If a model rejects that level, use the highest level it accepts at or below the target, else mark the role as needing a choice. `inherit-parent` does not change. So `unlimited` turns `opus high` and `opus medium` into `opus max`. `large` turns both into `opus high`. `small` turns both into `opus medium`.

**(c) Show the roles and confirm.** Show every role with its model and effort, marking any real model not in the detected set as needing a choice. Also list each line step 2 dropped. Ask whether to accept as-is or change specific roles, offering the detected models, each at the budget's effort (such as `haiku xhigh` under `large`), plus `inherit-parent` (this role runs on the parent session's model and effort) as the options. Prefer AskUserQuestion over free text. It takes at most four options per question, so leave any extra model to its `Other` row. For panel roles (arena runners, architect runners, interrogate reviewers) the value is a list, and one subagent runs per entry, alias entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena selects one value from it whose model differs from the parent's when possible. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

### 4. Validate

Every real model written must be in the detected set. `inherit-parent` always passes. If a chosen real model is not available, stop and ask again.

### 5. Write the rule

Write the rule with only a `description` in its frontmatter (no `paths`, so it loads in every session), a `# budget` line with the chosen label and its target effort, and one line per role, using the same labels poteto-mode uses. Overwrite the whole file so re-runs stay idempotent. Shape:

```
---
description: pstack per-role model choices (overrides skill defaults)
---
# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# `inherit-parent` as a value: the role runs on the parent session's model and effort (omit Agent `model` and `effort`). Alias entries in a panel list still count toward its fan-out.
# budget: defaults (high for judgment, medium for code)
feature, refactoring: opus medium
bug-fix: opus medium
perf-issue: opus medium
hillclimb: opus medium
judgment and prose: opus high
hardest tasks: opus high
how explorer: opus medium
how explainer: opus high
why investigators: opus medium
why synthesizer: opus high
reflect tooling: opus medium
reflect judgment, divergent, synthesizer: opus high
arena runners: opus high, opus high
arena cross-judge pool: opus high, opus high
swarm workers: opus medium
architect runners: opus high, opus high
interrogate reviewers: opus high, opus high
```

### 6. Confirm

Tell the user the rule was written and that it applies to new sessions. Re-running this skill updates it. Cloud sessions, including a Project's cloud threads, don't read `~/.claude`, so offer once to also put the same lines in the repo's `.claude/rules/pstack-models.md` or in Project instructions.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, read `${CLAUDE_PLUGIN_ROOT}/skills/create-verification-skill/SKILL.md` in full and follow it. It sets `disable-model-invocation: true`, so Claude Code refuses it through the Skill tool. On no, move on without pushing.
