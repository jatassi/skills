# Verification

How a verifier proves a change works in this kitchen. This is the one full statement of the verification ledger. Playbooks, skills and the Projects coordinator brief point here rather than restate it.

Verify skill: `none`

## The live lane is the floor

Every verdict includes the live lane: drive the running app the way a user does, on the surface the change touches (a UI, a CLI, a simulator), and capture the evidence (screenshots, a screencast, CLI transcripts). A verdict without live evidence is not a pass. CI passing is an input to the verdict, never the verdict.

When the verify skill above is `none`, prove the behaviour live by hand with whatever drives the surface (a browser, the CLI, a simulator), and propose creating one with `create-verification-skill`. Once a verify skill exists, `maintain-verification-skill` keeps it and its feature map current.

The verifier runs on the `verifier` role in `docs/agents/models.md`, its swarm lanes included. It is a fresh subagent: never the agent that wrote the change, and never resumed from an earlier round.

## The ledger

The ledger lives in GitHub, never in memory or a transcript. It holds one verdict per pull request number and head SHA. A verdict is two things on the pull request:

- a comment that starts `ledger: <tier> at <head SHA>` and names the patch-id, the lanes run and the evidence;
- the tier as the pull request's only tier label. Replace the label when a new verdict lands.

The verdict is bound to the head SHA and the patch-id, so a rebase can't carry a stale pass. "Was this verified?" is answered by the ledger and by nothing else.

## Tiers

Each verdict is at exactly one of these five tiers:

| Tier | Meaning |
| ---- | ------- |
| `live-ui-verified` | The live lane drove the running surface and passed. The only tier that passes the merge gate. |
| `unit-test-verified` | Tests passed, but no live lane ran. Not a pass. |
| `type-check-only` | Only static checks ran. Not a pass. |
| `verifier-blocked` | The verifier couldn't run its lanes (environment, auth, a dead tool). Not a pass. |
| `verifier-failed` | A lane proved a defect. |

## From a lane's report to a tier

Verifier lanes report `PASS`, `PASS+NOTES` or `FAIL` (a swarm worker's `ISSUES` is a `FAIL`, and its `BLOCKED` is blocked). The aggregate maps to one tier:

- Every lane `PASS` or `PASS+NOTES`, the live lane among them: `live-ui-verified`. Put the notes in the comment. A note that names a defect is a `FAIL`.
- Every lane passed, but no live lane ran: `unit-test-verified`, or `type-check-only` when only static checks ran.
- Any lane `FAIL`: `verifier-failed`.
- A lane that couldn't run, or whose evidence settles nothing (inconclusive, the wrong surface), and no `FAIL`: `verifier-blocked`.

## Reading the ledger

- **Check the head before you trust a verdict.** Compare it with `gh pr view <n> --json headRefOid`. A new head SHA voids the verdict unless its patch-id is unchanged.
- **`verifier-blocked` is not a pass.** Run a fresh verifier once the environment heals.
- **`verifier-failed` gets a fix**, not a re-verify of the same head.
- **A verifier overrides the worker.** A worker may self-report a tier. A verifier's verdict on the same pull request and head SHA replaces it.
- **A chef's merge is recorded too.** When the chef explicitly asks a thread to merge a pull request, the thread merges it and says so in the ledger comment (`merged on the chef's request`), whatever the tier.

## Cloud environments

The kitchen's vendored scripts (`watch-pr`, `check-plan`, `worktree-audit`) run on Bun. A cloud environment that uses them must install Bun in its setup script, for example `curl -fsSL https://bun.sh/install | bash`, since cloud threads start without it.
