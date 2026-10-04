# Glossary

## Grilling

**Channel**: the surface a grilling round is presented on and answers return through. The terminal is the default channel; `visual-grilling` adds a browser channel. A channel never changes the grilling procedure itself.

**Round page**: the browser channel's rendering of one grilling round: the round's numbered questions stacked as cards, each with its recommended answer and a way to answer inline.

**Illustration**: the rich content an agent attaches to a question on a round page to make it easier to answer: a diagram, table, chart, option mockups, or anything else the agent writes. Agents choose freely how to illustrate; ready-made building blocks exist for common cases, never as a limit.

**Block**: a ready-made kind of illustration that the round page renders from a source the agent writes in that kind's own language, checks before showing, and anchors comments to in the source's own terms. Raw HTML is an illustration but not a block.

**Option**: one of a question's lettered choices (A, B, C…). A recommendation may point at one option by its letter; picking an option answers the question with it.

**Mockup**: an optional sketch attached to one of a question's options, shown beside the other options' mockups; picking a mockup picks its option.

**Anchored comment**: a comment the user leaves by clicking a spot on a round page, carrying which question and which element of its illustration it points at.

**Round submission**: the user's answers to a whole round, sent back to the agent at once, including every anchored comment made during the round. A question may be answered by accepting the recommendation, picking an option, free text, or marked unsure; it may also carry only comments with no verdict, or be left unanswered. Unsure, comments-only and unanswered questions all stay on the frontier.

**Design tree**: the map of decisions a grilling session is working through, each branch hanging off the decision it depends on and marked settled or open. The agent restates the whole tree each round; the round page shows it beside the questions.

**Grilling session**: one agent session's run of `visual-grilling`, from its first round page until grilling concludes or the agent session ends. Its rounds, submissions and files belong to it alone and are gone when it ends; resuming the agent session starts a new grilling session.

## Kitchen

**Kitchen**: a repo set up to run milliways: its root AGENTS.md carries the one line that sends non-trivial work to the router, and its `docs/agents` folder holds the kitchen's config. milliways is the plugin that brings the whole kitchen from codebase to codebase.

**Chef**: the human who owns a kitchen. The chef makes the decisions only a human can (one-way doors, taste, intent, domain words), merges what the gate doesn't, and samples merged work afterwards.

**Router**: `make-it-so`, the entry point every non-trivial task starts with. It classifies the task, retrieves the playbook for that situation, and binds the thread to that playbook's steps.

**Playbook**: the written steps for one kind of task (feature, bug fix, opening a pull request, large or one-way-door work), copied verbatim into a thread's todo list by the router. Every playbook ends with a reflect step that files garden issues.

**Area**: a part of a codebase, declared as path globs in the kitchen's autonomy document. Trust is earned and lost per area.

**Rung**: an area's place on the trust ladder. At the bottom rung the chef merges every pull request in the area; an area that is gated lets a thread merge its own. Ten clean merges in a row make a promotion due, proposed as a pull request the chef merges; any unclean merge in a gated area demotes it back to the chef.

**Gate**: the conditions under which a thread in a gated area merges its own pull request: CI is green, a fresh verifier's verdict passes at the head SHA with live evidence, and the door is two-way. It is enforced by playbook steps, not by branch protection.

**Clean merge**: a merge that no revert, fix-forward pull request or garden issue links back to within seven days. Cleanliness is computed by the trust-ladder scorer, never judged.

**Door**: how reversible a change is. A two-way door can be walked back cheaply; a one-way door can't, carries the `door:one-way` label, and always waits for the chef, in every area at every rung.

**Garden issue**: a GitHub issue labelled `garden` recording a workaround, banned pattern or repeated mistake. Threads file them when they reflect, a nightly sweep files them, and a weekly pass clusters them and corrects each cluster at the highest level that works (architecture, then types, then a lint, then a test, then docs).

**Live lane**: the part of verification that drives the running app and captures evidence of the behaviour. It is the floor of every verdict: CI passing is an input, never a verdict.

**Verdict**: a verifier's pass or fail on a pull request, bound to its head SHA and patch-id so that a rebase can't carry a stale pass.

**Ledger**: the record of what has been verified, kept in GitHub (issue comments, pull request labels and checks) keyed by pull request and head SHA, at one tier: live-ui-verified, unit-test-verified, type-check-only, verifier-blocked or verifier-failed.

## Vendoring

**Upstream**: a repo milliways vendors skills from, pinned to one commit in `vendor/upstream.json`: cursor/plugins (pstack and cursor-team-kit) and mattpocock/skills.

**Derived form**: what a vendored file would be with no fork: the upstream file at the pinned commit, at its local path, after the substitution table.

**Substitution**: a mechanical rewrite in `vendor/substitutions.json`, applied to every upstream file on every sync (Task tool → Agent tool, a model version → its tier).

**Fork**: a vendored file allowed to differ from its derived form, declared in `vendor/forks.json` with a kind (policy, which changes what a skill does, or port-feature, which adapts it to Claude Code or the kitchen) and a reason. Any other difference fails the check.

**Skill triage**: deciding, for an upstream skill new since the last pin, whether milliways includes or excludes it. Not to be confused with issue triage and its labels.
