---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect, or when a make-it-so playbook's Reflect step calls for the full pass.
---

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

## When to invoke

Invoke when the user says "reflect" or "/reflect", or when a make-it-so playbook's Reflect step runs the full pass (a long thread, or the chef asked). Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## Process

### 1. Locate the active transcript

The parent finds its own transcript file before fanning out. This project's transcripts are in `~/.claude/projects/<project>/`, where `<project>` is the working directory's absolute path with every character other than a letter or digit turned into `-`. Use that path. Do not glob across `~/.claude/projects/*/`. That crosses workspace boundaries and reads private chats from unrelated projects.

```bash
ls -t ~/.claude/projects/<project>/*.jsonl ~/.claude/projects/<project>/*/subagents/*.jsonl 2>/dev/null | head -10
```

Two transcript layouts: a session (`<session-id>.jsonl`) and a subagent (`<session-id>/subagents/agent-<id>.jsonl`).

For each candidate, find the first line whose `type` is `user` and check that its `message.content` (a string, or the `text` of its first block) contains the conversation's opening user prompt. Take the matching path. If no path resolves (a cloud thread may not expose its transcript), write a tight digest of the session and pass that instead.

### 2. Spawn three reviewers in parallel

One message, three `Agent` calls, `subagent_type: general-purpose`, with `model` set as below. Reviewers need MCP access for context lookups (tickets, chat threads, observability traces referenced in the transcript). `general-purpose` keeps every MCP tool, so don't swap in a read-only agent type.

Each reviewer and the synthesizer name a role line in the kitchen's models document (`docs/agents/models.md`) and a default. Set `model` to that line's value, or to the default if the document or the line is missing. Leave `model` unset when the value is `inherit`. If the Agent tool rejects the value, use the default and say so. If that model isn't available in this thread, follow the models document's Fallback section: run on the parent's model and report its `fallback:` line.

| Lens | Role line | Default `model` | Prompt template |
|---|---|---|---|
| Judgment | `reflect judgment, divergent, synthesizer` | `opus` | `references/judgment-reviewer.md` |
| Tooling | `reflect tooling` | `sonnet` | `references/tooling-reviewer.md` |
| Divergent | `reflect judgment, divergent, synthesizer` | `opus` | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in the `Agent` response body.

### 3. Synthesize

One `Agent` call, `subagent_type: general-purpose`, with `model` from the `reflect judgment, divergent, synthesizer` line (default `opus`). The synthesizer's quality check includes spot-verifying citations, which can require MCP access. `general-purpose` keeps every MCP tool, so don't swap in a read-only agent type. Use `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. The synthesizer returns a structured Accepted / Rejected / Backlog list.

### 4. Structural enforcement check

Sanity-check the synthesizer's Accepted list. For any item that would be enforced more reliably by a lint rule, script, metadata flag, or runtime check, move it from Accepted to Backlog. See the **encode-lessons-in-structure** principle skill.

### 5. Apply

Before applying any Accepted edit, present the synthesizer's full Accepted/Rejected/Backlog output to the user and wait for explicit approval. The user picks which subset to apply and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply. When a playbook's Reflect step ran this pass and the chef isn't in the thread, don't wait. Put the Accepted list in the reply as an open gate for the chef, apply none of it, and go on with the Backlog.

File each Backlog item as a `garden` issue per `docs/agents/garden.md`, unless an open one already covers it, without waiting for approval. In a repo without that document, list them in the summary instead. Only the Accepted list waits for approval.

For each approved Accepted item, follow the Routing field exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): parent does directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): draft it per the `writing-for-agents` skill, show the draft, and iterate on it with the user.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): rewrite the description per `writing-for-agents`' context-pointer rules (front-load the trigger, one trigger per branch).
- `new skill via writing-for-agents: <kebab-name>`: author it per `writing-for-agents`, including its SKILL-MECHANICS.md for frontmatter. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done. Skip this step if it doesn't.

### 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed as `garden` issues: `<issue title>` (`<link>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
