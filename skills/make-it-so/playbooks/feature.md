### Feature

**You own the design. Plan, review, verify.** Delegate implementation. Stay in the lead.

1. `how` over the affected subsystem.
2. Prototype what running something can answer. When a `prototype:` PR already picked a winner for this work, check out its branch as your reference spec. Build what it shows on the paved path (the repo's real framework, data layer, tests, and conventions). Never merge or copy its shortcuts. When an open design question could be settled by observing it, run the Prototype playbook (`playbooks/prototype.md`, built with the **prototype** skill) before you design. `skip:` only when the direction is set and nothing open could be observed.
3. `architect` for parallel design exploration. `skip: <reason>` only when the change adds no new type, signature or module boundary (a flag, a one-function fix).
4. Write the throughput checkpoint as four todo items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates run before fan-out.
   - **Independent workstreams.** Disjoint files, services, or layers parallelize. Shared writes serialize.
   - **Shared mutable state.** Default to splitting the target (the **separate-before-serializing-shared-state** principle skill). Serialize only for real invariants.
   - **Smallest safe decomposition.** If one worker is best, name why.
5. Delegate code-writing to a subagent using your configured feature model (default `sonnet`), briefed to run the **implement** skill test-first with the **tdd** skill at the seams the architect pass named, with a specific scope (file paths, named data shape and its organizing structure per **principle-model-the-domain**, a state machine over scattered booleans, a table/registry over branching, a typed model over repeated shape assumptions, chosen before the delegate writes logic, and success criteria). The brief also says, in these words, "You own the diff; do not spawn." and "Skip implement's own code-review; step 8 owns it." When the implementation admits multiple valid shapes (error handling, abstraction layer, test structure), delegate via the **arena** skill instead so the runners surface the alternatives and the cross-judge guards the pick. Mandatory: no skip-with-reason escape, and Laziness Protocol does not override it (the gain is review separation, not lines saved). A subagent forbidden to spawn satisfies this by owning the diff directly with the same review separation. No "standing by" reply that waits on a nested agent. Comments per **Comments**. Surgical edits, re-ground against the source for upstream-derived files. Port shared-primitive improvements to all consumers and verify each. Commit liberally.
6. Verify on the matching surface, through a fresh verifier per Who verifies in `docs/agents/verification.md`, never the step 5 delegate. The live lane is the floor. "Inconclusive" or wrong-surface is not a pass. Flag it.
7. Rebase into small, ordered commits. Follow-ups get their own PRs.
   Use the **sequence-verifiable-units** principle skill, building, verifying, and committing each small unit before the next.
8. Review the branch with the **code-review** skill against its merge-base. Each axis subagent's brief says "read `<milliways>/skills/code-review/SKILL.md` in full before starting", never "see" it. If the change is a one-way door or the design is still contested, also `interrogate` before shipping.
9. Run **Opening a PR**, which writes the PR with the **pr** skill.

Code-coupled work (one feature, one migration) goes to a single owner with the checkpoint inline. That owner fans out internally after the blocking phase. Parent-level fan-out is for slices that produce independent artifacts (audits, cross-subsystem investigations, competing experiments). Rewrite the checkpoint at phase boundaries. Spawn a fresh owner rather than chaining interrupts.

**Reply:** what you built, what you chose and why, the throughput checkpoint, open decisions. Tables for design alternatives.

**Reflect, the last step.** Keep this as the last item in the todo list, and do it before you send the reply. List what this thread had to work around: a broken or missing tool, a flaky check, a skill or doc that misled you, a lint you suppressed, a pattern you copied knowing it was wrong. File one `garden` issue for each, per `docs/agents/garden.md`, unless an open one already covers it, and name what you filed in the reply. In a repo without that document, list them in the reply instead. Run the full **reflect** skill as well when the thread was long or the chef asks for it. A playbook run inside another one, such as Opening a PR at the end of Feature, leaves this step to the outer playbook.
