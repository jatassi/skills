---
name: to-spec-and-tickets
description: "Settle large or one-way-door work into a spec on the issue tracker, then cut it into blocked tickets other threads can pick up. Runs make-it-so's Spec and tickets playbook."
disable-model-invocation: true
---

Run make-it-so's Spec and tickets playbook on the work the user names. Read `<milliways>/skills/make-it-so/playbooks/spec-and-tickets.md`, where `<milliways>` is the milliways plugin root, two folders above this skill's base directory, which Claude Code names when it loads this skill. Copy its steps into your todo list before any other work, then follow them to the end, Reflect included.

The playbook grills with the **grill-with-docs** skill, writes the spec with the **to-spec** skill and cuts the tickets with the **to-tickets** skill. If you can't invoke a skill using harness-provided skill tools, locate its SKILL.md under `<milliways>/skills/` and read it directly. If you can't locate the playbook or a SKILL.md it names, stop and report this to the user. Never fabricate a skill's content.
