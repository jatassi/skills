# The browser channel

This channel changes only where rounds appear: each round goes to the user as a round page in the browser, and the round submission comes back through the CLI. Your conversation with the user stays a channel too.

The CLI is `node <this skill's folder>/dist/cli.mjs`, the command the Channel step ran; `--help` lists its commands, flags and outcome lines. Read [`round-file.md`](round-file.md) before your first round. Read [`illustrating.md`](illustrating.md) before a round that illustrates.

## Each round

1. **Write the round file.** The round exactly as grilling would print it, in a scratch file outside the repository. Open it with a `design-tree` fence restating the whole design tree, every round.

2. **Present it.** Run `present --agent "<your name>" <round.md>`, naming the agent product you are as you'd introduce yourself (`"Claude Code"`, `"Codex"`, `"Gemini CLI"`, `"Cursor"`…); the round page shows it with its logo. On a rejection, fix every line it printed and run it again. When it prints `session: <id>`, pass `--session <id>` to every later `present`, `await` and `end`. Put the printed link in your reply.
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

Stop every server you started: run `end`, once with each `--session <id>` you used (or bare, if `present` never printed one). Do this when grilling concludes, when the user abandons or redirects it mid-grilling, when the user switches to the text channel, and always before your work in this agent session ends. `end` deletes every file of the grilling session, and does nothing for one that is already gone.
