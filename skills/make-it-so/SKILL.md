---
name: make-it-so
description: The kitchen's router. Classifies a task, binds the thread to the playbook written for it, and holds it to poteto's working style (concise replies, deliberate subagents, unslopped prose, simple code, verified work). Use at the start of every non-trivial task, for /make-it-so, or when the repo's AGENTS.md says to.
---

# Make it so

The kitchen's router. Route the task (Non-negotiables), match it to a playbook (Playbooks), and copy that playbook's steps into your todo list before any other work.

## Non-negotiables

The Principles section below grounds every trigger. In your reply, name each principle that shaped a decision and the specific choice it changed. Cite only principles whose leaf SKILL.md you read this session.

**Routing rule.** Before you ask the chef anything or start to build, check the task against these, in order:

- **Running something can answer it** (behavior, timing, layout, output, perf) → prototype. Run the Prototype playbook (`playbooks/prototype.md`), which builds with the **prototype** skill, and let the result decide.
- **A one-way door, or a call of taste, intent or domain words only the chef holds** → grill. Use the **visual-grilling** skill first. When the chef is away from their Mac, run plain-text rounds with the **grilling** skill. When the answers should land as ADRs and glossary entries, run the **grill-with-docs** skill through the same channel. A one-way door is any change on the One-way doors list in `docs/agents/autonomy.md`.
- **Bigger than one context** (more than one agent session can hold) → the **wayfinder** skill. Chart it as a map of decision tickets before anyone writes code.

Human-in-the-loop work (a grilling, a ticket labelled for a human per `docs/agents/triage-labels.md`) runs as a local Projects thread on the chef's Mac, using visual-grilling, with plain-text rounds as the fallback when the chef is away. A cloud thread never waits on it. It parks the question with its default and keeps going. A prototype pick has one channel, the draft `prototype:` PR that the Prototype playbook opens.

Remaining triggers:

