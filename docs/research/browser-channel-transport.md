# Research: how an agent drives a browser page and awaits a round submission

Ticket: [jatassi/skills#2](https://github.com/jatassi/skills/issues/2) (map [#1](https://github.com/jatassi/skills/issues/1)). Researched 2026-09-26 against primary sources. Vocabulary (channel, round page, round submission) is from `CONTEXT.md`.

## Question

Which mechanism should carry the browser channel between agent and page?

- **(a)** a local HTTP server plus a blocking CLI command the agent runs;
- **(b)** an MCP server exposing tools like `present_round` / `await_submission`, including **MCP Apps** (interactive UI rendered inside the host);
- **(c)** **WebMCP**.

For each: spec status, host support, whether the agent can block until a round submission arrives (and the timeouts), and install/runtime cost.

## Short answer

Use **(a)** as the baseline: a small local HTTP server that serves round pages and collects submissions, plus a CLI command that blocks until a submission arrives or a timeout passes. It is the only option that meets the map's "any agent + any browser" baseline, because every agent host has a shell tool. It also keeps the terminal-link flow the map's Destination describes. Design the core so a plain MCP facade **(b, without Apps)** can be added later for hosts where MCP is a better fit. Leave **MCP Apps** for later as an optional in-host rendering, and do not use **WebMCP** at all: its calls run the wrong way, and today it only works in Chrome behind an origin trial.

Whatever the transport, the wait must be **bounded and re-entrant**: `await` takes a timeout and returns either the submission or `pending`, and the agent calls it again. Hosts cap tool calls at anywhere from 60 s (Codex's MCP default) to hours (Claude Code's MCP default), so a single call that blocks forever is not portable.

## Comparison

| | (a) Local HTTP + blocking CLI | (b) MCP server, plain tools | (b') MCP Apps | (c) WebMCP |
| --- | --- | --- | --- | --- |
| Spec status | None needed (HTTP + shell) | MCP core, current revision `2026-07-28` | Stable extension `io.modelcontextprotocol/ui`, spec 2026-01-26 | Draft Community Group Report (W3C WebML CG), not a standard |
| Where the page renders | User's own browser (any) | User's own browser (the server hosts the page) | Sandboxed iframe **inside the host's chat UI** | User's Chrome tab |
| Hosts | Any agent with a shell tool | Any MCP client (Claude Code, Codex, Cursor, Copilot/VS Code, all Agent Plugins clients) | Claude web/Desktop, VS Code Copilot, M365 Copilot, ChatGPT, Cursor, Goose, Postman, MCPJam, Archestra, PostHog Code. **Not Claude Code CLI.** | Chrome 149+ origin trial, or a flag for local dev; agents: in-browser agents, or an external agent through experimental chrome-devtools-mcp tools |
| Direction page to agent | Page POSTs to the local server; the CLI returns it | Page POSTs to the server; the `await` tool returns it | `ui/message` (injects a user message, triggers a turn) or `tools/call` to an app-only tool | **None.** The page exposes tools that the agent calls; the page cannot push to the agent |
| Can the agent block? | Yes, bounded by the host's shell timeout (Claude Code: 2 min default, 10 min max, then auto-backgrounded) | Yes, bounded by the MCP tool timeout (Claude Code: long, but auto-backgrounds after 2 min; Codex: 60 s default) | Not needed: the UI starts a new turn itself | No blocking primitive |
| Install/runtime | One script plus a runtime (Node or Python stdlib) | An MCP server entry in the plugin (Agent Plugins `mcp.json`, Claude Code `.mcp.json`) plus the same runtime | As (b), plus the ext-apps SDK or a hand-rolled postMessage bridge; HTML must fit the host's CSP | Chrome with origin-trial token or flag, plus a CDP bridge for CLI agents |

## (a) Local HTTP server + blocking CLI command

**Mechanism.** The skill ships a script (for example `skills/visual-grilling/scripts/…`). One subcommand starts a localhost server bound to `127.0.0.1` that serves round pages and accepts `POST` submissions. It writes round files to disk. Another subcommand, `await`, long-polls until the round's submission arrives or `--timeout` elapses, then prints the submission (or `pending`) to stdout. The agent prints the URL in the terminal and optionally opens it (`open` / `xdg-open` / `start`).

**Blocking in Claude Code.**
- The Bash tool's default timeout is `BASH_DEFAULT_TIMEOUT_MS` = 120000 (2 min), and the model can raise it per call up to `BASH_MAX_TIMEOUT_MS` = 600000 (10 min) ([env vars](https://code.claude.com/docs/en/env-vars); [tools reference, "Timeout and output limits"](https://code.claude.com/docs/en/tools-reference)).
- "When a command reaches its timeout without finishing, Claude Code moves it to the background instead of stopping it" ([tools reference, "Background commands"](https://code.claude.com/docs/en/tools-reference); [interactive mode, "Background Bash commands"](https://code.claude.com/docs/en/interactive-mode)). A slow user therefore does not kill the wait.
- The agent can start `await` with `run_in_background: true` on purpose. Background commands started by the main conversation keep running after the turn ends ([tools reference](https://code.claude.com/docs/en/tools-reference)). Claude Code's Bash tool description says a background command "re-invokes you when it exits" (observed in the tool schema of this session). So the terminal stays free and the agent wakes when the user submits. Background tasks are cleaned up when Claude Code exits ([interactive mode](https://code.claude.com/docs/en/interactive-mode)), which suits the map's "cleaned up when the session ends" preference.
- There is an alternative for streaming events: the **Monitor** tool feeds each output line of a background command, or each WebSocket message, back to Claude. Every watch has a deadline of 5 min by default and at most 30 min ([tools reference, "Monitor tool"](https://code.claude.com/docs/en/tools-reference)). It is less suited than a single background `await`, because rounds can take longer than 30 min.
- A foreground subagent's background command ends when the subagent gives its final response ([tools reference](https://code.claude.com/docs/en/tools-reference)). The wait should therefore run in the main conversation that holds the grilling session.

**Blocking elsewhere.** Other hosts cap shell commands differently, and some do not auto-background. A bounded `await --timeout N` that returns `pending` makes the loop portable: the agent simply runs it again.

**Host features.** Claude Code desktop has a Browser pane. Claude can open localhost URLs there through preview servers configured in `.claude/launch.json`, and `localhost`, `*.localhost`, `127.0.0.1` and `::1` open without a prompt ([desktop docs, "Preview your app", "Configure preview servers"](https://code.claude.com/docs/en/desktop)). This is the "host feature when present" path: same server, opened in the pane instead of the system browser.

**Cost.** No protocol dependency. Needs a runtime. Node's `http` and Python's `http.server` are both stdlib, but neither is guaranteed on every machine (Claude Code no longer requires Node). This is an open question for the architecture ticket.

## (b) MCP server with present-round / await-submission tools

**Packaging.** Agent Plugins 1.0.0 (published 2026-08-06) defines exactly two component types, skills and MCP servers. MCP servers are declared in `mcp.json` at the plugin root with `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` placeholders ([Agent Plugins spec](https://agent-plugins.org/specification)). Launch clients: "ChatGPT and Codex, Cursor, GitHub Copilot, Kiro, VS Code" ([Vercel announcement](https://vercel.com/blog/introducing-agent-plugins)). Claude Code plugins bundle servers in `.mcp.json` or inline in `plugin.json` with `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}`. Claude Code connects them at startup, and tools are named `mcp__plugin_<plugin>_<server>__<tool>` ([Claude Code MCP docs, plugin servers](https://code.claude.com/docs/en/mcp)). So this repo could ship one server to both formats.

**Blocking in Claude Code** ([Claude Code MCP docs](https://code.claude.com/docs/en/mcp); [env vars](https://code.claude.com/docs/en/env-vars)):
- `MCP_TOOL_TIMEOUT` defaults to 100000000 ms (about 28 hours). A per-server `timeout` in `.mcp.json` overrides it and acts as a hard wall-clock limit. Progress notifications do not extend it.
- **Idle timeout**: a call with no response and no progress notification aborts after 30 min for stdio servers, or 5 min for HTTP/SSE/WebSocket servers (`CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`; stdio has been covered since v2.1.203). An `await_submission` tool must therefore send progress notifications while it waits.
- **Auto-backgrounding**: a main-conversation MCP call still running after 2 min moves to a background task. Claude gets a task ID and receives the result as a task notification (`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`, v2.1.212+). Calls from subagents never background.
- HTTP servers also have a per-request timer of at least 60 s up to the first response byte. Stdio servers do not.
- `MCP_TIMEOUT` (server startup) defaults to 30 s.

**Blocking in Codex.** The MCP tool timeout defaults to 60 s and the startup timeout to 10 s. Installed plugins can bundle MCP servers ([OpenAI MCP docs, CLI](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)). A single long-blocking `await_submission` fails there unless the user raises `tool_timeout_sec`, so the bounded/`pending` loop is needed here too.

**Other MCP routes that do not fit.**
- MCP **elicitation** shows a host-drawn form, not a browser page. Claude Code blocks the call while the dialog is open ([Claude Code MCP docs](https://code.claude.com/docs/en/mcp)).
- Claude Code **channels** let an MCP server push events into a running session. But they are a research preview that needs `--channels`, claude.ai or Console auth, and admin enablement on Team/Enterprise. Documented channel plugins require Bun. And on the v2 runtime a channel server that negotiates MCP `2026-07-28` cannot deliver messages ([channels docs](https://code.claude.com/docs/en/channels); [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)). This is too gated for a baseline, though a later Claude Code-only upgrade could use it to push submissions without an `await`.

**Cost versus (a).** Same runtime need, plus an MCP SDK or a hand-rolled JSON-RPC loop, plus a server that runs for every session in which the plugin is enabled (not only while grilling). Gain: structured tool I/O, and no dependence on a shell tool. Loss: every host has different MCP timeout defaults to manage.

## (b') MCP Apps

**Status.** A stable extension, identifier `io.modelcontextprotocol/ui`, spec version 2026-01-26 ([spec](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx); [overview](https://modelcontextprotocol.io/extensions/apps/overview)). A tool declares `_meta.ui.resourceUri` pointing at a `ui://` HTML resource, and the host renders it in a sandboxed iframe in the conversation.

**Can the UI send input back?** Yes, in two ways:
- `ui/message` sends a message into the host chat. Per the spec, the host "SHOULD add the message to the conversation context, preserving the specified role" and "MAY request user consent". In practice this is how a UI triggers a follow-up turn.
- The UI can call `tools/call` on an app-only tool (`_meta.ui.visibility: ["app"]`), which the host must hide from the model.

`ui/update-model-context` does not start a turn: the host "MAY defer sending the context to the model until the next user message" ([spec](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)). The view is initialized in parallel with the tool call, and `tool-result` is sent "when tool execution completes (if the View is displayed during tool execution)". So a long-running tool could, in principle, wait on an app-only submit tool, but the host's MCP timeouts still apply.

**Hosts** ([client matrix](https://modelcontextprotocol.io/extensions/client-matrix)): Claude (web), Claude Desktop, VS Code GitHub Copilot, Microsoft 365 Copilot, Goose, Postman, MCPJam, ChatGPT, Cursor, Archestra.AI, PostHog Code. **Claude Code is not listed.** Its docs treat `ui://` / `text/html;profile=mcp-app` resources as "pages for a host application to render rather than content for Claude to read" and hide them from resource listings ([Claude Code MCP docs, "Reference MCP resources"](https://code.claude.com/docs/en/mcp)). This repo's primary host, the Claude Code CLI, would never show the round page.

**Constraints.**
- Views must run in sandboxed iframes.
- With no declared `ui.csp`, the host must apply `default-src 'none'; script-src 'self' 'unsafe-inline'`, so external libraries need declared `resourceDomains` ([spec](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)). Free-form illustrations written by agents would have to live inside that.
- The page is embedded in chat, not a link the terminal shows, which conflicts with the Destination's flow.

**Verdict.** A good optional second renderer for Claude Desktop, ChatGPT or VS Code users, sharing the same round/submission core. It is not the baseline.

## (c) WebMCP

**Status.** A Draft Community Group Report from the W3C Web Machine Learning Community Group; "not a W3C Standard nor … on the W3C Standards Track" ([spec](https://webmachinelearning.github.io/webmcp/)). Chrome ships it as an origin trial from Chrome 149, plus `chrome://flags/#enable-webmcp-testing` for local development ([Chrome docs](https://developer.chrome.com/docs/ai/webmcp); [origin trial post](https://developer.chrome.com/blog/ai-webmcp-origin-trial), 2026-06-09). Neither source mentions other browsers.

**Direction.** Pages register JavaScript tools with `document.modelContext.registerTool()` for agents to call ([spec](https://webmachinelearning.github.io/webmcp/)). The agent calls into the page; there is no mechanism for the page to push a submission to the agent. A CLI agent reaches the tools only through a browser bridge. For example, chrome-devtools-mcp's `list_webmcp_tools` / `execute_webmcp_tool` sit behind `--categoryExperimentalWebmcp=true`, and its only waiting primitive is `wait_for` text on the page ([tool reference](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md)).

**Verdict.** Wrong direction, Chrome-only, pre-standard, and it would need the agent to drive the user's browser. It fails "any agent + any browser". Reject.

## Other host feature noted

Claude Code **artifacts** publish HTML to claude.ai. Collaborators on Team/Enterprise plans can "Send to Claude" comments that reach the running session (v2.1.228+). Artifacts need a claude.ai login, the Anthropic API, and org policy allowing them, and they are off in Agent SDK and MCP-server contexts ([artifacts docs](https://code.claude.com/docs/en/artifacts)). The docs' own suggestion for bringing results back is a "Copy as prompt" button that the user pastes. The channel is hosted off-machine and plan-gated, so it is not a fit for the local, private baseline.

## Recommended direction

1. **Baseline transport = (a)**: a single script with `serve`, `present <round>` and `await <round> --timeout <s>` behaviour. `await` returns the submission or `pending`. The agent prints the link, then waits: in Claude Code, a background `await` that re-invokes the agent on exit; elsewhere, a foreground loop with a timeout under the host's shell cap.
2. **Keep the core transport-agnostic** so a stdio MCP facade (`present_round`, `await_submission` with progress notifications and the same bounded/`pending` contract) can wrap it later. That facade is also the natural hook for an MCP Apps view.
3. **Use host features when present**: open the link in the Claude Code desktop Browser pane via a preview server.
4. **Do not use WebMCP.**

Open for the architecture ticket: the runtime choice (Node vs Python vs a single binary), since none is guaranteed on every host.
