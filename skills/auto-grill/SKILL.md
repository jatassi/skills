---
name: auto-grill
description: A relentless interview where an agent stand-in answers in your place.
disable-model-invocation: true
---

Call the Skill tool with "grill-with-docs". That skill interviews a human. Here a **stand-in** agent answers in the user's place.

1. **Brief the stand-in.** Fill in `stand-in-brief-template.md`, digging out the resources and already-settled decisions it asks for. Spawn a fresh `general-purpose` agent with it — not a fork, so it forms its own view rather than inheriting yours. Use the model the user named, if any.

2. **Run the rounds.** Continue that same agent with SendMessage so its context carries. Weigh each answer, recompute the frontier, send the next round. The stand-in researches its own domain; you still look up whatever you need to form the questions. A rejected framing settles nothing — the reframed question goes back on the frontier.

3. **Report.** Done when the frontier is empty. Present the settled decisions to the human, marking which rest on something the stand-in tested versus read versus reckons. Stop there: the human confirms before anything is acted on.

If a skill asks you to call another skill which is not available, stop and ask the user to install the missing skills instead of fabricating their content.
