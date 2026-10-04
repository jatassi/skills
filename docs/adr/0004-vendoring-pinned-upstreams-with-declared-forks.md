# Upstream skills are vendored from pinned commits, with every divergence declared

milliways ships skills from two upstreams, [cursor/plugins](https://github.com/cursor/plugins) (pstack and the cursor-team-kit skills it depends on) and [mattpocock/skills](https://github.com/mattpocock/skills). Each upstream is pinned to a commit. Every vendored file is that commit's file, mapped to its local path and passed through a substitution table of mechanical rewrites, unless it is a declared fork. A fork has a kind (`policy` or `port-feature`) and a reason. A check fails the build on any other divergence, and on what the rewrites exist to remove: Cursor-isms, pinned model versions, CLAUDE.md, agent types outside the `milliways:` namespace, and playbook steps naming skills the plugin doesn't ship. A sync moves a pin and three-way merges upstream's changes into each fork. Changes that collide come back as conflicts for a human. New upstream skills come back for triage.

We chose this because both upstreams keep moving, and milliways must follow them without its own changes going unrecorded. Vendoring from the source keeps each upstream diff small enough to review weekly, and keeps every divergence written down with its reason. The mechanism (an upstream manifest, a substitution table and a declared-forks list) is borrowed from [pstack-claude](https://github.com/michael-denyer/pstack-claude); its tree is not.

## Considered Options

- **Fork open-pstack.** Rejected: it is two upstream releases behind, built around Grok and GPT lanes, and keeps its config in `~/.claude`, which cloud threads don't have.
- **Fork pstack-claude.** Rejected: it is well engineered, but it carries 46 policy forks plus Pi and generator machinery. We would inherit someone else's divergence, and every upstream release would reach us second-hand.
- **Copy upstream skills by hand.** Rejected: that is what drifted before. Matt's `CONTEXT.md` → `GLOSSARY.md` rename never reached the hand-made copies.

## The files

All four live in `vendor/` and are data. Adding a skill, a rewrite or a fork is an edit to one of them, never to the CLI.

- **`upstream.json`**: per upstream, the `repo`, the pinned `commit` (a full SHA), the paths it ships (`include`, local path → upstream path, a file or a folder; `{ "path", "verbatim": true }` copies bytes untouched and skips the checks, for licences and scripts), the upstream folders whose child folders are skills (`watch`), and the upstream paths deliberately not shipped, each with its reason (`exclude`).
- **`substitutions.json`**: ordered rules, each a literal `pattern` or a `regex` (with optional `flags`), a `replacement` (a regex rule may use `$1`), an optional `files` regex over local paths, and a `why`. Each rule runs on the output of the ones before it. A literal pattern that contains an earlier one is rejected, so put the more specific rule first.
- **`forks.json`**: local path → `{ "kind": "policy" | "port-feature", "why" }`. A `policy` fork changes what a skill does. A `port-feature` fork adapts it to Claude Code or the kitchen in a way no mechanical rewrite can.
- **`checks.json`**: the denylist (each entry a `rule` name, a `token` or `regex`, and a `hint`), the built-in agent types, the plugin namespace, which local paths are playbooks, and the patterns that find a skill named in a playbook step.

## The commands

```
npm run vendor -- check
npm run vendor -- sync [--upstream <name>] [--to <sha>|HEAD] [--overwrite]
```

`check` derives every upstream at its pin and compares it with the tree. It exits 1 on any of these:
- a vendored file that differs from its derived form (bytes, or the executable bit on POSIX), is missing, or is extra, with no fork declared;
- a fork that no longer differs (stale);
- a fork outside every include;
- a denylisted line;
- an agent type that is neither built in nor a `milliways:` agent in `agents/`;
- a playbook naming a skill missing from `skills/`;
- a leftover conflict marker.

It runs at the end of the vendor workspace's tests (whenever `npm test` picks that workspace, and always under `npm run test:all`) and as its own step in the Release workflow.

`sync` moves the named upstream, or all of them, to `--to`. Without `--to` it re-derives each upstream at its pin, which is how a new include or rule lands. It writes the tree, moves the pin and then runs `check`. Each non-forked file is rewritten from upstream. A fork upstream left alone is kept. A fork upstream changed is three-way merged, and a collision is written with git's conflict markers. The run reports every upstream skill folder that is new since the old pin and neither included nor excluded. If any vendored file has diverged from its old derived form without a declared fork, sync stops before writing anything. `--overwrite` restores those files instead. It is also how edits to the substitution table reach files that aren't forks. Exit 1 means something needs a human, and 2 means a usage or configuration error.

Upstream commits are fetched into bare clones under `node_modules/.cache/milliways-vendor/`, and files are read from git's object store, so bytes and line endings are upstream's on every platform. `.gitattributes` marks the vendored folders `-text` so that a checkout never converts them either. Check also compares the executable bit, on POSIX only.

## Consequences

- Every rewrite is in the table and every fork is in the list, each with its reason. The diff between milliways and upstream can be read without reading the tree.
- A rewrite only reaches a non-forked file through `sync`. A fork doesn't pick up later rewrites at all, so the checks are what catch a Cursor-ism left in a fork.
- The check needs the network the first time it sees a commit.
- Rewrites match upstream's exact wording, so an upstream rewording can slip past a rule. The denylist catches what slips through.