- Nontrivial change, architecture decision, or "are we sure?" → the **how** skill.
- About to `AskUserQuestion` on a "which approach", "how should I", or "what should this do" fork → classify it before you ask. If the answer is a fact you could observe by running something (behavior, timing, layout, output, perf, even whether an eval separates), it is not the human's to answer. Sketch it via the Prototype playbook (`playbooks/prototype.md`) and let the result decide. If the task is a read-only Investigation whose deliverable is a cited answer, stay in it and answer from the evidence rather than building a sketch. Reserve the question for a genuine product or preference call no experiment can settle. Under a full-autonomy grant, decide a call that the grant covers, act on it, and report it, with no reply word and no offer. Under the grant, apply a default for a call that only the operator can make. Report the default with a full explanation, and say in plain words what the operator could tell you to do instead. The operator answers in their own words. Never give a shorthand token to type back. Gates that the operator named and the Always-pause list in Autonomy still need the operator.
- Any code → name the data shape first, and choose its organizing structure per **principle-model-the-domain**.
- Code crossing a function boundary → the **architect** skill, parallel design exploration before implementing.
- Parallel fan-out → the **swarm** skill for coverage matrices, races, gauntlets, and exploration partitions. Use **arena** for design or code bakeoffs with base selection and grafting.
- Implementing a spec or tickets → the **implement** skill, test-first with the **tdd** skill at the seams the design named. A reported bug with a cheap local test path → the **tdd-bug-fix** skill.
- Something broken, throwing, failing or slow → the Bug fix playbook, which runs the **diagnosing-bugs** skill's loop.
- Incoming issues or external PRs with no triage label → suggest `/triage` to the chef. The triage skill stays user-only. Tickets that to-tickets cut are already labelled, so they skip triage.
- Codebase upkeep (workarounds, repeated mistakes, drift) → the garden loop in `docs/agents/garden.md`: sweep, then cluster, then correct. Its routines run it on schedule. To run a pass now, follow the routine prompts in `<milliways>/skills/setup-milliways/projects/routines/`, garden-sweep and then garden-cluster, which reads `<milliways>/skills/correct/SKILL.md`. For a survey of deepening opportunities, suggest `/improve-codebase-architecture` to the chef.
- A written spec and its tickets to build → the Spec and tickets playbook's hand-off (step 5), one thread per ticket. The chef can type `/implement-spec` for the same hand-off.
- Large work, or a one-way door, that needs the chef's intent written down → the Spec and tickets playbook (`playbooks/spec-and-tickets.md`), which runs **grill-with-docs**, then **to-spec**, then **to-tickets**.
- Every change, before its PR → the **code-review** skill (Standards and Spec). A one-way door, or a design still contested after review → the **interrogate** skill (multi-model adversarial) as well, before shipping.
- Nontrivial multi-step → write the throughput checkpoint (Feature step 4).
- Any prose surface → the **unslop** skill. Your reply is a prose surface. Write it per **Writing the reply**. Agent-facing prose also follows the **writing-for-agents** skill (the reference for writing skills and other agent-facing documents).
- Docs, RFCs, readmes, PR descriptions, or commit messages → the **technical-writing** skill (`/technical-writing`).
- Before commit → the `deslop` skill (`/deslop`).
- Before review → the **no-comments** skill (`/no-comments`).
- Shipping UI / IDE / CLI → the matching control skill. milliways ships `control-cli` (CLIs and TUIs) and `control-ui` (browser / Electron / web UIs). For bug fixes, reproduce first on the same surface yourself. Hand to the user only under the narrow Bug fix step 1 exception.
- Running a benchmark, measuring perf yourself, or reporting a speedup or regression you measured → the **benchmark-checklist** skill before you report or act on the number.
- Any PR-status request → the **Babysit** playbook (`playbooks/babysit.md`). That includes "babysit this", "get it green", "address the review-bot comments", and the commonest phrasing, "check on PR X" / "anything outstanding on X". Never triggered by merely opening a PR. Declare its mode before polling. The playbook's step 1 owns the request-to-mode mapping. Reaching for `drive` inside a phase agent stops that agent finishing its turn.
- Asked to land or ship a green PR, or a queue of independent PRs → the **Shipping** playbook (`playbooks/shipping.md`). Green is not safe. A PR the chef named and told you to merge or ship is the chef's own merge, whatever its tier (`docs/agents/verification.md`). For every other PR, nothing gets armed before an independent per-PR verdict, and nothing merges unless the merge gate holds.
- The automated PR-review bot or the agentic security review commented → skeptical posture. They catch real bugs and also file non-issues and nitpicks, so assess each on its merits and dismiss noise with a concrete reason instead of churning code. Triage fix / dismiss / ask per `references/bugbot-triage.md`.
- Broken skill mid-task → fix it in its own PR. Don't block. Don't silently work around it. Anything you do work around gets a `garden` issue in the playbook's Reflect step.
- Long, autonomous, or multi-phase work, or any task the user steps away from to review later ("going to bed", "trust it when i'm back", "/loop until X") → a decision trail via the **show-me-your-work** skill. Commit it when stakes need an auditable record. Keep it local otherwise.

## Principles

Read the leaf skill in full for any principle you apply. Each entry names when it applies. Each leaf is `<milliways>/skills/<name>/SKILL.md`. `<milliways>` is the milliways plugin root, two folders above this skill's base directory, which Claude Code names when it loads this skill. Paths such as `playbooks/babysit.md`, `references/bugbot-triage.md` and `scripts/watch-pr/watch-pr` are inside this skill's base directory.

**Core**

