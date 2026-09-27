# PROTOTYPE: in-chat round pages in Claude Code desktop

Throwaway spike for [Prototype: in-chat round pages in Claude Code desktop](https://github.com/jatassi/skills/issues/9), part of the [Visual grilling map](https://github.com/jatassi/skills/issues/1). Not production code.

**Question:** can Claude Code desktop show a round page inside the chat and carry a round submission back to the agent? Two paths: a local MCP server returning an MCP Apps view, and the inline widget's `sendPrompt(text)`.

## Files

| File | What it probes |
|---|---|
| `mcp-apps-probe.mjs` + `/.mcp.json` | Zero-dep stdio MCP server; tool `show_round` bound to `ui://visual-grilling/round`; logs every JSON-RPC message to `probe.log` |
| `probe.log` | Evidence: `initialize` from Claude Code CLI 2.1.278 (headless) and desktop 2.1.281 |
| `widget-sendprompt-probe.html` | `widget_code` for the `visualize` `show_widget` tool: mini round with an anchorable SVG, options, free text, payload padding, localhost probes |
| `localhost-probe.mjs` + `localhost-probe.log` | Logging HTTP server on 127.0.0.1:47613; the log shows no widget request ever arrived |
| `widget-cdn-probe.html` | Widget loading Mermaid + Tailwind browser from jsdelivr and an ESM import from esm.sh |

Run the MCP probe: `claude -p "call show_round" --mcp-config .mcp.json --strict-mcp-config --allowedTools mcp__round-probe__show_round`. Widget probes are pasted as `widget_code` into `show_widget`.

## Verdict

**Path A, local MCP server + MCP Apps: does not render.** Neither the CLI (2.1.278) nor the desktop Code tab (2.1.281) advertises `capabilities.extensions["io.modelcontextprotocol/ui"]` at `initialize`, and neither ever calls `resources/read` for the `ui://` view; only the tool's text reaches the agent. Matches anthropics/claude-code#95149 (still open). Only useful as progressive enhancement for other hosts, detected server-side from `initialize`.

**Path B, inline widget + `sendPrompt`: works, with caveats.**

- Renders a round page inline; an anchored comment (question, illustration, element, text) plus answer arrive intact.
- `sendPrompt` **fills the composer; the user presses Enter**. It never auto-sends, so the widget can't wake the agent by itself. It fits grilling's turn model anyway: the agent ends its turn after showing the round and the submission is the next user message, with no wait or server involved.
- Payload size: 32 KB arrived whole as plain text (not an attachment). Bigger wasn't tried: real submissions are a few KB, and the cost that matters is context tokens, since the submission lands in the transcript verbatim and the user sees it as their own message.
- **Sealed from localhost:** fetch GET/POST, WebSocket, image beacon, `sendBeacon` and iframe to 127.0.0.1 all blocked (zero requests logged; iframe blank). The widget can't talk to a local server or read the round files.
- **CDN works:** the CSP allowlist (cdnjs, jsdelivr, esm.sh, unpkg, Google Fonts) loaded Mermaid (rendered), Tailwind browser (applied) and an esm.sh import. A round page shell hosted as an npm package on jsdelivr would let the agent emit only round data, not the whole page, each round.
- **No pull:** `read_widget_context` returns nothing for `show_widget`; the agent only learns what `sendPrompt` sends.
- **Session:** the first widget kept working across ~6 turns and repeated submissions. Survival across session resume is **untested**.
- **Detection:** a `show_widget` tool in the agent's tool list (the `visualize` connector; tool ids vary, e.g. `mcp__visualize__show_widget` plus a UUID-prefixed twin).
