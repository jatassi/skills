---
version: 1
slug: "prototype-round-page-html"
primary_target: "PROTOTYPE-round-page.html"
related_targets: []
---

Scope: the visual-grilling round page (prototype). Visitor mode: Operate.
Audience/job: a developer answering an agent's grilling round; accept, pick, write, comment, or skip each question, then submit once.
Constraints: dark default; narrow side pane first (~480–700px), full tab adds a side column; single HTML file; agent HTML sandboxed.
Chosen structure: B, one at a time (user, 2026-09-26): a question tab strip across the top, one question per screen, and a final Review screen that submits. Variants A and C stay in the prototype for reference only.

## Direction contract

THESIS: Answering a round is reviewing a change: a verdict per question, comments pinned inline on illustrations, one "Submit round". Refuses the rounded questionnaire card stack.
OWN-WORLD: near-black canvas, one panel step up, 1px hairline borders, 6px radius, no shadows except popovers. System sans for prose, mono only for ids, figures and paths. Blue for primary action and focus only; green accepted, purple commented, amber unsure; drawn 16px stroke icons.
STORY: the user scans question headers and their states, accepts recommendations with one key, pins comments on illustration elements, and submits the round.
FIRST VIEWPORT: a sticky review bar (round, "n of m answered" in tabular figures, Submit round in blue). The first question panel below it: header row, prose, recommendation block with Accept, illustration, answer row.
FORM: Code Review (pull-request review screens), 1st on my list; seed 38aa679b.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