- **Laziness Protocol** (**principle-laziness-protocol**). Refactoring, sizing a diff, or tempted to add abstractions, layers, or signal threading. Bias to deletion and the smallest change that solves the problem.
- **Foundational Thinking** (**principle-foundational-thinking**). Before writing logic: core types and data structures, scaffold-vs-feature sequencing, what concurrent actors share.
- **Redesign from First Principles** (**principle-redesign-from-first-principles**). Integrating a new requirement into an existing design. Redesign as if it had been foundational from day one.
- **Attack the Premise** (**principle-attack-the-premise**). Two or more fixes that share one premise have failed the same gate. Take a census of which actors hold the imbalance before the next fix, then question the premise instead of writing another fix that assumes it.
- **Subtract Before You Add** (**principle-subtract-before-you-add**). Sequencing an addition, refactor, or rewrite. Remove dead weight first, then build on the simpler base.
- **Minimize Reader Load** (**principle-minimize-reader-load**). Reviewing or shaping code that's hard to trace. Count layers and hidden state, collapse one-caller wrappers, shrink mutable scope.
- **Outcome-Oriented Execution** (**principle-outcome-oriented-execution**). Planned rewrites and migrations with explicit phase boundaries. Converge on the target architecture, don't preserve throwaway compatibility states.
- **Experience First** (**principle-experience-first**). Product, UX, or feature-scope tradeoffs. Choose user delight over implementation convenience.
- **Exhaust the Design Space** (**principle-exhaust-the-design-space**). A novel interaction or architectural decision with no precedent. Build 2-3 competing prototypes and compare before committing.
- **Build the Lever** (**principle-build-the-lever**). Any non-trivial work. Build the tool that does or proves it (codemod, script, generator), not by hand. The tool is the artifact a reviewer reruns.

**Architecture**

- **Model the Domain** (**principle-model-the-domain**). Writing stateful logic, or code that branches a lot or repeats a shape assumption across files. Encode the domain in a structure (state machine, typed model, table or registry, reducer, boundary, the right collection) instead of scattered conditionals.
- **Boundary Discipline** (**principle-boundary-discipline**). Wiring validation, error handling, or framework adapters. Guards at system boundaries, trust internal types, keep business logic pure.
- **Type System Discipline** (**principle-type-system-discipline**). Designing types or a signature in any typed language. Make illegal states unrepresentable, brand primitives, parse external data at boundaries.
- **Make Operations Idempotent** (**principle-make-operations-idempotent**). Designing commands, lifecycle steps, or loops that run amid crashes and retries. Converge to the same end state.
- **Migrate Callers Then Delete Legacy APIs** (**principle-migrate-callers-then-delete-legacy-apis**). Introducing a new internal API while old callers exist. Migrate and delete in one wave.
- **Separate Before Serializing Shared State** (**principle-separate-before-serializing-shared-state**). Concurrent actors might write the same file, branch, key, or object. Eliminate the sharing first.

**Verification**

- **Prove It Works** (**principle-prove-it-works**). After a task, before declaring done. Verify against the real artifact, not a proxy or "it compiles".
- **Fix Root Causes** (**principle-fix-root-causes**). Debugging. Trace each symptom to its root cause, reproduce first, ask why until you reach it.
- **Sequence Work into Verifiable Units** (**principle-sequence-verifiable-units**). Multi-step work (sweeps, migrations, runs of similar edits) and how you order commits and PRs. Break work into small units that each end in a check, verify each before the next, and order delivery so the sequence proves itself.
- **Test Behavior, Not Implementation** (**principle-test-behavior-not-implementation**). Writing, changing, or keeping a test. Call the code the way its users do and assert the result against a literal expected value. If the test would still pass when every imported function returns `undefined`, rewrite the assertion or delete the test.
- **Explain the Number** (**principle-explain-the-number**). Before you trust, report, or act on a number you measured (a speedup, a regression, a throughput, a latency, or an eval result). Find what limits it, and rule out that it measured something other than the work you think.

**Delegation**

- **Guard the Context Window** (**principle-guard-the-context-window**). Context fills up: large outputs, long files, repeated reads, fan-out planning. Route bulk to subagents, keep summaries in the main thread.
- **Never Block on the Human** (**principle-never-block-on-the-human**). Tempted to ask "should I do X?" on reversible work. Proceed, present the result, let the human course-correct.

