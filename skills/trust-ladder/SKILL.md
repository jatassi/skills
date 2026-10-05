---
name: trust-ladder
description: Score a kitchen's areas on the trust ladder from merged pull requests, as JSON. Use for the daily risk digest, to find promotions and demotions due, or to check whether a merge was clean.
---

# Trust ladder

The **trust ladder** decides who merges in each **area** of a kitchen. An area on rung `chef` waits for the chef's merge; ten clean merges in a row make a promotion to `gated` due, where a thread merges its own pull request once the gate holds. One unclean merge in a gated area makes a demotion due. The areas, rungs, thresholds and one-way doors live in `docs/agents/autonomy.md`, written by `setup-milliways`.

The scorer is `node ${CLAUDE_SKILL_DIR}/scripts/trust-ladder.mjs score`, where `${CLAUDE_SKILL_DIR}` is this skill's folder. It reads the autonomy document, fetches history through `gh`, and prints JSON on stdout. It only reads: proposing a promotion, applying a demotion and posting the digest are the caller's steps.

## Command line

```
trust-ladder score [--repo <dir>] [--autonomy <file>] [--now <iso>] [--since <iso>]
                   [--lookback-days <n>] [--base <branch>] [--limit <n>]
```

| Flag | Default | Meaning |
| ---- | ------- | ------- |
| `--repo` | current directory | The repo root. `gh` runs here; git history of the document is read here. |
| `--autonomy` | `<repo>/docs/agents/autonomy.md` | The autonomy document. |
| `--now` | the current time | The moment to score at. |
| `--since` | 24 hours before `--now` | Start of the digest window, which ends at `--now`. For a calendar day, pass its midnight with `--now` at the next midnight. |
| `--lookback-days` | 90 | How far back merges are scored for streaks. |
| `--base` | the repo's default branch | The branch merges land on. |
| `--limit` | 1000 | Most results per `gh` query. |

Exit status: `0` scored, `1` failed with the reason on stderr (no autonomy document, a malformed one, `gh` not signed in), `2` bad usage. Thresholds come from the document's Rules table (`clean-window-days`, `promotion-streak`), never from the script.

Environment: `TRUST_LADDER_GH_SCRIPT=<file>` is a test seam; when set, the scorer runs that script under `node` with the `gh` arguments instead of spawning `gh`.

## How a merge is scored

- **Area**: each changed file belongs to the first area, top to bottom, with a glob matching its repo-relative path. A merge belongs to every area its files land in. Globs: `**` spans directories (a leading `**/` also matches none), `*` and `?` stay within one path segment. Files no area matches are listed under `unassigned`.
- **Link**: something created within `clean-window-days` after the merge (inclusive), that references it. A reference is `#N`, `<this owner/repo>#N`, the pull request's URL, or a 7+ character prefix of its merge commit SHA. `other/repo#N` is not a reference. Three kinds:
  - `revert`: a pull request, open or merged, whose title starts with `Revert` and that references the merge either on a body line saying `revert` (GitHub's `Reverts owner/repo#N`, git's `This reverts commit <sha>`) or in its title outside the quoted original title.
  - `fix-forward`: a pull request, open or merged, with a line in its title or body that says `fix-forward` (or `fix forward`, `fixes forward`) and references the merge on that same line. Write it as `Fix-forward: #N`. A bare `Fixes #N` is a closing keyword, not a link.
  - `garden`: an issue labelled `garden`, in any state, whose title or body references the merge.
  Pull requests closed without merging never link.
- **Status**: `unclean` once any link exists; `clean` when the window has passed with none; `pending` while the window is still open.
- **Streak**: the clean merges in the area since its latest unclean merge. Pending merges neither extend nor break it until they settle.
- **Promotion due**: a `chef` area whose streak reaches `promotion-streak`.
- **Gated since**: for a `gated` area, the date of the first-parent commit at which the document's history last turned the area `gated` (the current time if that change isn't committed). `null` when unknown: no git history, or a shallow clone whose history ends while the area is still gated. Run on a full clone (`git fetch --unshallow`) so it is known.
- **Demotion due**: a `gated` area with an unclean merge merged since it was gated. With `gatedSince` unknown, the unclean merges after the area's latest run of `promotion-streak` clean merges count instead, or every unclean merge in the lookback when no such run is in it.

## Digest risk

Each merge in the digest window scores the sum of its factors, and the digest ranks by score, then most recent merge, then lowest number.

| Factor | Points |
| ------ | ------ |
| `door` | 40 when labelled `door:one-way` or touching a path under the document's `### Paths` of one-way doors |
| `verifier` | by the ledger label: `verifier-failed` or `verifier-blocked` 30, no tier label 20, `type-check-only` 15, `unit-test-verified` 5, `live-ui-verified` 0 |
| `blastRadius` | a body line `Blast radius: high` 20, `medium` 10, `low` 0; plus 5 for each area beyond the first |
| `size` | additions plus deletions: up to 10 lines 0, 100 lines 5, 500 lines 10, 1000 lines 15, more 20 |
| `newlyGated` | 15 when the merge is among the first `promotion-streak` merges in a gated area since it was gated |
| `linked` | 30 when the merge already has a link |

## Output

One JSON object, keys in this order, arrays in a fixed order, so equal inputs print byte-identical output. Times are ISO 8601 in UTC with milliseconds.

```jsonc
{
  "schema": 1,                       // bumped on any breaking change
  "repo": "owner/name",
  "base": "main",
  "now": "2026-10-04T12:00:00.000Z",
  "rules": { "cleanWindowDays": 7, "promotionStreak": 10 },
  "lookback": { "from": "<iso>", "days": 90 },
  "areas": [                         // document order
    { "area": "api", "rung": "chef", "gatedSince": null,
      "merges": 11, "streak": 10, "pending": 1, "unclean": [201] }   // PR numbers
  ],
  "unclean": [                       // merge order
    { "pr": 201, "url": "…", "title": "…", "mergedAt": "<iso>", "areas": ["web"],
      "links": [ { "kind": "revert", "number": 202, "url": "…", "createdAt": "<iso>" } ] }
  ],
  "promotions": [ { "area": "api", "streak": 10, "prs": [101, 102] } ],  // prs: the streak, merge order
  "demotions": [ { "area": "infra", "prs": [500, 501] } ],             // prs: unclean since gated
  "unassigned": [ { "pr": 12, "paths": ["odd/file"] } ],
  "digest": {
    "from": "<iso>", "to": "<iso>",
    "merges": [                      // ranked
      { "rank": 1, "pr": 601, "url": "…", "title": "…", "author": "login", "mergedAt": "<iso>",
        "score": 75,
        "factors": { "door": 40, "verifier": 0, "blastRadius": 20, "size": 15, "newlyGated": 0, "linked": 0 },
        "areas": ["api"], "rung": "chef",          // rung: the lowest among its areas; null with no area
        "door": { "oneWay": true, "label": true, "paths": [] },  // paths: files under one-way door globs
        "verifier": "live-ui-verified",            // or null
        "blastRadius": "high",                     // or null when the body doesn't say
        "newlyGated": false,
        "size": { "additions": 600, "deletions": 100, "files": 1 },
        "status": "pending",                       // clean | unclean | pending
        "links": [] }
    ]
  }
}
```
