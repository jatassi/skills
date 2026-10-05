### Opening a PR

Invoked at the end of every playbook that ships a change.

**Worktree.** Work from a git worktree off main. Subagents inherit it. Multiple `Agent` calls on the same branch each get their own worktree, or `git fetch && git reset --hard origin/<branch>` between them. Dirty branch with unrelated work: patch out, fresh worktree, apply. Snarled worktree: reset from main, redo minimally.

**Commits.** Commit liberally. Rebase into small, ordered commits before opening PRs. Each commit is a future PR: landable, ordered to tell the story. Amend when the fix belongs in a just-made commit. New commit when separable.

**PRs.** Run `/deslop` over the diff before commit. Run `/no-comments` before review. Review the branch with the **code-review** skill against its merge-base, unless the calling playbook already did. A one-way door also gets `interrogate`. Write every commit body with `/technical-writing`, then apply `/unslop`. Apply every technical-writing layer except Diátaxis. Use one word for each action, keep articles, and avoid `-ing` when a plain verb works.

**Title and description.** Write them with the **pr** skill. It owns the PR's anatomy: the title, the body's sections, the evidence it attaches, and the labels it sets, `door:one-way` among them. Where this playbook and the pr skill disagree about a title or a body, the pr skill wins. A commit body does not restate its subject.

**Forge.** Resolve the forge before the first PR operation and keep that choice for create, edit, view, watch, and merge. GitHub CLI (`gh`) is the default. If `command -v origin` succeeds and Origin can resolve the repository, prefer `origin pr ...`. If Origin is absent or cannot resolve the repository, stay on `gh` and record the fallback. Do not require Graphite (`gt`).

**Built-in PR tool.** When the run provides a built-in PR tool, create, edit, retarget, and mark ready through it, never through a forge CLI. Its own instructions say how. A PR made with the CLI misses what the tool tracks, such as a description later runs can edit. Use the resolved forge for everything the tool does not cover, and for every PR operation when the run has no such tool.

**Size.** One concern per PR, per the **pr** skill. Branch each PR from trunk, and sequence dependent work merge-then-branch. Never stack a PR on another PR's branch.

**Readiness.** Open every PR ready, never as a draft. The one exception is a `prototype:` PR, which the Prototype playbook opens as a draft on purpose. A built-in PR tool can default to draft, so set `draft: false` on every creation call through it. With Origin, pass `--status open`. With `gh`, omit `--draft`. If a PR still opens as a draft, mark it ready through the PR tool, or run `origin pr ready <number>` or `gh pr ready <number>` according to the resolved forge. Run `origin pr view <number>` or `gh pr view <number>` before you refer to PR status.

**Babysit.** Opening a PR does not start a babysit. Post the URL and keep building. Finish the phase or queue first. Run a separate babysit pass only when the user asks for one after the whole queue exists. A babysit for each new PR stalls the build and spends checks on commits that later waves restart. Push back when feedback drifts from intent.

A subagent that opens a PR runs the **code-review** skill (and `interrogate` for a one-way door), `/deslop`, and `/no-comments`, and posts the URL. Then it returns to the parent without babysitting, unless it is a PR's owner: an Autopilot-full owner, or a thread started from a Projects coordinator brief. That owner's brief assigns the babysit loop and is the ask `playbooks/babysit.md` waits for. An Autopilot-full owner starts the loop after its code-ready report and reports merge-ready as its playbook says. A thread started from a coordinator brief runs Babysit in `drive` mode to merge-ready, then merges only through the merge gate in `playbooks/autopilot-full.md` step 5, or on the chef's explicit request. The rules here and in `playbooks/babysit.md` that hold babysitting until a whole queue is built do not apply to an owner.

**Reflect, the last step.** Keep this as the last item in the todo list, and do it before you send the reply. List what this thread had to work around: a broken or missing tool, a flaky check, a skill or doc that misled you, a lint you suppressed, a pattern you copied knowing it was wrong. File one `garden` issue for each, per `docs/agents/garden.md`, unless an open one already covers it, and name what you filed in the reply. In a repo without that document, list them in the reply instead. Run the full **reflect** skill as well when the thread was long or the chef asks for it. A playbook run inside another one, such as Opening a PR at the end of Feature, leaves this step to the outer playbook.
