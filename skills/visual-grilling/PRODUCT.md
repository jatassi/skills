# Product

<!-- impeccable:product-schema 1 -->

> Prototype-branch record (`prototype/round-page-look`) for [Prototype: round page look and feel](https://github.com/jatassi/skills/issues/6). Not on main by the user's choice.

## Platform

web

## Stack

Single self-contained HTML file, no build step: vanilla HTML/CSS/JS, with illustration libraries (Mermaid 12, Vega-Lite 6 via vega-embed) loaded from a CDN. The user asked to see how far a single file goes before considering anything else.

## Users

A developer being grilled by a coding agent (Claude Code, or any agent) about a plan, a design, or a spec. They answer a round of numbered questions, each with the agent's recommended answer, often several rounds in one sitting, and decide on each rather than just reading.

## Product Purpose

`visual-grilling` adds a browser **channel** to the `grilling` skill. The procedure stays the same. Each round renders as a **round page**: numbered question cards, each with a recommended answer and an optional **illustration** (diagram, chart, table, option mockups, or raw agent HTML). The user answers inline and sends the whole round back as one **round submission**. Success means the user answers faster and more precisely than in the terminal, especially where a picture settles what prose couldn't.

## Positioning

A decision surface for someone else's question list: the agent writes the questions and illustrations, and the page only has to make answering them fast and exact. Comments can point at a specific element inside an illustration (**anchored comments**), and the agent reads them in the illustration's own terms (Mermaid node ids, chart datum, table row/column).

## Operating Context

- Opened beside the conversation. Primary surface: a narrow side pane (Claude Code desktop's Browser pane, ~480–700px wide). It also works as a full browser tab; wide layouts may add a side column.
- The terminal shows the link, then a text summary of the answers once they come back.
- Rounds persist for the session. Past rounds stay viewable (read-only), and every file is removed when the session ends.
- Grilling maps its work as a **design tree**. Each round asks the current **frontier**, and settled decisions push the frontier outward.

## Capabilities and Constraints

- Answer modes per question: accept the recommendation, pick an option, free text, anchored comments, or unsure/skip (the question stays on the frontier). Anchored comments can go with any other mode.
- Submit the whole round at once. No per-question sending.
- Illustrations are free-form. Ready-made blocks are conveniences, and raw agent HTML (sandboxed) is always allowed. Agent HTML may hardcode colours, so the page must keep it legible.
- The anchored-comment model is settled in [the anchoring prototype](https://github.com/jatassi/skills/issues/5).
- Undecided: the transport architecture ([the architecture ticket](https://github.com/jatassi/skills/issues/7)), exactly which ready-made blocks ship ([the illustration blocks ticket](https://github.com/jatassi/skills/issues/8)), and the submission payload shape.

## Brand Commitments

- **Dark mode is the default** (user's instruction). A light theme may exist, but dark is what opens.
- Vocabulary from `CONTEXT.md`: channel, round page, illustration, anchored comment, round submission.

## Evidence on Hand

No real grilling transcripts are bundled. Demo rounds in the prototype are synthetic and labelled so; take their subject matter from this repo's own map (the visual-grilling decisions) so the content is realistic.

## Product Principles

1. The question is the unit. Every visual decision serves reading one question and answering it.
2. The recommendation is one keystroke away. Accepting the agent's suggestion must be the cheapest action on the page.
3. The illustration belongs to its question. It is evidence for the answer, not decoration.
4. Nothing is lost. Answers survive until submitted, and past rounds stay readable.
5. The channel is invisible. The page adds no procedure of its own beyond what grilling already does.

## Accessibility & Inclusion

Keyboard-first answering (developers already at a keyboard). Illustrations must stay readable in dark mode.
