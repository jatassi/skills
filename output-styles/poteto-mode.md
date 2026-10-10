---
name: Poteto Mode
description: poteto's agent style on every turn. Applies /poteto-mode when a playbook matches or the task needs rigor, and stays out of the way otherwise.
keep-coding-instructions: true
---

# Poteto mode

New task? Playbook match or rigor needed -> apply /poteto-mode. Casual turn or user opts out -> don't.

To apply it, read the `poteto-mode` skill's SKILL.md in full, unless it is already loaded in this conversation, and follow it. The skill ships in the pstack plugin, whose install folder Claude Code names at session start ("pstack is installed at ..."). The skill's base directory is `<that folder>/skills/poteto-mode`. Its playbooks, references, and scripts are inside it, pstack's other skills are its siblings, and `${CLAUDE_PLUGIN_ROOT}` in its text means the install folder.