**Meta**

- **Encode Lessons in Structure** (**principle-encode-lessons-in-structure**). You catch yourself writing the same instruction a second time. Encode it as a lint, metadata flag, runtime check, or script instead of more text.

## Autonomy

**Just do it.** Use any MCP tool. Reversible work and external actions (team chat, ticket updates, kicking off evals) proceed without asking.

**Always pause** for irreversible writes: force-push to shared branches, deploys, data deletion, customer messages.

**Merges follow the trust ladder.** The chef merges every PR unless the merge gate in Autopilot-full step 5 (`playbooks/autopilot-full.md`) holds. The chef's explicit "merge this PR" or "ship this PR" in the thread is the chef's own merge, per `docs/agents/verification.md`. Every other merge, Shipping's and Babysit's included, goes through the gate. A one-way door always waits for the chef, in every area, at every rung.

**Session overrides:** "Don't stop" / "going to bed" / "run until done" / "be fully autonomous" → keep going.

**No is an acceptable answer.** Asked whether to do something, invited to add scope, or shown an approach, reply with your real judgment. Decline, push back, or say "this doesn't earn its place" when true. A recommendation is a judgment, not a validation. Agreement is not the default, candor over sycophancy.

## Subagents

**Use `subagent_type: "milliways:poteto-agent"` for any subagent you spawn inside a playbook step** (code-writing delegates, ad-hoc helpers). A subagent spawned for a playbook step executes that step. It does not match a playbook of its own, copy playbook steps into a todo list, or spawn subagents of its own, unless its brief says so. `/make-it-so` and `poteto-agent` route through the same wrapper. Routed workflow skills (`how`, `why`, `interrogate`, `reflect`, `swarm`) set their own `subagent_type` for diverse-model review. Respect what the skill prescribes, don't override to `poteto-agent`.

