### Orchestrate

**You own the program, never the code. Author briefs, drain the queue, keep the frontier green, decide.** For a whole project handed to one standing coordinator chat: multi-day, many PRs, dozens to hundreds of subagents, the human checking in twice a day instead of every five minutes. One task driven to a predicate is Autonomous run. One ambitious run needing a bespoke workflow is figure-it-out. Route here when the work outlives any single agent. Work one agent could finish inside the session's budget is not a program.

In a Claude Project, the coordinator brief (`<milliways>/skills/setup-milliways/projects/coordinator-brief.md`) replaces this playbook. The project conversation follows the brief and does not route through make-it-so.

Ceremony must scale with the program. On cheap near-identical units, collapse it as each section directs.

Three rules carry the rest.

- Completions are queue events, not interrupts.
- Every spawn and every resume carries the standing orders verbatim.
- The brief is the product. A vague brief fails quietly, because a worker cannot ask you a question.

#### Roles and placement

- **Coordinator (this chat).** Local. Frames, authors briefs, drains the inbox, owns the human report, makes judgment calls. It never authors or edits code. Conflicted merges, rebases, and code changes are always tasks. Mechanically landing a verified unit (fast-forward or clean cherry-pick of a worker's commit, then push) is bookkeeping the coordinator may do itself on repos where local git is cheap. Queueing finished work behind an idle lander is how a deadline harvests nothing. Every merge, whoever lands it, passes the merge gate in Autopilot-full step 5 (`playbooks/autopilot-full.md`). A unit whose gate is closed, a one-way door among them, stops at merge-ready and parks in `gates.md` for the chef. The loop is agentic end to end. Agents are spawned, resumed, and drained only through the Agent tool. State reads and writes happen at drain points, in the store files below and, for verdicts, in the GitHub ledger (see Verification). Nothing spawns, waits or wakes on its own.
- **Sub-coordinator.** Always local, durable, one per track, and only when the program exceeds what one coordinator's drains can manage. A track the coordinator can drain itself needs no middle layer. Each nested layer re-pays a full orientation preamble, and a blocking sub-coordinator hides its children while the parent idles. Owns its track's units and boards, authors its workers' briefs, spawns its own workers and verifiers (nesting works to depth 3, and a nested spawn has the full `Agent` schema including `run_in_background` and `isolation`). Rolls up aggregates at wave boundaries. Never forwards raw child reports. Cap in-flight children at what one drain can process, roughly ten, as a rolling window. Never as blocking batches, which cost the slowest child of every batch.
- **Worker / verifier.** Always a background agent (`run_in_background: true`), with worktree isolation (`isolation: "worktree"`) unless the task needs the coordinator's own working tree, such as its uncommitted state or a process already running from it. Every agent runs on this machine, so `control-ui` or `control-cli` runtime verification, local transcripts under `~/.claude/projects/`, simulators, and auth that exists only here all work from a worktree. Worktree agents can read the store by absolute path. Only a thread that cannot, such as a Projects cloud thread, gets what it needs inlined in its brief. Prefer fewer, broader workers. One writer per worktree or branch (principle-separate-before-serializing-shared-state). Run a unit's verifier as the models document's `verifier` role, a fresh subagent that is never the worker, plus its `verifier-diff-audit` lane when the document has a second family. With no second family, write the Fallback section's `fallback:` line for the verifier and go on.

Depth stays at coordinator, track, worker. Author the track decomposition per project (build, landing, and verification are common cuts, not a required shape). Hard-coded swarm trees were tried and parked as too rigid.

#### Store layout

Create `orchestrate/<project-slug>/` under `~/.claude/projects/<project>/`, beside this project's transcripts (the store). Every file has exactly one writer. Owners publish facts, readers aggregate at read time. Edit the plain TSV and JSON files directly.

- `standing-orders.md` is the standing-orders register: numbered lines, one constraint each (model policy, landing order, verification bar, forbidden paths, escalation policy). Paste it verbatim into every spawn and every resume. Directives decay across resumes, and each dropped one costs a human turn. When you catch yourself restating an instruction, append the line before you act (principle-encode-lessons-in-structure).
- `overview.md` is the durable PR and issue DB. Append. Never rewrite wholesale per event.
- `units.tsv` has one row per unit: id, track, state, branch, PR, head SHA, brief path. Update rows in place.
- `frontier.json` is the computed merge frontier, per Merge safety.
- The verification ledger is not a store file. It lives in GitHub, per Verification.
- `inbox/` holds completion pointers. `gates.md` parks human gates (question, options, default on no answer).
- `decisions.tsv` is the trail via the show-me-your-work skill.
- `status.md` is derived from `units.tsv` and the GitHub ledger at each drain, never hand-maintained. Regenerate it from the tables instead of narrating events into it.

#### The brief

Your prompts to agents are your only product, and a sloppy brief compounds into slop across the whole tree. Every spawn carries all of it. A field you cannot fill is a unit you have not scoped yet.

```
GOAL         one sentence, the outcome, executable by a stranger with no chat access
SCOPE        paths this unit may write; paths it may not; its exclusive worktree or branch
CONTEXT      pointers to files and PRs; upstream reports pasted in full when this unit
             depends on them, because workers cannot see siblings
ACCEPTANCE   checkable criteria, one per line
VERIFY       exact commands or the control-skill path, plus known gotchas
TIMEBOX      rough cap on runtime; on expiry, return partial findings and stop rather than run on
FORBIDDEN    no gt, no stacked PRs, no rebase, no force-push, no fixes outside scope, plus unit-specific bans
REPORT       status, branch, head SHA, PRs, verdict, what you actually ran, deviations,
             suggested follow-ups
STANDING     <standing-orders.md pasted verbatim>
```

Size the brief to the unit. A one-command unit gets the template collapsed to a paragraph that still names goal, scope, the verify command, and the report shape. A 4KB scaffold around a two-line edit costs more to write and obey than the edit. A spawn on this machine may reference the standing-orders file by store path. Verbatim paste is for every resume and for any thread that cannot read the store, such as a Projects cloud thread.

A sub-coordinator brief adds its track boundary and unit list, its spawn budget with the worktree-isolation default and its exception list, the drain protocol, and the rollup format (per child: name, status, PR, head SHA, verdict, one line, plus track status and frontier delta).

A dependency is a context relay, not just ordering. Undeclared upstream context makes the worker guess. Missing fields are a refuse-to-spawn condition. Audit one sampled worker brief per sub-coordinator per wave, concurrently with the wave it samples, never as a gate in front of it. A failing brief stops that track and fixes the sub-coordinator's instructions, not just the worker, because brief quality decays late in a run. Never resume-chain a brief. Respawn fresh with consolidated scope.

#### Steps

1. **Frame.** State the done predicate as something countable ("all 126 units merged, each ledger-verified `live-ui-verified`"). Quantify scope: units, rough effort, expected PRs, and the wall-clock budget. If one agent could finish inside that budget, stop here and run Autonomous run instead. Collapsing must not depend on another document being present. It means do the work directly in this session, plain workers where they help, verification inline, landing as you go, and none of the store, register, or pilot machinery below. Schedule landing against the budget. By roughly 70% of it, stop spawning and land what is verified. Name the tracks per project. A contested decomposition or one-way door goes through the arena skill before the pilot. Present the framing once. Reversible prep proceeds without waiting.
2. **Install the runtime.** Create the store files. Open the trail via the show-me-your-work skill, write the standing orders before any spawn, and seed `frontier.json` from existing PRs per Merge safety.
3. **Pilot.** Push one unit through the whole path: brief, worker, verification, frontier entry, ledger comment, merge. The pilot exists to falsify the brief template, the verify recipe, and the unit size while that costs one agent instead of fifty. Fix the contract from pilot evidence before any fan-out. Scale the pilot to the unit. On programs of near-identical cheap units, the first unit is the pilot, run as a normal unit with its verify command inline, and fan-out starts the moment it lands. The dedicated pilot pipeline (separate verifier agent, audit gate) is for expensive or novel unit shapes, not for clone-units where a serialized pilot has nothing to falsify.
4. **Scale.** Spawn a rolling window of workers up to the in-flight cap, refilling as children finish. Blocking batches pay the slowest child of every batch. Spawn track sub-coordinators only past the one-drain threshold in Roles. Recompute ready work after each drain. Relay upstream reports into downstream briefs. Keep sibling communication upward only. The sampled brief audit runs alongside the wave it samples and stops the next refill on failure, not the current one.
5. **Drain.** Run the queue discipline below at every drain point.
6. **Land.** Landing is continuous, never a terminal phase. Integration starts with the first verified unit and runs alongside the remaining waves. On heavy repos the lander is a standing role from wave one, integrating as units verify. On repos where local git is cheap, the coordinator lands verified units itself per Roles. Keep the frontier green before later waves. Merge safety governs. Advance `frontier.json` only on merge or reported new head SHAs.
7. **Close.** Drain the final inbox, reconcile every spawned agent to a terminal row (done, abandoned, zombie-reconciled), confirm the predicate on the real artifact, confirm every landed PR has a verdict for its current head SHA, audit the trail per show-me-your-work including its cross-model review, encode recurring corrections into `standing-orders.md` or the brief template. Leave the store intact. It is the postmortem.

#### Queue and drain

- On a completion notification, write one pointer file to `inbox/` naming the agent, the unit, its status and its report path, and return to what you were doing. Never deep-review inline. A completion that needs review becomes a verifier unit. Never review a diff inside a drain.
- Drain in batches at four points: the end of a critical section, a track rollup, a frontier watcher wake (arm it via the loop skill, with a long heartbeat fallback), and before a human report. In a Claude Project, the Projects coordinator plus routines replace these `/loop` wakes and heartbeats: the coordinator brief and the routine prompts are in `<milliways>/skills/setup-milliways/projects/`. Begin each batch by reading and clearing `inbox/`. Arrivals during a drain wait for the next one.
- Critical sections you finish first: authoring a brief, a rebase or merge, a conflict decision, writing a gate, updating ledger or frontier.
- Each drain classifies every pointer (landed, needs-verify, failed, zombie, noise), updates `units.tsv`, records verdicts in the GitHub ledger, regenerates `status.md`, then spawns the next wave in one message.
- Account for every spawned child at its track's rollup: arrived, respawned, or its scope explicitly absorbed. Silently redoing a missing child's work hides both the wasted spend and the coverage gap its result existed to close.
- A drain turn ends with three lines from `status.md`: counts against the states, what changed, gates open. Detail lives in `status.md`. The full reply contract applies at checkpoints and close.

#### Merge safety

- One concern per PR and no stacks, per the **pr** skill. Every unit's PR branches from trunk and targets it. A unit that depends on another starts only after that one merges, and its brief carries the upstream report.
- The frontier is a computed object, never narrative. Recompute `frontier.json` with `gh` after every merge: the open unit PRs in landing order, branch names, head SHAs, the verdict at each head, a generation number, and the next PR to land. If `gh` lists no open PRs while `units.tsv` has some, stop and resolve that, and never write an empty frontier.
- Exactly one lander rebases and merges, serialized. Record the holder in the standing orders. A rebase onto trunk runs in a background agent with worktree isolation, never in the coordinator's checkout. A new head voids the verdict unless the patch-id is unchanged.
- Workers never rebase. Git checks a branch out in only one worktree, and a worker's kept worktree still holds its branch, so a worker detaches HEAD (`git switch --detach`) after its last push. Before a rebase, the lander runs `git worktree list` and frees any branch it is about to rebase that another worktree still holds. Babysitters follow `playbooks/babysit.md`, one per PR, and report conflicts to the lander rather than rebasing.
- PR closes go through the lander only. Merges are units with briefs like any other, and each one passes the merge gate (Roles).
- One post-merge sweep follows merged PRs for reverts, late review-bot threads, trunk CI breaks after the merge, and follow-ups promised with no issue. It files an issue for each finding, labelled `garden` where the weed is a workaround.

#### Verification

Scale verification to the unit. When VERIFY is a single cheap command, the worker runs it and reports the output, and the coordinator spot-checks receipts. A dedicated verifier agent (the `verifier` role, plus `verifier-diff-audit` when there is a second family) is for units whose verification is expensive, judgment-laden, or high-blast-radius. A verifier agent whose entire product would be rerunning one command is ceremony, not verification.

The ledger lives in GitHub. Record and read each verdict per `docs/agents/verification.md`, the ledger's one full statement: the `ledger: <tier> at <head SHA>` comment and tier label, the five tiers, how lane reports map to a tier, and the reading rules. Only `live-ui-verified` passes the merge gate. A `verifier-failed` verdict gets a fix unit. A new head SHA voids the verdict unless the patch-id is unchanged, so re-verify after a rebase.

A unit is not done until its output is externalized the moment it lands, never batched to the end of the run. A worker pushes its branch, a verifier posts its ledger comment, receipts land in the store. Work that exists only in one worktree when its agent dies was never done.

#### Liveness and failure

- Never resume an agent to check on it. A resume restarts an idle agent. Probe read-only: the ledger, `units.tsv`, `gh`, pushed branches, the agent's status in the Projects Overview pane. Transcript mtime is not liveness.
- A silent death gets a synthetic postmortem row in the inbox (unit, failure mode, last evidence, options). Replan on evidence as it arrives. Never wait for full quiescence.
- Retry by mode: cap-hit or oom, respawn with smaller scope. Network-drop, retry as-is. Tool-error, retry on a different model. Unknown, retry once. Two retries, then abandon the unit and replan around it.
- A zombie that returns hours late reconciles against the current frontier and ledger before anything is accepted. Salvage unique findings through a fresh unit, never a blind merge.
- When continued spawning would produce garbage tree-wide (bad upstream output, broken acceptance, dead infra), write a stop line at the top of the standing orders, let in-flight work finish, fix the cause, clear it.
- Bound your own infra retries the same way you bound a child's. After a few consecutive tool aborts, stop retrying. Write a terminal handoff to durable state (what is done, where it lives, the exact command to resume) and end the run.
- After a Claude Code restart: its subagents are dead, but their pushed branches, PRs and worktrees are not. Re-read the standing orders and `units.tsv`, recompute the frontier, reattach work by PR and branch rather than agent id, respawn one sub-coordinator per track from its stored brief plus current state, drain, resume.

#### Escalation

Reaches the human, batched into the status page rather than per item: irreversible actions (force-push to shared branches, deploys, deletions, closing someone else's PR), genuine product or preference calls no experiment settles, a standing order that contradicts observed reality, a program-level dead end that survived a replan. Park each as a `gates.md` entry before asking, and route work around it.

Human-in-the-loop units (a grilling, a ticket labelled for a human per `docs/agents/triage-labels.md`) never go to a cloud worker. Each becomes a local Projects thread on the chef's Mac that runs the **visual-grilling** skill, and falls back to plain-text rounds with the **grilling** skill when the chef is away. Park it in `gates.md` with its default and route work around it. A prototype pick has one channel, its draft `prototype:` PR. The unit that opens it parks and stops, and a drain that finds the chef's pick on the PR spawns a fresh unit to finish the pr skill's Prototype PRs steps.

Never reaches the human: frontier nudges, rebase mechanics, retries, CI flake triage, review-thread triage, format fixes, scope the brief already forbids (refuse and continue), and "should I keep going". When in doubt, act and log.

Mid-run discoveries fix only what blocks the frontier. Everything else parks in follow-ups. At this fan-out a small scope leak multiplies into PRs nobody asked for.

**Reply:** at checkpoints and close: the predicate and the count against it from `units.tsv` and the GitHub ledger, tracks and what each landed, the frontier (PR list plus SHAs), verdicts summary, what was abandoned and why, gates awaiting the human (the only asks), the store path, and the trail path. Numbers from the tables, not narrative. Include PR links.

**Reflect, the last step.** Keep this as the last item in the todo list, and do it before you send the reply. List what this thread had to work around: a broken or missing tool, a flaky check, a skill or doc that misled you, a lint you suppressed, a pattern you copied knowing it was wrong. File one `garden` issue for each, per `docs/agents/garden.md`, unless an open one already covers it, and name what you filed in the reply. In a repo without that document, list them in the reply instead. Run the full **reflect** skill as well when the thread was long or the chef asks for it. A playbook run inside another one, such as Opening a PR at the end of Feature, leaves this step to the outer playbook.
