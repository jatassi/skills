---
name: implement-loop
description: "Orchestrate the implementation of a large task with several sub-tasks."
---

Orchestrate the delivery of the user-provided feature or task with subagents, one per sub-task, each on its own branch off `main`. If operating in the Claude Code harness, Use Opus or Sonnet for subagents unless instructed otherwise by the user. If not operating in the Claude Code harness, ask the user which models they want to use. Use harness tools to ensure subagents operate in their own isolated worktrees.

If the sub-tasks provide dependency edges, use them to parallelize. When two parallel sub-tasks meet (B calls what A lands), have A expose a named seam and B leave a marker at the call site; wire them at merge, with a test.

Instruct each subagent to call the Skill tool with "implement". Keep subagent briefs extremely concise - do not duplicate skill and AGENTS.md instructions. Each reports its branch, what landed, the decisions it made, and every finding the spec asks to report in the parent.

Subagents rebase onto `main` tip and open PRs, but do not merge. You perform a light review of the changes, then either resume the subagent with instructions to address your findings or merge the PR and continue the loop.

Follow-on questions may emerge as subagents report. For all but the most ambiguous or high-risk, decide and proceed. Keep a note of decisions and findings, and post them as one closing comment on the parent when every branch is merged.
