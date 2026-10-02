# Spike: visual-grilling as a Claude Code mod

A throwaway spike, not a shipped feature. It checks whether `visual-grilling` (the browser round page, see [`skills/visual-grilling/SKILL.md`](../../skills/visual-grilling/SKILL.md)) can become a Claude Code **mod**: a plugin of function hooks that draws a native pane in the terminal and the Desktop app's Code tab. The aim is as little loss of functionality as possible.

It was built in a cloud session that had no Desktop app, so **nobody has seen it drawn yet**. The next session, on a laptop with the Desktop app, should load it, look at it, and answer the open questions below.

## State

- `claude plugin validate` passes. `claude plugin test` passes 3 tests ([`tests/round.test.ts`](tests/round.test.ts)) on the `desktop` and `terminal` surfaces. Built and tested on Claude Code 2.1.288.
- The tests check the drawn tree against each surface's element table. They don't check what the Desktop app actually draws.
- Nothing outside `spikes/` changed. The repo's plugin manifests don't load this mod.

## What the spike does

[`hooks/register.tsx`](hooks/register.tsx):

1. **Registers a tool**, `mcp__visual-grilling-mod__present_round`, which takes `{ markdown }`: the round file exactly as [`round-file.md`](../../skills/visual-grilling/round-file.md) describes it.
2. **Parses the round with the repo's own parser.** That's `packages/visual-grilling/src/core/round.ts`, bundled into `hooks/round-parser.mjs` by [`build.mjs`](build.mjs). A bad round returns `rejected` plus the same `round.md:LINE · Qn …` lines that `present` prints.
3. **Opens a pane** and returns `presented` at once, so Claude's turn ends.
4. **Draws one card per question:**
   - prose (`Markdown`) and illustrations;
   - one `Button` per option, with the recommended one drawn as `variant="primary"`;
   - Accept and Unsure buttons, a free-text `Input` and a comment `Input`;
   - the design tree as a Markdown task list, and a Submit button.
5. **On Submit, starts Claude's next turn** with `$.prompt.submit({ text: summary })`. This replaces `await` and its background shell: no `pending`, no server, no port.
6. **Handles a reply typed in the terminal.** A `prompt.submit` hook marks the open round answered, so the terminal stays a channel.

Illustrations: tables become `Markdown`. Everything else is shown as its source in a `Code` block for now. The pane can already draw `{ kind: 'svg' }` with the Desktop `Svg` element (the first test does), but nothing produces SVGs yet.

### Decision made: don't hold the tool call

[blast-radius](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods/blast-radius) holds a tool call while it waits for a person. A hook has a 10 s budget of its own time, so it polls with `$.process.run(['sleep','0.25'])`.

Holding was tried here and dropped for three reasons:
- it blocks the turn;
- it needs a 10-minute `pending` path;
- the hot loop was hard to test.

Returning at once and submitting on Submit matches today's "background `await` wakes the agent" flow.

## How each feature maps (from the analysis)

