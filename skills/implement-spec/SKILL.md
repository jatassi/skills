---
name: implement-spec
description: "Implement the result of /to-spec and /to-tickets in code."
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

Find the issue tracker and the triage label vocabulary through the kitchen config index, `docs/agents/AGENTS.md`: open the documents its table lists for them and follow them. If the index is missing, tell the user to run `/setup-milliways`.

This is the hand-off step of make-it-so's Spec and tickets playbook (`<milliways>/skills/make-it-so/playbooks/spec-and-tickets.md`, where `<milliways>` is the milliways plugin root, two levels above this file). Each agent ticket runs the Feature playbook in its own thread and lands as its own PR, written with the **pr** skill. There is no integration branch, and no PR is stacked on another.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed: open, labelled for an agent, and with every blocker closed.

Communication to and from the threads should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

## Steps

1. Read the spec and tickets to understand the task graph. Sort each ticket by its triage label: agent tickets are yours to start, human tickets are listed for the chef and never started here.

2. For each ticket on the frontier, start one Feature thread: a background subagent (`subagent_type: "milliways:poteto-agent"`, `isolation: "worktree"`, model per the `code` role in `docs/agents/models.md`), briefed with pointers to the spec and its ticket and told to run make-it-so's Feature playbook (`<milliways>/skills/make-it-so/playbooks/feature.md`) for that ticket alone. Its branch starts from the latest trunk. It ends with Opening a PR, so the ticket lands as one PR whose body closes it.

3. Run the frontier's threads in parallel. A ticket whose blockers are still open waits: dependent work branches from trunk only after its blockers' PRs merge.

4. As each thread reports, review its PR yourself, then re-read the frontier. Start a Feature thread for each newly unblocked agent ticket.

5. Merging follows the kitchen's merge rules (make-it-so's Autonomy section): the chef merges unless the area's merge gate holds. When the frontier holds no agent ticket left to start, stop and report.

**Reply:** each started ticket with its PR and verdict, the tickets still blocked and the PR each waits on, and the human tickets left for the chef. Run `/implement-spec` again after the next merges to carry on from the new frontier.
