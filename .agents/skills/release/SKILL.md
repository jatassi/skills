---
name: release
description: Publish a new version of this plugin in both the Claude Code and Agent Plugins formats.
disable-model-invocation: true
argument-hint: "[patch|minor|major|<version>]"
---

# Release

One tree ships one plugin in two formats: [Agent Plugins](https://agent-plugins.org/specification) reads `plugin.json` at the root; Claude Code reads `.claude-plugin/`. A release is **in sync** when every component reaches each format that supports it, both manifests carry the new version, and tag `v<version>` points at the commit that sets it.

Start on a clean `main`, up to date with `origin`.

## 1. Pick the version

Use `$ARGUMENTS` if given. Otherwise diff against the last tag (`git describe --tags --abbrev=0`) and propose semver: **major** for a removed or renamed skill or server, or a behaviour change users rely on; **minor** for an added component; **patch** for the rest. With no tag yet, the release is the version already in the manifests.

Done when the user has confirmed the version.

## 2. Wire every component

Inventory the plugin root, then check each component against its row:

| Component | Agent Plugins | Claude Code |
| --- | --- | --- |
| Skills | `skills/<name>/SKILL.md` | same directory, auto-discovered |
| MCP servers | `mcp.json`: `$schema` `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`, `${PLUGIN_ROOT}` / `${PLUGIN_DATA}`, HTTP type `streamable-http` | `.mcp.json`: no `$schema`, `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}`, HTTP type `http` |
| Hooks, agents, commands, LSP, output styles, anything else Claude-only | not portable: files live in the client extension directory `com.anthropic.claude-code/` | the manifest points at them, e.g. `"hooks": "./com.anthropic.claude-code/hooks/hooks.json"` |

The two MCP files mirror each other: same server names and config, differing only in the columns above. Setting `commands` or `agents` in the Claude manifest replaces the default folder scan, so list every path. Every skill and server also gets a row in the README.

Then validate:

- `claude plugin validate --strict .` (marketplace) and `claude plugin validate --strict .claude-plugin/plugin.json`
- `uvx check-jsonschema --schemafile <its $schema URL> <file>` for `plugin.json` and `mcp.json`

Done when every component in the tree appears in each format that supports it and every validator passes clean.

## 3. Bump and publish

Set `version` in `plugin.json` and `.claude-plugin/plugin.json`; the marketplace entry carries none. Claude Code keeps users on the installed version until this field changes, so an unbumped change never reaches them.

Commit `Release v<version>` and tag `v<version>`. The repo is public: show the user the commit and release notes, and push only on their go-ahead. Then push the commit and tag, and run `gh release create v<version> --generate-notes`.

Done when `gh release view v<version>` shows the release.
