# The browser channel is a bundled Node CLI driving a detached local server

`visual-grilling` carries its browser channel through one path on every host: the agent writes a Markdown round file and runs a CLI bundled in the skill folder (`present`, `await --timeout`, `end`); the first `present` starts a detached Node server that serves the round page, and `await` returns the round submission or `pending`. We chose this because it works in any agent with a shell, runs only while a grilling session is live, and lets the CLI validate blocks with the same libraries the page draws them with. Host features change only where the page shows (the Claude Code desktop Browser pane when present) and how the agent waits (a background `await` where the shell can wake the agent), never the payload.

## Considered Options

- **An MCP server** (`present_round` / `await_submission` tools): rejected for now. It would run in every session with the plugin enabled, and host tool timeouts vary widely (Codex defaults to 60 s). The core stays transport-independent so an MCP layer can wrap it later.
- **MCP Apps views**: Claude Code (CLI and desktop) doesn't render them from a local server.
- **The Claude Code desktop inline widget** (`show_widget` + `sendPrompt`): it works, but as a second carrier with no server. The user has to press Enter to send each submission, which lands as a visible user message, and the page would need its own delivery and error path. Out of scope for this effort.
- **WebMCP**: draft, Chrome-only, and the page can't push a submission.
- **Python stdlib or a compiled binary instead of Node**: Python can't run the JS validators; per-platform binaries need a release pipeline and are tens of MB each.
- **npx or CDN delivery**: rejected for prebuilt bundles committed in the skill folder, so installing the plugin is the whole install, it works offline, and nothing loads from a third-party origin.

## Consequences

- Node (a pinned minimum version) is a hard requirement of the skill.
- Release commits carry built bundles (CLI plus page libraries); Shiki ships a curated language set to keep them small.
- The terminal stays a channel: a reply typed there answers the round, and the page marks it answered in the terminal.
