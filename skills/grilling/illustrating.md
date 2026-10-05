# Illustrating a question

An illustration is what you attach to a question so the user can answer it at a glance: a block (a diagram, chart, table or code the page draws from your source) or raw HTML. The user can click any spot of it to leave an anchored comment, which comes back in your source's own terms.

## When to illustrate

Apply the **whiteboard test**: illustrate only what you would stop and sketch on a whiteboard for this question, such as a structure, a flow, numbers side by side, a screen or a code change. A question that reads fine as prose stays prose.

Draw only what the question is about. Every element should carry meaning the user needs for the decision, with no decoration, no filler nodes and no styling for its own sake.

Give each question **one illustration** by default. Add more only when they are being compared, such as the current flow next to the proposed one. Mockups under options don't count toward this.

## Which one

Use a block before raw HTML. A block is checked by `present`, follows the theme, and anchors comments in its source's terms. Before a round uses a block, read its file.

| question shape | illustration | read |
|---|---|---|
| flow, sequence, state, dependencies, timeline | `mermaid` | [`blocks/mermaid.md`](blocks/mermaid.md) |
| dense or large graph where layout control matters | `dot` | [`blocks/dot.md`](blocks/dot.md) |
| numbers, trade-off curves, cost or size comparisons | `vega-lite` | [`blocks/vega-lite.md`](blocks/vega-lite.md) |
| options compared attribute by attribute | `table` | [`blocks/table.md`](blocks/table.md) |
| a change to existing code | `diff` | [`blocks/code.md`](blocks/code.md) |
| new code or a snippet | code fence | [`blocks/code.md`](blocks/code.md) |
| options that differ in how they look | a mockup under each option | [`blocks/html.md`](blocks/html.md) |
| anything else | `html` | [`blocks/html.md`](blocks/html.md) |

The fence syntax is in [`round-file.md`](round-file.md), and `present`'s messages cover syntax mistakes and draw failures. Write the illustration, run `present`, and fix what it prints.

## Theme

The round page is dark by default and the user can switch it to light. Blocks draw with the page's colours and redraw when the theme changes. Your HTML follows the theme through the tokens below.

To highlight part of an illustration, use the **preset marks** `recommended`, `risk` and `muted`. Each block file shows how to apply them.

A **theme override** sets a block's colours yourself, for example to match a real product. Each block file gives its override syntax. An overridden block stops following the theme, since its colours stay as written in both themes. If its text would be unreadable on dark, the page shows it on the light backdrop. Override only when the exact colours matter to the question.

### Theme tokens

Your HTML (illustrations and mockups) gets each token as a CSS variable `--vg-<name>` and, with Tailwind, as a colour utility (`bg-surface`, `text-fg`, `border-line`, `text-accent-green`…). Both switch live with the theme.

| token | use |
|---|---|
| `canvas` | the page behind every panel |
| `surface` | the frame's own backdrop (default background) |
| `surface-2` | a raised panel inside the frame |
| `line` | hairline borders |
| `line-strong` | borders that need to show |
| `fg` | body text (default text colour) |
| `fg-muted` | secondary text |
| `fg-subtle` | hints and captions |
| `accent-blue` | links, focus, primary actions |
| `accent-green` | recommended, done, OK |
| `accent-purple` | notes and highlights |
| `accent-amber` | warnings and uncertainty |
| `accent-red` | risk, errors, destructive actions |
