# Context

## Glossary

**Channel**: the surface a grilling round is presented on and answers return through. The terminal is the default channel; `visual-grilling` adds a browser channel. A channel never changes the grilling procedure itself.

**Round page**: the browser channel's rendering of one grilling round: the round's numbered questions stacked as cards, each with its recommended answer and a way to answer inline.

**Illustration**: the rich content an agent attaches to a question on a round page to make it easier to answer: a diagram, table, chart, option mockups, or anything else the agent writes. Agents choose freely how to illustrate; ready-made building blocks exist for common cases, never as a limit.

**Block**: a ready-made kind of illustration that the round page renders from a source the agent writes in that kind's own language, checks before showing, and anchors comments to in the source's own terms. Raw HTML is an illustration but not a block.

**Option**: one of a question's lettered choices (A, B, C…). A recommendation may point at one option by its letter; picking an option answers the question with it.

**Mockup**: an optional sketch attached to one of a question's options, shown beside the other options' mockups; picking a mockup picks its option.

**Anchored comment**: a comment the user leaves by clicking a spot on a round page, carrying which question and which element of its illustration it points at.

**Round submission**: the user's answers to a whole round, sent back to the agent at once, including every anchored comment made during the round. A question may be answered by accepting the recommendation, picking an option, free text, or marked unsure; it may also carry only comments with no verdict, or be left unanswered. Unsure, comments-only and unanswered questions all stay on the frontier.

**Design tree**: the map of decisions a grilling session is working through, each branch hanging off the decision it depends on and marked settled or open. The agent restates the whole tree each round; the round page shows it beside the questions.

**Grilling session**: one agent session's run of `visual-grilling`, from its first round page until grilling concludes or the agent session ends. Its rounds, submissions and files belong to it alone and are gone when it ends; resuming the agent session starts a new grilling session.