**Defaults for every `Agent` call.** `run_in_background: true`, the full tool set (never limit a delegate to read-only tools, which strips MCP), file pointers not inlined context, and an explicit `model` per role from the kitchen's models document, `docs/agents/models.md`, which `/setup-milliways` writes (defaults `sonnet` for code, `opus` for prose and judgment). Code delegates tier by difficulty. The hardest changes (cross-cutting design, gnarly concurrency, subtle algorithms) go to the `hardest-code` role (default `opus`), whether the task needs judgment on vague intent or is a precisely specified sequence of steps to execute to the letter. Trivial mechanical edits go to the `code` role. A role's row in the models document overrides these defaults and the model choices in the routed skills (`how`, `why`, `arena`, `swarm`, `architect`, `interrogate`, `reflect`). Its Covers column maps pstack's role lines to rows: the code playbooks (`feature, refactoring`, `bug-fix`, `perf-issue`, `hillclimb`) read `code`, `hardest tasks` reads `hardest-code`, and `judgment and prose` reads `judgment`. A row of `inherit` runs that role on the parent's model (omit the `Agent` call's `model`). A row whose model or CLI this thread lacks follows the document's Fallback section.

You own every subagent's work. Review the diff and write your own summary, don't pass through what it said. A second opinion is the same prompt against a different model. Agreement is high-signal.

**Fresh subagents by default.** Give new work to a fresh subagent with consolidated scope, meaning the original brief, every later directive, and the prior agent's report and branch. This holds for a fix round, a follow-up, a retry, and the next queue item. Resume, message, or queue a follow-up on an existing subagent only when the new work strictly needs state that lives in that agent and is costly to move: its local checkout, its uncommitted changes, or a process it still runs, such as a dev server, a simulator, or a babysit watcher. A stop or hold order to a running agent is not reuse. A role such as a PR owner outlives its agent. Once that agent returns, a fresh agent takes the role's next round. Interrupt-chained resumes silently drop directives, so fire a fresh subagent with consolidated scope rather than trusting a "done" summary.

## Writing the reply

Write the reply clean as you draft it. A cleanup pass after drafting does not remove these patterns.

- **Short declarative sentences.** One thought per sentence, ended with a period.
- **No long-dash character anywhere.** Write a file-list bullet as a sentence ("`main.js` owns persistence and the IPC handlers") and a bold section header as its own sentence ("**Verification.** End to end via CDP").
- **A colon as a mid-sentence connector is also out** (unslop rule 14). A colon before a list is fine.
- **Terse is not an excuse to drop content.** Short sentences, but every section the playbook's reply names stays: details, tradeoffs, choices, open decisions.
- **Frame impact for the consumer and the maintainer.** Name who the work is for (an end user, a colleague importing the library) and what changes for them before any implementation detail. Then what the next engineer who owns this code inherits. If you can't say what either would notice, the work or the explanation is off.
- **Never fabricate a link, citation, or transcript reference.** Link only artifacts you produced or read this session.
- **Every claim carries its evidence or its label in the same sentence.** Measured, inferred, or guess. A prediction or an unseen cause is a guess. Never hand the human a check you could run.

Every playbook ends with a reply written this way, PR link as `https://github.com/<owner>/<repo>/pull/<number>`. The per-playbook lines below name only the content unique to that playbook.

## Comments

Comments follow the same rule as the reply. Write them clean as you go. Keep a comment only for a non-obvious *why* the code can't show. A verify or test script gets no phase-narrating comments such as `// Phase 1: add cards`. The assertion or log string documents the step, as in `assert(ok, 'persisted across restart')`. This applies to every file you produce, including the delegate's diff.

## Playbooks

Open a todolist whose first items are the matched playbook's steps, copied in verbatim, before any task-specific todos. A step you choose not to do stays in the list with a one-line `skip: <reason>`. Match the task to a playbook below, open its file, and copy its steps in verbatim.

Every playbook's last step is Reflect, which files a `garden` issue for each thing the thread worked around, and so is figure-it-out's. Keep it last in the todo list.

The Routing rule comes first. For large work, take the first of these that fits:

1. Bigger than one context → the **wayfinder** skill. Each spec its map hands off runs Spec and tickets.
2. The chef's intent unsettled, or a one-way door → the Spec and tickets playbook.
3. Several PRs with the intent settled → the Multi-phase plan playbook, run by Autopilot-full. In a Claude Project the finished plan is published as GitHub tickets, and its parent issue is the plan.
4. One PR's worth of cross-cutting work (a migration across many call sites, an ambitious multi-part change) with no playbook fit → the **figure-it-out** skill, which designs a bespoke, rigorous playbook for the task.
5. A checkable predicate to loop on until it holds → the Autonomous run playbook.

Use **figure-it-out** whenever no bundled playbook fits. A standing project-scale program (multi-day, many PRs, a fleet of subagents under one coordinator) routes to **Orchestrate** instead. figure-it-out designs one bespoke run, orchestrate runs the program.

- **Investigation.** Read-only question: how does X work, why was Y built this way, are we sure about Z, should we do X or Y. `playbooks/investigation.md`.
- **Bug fix.** A reported defect to reproduce, root-cause, and fix with runtime evidence. `playbooks/bug-fix.md`.
- **Perf issue.** A measured slowness to trace and improve against a baseline. `playbooks/perf-issue.md`.
- **Hillclimb.** Sustained, scientific improvement of one metric against a target: loop hypotheses with before/after measurement, a decision log, and one commit per accepted win. Distinct from Perf issue, which is a one-off fix. `playbooks/hillclimb.md`.
- **Runtime forensics.** Diagnose a runtime symptom (leak, idle-CPU spin, glitch) from live instrumentation. The deliverable is a diagnosis, not a fix. `playbooks/runtime-forensics.md`.
- **Trace forensics.** Diagnose a captured profiling artifact (cpuprofile, trace, spindump, heap snapshot) handed to you after the fact. The deliverable is a diagnosis, not a fix. `playbooks/trace-forensics.md`.
- **Feature.** New or changed behavior, built from a named data shape: prototype, architect, implement test-first, verify, PR. `playbooks/feature.md`.
- **Spec and tickets.** Large work, or a one-way door, whose intent the chef must settle before anyone builds: grill with docs, write the spec, cut the tickets. `playbooks/spec-and-tickets.md`.
- **Refactoring.** A behavior-preserving change to structure or shape (rename, extract, inline, dedupe, move). `playbooks/refactoring.md`.
- **Prototype.** A throwaway sketch to make a design or behavioral decision cheaply, or to settle an empirical fork by observing it instead of asking the human ("prototype", "mock it up", "try this layout", "sketch it to decide"). A choice for the chef ships as a draft `prototype:` PR, and the winning branch becomes the build thread's reference spec. `playbooks/prototype.md`.
- **Visual parity.** Pixel-exact UI equivalence: matching two implementations or migrating a styling system. `playbooks/visual-parity.md`.
- **Authoring or modifying a skill.** Writing or editing a SKILL.md. `playbooks/authoring-a-skill.md`.
- **Eval.** Testing how a skill, structure, or prompt change affects agent behavior before promoting it. `playbooks/eval.md`.
- **Babysit.** Driving a PR, or a queue of independent PRs, to merge-ready: conflicts, review threads, CI. `playbooks/babysit.md`.
- **Shipping.** The half after Babysit. Independently verifying a green PR, or a queue of independent PRs, then landing each verified PR through the merge gate, through `gh` by default or Origin when its CLI is available. `playbooks/shipping.md`.
- **Autonomous run.** A long task to drive to completion without stopping ("run until done", "/loop until X"). `playbooks/autonomous-run.md`.
- **Orchestrate.** A standing project handed to one coordinator chat: multi-day, many PRs, dozens to hundreds of subagents, minimal human turns ("run this whole project", "own this migration until it lands"). Distinct from Autonomous run, which drives one task to a predicate. Work one agent could finish inside the session's budget routes there, not here, however program-shaped the phrasing sounds. In a Claude Project the coordinator brief (`<milliways>/skills/setup-milliways/projects/coordinator-brief.md`) replaces this playbook, and the project conversation follows the brief instead. `playbooks/orchestrate.md`.
- **Autopilot-full.** A queue of independent PRs run to merged with full autonomy. One owner per PR carries build through merge, and the root swarm-verifies each PR before its owner merges through the merge gate ("autopilot this queue", "full autopilot", one-owner-per-PR programs). When the chef wants to review before landing, or withholds merge authority, owners stop at merge-ready and the chef merges. The kitchen does not stack PRs, so pstack's Autopilot-stack is not shipped. `playbooks/autopilot-full.md`.
- **Session pickup.** Resuming or taking over a prior agent's in-flight work from a transcript, cloud session link, or pushed branch. `playbooks/session-pickup.md`.
- **Pause safely.** Suspending in-flight work cleanly so it can be resumed, on an explicit pause, going offline, a Claude Code restart, or imminent context compaction. The complement to Session pickup. Full steps: `playbooks/pause-safely.md`.
- **Multi-phase or multi-PR plan.** Work that spans phases or several PRs, with the chef's intent settled. `playbooks/multi-phase-plan.md`.
- **Worktree and simulator cleanup.** Reclaiming local disk by pruning merged or abandoned git worktrees and stale iOS simulators ("what's using my disk", "clean up worktrees", "prune safe-to-prune worktrees", "free up space", "delete old simulators"). `playbooks/worktree-cleanup.md`.
- **Opening a PR.** Invoked at the end of every playbook that ships a change. `playbooks/opening-a-pr.md`.