| visual-grilling feature | As a mod | Loss |
|---|---|---|
| Question cards, options, recommendation, accept / unsure / free text / comments-only | Pane + `Button` / `Input` (built) | none |
| Answers back to the agent | `$.prompt.submit` on Submit (built) | better than today |
| Terminal reply answers the round | `prompt.submit` hook (built) | none |
| Design tree; `Q<n>` links to earlier rounds (read-only) | Markdown task list; links via `Markdown` `onLinkPress` could switch the pane to that round (not built) | small |
| `table` | `Markdown` (10,000-character limit) | small |
| `code`, `diff` | `Code` (10,000 characters; `format: 'diff'`) | probably loses `highlight` |
| `mermaid`, `dot`, `vega-lite` | Desktop `Svg` (≤ 131,072 characters, `isInteractive` gives a script-less sandboxed frame), with the SVG drawn by Node. The server already draws every block under jsdom / viz / Vega (`packages/visual-grilling/src/server/draw-check.ts`). Terminal has no `Svg`, so it gets text | small on Desktop. Node is still required |
| **`html` illustrations and option mockups (Tailwind)** | No HTML element. The only route is `<foreignObject>` inside `Svg`, with Tailwind compiled to inline CSS. The Desktop app's SVG cleaning may strip it | **high risk** |
| **Anchored comments** (click a spot → comment in the source's terms) | `Svg` reports no click position ("presses … go on an enclosing element"). `Client` gets pointer events but can't draw `Svg`. Fallback: a `Select` of anchor targets per illustration (the page's anchor code already lists them) plus a comment `Input` | **medium**: same data, worse UX |
| Other agents (Codex, Cursor, …) | Mods run only in Claude Code (terminal + Desktop Code tab). Not in the VS Code chat panel, Desktop WSL, `claude -p` or cloud sessions | the skill and its command-line tool must stay |

Recommended shape: the mod as a **second front end in the same plugin**. The repo root is already a Claude Code plugin, so it would add `hooks/hooks.json`, and the tool becomes `mcp__jatassi-skills__present_round`. SKILL.md would say to use the tool when present and the CLI otherwise, and the Node draw code would be reused to produce SVGs.

## Next steps for the laptop session

1. **Load it in the Desktop app.**
   - Build first: `npm ci` at the repo root, then `node spikes/visual-grilling-mod/build.mjs`.
   - Then add the folder's absolute path to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`, and restart the Code tab.
   - Or, in a terminal: `claude --plugin-dir spikes/visual-grilling-mod`.
   - Confirm with `/plugin`, which should show `1 mod active · visual-grilling-mod`.
2. **Try a round.** Ask Claude to call `present_round` with the worked example from `round-file.md`. Check the pane's layout and width, the buttons and fields, and that Submit starts a turn with the summary. Also check how that submitted message shows in the conversation; a `UserMessage` render hook could draw it compactly.
3. **Answer open question 1, diagram SVGs.**
   - Get real SVGs for a mermaid, a dot and a vega-lite block out of the server's draw code (or a small Node script using the same chunks).
   - Check their size against the 131,072-character limit, and how they look in `Svg`, both plain and with `isInteractive`, in light and dark.
   - Then decide how the mod calls Node: `$.process.run(['node', …])` per round, or a long-lived `$.process.spawn`.
4. **Answer open question 2, HTML mockups.** Draw an `html` mockup as `<svg><foreignObject>…</foreignObject></svg>`, with Tailwind compiled to inline CSS, and see what survives the Desktop app's SVG cleaning. This decides whether the port is low-loss or a reduced version.
5. **Choose the anchored-comment approach.** Try the `Select`-of-anchors fallback against today's click-to-anchor and decide whether it's acceptable.
6. If it's still worth doing, write it up as an ADR next to [`docs/adr/0001-browser-channel-architecture.md`](../../docs/adr/0001-browser-channel-architecture.md). That ADR rejected "MCP Apps views" and the "desktop inline widget"; mods are a new option it doesn't cover. Then file issues per `docs/agents/issue-tracker.md`.

## Gotchas found while building

- The `tool.call` matcher must be a string literal. With a template literal, `claude plugin validate` shows `tool=?`.
- In `claude plugin test`, the hooks the test registers stand in for the engine. A test must answer every `$` call the mod makes: `ui.open`, `ui.status`, `prompt.submit` (returning `{ text }`), and so on. Otherwise the test reports `no implementation for <noun>.<method>`.
- `find` hands back `{ type, key, props, text }`, so a Button's label is `props.label`. `Code` elements don't keep a `key`.
- A `$.process.run` stub that resolves at once makes a polling hold loop spin and hang the test run.
- `$.state` values must be declared in `types/index.d.ts` and named by `"types"` in `plugin.json`.

## References

- Docs: [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview), [Draw in the interface](https://code.claude.com/docs/en/plugins/mods/interface), [Reference](https://code.claude.com/docs/en/plugins/mods/reference) (elements per surface, limits), plus the create / events / api / test / troubleshoot pages linked from those.
- Full API: the types Claude Code writes for your build, laid in `.claude-plugin/types/claude-code/index.d.ts` once the mod loads. They are also handed out when the `plugin-authoring` skill loads. Grep them for `SvgProps`, `ClientProps`, `HookBudget`, `PromptSubmitArgs`, `ToolSpec`, `MountTarget`.
- Samples: [anthropics/claude-code-playground `claude-code/mods`](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods) (blast-radius: holding a tool call, Pane vs band; replay-theater: pane + command); [anthropics/claude-code `mods/`](https://github.com/anthropics/claude-code/tree/main/mods) (built-in mods with tests).

## Suggested skills

- **`plugin-authoring`**: load it before touching the hooks module. It starts hot reloading for the session and gives you the current types file.
- **`anthropic-skills:grilling`** (or this repo's `visual-grilling`): to stress-test the port decision (mockups, anchoring, one plugin or two) with the user before building more.
- **`anthropic-skills:tdd`**: when turning the spike into the real thing, extending `tests/round.test.ts` first.
- **`anthropic-skills:domain-modeling`**: to record the decision as an ADR and update `CONTEXT.md` (for example "channel": a mod pane is a third channel).
