---
name: setup-milliways
description: Make this repo a kitchen, or refresh one. Writes the `docs/agents` config, the one root AGENTS.md line, the GitHub labels and the model-role table detected from this harness. Safe to re-run.
disable-model-invocation: true
---

# Setup milliways

A **kitchen** is a repo whose root `AGENTS.md` sends non-trivial work to `make-it-so`, and whose `docs/agents/` folder holds the kitchen's config behind its own `AGENTS.md` index. This skill makes one, and on a re-run adds only what's missing.

The CLI is `node ${CLAUDE_SKILL_DIR}/scripts/setup-milliways.mjs`, where `${CLAUDE_SKILL_DIR}` is this skill's folder. It does the deterministic parts: `detect`, `write` and `labels`, each with `--repo <root>`; `--help` lists flags and output lines. `write` creates what's missing and never overwrites a file, so every hand edit survives a re-run. The judgment parts (what to show the chef, folding `CLAUDE.md`) are yours.

## 1. Detect

Run `detect` at the repo root and read its JSON: the GitHub repo, the harness and model families, every `CLAUDE.md`, every `CONTEXT.md` to rename, which `docs/agents` documents exist, and any `verify-*` skill.

If `github` is null, stop and tell the chef: a kitchen runs on GitHub Issues, labels and pull requests, so the repo needs a GitHub `origin` first.

## 2. Present and confirm

Show the chef what exists and what `write` will add, then take these one at a time, leading each with the recommendation so a word accepts it. Skip any that detection already settled.

- **Triage labels** (only when `docs/agents/triage-labels.md` is missing): keep the five defaults? Recommended: yes. On no, collect the chef's label string for each role.
- **Models** (only when `docs/agents/models.md` is missing): show the roles `write` will give the detected families. The defaults: opus at high effort for judgment and the hardest code, sonnet for code delegates and explorers, a fresh opus verifier, an opus-only review panel, and fable on no role. A second family (the first detected family other than the harness's own, through `codex`, `gemini` or `claude` on PATH) gets one diff-audit verifier lane and one interrogate seat. Ask whether to accept, promote fable to a role, or drop the second family. Name models by tier only (haiku, sonnet, opus, fable; luna, sol, astra), never by version.
- **Stale models** (when `docs/agents/models.md` exists and its `Detected families` line differs from detection): say what changed and offer to update the Detected line and the second-family rows by hand. A family missing in a cloud thread but present on the chef's laptop is expected; the fallback rule covers it, so recommend keeping the document.
- **CLAUDE.md**: for each one detected, offer to fold its content into the `AGENTS.md` beside it and delete it, so the harness reads `AGENTS.md` natively. Recommended: yes.
- **`## Agent skills` block** (when `agentsMd.agentSkillsBlock` is true): offer to delete it from the root `AGENTS.md`; the `docs/agents` index replaces it. Recommended: yes.
- **CONTEXT.md**: tell the chef each rename `write` will make. No question unless one is a `conflict`, which is the chef's to resolve.

Every point is confirmed when the chef has answered it or accepted its recommendation.

## 3. Write

1. Run `write`, with `--families <list>` when the chef dropped or chose families. Read every output line: `created`, `added`, `renamed`, `indexed` and `updated` are changes; `kept` means a file was already there and was left alone; `conflict` and `stale` need the chef.
2. Apply the chef's answers to the documents this run created, and only those: label overrides in `triage-labels.md`'s right-hand column, role changes in `models.md`'s Roles table.
3. Fold each confirmed `CLAUDE.md` into the `AGENTS.md` in the same directory (for the root, below the directive line), dropping lines the `AGENTS.md` already says, then delete the `CLAUDE.md`. Write no `CLAUDE.md` anywhere.
4. Delete a confirmed `## Agent skills` block.
5. After a rename, search the repo for references to `CONTEXT.md` and `CONTEXT-MAP.md` and point them at `GLOSSARY.md` and `GLOSSARY-MAP.md`.

Done when every confirmed change is on disk and the root `AGENTS.md` carries the directive line exactly once.

## 4. Labels

Run `labels`. It reads the triage strings from `docs/agents/triage-labels.md` and creates, through `gh`, each missing label: the five triage labels, `wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, `wayfinder:task`, `garden`, `door:one-way` and `prototype`. If `gh` isn't signed in, tell the chef to run `gh auth login`, then run `labels` again.

## 5. Verification

When `detect` found no `verify-*` skill, offer once to create one with `create-verification-skill`, so threads can drive the app the way a user does. On no, move on.

## 6. Report

Tell the chef what changed, what was kept, and anything left for them (conflicts, a stale models document, labels not created). Leave the changes uncommitted for the chef to review. The documents are theirs to edit from here; re-running this skill fills in whatever a later milliways adds.
