#!/usr/bin/env bash
root=$(printf '%s' "$CLAUDE_PLUGIN_ROOT" | sed 's/\\/\\\\/g; s/"/\\"/g')
text="pstack is installed at ${root}. Its skills are at ${root}/skills/<name>/SKILL.md."
printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' "$1" "$text"
