# Research: building blocks and libraries for illustrations

Ticket: [#4](https://github.com/jatassi/skills/issues/4), child of map [#1](https://github.com/jatassi/skills/issues/1) (visual grilling).
Researched 2026-09-26. Vocabulary (illustration, anchored comment, round page, round submission) is from `CONTEXT.md`.

## Question

Which libraries fit the ready-made illustration building blocks, given that the coding agent itself writes the content (no separate LLM call from a server)? Covers diagrams, tables, charts and option mockups, and whether Vercel-style generative UI fits. Criteria:

1. CDN-loadable without a build step.
2. How reliably agents write the input format.
3. Rendering quality.
4. Whether the rendered output exposes addressable elements, so an anchored comment can name what was clicked.

## Answer in brief

| Block | Pick | Why | Anchor quality |
|---|---|---|---|
| Diagrams (flow, sequence, state, class, ER…) | **Mermaid 12** | One `<script type="module">` import; the most widely known text-to-diagram format; SVG output whose element ids and `data-id`s carry the agent's own source ids | Excellent |
| Diagrams, fallback for dense graphs | Graphviz via `@viz-js/viz` (optional) | 1.3 MB, sync render, agent can set `id=` on every node and edge | Excellent |
| Charts | **Vega-Lite 6** (SVG renderer) | Declarative JSON (schema-validatable); every mark gets an `aria-label` holding its datum, e.g. `opt: A; cost: 28` | Excellent |
| Charts, alternative | Observable Plot | Small, good defaults, but agent writes JS and marks carry no attributes | Fair |
| Tables | **No library.** Plain HTML `<table>` rendered from Markdown or a small JSON block | Agents write Markdown/HTML tables near-perfectly; cells are trivially addressable by row/column | Excellent |
| Option mockups | **Agent-written HTML per option**, each in an isolated container, optionally with Tailwind's browser CDN | Mockups are free-form by nature; a thin "options" block supplies the card frame, the pick control and the option ids | Good (generic anchoring) |
| Generative UI (AI SDK UI / RSC, json-render) | **Not a fit** as a runtime; json-render's flat keyed-element spec is worth borrowing as an idea | Their value is in constraining and streaming a *server-side* model call, which does not exist here; all need React plus a build | n/a |

Avoid for building blocks: Chart.js and ECharts' default canvas renderer (no DOM per data point), D2 (11.5 MB browser bundle, less agent familiarity), `wired-elements` (unmaintained since 2022).

Two cross-cutting recommendations:

- **Validate before showing, and return errors to the agent.** Every recommended format has a cheap validator (`mermaid.parse`, Vega-Lite JSON schema / `vegaLite.compile`, D2 `compile`). The agent writes blind, so the channel should report a parse error back rather than render a broken card. See [Agent reliability](#agent-reliability).
- **Anchoring must be generic first, library-specific second.** Raw HTML is always allowed (map #1 Notes), so the anchoring code has to describe *any* clicked element. Libraries with good addressability add a precise, source-level id on top. See [Anchoring design implications](#anchoring-design-implications).

## Method

- Versions, entry points and CDN files were read from the npm registry (`registry.npmjs.org/<pkg>/latest`) and jsDelivr on 2026-09-26.
- A local harness page loaded every candidate from jsDelivr with plain `<script>` / `import()` (no build), rendered a flowchart, sequence diagram, state diagram, D2 diagram, Graphviz graph, and the same 3-bar chart in Vega-Lite, Plot, ECharts (SVG) and Chart.js, then dumped the attributes of the rendered elements. Results quoted below as "harness" are from that run (Chromium, Browser pane).
- Docs and release notes were read from each project's own site or repo.

## CDN availability (measured)

All sizes are uncompressed bytes as served by jsDelivr on 2026-09-26.

| Library | Version | No-build entry | Size |
|---|---|---|---|
| Mermaid | 12.0.0 | `import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.esm.min.mjs'` | 30 KB entry, diagram chunks lazy-loaded; single-file `mermaid.min.js` is 5.6 MB |
| Vega + Vega-Lite + Vega-Embed | 6.x / 6.4.3 / 7.3.0 | three `<script src>` tags | 521 KB + 251 KB + 60 KB |
| Observable Plot (+ d3) | 0.6.17 | `plot.umd.min.js` (+ `d3.min.js`) | 209 KB + 280 KB |
| Chart.js | 4.5.1 | `chart.umd.min.js` | 209 KB |
| ECharts | 6.1.0 | `echarts.min.js` | 1.12 MB |
| Graphviz (`@viz-js/viz`) | 3.30.0 | `viz-global.js` | 1.32 MB (WASM inlined) |
| D2 (`@d2lang/d2`) | 0.1.34 | `dist/browser/index.js` (ESM) | 11.5 MB (WASM inlined) |
| nomnoml | 1.7.0 | `nomnoml.js` | 72 KB |

Sources: npm registry metadata; jsDelivr downloads (harness). Mermaid's own usage docs give the same ESM import line ([Mermaid usage](https://mermaid.ai/open-source/config/usage.html)); Vega-Lite's docs give the three script tags ([Vega-Lite embed](https://vega.github.io/vega-lite/usage/embed.html)); D2.js's README shows the ESM import ([d2js README](https://github.com/terrastruct/d2/blob/master/d2js/js/README.md)).

Everything loads without a build step. Offline use would need these files vendored into whatever serves the round pages (the map allows a dedicated server install); the CDN-vs-vendor choice belongs to the session-lifecycle ticket, not this one.

## Diagrams

### Mermaid 12 — recommended default

- **Status.** 12.0.0 released 2026-09-10. It bundles ELK as the default layout for flowchart, state, class, ER, requirement and use-case diagrams, adds a new default appearance (`neo` look), and targets ES2024 / Safari 17.4+. ELK is "loaded as a separate chunk in the ESM builds, so it is only fetched when a diagram actually uses it." Old look: `layout: dagre`, `theme: default`, `look: classic`. ([release notes, mermaid@12.0.0](https://github.com/mermaid-js/mermaid/releases/tag/mermaid%4012.0.0))
- **API.** `mermaid.initialize({ startOnLoad: false })`, then `await mermaid.render(id, text)` returns `{ svg, bindFunctions }`, or `mermaid.run({ querySelector })` renders `<pre class="mermaid">` blocks in place. ([Mermaid usage](https://mermaid.ai/open-source/config/usage.html))
- **Security.** `securityLevel: 'strict'` (the default) HTML-encodes tags in labels and disables `click` directives; `sandbox` renders inside a sandboxed iframe. ([Mermaid usage](https://mermaid.ai/open-source/config/usage.html)) `strict` is the right setting: anchoring listeners are attached by the round page, not by Mermaid `click` directives.
- **Validation.** `mermaid.parse(text)` throws with a line-numbered message. Harness, for `flowchart LR\n A-->`: `Parse error on line 3: … Expecting 'AMP', 'COLON', 'PIPE', … got …`. That message is good enough to hand back to the agent verbatim.
- **Addressability (harness).** Rendered with `mermaid.render('flowsvg', …)`:
  - Flowchart nodes: `<g class="node default" id="flowsvg-flowchart-A-0">`: the agent's source id (`A`) is embedded between the render id and a counter.
  - Flowchart edges: `<path id="flowsvg-L_A_B_0" data-edge="true" data-et="edge" data-id="L_A_B_0">`, i.e. source→target ids. Edge labels are `<g class="edgeLabel">` with no id (map via position or DOM order).
  - Sequence participants: `<g id="root-1" data-et="participant" data-type="participant" data-id="S">`; lifelines `data-et="life-line" data-id="S"`.
  - Sequence messages: `<line class="messageLine0" data-et="message" data-id="i0" data-from="U" data-to="S">`. The message *text* (`<text class="messageText">`) has no id, so a click on the text must be resolved to its neighbouring line.
  - Notes: `<rect class="note">` + `<text class="noteText">`, no id.
  - State diagram: `<g class="node statediagram-state" id="statesvg-state-Draft-1">`; transitions `<path class="… transition" data-id="edge0">`.
  - **Takeaway:** node and participant clicks resolve to the ids the agent wrote, so an anchored comment can say "node `C` (Cache hit?)" in the agent's own terms.
- **Rendering quality.** Clean SVG, text is real `<text>`/HTML, scales crisply. The 12.0 default look is new and restyles every existing diagram; pin a look/theme in the block so rounds look consistent.
- **Coverage.** Flowchart, sequence, class, state, ER, Gantt, pie, mindmap, timeline, quadrant, architecture, use case (new in 12), and more ([mermaid package description](https://registry.npmjs.org/mermaid/latest), [release notes](https://github.com/mermaid-js/mermaid/releases/tag/mermaid%4012.0.0)). One library covers every "diagram" illustration a grilling round is likely to need.

### D2 — not recommended as a building block

- Browser use is `new D2(); await d2.compile(text); await d2.render(diagram, renderOptions)` returning an SVG string; layouts `dagre` (default), `elk`, `tala` ([d2js README](https://github.com/terrastruct/d2/blob/master/d2js/js/README.md)). TALA is D2's own engine "designed specifically for software architecture diagrams" ([D2 layouts](https://d2lang.com/tour/layouts)).
- Cost: the browser bundle is 11.5 MB and the harness took about 1.7 s to render a 3-node diagram (versus about 0.7 s for three Mermaid diagrams, including module load).
- Addressability is actually good: each shape/edge is `<g class="<base64 of D2 key>">`, e.g. `class="Y2xpZW50"` = `client`, `class="KGNsaWVudCAtJmd0OyBhcGkpWzBd"` = `(client -&gt; api)[0]` (harness). Decoding the class gives the source key.
- Agents see far less D2 than Mermaid in the wild, and the weight is hard to justify when Mermaid covers the same diagrams. Leave it to raw-HTML freedom: an agent that wants D2 can import it itself.

### Graphviz (`@viz-js/viz`) — optional fallback

- `const viz = await Viz.instance(); viz.renderSVGElement(dot)` is synchronous after init (harness: 20 ms).
- Nodes are `<g id="node1" class="node"><title>client</title>…`; if the agent writes `id="n_cache"` in DOT, the `<g>` gets exactly that id (harness). That makes it the most precisely addressable diagram format.
- Worth a slot only if Mermaid's layouts prove poor for dense dependency graphs. Not needed for the first cut.

### Others considered

- **nomnoml** (72 KB, UML-ish): small, but niche syntax and little agent familiarity.
- **PlantUML**: needs a server (Java) or a remote renderer; fails "no separate server call".
- **Excalidraw**: a React component ([npm](https://registry.npmjs.org/@excalidraw/excalidraw/latest)); heavy and hand-drawn, better suited as a host-side MCP App (the MCP Apps docs use an Excalidraw app as their showcase, [MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps)).

## Charts

### Vega-Lite 6 — recommended default

- **Format.** One JSON object (`data`, `mark`, `encoding`), validated against a published JSON schema (`$schema: https://vega.github.io/schema/vega-lite/v6.json`). No agent-written JavaScript, so the chart block needs no script sandboxing beyond what Vega itself does.
- **Embedding.** `vegaEmbed('#vis', spec, { renderer: 'svg', actions: false })`. Vega-Embed adds export/source/editor links by default; disable them with `actions: false` ([Vega-Lite embed](https://vega.github.io/vega-lite/usage/embed.html)).
- **Addressability (harness, SVG renderer).** Every mark is `<path role="graphics-symbol" aria-roledescription="bar" aria-label="opt: A; cost: 28">`. The `aria-label` is a readable encoding of the datum, which is almost exactly what an anchored comment should carry. Programmatically, `view.addEventListener('click', (event, item) => …)` receives the scenegraph item ([Vega View API](https://vega.github.io/vega/docs/api/view/)); in the harness `item.datum` was `{opt: "A", cost: 28, …}`.
- **Rendering quality.** Good defaults, crisp SVG, consistent theming via `config`.
- **Reliability caveat.** The one direct comparison found (GPT-3.5, GPT-4o, Gemini 1.5 Pro, Claude 3 Opus, 2025) reports "Vega-Lite proved to be difficult for the LLMs": GPT-4o produced about 70% of charts via Vega-Lite versus about 95% via Python ([Evaluating LLMs for Visualization Generation and Understanding](https://arxiv.org/html/2507.22890v1)). That was NL→chart over datasets with older models; grilling charts are small and the agent already holds the data. Still, schema validation plus an error loop should be treated as required, not optional.

### Observable Plot — reasonable alternative

- UMD script + `Plot.plot({...})` returns an SVG/figure element; harness render took 5 ms.
- Marks carry no identifying attributes (harness: bare `<rect>` elements; the parent `<g aria-label="bar">` identifies only the mark type). D3's `__data__` on each rect holds the *index* into the data array. The pointer transform "emits an input event whenever the focused points changes, and sets the value of the plot element to the focused data" ([Plot pointer docs](https://github.com/observablehq/plot/blob/main/docs/interactions/pointer.md)), which works for hover/click-to-stick but is less direct than Vega's per-element labels.
- The agent writes JavaScript (accessors, marks), so it needs script execution in the illustration container.

### ECharts — not recommended as a block

- Rich and polished, very familiar to models. Canvas is the default; `echarts.init(dom, null, { renderer: 'svg' })` selects SVG ([ECharts canvas vs SVG](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/)).
- Even in SVG mode the harness found 11 bare `<path>` elements with no identifying attributes. Identity is only available through the event API: `chart.on('click', params => …)` with `seriesName`, `dataIndex`, `name`, `value` ([ECharts events](https://echarts.apache.org/handbook/en/concepts/event/)). Usable, but only through a library-specific adapter.
- 1.12 MB.

### Chart.js — not recommended as a block

- Canvas only; the harness DOM was a single `<canvas>`. The docs say to use the interaction system (`onClick(event, elements, chart)`, elements with `datasetIndex`/`index`) rather than the DOM ([Chart.js interactions](https://www.chartjs.org/docs/latest/configuration/interactions.html)). A generic anchor would only get pixel coordinates.
- Agents write Chart.js configs very fluently, so it remains a fine *raw HTML* choice; it just should not be the building block.

## Tables

No library is needed, and adding one would hurt:

- Agents write Markdown and HTML tables with near-zero error, and a grilling table is small (options × criteria).
- A plain `<table>` renders with the round page's own styles and each `<td>`/`<th>` is addressable by row and column index plus header text, which is the most useful anchor ("row *Option B*, column *Cost*").
- Grid libraries (Grid.js 6.2.0, Tabulator 6.5.3 on npm) add sorting/paging, which grilling tables do not need, and they re-render cells, which complicates anchoring.

Suggested block: accept a Markdown table (render with a small parser such as `marked`, 18.0.14 on npm) or a JSON `{ columns, rows }`, and emit `<td data-row="…" data-col="…">`. Let the agent optionally mark the recommended row/cell.

## Option mockups

"Option mockups" are side-by-side sketches of alternatives (UI variants, layouts, API shapes). Findings:

- No library covers this; mockups are inherently free-form. The useful building block is a **frame**, not a renderer: an `options` block taking `[{ id, label, html | markdown | code }]`, rendering each as a card with the "pick this option" control. That ties the mockup directly to the "pick an option" answer type in the map.
- **Isolation.** Each option's HTML should render in its own container so styles do not leak between options or into the round page: Shadow DOM for trusted styling only, or `<iframe sandbox srcdoc>` if scripts are allowed. Which one is the security ticket's call.
- **Styling helper.** Tailwind's browser build loads with one tag, `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4">`; Tailwind says the Play CDN "is designed for development purposes only, and is not intended for production" ([Tailwind Play CDN](https://tailwindcss.com/docs/installation/play-cdn)). A local grilling session is a development context, and agents write Tailwind classes fluently, so this is a reasonable optional include. A classless sheet such as Pico CSS (`@picocss/pico` 2.1.1) is a lighter alternative.
- **Sketchy wireframe look.** `wired-elements` (3.0.0-rc.6, last published May 2022) is effectively unmaintained; `roughjs` (4.6.6) can draw hand-drawn SVG but makes the agent write drawing code. Neither is worth building in.
- **Anchoring** falls back to the generic scheme: option id from the card, plus the clicked element's descriptor inside it.

## Generative UI (Vercel AI SDK, json-render)

The question: when the coding agent itself is the generator, does Vercel-style generative UI beat agent-written HTML?

- **AI SDK RSC (`streamUI`)** "calls a model and allows it to respond with React Server Components"; it needs a framework with RSC support, and the docs say "AI SDK RSC is currently experimental. We recommend using AI SDK UI for production." ([AI SDK RSC overview](https://ai-sdk.dev/docs/ai-sdk-rsc/overview)). Package `@ai-sdk/rsc` 3.0.116 on npm.
- **AI SDK UI generative UI** is "the process of connecting the results of a tool call to a React component": a server route runs `streamText` with tools, and the client's `useChat` renders typed tool parts ([AI SDK UI generative UI](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)).
- **json-render** (Vercel Labs, 0.21.0) defines a Zod-typed component **catalog**, has the model emit a **flat spec** `{ root, elements: { key: { type, props, children: [keys] } } }`, streams it as RFC 6902 JSON-Patch lines, and renders with React, Vue, Svelte, Solid, React Native and others ([json-render.dev](https://json-render.dev/), [core README](https://github.com/vercel-labs/json-render/blob/main/packages/core/README.md), [packages dir](https://github.com/vercel-labs/json-render/tree/main/packages)). It also ships `@json-render/mcp`, which serves a json-render UI as an MCP App; the iframe UI is a React app "bundle[d] with Vite + vite-plugin-singlefile" ([mcp README](https://github.com/vercel-labs/json-render/blob/main/packages/mcp/README.md)).

Assessment for this project:

- **Both AI SDK paths presuppose a server-side model call.** Their machinery (tool-call streaming, `useChat`, RSC streaming) exists to connect a model the *app* calls to React. Here the model is the coding agent, already outside the page; there is no `streamText` to hook. They also require React plus a bundler, which fails criterion 1. **No fit.**
- **json-render is the closest fit, but its advantages do not apply here.** `catalog.prompt()`, JSONL patch streaming and the AI Gateway composer all serve an app-side model. With the agent as generator, json-render reduces to "the agent writes JSON against a component catalog", which the building blocks above already do per block (Mermaid text, Vega-Lite JSON, table JSON, options JSON), without React or a build. The React/Vue/Svelte renderers need either a prebuilt bundle shipped with the skill or an import-map setup; neither is "CDN, no build" for the agent.
- **What to borrow:** the flat, keyed element map. Giving every element a stable key the agent chose is exactly what makes anchored comments precise. The round-page format could adopt that shape (each illustration and block has an agent-chosen `id`), independent of json-render itself.
- **Versus agent-written HTML:** HTML maximises freedom (already required by the map) and agents write it very reliably; its weakness is anchoring (arbitrary DOM, no guaranteed ids) and isolation. Blocks cover the common cases with better anchors; raw HTML covers the rest with generic anchors.

## Agent reliability

Primary evidence on *frontier coding agents* writing these formats is thin:

- MermaidSeqBench (132 NL→sequence-diagram samples) evaluated only open 0.5B–72B models; syntax was "consistently the strongest" dimension, with 8B models scoring around 87–92% on syntax as judged by an LLM ([MermaidSeqBench](https://arxiv.org/html/2511.14967v3)). No frontier models were evaluated.
- The Vega-Lite comparison above found Vega-Lite markedly harder than Python for 2024-era models ([arXiv 2507.22890](https://arxiv.org/html/2507.22890v1)).
- Mermaid's docs list known syntax traps: a lowercase `end` in a flowchart node "will break the Flowchart", and special characters need quoting or entity codes ([flowchart syntax doc](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/docs/syntax/flowchart.md)).

Implications for the skill:

1. Validate every block before the round is shown (`mermaid.parse`, Vega-Lite schema/compile), and send failures back to the agent as text so it can fix and resubmit. The agent cannot see the rendered page, so this loop is the only guarantee a round renders.
2. Keep authoring guidance short and trap-focused (quote labels in Mermaid; always set `$schema` and field types in Vega-Lite).
3. Pin the Mermaid look/theme and Vega config in the block so output is consistent across rounds and major versions (Mermaid 12 just changed every diagram's default look).

## Anchoring design implications

For the anchored-comment ticket; findings, not a decision:

- **Generic layer (works for raw HTML and every block):** on click, walk up from `event.target` to the nearest element carrying identity (`id`, `data-id`, `data-*`, `aria-label`, `<title>` child), and record: question id, illustration id, that identity, the element's tag/role and text snippet, a CSS path as fallback, and the click position relative to the illustration box.
- **Block adapters add precision:**
  - Mermaid: strip the render-id prefix and counter from node ids (`flowsvg-flowchart-C-3` → `C`); edges via `data-id` (`L_C_D_0`); sequence participants and messages via `data-id`/`data-from`/`data-to`. Resolve clicks on message text and edge labels to their neighbouring line or edge.
  - Vega-Lite: use the mark's `aria-label` (or `item.datum` from `view.addEventListener`).
  - Tables: `data-row`/`data-col` plus header text.
  - Options: the option `id` plus the generic descriptor inside the card.
  - Graphviz (if included): the `<g id>` the agent set, or the `<title>` text.
  - D2 (if an agent uses it raw): base64-decode the `<g class>`.
- **Canvas renderers** (Chart.js, ECharts default) only yield coordinates unless a library-specific adapter calls their event API. This is the main reason to steer chart blocks to SVG output.

## Sources

- npm registry metadata, `https://registry.npmjs.org/<package>/latest`, read 2026-09-26: mermaid, @d2lang/d2, @terrastruct/d2, vega-lite, vega-embed, chart.js, echarts, @observablehq/plot, d3, @viz-js/viz, nomnoml, gridjs, tabulator-tables, marked, @tailwindcss/browser, wired-elements, roughjs, @excalidraw/excalidraw, @picocss/pico, @json-render/*, ai, @ai-sdk/rsc, @ai-sdk/react.
- jsDelivr file downloads and a local no-build harness page (all rendering/attribute observations marked "harness").
- [Mermaid usage](https://mermaid.ai/open-source/config/usage.html)
- [Mermaid 12.0.0 release notes](https://github.com/mermaid-js/mermaid/releases/tag/mermaid%4012.0.0)
- [Mermaid flowchart syntax doc](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/docs/syntax/flowchart.md)
- [D2.js README](https://github.com/terrastruct/d2/blob/master/d2js/js/README.md), [D2 layouts](https://d2lang.com/tour/layouts)
- [Vega-Lite embedding](https://vega.github.io/vega-lite/usage/embed.html), [Vega View API](https://vega.github.io/vega/docs/api/view/)
- [Observable Plot pointer docs](https://github.com/observablehq/plot/blob/main/docs/interactions/pointer.md)
- [ECharts events](https://echarts.apache.org/handbook/en/concepts/event/), [ECharts canvas vs SVG](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/)
- [Chart.js interactions](https://www.chartjs.org/docs/latest/configuration/interactions.html)
- [Tailwind Play CDN](https://tailwindcss.com/docs/installation/play-cdn)
- [AI SDK RSC overview](https://ai-sdk.dev/docs/ai-sdk-rsc/overview), [AI SDK UI generative UI](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)
- [json-render.dev](https://json-render.dev/), [json-render core README](https://github.com/vercel-labs/json-render/blob/main/packages/core/README.md), [json-render MCP README](https://github.com/vercel-labs/json-render/blob/main/packages/mcp/README.md)
- [MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps)
- [MermaidSeqBench (arXiv 2511.14967)](https://arxiv.org/html/2511.14967v3)
- [Evaluating LLMs for Visualization Generation and Understanding (arXiv 2507.22890)](https://arxiv.org/html/2507.22890v1)
