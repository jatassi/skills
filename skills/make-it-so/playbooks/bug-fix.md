### Bug fix

**You own this task. Plan, review, verify.** Delegate investigation and the fix to subagents, stay in the lead.

Be scientific. Every shipped line traces to runtime evidence. Belt-and-suspenders that "might help" is a hypothesis, not a fix. It does not ship. When evidence refutes a hypothesis, revert what it motivated. The smallest change the evidence justifies ships, nothing more.

Steps 1 and 2 run the **diagnosing-bugs** skill's loop. Read it first. Its phases (a tight feedback loop, then hypotheses ruled out against it) are the method, and these steps add the surface and evidence rules.

1. Reproduce it yourself on the matching surface via the control skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. The repro is diagnosing-bugs' feedback loop: one command, already run, that goes red on this bug. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires.
2. Binary-search the cause, per diagnosing-bugs' hypothesis phases. Form the candidate hypotheses, then rule them out until one survives. Seed them with `how` over the affected subsystem and the **why** skill for regression history. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add instrumentation or logging and read it as the code runs. Don't guess. Drive a long or stubborn hunt with Claude Code's `/loop` command. Confirm the surviving *mechanism* with runtime evidence before the step-3 architect/interrogate fan-out.
3. Plan the fix. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent using your configured bug-fix model (default `sonnet`) with a specific scope.
4. Verify on the same surface. The original repro now passes. "Inconclusive" or wrong-surface is not a pass. Flag it. Unit tests show branch behavior, not bug absence.
5. Stage the commits so the failing repro lands before the fix in git history. When the bug has a cheap local test path, read the **tdd-bug-fix** skill (`<milliways>/skills/tdd-bug-fix/SKILL.md`) in full before starting, and follow its failing-test-first cadence. Skip it when the test would be expensive, integration-heavy, or unclear.
   This is the canonical **sequence-verifiable-units** principle skill, the failing test first and the fix on top.
6. Review the branch with the **code-review** skill against its merge-base, then run **Opening a PR**.

**Reply:** what was broken, root cause, fix, how you verified. Paste failing-then-passing repro output verbatim.

**Reflect, the last step.** Keep this as the last item in the todo list, and do it before you send the reply. List what this thread had to work around: a broken or missing tool, a flaky check, a skill or doc that misled you, a lint you suppressed, a pattern you copied knowing it was wrong. File one `garden` issue for each, per `docs/agents/garden.md`, unless an open one already covers it, and name what you filed in the reply. In a repo without that document, list them in the reply instead. Run the full **reflect** skill as well when the thread was long or the chef asks for it. A playbook run inside another one, such as Opening a PR at the end of Feature, leaves this step to the outer playbook.
