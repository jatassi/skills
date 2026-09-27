---
name: visual-grilling
description: Grilling with each round shown as a page in the browser, answered and commented on there.
disable-model-invocation: true
hooks:
  SessionEnd:
    - hooks:
        - type: command
          command: 'node "${CLAUDE_PLUGIN_ROOT}/skills/visual-grilling/dist/cli.mjs" end --hook'
---

Call the Skill tool with "grilling" and follow it. This skill changes only the channel: each round goes to the user as a round page in the browser, and the round submission comes back through the CLI. The terminal stays a channel too.

The CLI is `node ${CLAUDE_SKILL_DIR}/dist/cli.mjs`, where `${CLAUDE_SKILL_DIR}` is this skill's folder; `--help` lists its commands, flags and outcome lines. Read [`round-file.md`](round-file.md) before your first round. Read [`illustrating.md`](illustrating.md) before a round that illustrates.

## Each round

1. **Write the round file.** The round exactly as grilling would print it, in a scratch file outside the repository. Open it with a `design-tree` fence restating the whole design tree, every round.

2. **Present it.** Run `present <round.md>`. On a rejection, fix every line it printed and run it again. When it prints `session: <id>`, pass `--session <id>` to every later `present`, `await` and `end`. Put the printed link in your reply.
   - When the Claude Code desktop Browser pane's tools are present, pass `--no-open` and open the link in the Browser pane, and again whenever the link changes.
   - Otherwise `present` opens the user's default browser itself.

3. **Wait for the submission.**
   - On Claude Code, run `await` in the background and end your turn. The shell wakes you when it exits.
   - Elsewhere, run `await --timeout <seconds>` in the foreground, keeping it under your shell's command time limit.

4. **Read the outcome** on the first line of `await`'s output:
   - `submitted`: echo the `summary:` block verbatim to the user, then weigh the answers as grilling does. Unsure, comments-only and unanswered questions stay on the frontier; anchored comments and ⚠ warnings belong to the question they sit under.
   - `pending`: run `await` again.
   - `superseded`: ignore it; the user answered that round in the terminal.
   - `ended`: the server is gone. The next `present` starts a new one.

A reply the user types in the terminal answers the open round just as a submission does; carry on with it, and the next `present` marks that round answered in the terminal.

## When grilling concludes

Run `end` (with `--session <id>` if `present` printed one). It stops the server and deletes every file of the grilling session. If the agent session ends first, the session-end hook does the same.

If a skill asks you to call another skill which is not available, stop and ask the user to install the missing skills instead of fabricating their content.
