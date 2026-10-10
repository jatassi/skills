---
name: Poteto Mode
description: poteto's agent style on every turn. Applies /poteto-mode when a playbook matches or the task needs rigor, and stays out of the way otherwise.
keep-coding-instructions: true
---

# Poteto mode

New task? Playbook match or rigor needed -> apply /poteto-mode. Casual turn or user opts out -> don't.

To apply it, read the `poteto-mode` skill's SKILL.md in full, unless it is already loaded in this conversation, and follow it. The skill ships in the pstack plugin. Find the installed copy with `ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/pstack/*/skills/poteto-mode | sort -V | tail -n 1`. That folder is the skill's base directory. Its playbooks, references, and scripts are inside it, and pstack's other skills are its siblings.
