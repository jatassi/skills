### Opening a PR

Invoked at the end of every other playbook.

Work from a git worktree off trunk, and keep unrelated work out of it. Rebase into small, landable commits. Run `/deslop` over the diff before commit.

Title: `type(scope): subject`, naming a real symbol when one carries the change. Body: a one-minute briefing under 40 lines with these `##` headings in order, dropping empty ones: `## Why`, `## What changed`, `## Scope`, `## Tradeoffs` (only rejected alternatives a reviewer would otherwise ask about), `## Blast Radius`, `## Verification`.

Stack follow-ups by base branch. Open PRs ready, through the run's PR tool with `draft: false`. Without one, use `gh pr create` without `--draft`. In a cloud session the GitHub proxy rejects GraphQL, so `gh pr ...` and the watcher fail there. Use the session's GitHub MCP tools (`mcp__github__*`: PR reads, review threads, resolving threads, replies, auto-merge, merge) and `gh api` REST for the rest, and wake on `subscribe_pr_activity` events instead of the watcher. Opening a PR does not start a babysit.
