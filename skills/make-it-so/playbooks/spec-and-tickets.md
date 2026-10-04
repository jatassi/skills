### Spec and tickets

**You own the shared understanding. The chef owns the decisions.** For work too large for one PR, and for any one-way door. Settle the chef's intent in a grilling before anyone builds, write it down as a spec, and cut the spec into tickets other threads can pick up. Work bigger than one context goes to the **wayfinder** skill first (the Routing rule). This playbook runs once its map hands off a spec to write.

1. Grill with the **grill-with-docs** skill, so the answers land as ADRs and glossary entries as you go. Run the rounds through the **visual-grilling** skill when this is a local thread and the chef is at their Mac, and as plain-text rounds when they are away. Facts are yours to find, never the chef's. A question that running something can answer goes to the Prototype playbook (`playbooks/prototype.md`), not to a round.
2. For a one-way door, run the **interrogate** skill over the settled design before you write the spec, and put each finding it proves to the chef. `skip:` for a two-way door.
3. Write the spec with the **to-spec** skill and publish it to the issue tracker that `docs/agents/AGENTS.md` lists.
4. Cut the spec into tracer-bullet tickets with the **to-tickets** skill, each declaring its blocking edges. Label each ticket for an agent or a human per `docs/agents/triage-labels.md`. A human-in-the-loop ticket runs later as a local Projects thread with visual-grilling. Name each one-way door in its ticket's body, so the PR that lands it carries the `door:one-way` label.
5. Hand off. Each agent ticket runs its own playbook in its own thread (Feature for new behavior, which implements with the **implement** skill). Do not build here.

**Reply:** the spec and its link, the tickets in dependency order with their blocking edges and who each waits for, the ADRs and glossary entries the grilling wrote, and the one-way doors named.

**Reflect, the last step.** Keep this as the last item in the todo list, and do it before you send the reply. List what this thread had to work around: a broken or missing tool, a flaky check, a skill or doc that misled you, a lint you suppressed, a pattern you copied knowing it was wrong. File one `garden` issue for each, per `docs/agents/garden.md`, unless an open one already covers it, and name what you filed in the reply. In a repo without that document, list them in the reply instead. Run the full **reflect** skill as well when the thread was long or the chef asks for it. A playbook run inside another one, such as Opening a PR at the end of Feature, leaves this step to the outer playbook.
