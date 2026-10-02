# Agent logos

One SVG per agent id in `src/core/agents.ts`; `test/unit/agents.test.ts` holds the two lists equal. The build copies them to `page/agents/`. Each brand is its owner's trademark, shown only to name the agent the round page is connected to.

Sources:

- **lobehub**: [`@lobehub/icons-static-svg`](https://github.com/lobehub/lobe-icons) 1.95.1 (MIT), the `-color` variant where one exists.
- **simple-icons**: [`simple-icons`](https://github.com/simple-icons/simple-icons) 16.33.0 (CC0-1.0), filled with `currentColor` or the brand colour.
- **agentskills.io**: the logo each client submitted to the [Agent Skills client showcase](https://agentskills.io), cropped to its mark where it was a wordmark. White fills became `currentColor`.
- **favicon / icon**: the vendor's own site icon. PNG-only ones are wrapped in an SVG `<image>`.
- **lucide "bot"**: [lucide](https://github.com/lucide-icons/lucide) (ISC), the generic logo for an agent not listed.

Logos with `currentColor` take the page's text colour; the rest keep their brand colours.

| id | source |
| --- | --- |
| `claude-code` | lobehub |
| `claude` | lobehub |
| `codex` | lobehub |
| `chatgpt` | lobehub |
| `gemini-cli` | lobehub |
| `antigravity` | lobehub |
| `github-copilot` | lobehub |
| `vscode` | agentskills.io (cropped) |
| `cursor` | lobehub |
| `windsurf` | lobehub |
| `amp` | lobehub |
| `opencode` | lobehub |
| `openhands` | lobehub |
| `goose` | lobehub |
| `junie` | lobehub |
| `kiro` | lobehub |
| `cline` | lobehub |
| `roo-code` | lobehub |
| `kilo-code` | lobehub |
| `trae` | lobehub |
| `qwen-code` | lobehub |
| `kimi-cli` | lobehub (single-colour) |
| `qoder` | lobehub |
| `codebuddy` | lobehub |
| `devin` | lobehub |
| `replit` | lobehub |
| `command-code` | lobehub |
| `hermes-agent` | lobehub |
| `openclaw` | lobehub |
| `snowflake-cortex-code` | lobehub |
| `zed` | simple-icons |
| `warp` | simple-icons |
| `qodo` | simple-icons |
| `databricks-genie-code` | simple-icons |
| `spring-ai` | simple-icons |
| `letta` | agentskills.io (cropped) |
| `piebald` | agentskills.io (cropped) |
| `tabnine` | agentskills.io (cropped) |
| `laravel-boost` | agentskills.io (cropped) |
| `agentman` | agentskills.io (cropped) |
| `emdash` | agentskills.io (cropped) |
| `autohand` | agentskills.io |
| `mistral-vibe` | agentskills.io |
| `pi` | agentskills.io |
| `bub` | agentskills.io |
| `deep-code` | agentskills.io |
| `pulumi-neo` | agentskills.io |
| `google-ai-edge-gallery` | agentskills.io |
| `factory` | factory.ai favicon |
| `firebender` | firebender.com icon |
| `ona` | ona.com favicon |
| `workshop` | workshop.ai favicon |
| `fast-agent` | fast-agent.ai icon |
| `vita` | vita-ai.net icon |
| `superconductor` | superconductor.com favicon |
| `vt-code` | agentskills.io (the logo's ">" glyph, as text) |
| `mux` | agentskills.io (the wordmark's "m" and block, as the favicon draws them) |
| `nanobot` | nanobot.wiki icon (PNG) |
| `zeroclaw` | zeroclawlabs.ai (PNG) |
| `other` | lucide "bot" |
