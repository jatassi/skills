---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
---

# Swarm

Fan out N parallel cloud workers. They may cover separate slices, race the same brief, or mix both. The parent waits, aggregates, and returns one report.

## Start

Open a todolist (a checklist in your reply when the session has no task tools) with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Set N from the user or derive it from the shape. N is total workers, not the concurrent-subagent limit.
4. Pick the worker model from the `swarm workers` line in `~/.claude/rules/pstack-models.md` (in a cloud session, the same lines in the repo's `.claude/rules/pstack-models.md` or the Project instructions). If the rule or that line is missing, use `opus medium`. For `inherit-parent`, omit `model` and `effort` so the workers run on the parent model. If the Agent tool rejects that model or effort, use the default and say so. If it rejects the default, use the same model at the highest effort it accepts below the default's. For a model race, name each arm's model up front.
5. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.

## Phase B: Fan out

Spawn all N workers in one message. From a cloud session or Project thread, start each as a cloud session with `create_session` (Claude Code Remote), with the brief as `prompt`, the repo as `source_url`, and the step 4 model as `model`, and end each brief by telling the worker to send its report to this session with `send_message`. A local session can't start cloud sessions, so there spawn each worker as an `Agent` with `subagent_type: general-purpose`, `isolation: "worktree"`, `run_in_background: true`, and the step 4 model and effort, left unset for `inherit-parent`. Run a worker without a worktree only when it needs access to something on the user's computer and writes nothing.

When a worker must start from a non-default pushed branch, pass it as `create_session`'s `source_revision`, or name it in a local worker's brief and have the worker check it out first.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results (a cloud worker's arrive as its `send_message` report, and `get_session` and `list_events` show one that never reported). Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

Keep a compact result table, one-line evidenced issues, and explicit gaps or dropouts.

## Phase D: Report

Return one consolidated in-chat report with the table, issue one-liners, gaps or dropouts, and the race rule when used.
