# Research: anchor terms for every Mermaid 12 diagram type

Ticket: [#10](https://github.com/jatassi/skills/issues/10), child of map [#1](https://github.com/jatassi/skills/issues/1) (visual grilling).
Researched 2026-09-26 against `mermaid@12.0.0`, the only 12.x release (npm `latest`, published 2026-09-10).
Vocabulary (illustration, anchored comment) is from `CONTEXT.md`.
Test page: [`mermaid-anchor-terms-harness.html`](mermaid-anchor-terms-harness.html), next to this file.

## Question

For each diagram type Mermaid 12 ships, rendered with the `neo` look and the default ELK layout:

1. Which elements would a user click to comment on?
2. What does the rendered SVG expose for each (ids, `data-*`, classes, `<title>`, text)? Does it carry the agent's source id or label?
3. What rule turns a click into the source term: which attribute to read, what to strip, or which position in the source it matches? This includes clicks on text that has no id.
4. Where is a precise term not achievable, and why?

It also asks whether the flowchart, sequence and state findings from [#4](https://github.com/jatassi/skills/issues/4) and [#5](https://github.com/jatassi/skills/issues/5) still hold.

## Answer in brief

- **Mermaid 12.0.0 ships 32 diagram types.** It registers 36 diagram ids, because the four railroad dialects are registered separately and `flowchart-elk` is an alias of flowchart. Beyond the ticket's list, it also ships C4, tree view, event modeling, Ishikawa, Venn, Wardley, Cynefin, railroad (IR/EBNF/ABNF/PEG), agentflow and swimlane. All 32 rendered in the harness.
- **No diagram type is impossible to anchor precisely.** Every element the agent wrote can be mapped back to a precise source term. The rule differs by type, though, and falls into one of four kinds:
  - **A. Source id in the SVG.** Read an attribute and strip the render-id prefix and counter. Applies to flowchart, swimlane, agentflow, class, state (states), ER, requirement, kanban, block, use case, architecture, C4 elements, Gantt, Venn, gitGraph (commits with ids), and sequence participants and messages.
  - **B. Position in the source.** The SVG has no id, or the syntax has none, but DOM order follows a fixed, verified rule, so element *k* is the *k*-th source statement. Applies to mindmap (the agent's ids are dropped), pie, XY chart, quadrant, sankey, radar, packet, journey, timeline, tree view, event modeling boxes, railroad, Wardley, Cynefin, Ishikawa, C4 relationships and boundaries, state transitions, and sequence notes and blocks.
  - **C. A neighbouring element.** The clicked text has no id, but a fixed DOM relation points to the element it labels. Examples: sequence message text goes to the *next* message element, a C4 relationship label goes to the preceding line, a journey face or label goes to the preceding task line, and a class cardinality goes to the preceding relation label.
  - **D. Geometry.** Which shape contains the click point. Needed for Venn (a label can sit under another region's path), architecture group titles, treemap leaves (to find their parent section), sequence activation bars, the points on an XY line, and sankey node labels (links are drawn over them).
- **Some elements cannot be given a source term.** None of these is a whole diagram type:
  - **Generated decoration** with no source statement: axis ticks, Gantt dates and the today line, Cynefin domain subtitles, Wardley stage labels and axes, event-modeling lane headers, tree view's synthetic `/` root, Venn intersections the agent never declared, and event-modeling relations inferred from frame order. These can only be named by what they show, for example "generated tick 2026-09-03" or "relation ShopUI → AddItem".
  - **Content dropped from the render**, so it cannot be clicked at all: pie slices under 1% (and repeated pie labels, where the first one wins), and timeline periods written before the first `section` when sections exist.
  - **Identical siblings in types without ids.** Two treemap leaves with the same name under the same parent differ only by value, because treemap orders by value. The adapter should report both candidates.
  - **Flowchart edge-id collisions.** `a_b --> c` and `a --> b_c` both get edge id `L_a_b_c_0`. Under ELK this makes `render()` throw, even though `mermaid.parse` accepts the text. Under dagre it renders two edges with the same id.
- **The #4/#5 findings still hold under `neo` + ELK, with four corrections.** Details in [Confirmation of #4/#5](#confirmation-of-45):
  1. Edge labels are directly addressable. The click lands in `g.label[data-id]`, not in an id-less `edgeLabel`.
  2. Sequence message text must be matched to the *next* message element, not the *n*-th one, because multi-line messages emit several `<text>` elements.
  3. Edge ids must be split against the known node ids, not with a regex, because source ids can contain `_`.
  4. Explicit edge ids (`A e1@--> B`) arrive as `data-id="e1"`.

## Method

- **Type list.** `mermaid@12.0.0` from npm: the detector list in `dist/mermaid.esm.mjs` (`addDiagrams`), `mermaid.getRegisteredDiagramsMetadata()` called in the page, the [12.0.0 release notes](https://github.com/mermaid-js/mermaid/releases/tag/mermaid%4012.0.0), and the syntax docs at the `mermaid@12.0.0` tag (`packages/mermaid/src/docs/syntax/`). Sample sources came from `@mermaid-js/examples@2.0.0`, released with 12.0.0, and the tag's syntax docs for agentflow, swimlane and use case.
- **Rendering.** [`mermaid-anchor-terms-harness.html`](mermaid-anchor-terms-harness.html) imports `https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.esm.min.mjs` with no build step and calls `mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', look: 'neo' })`. It leaves `layout` unset, so the 12.0 global default applies: `"layout": "elk"` in the shipped default config. The ELK chunk (`elk-*.mjs`) was confirmed as fetched. It renders one sample per type, with ids deliberately different from labels, plus edge-case samples prefixed `x-`. Each sample goes through `mermaid.render('d-<type>', src)`.
- **Dump.** `window.harness.dumpAll()` groups every element carrying identity by signature (tag, class, attribute names). For each visible text leaf it runs `document.elementFromPoint` at the text's centre, which is what a real click would hit, and walks up to the nearest element carrying identity. For each identity element it checks whether a centre click reaches it. Run in headless Chromium 153 via Playwright 1.63. Follow-up probes rendered targeted variants such as duplicate edges, ids with underscores, multi-line messages, and wrapping packet fields. Their sources are the `x-` samples in the harness.
- **Source reading** for behaviour the render alone does not show: the pie renderer's filtering (`pieDiagram-*.mjs`), and the default config (`chunk-*.mjs`: global `"layout": "elk"`, per-type `look`).

To reproduce, serve `docs/research/` (`python3 -m http.server`), open the harness, click any element to see its attribute chain, or run `await harness.dumpAll()` in the console.

## Conventions used below

- `P` is the render-id prefix: the id passed to `mermaid.render` (the `<svg id>`) followed by `-`. In the harness `P` is `d-flowchart-`, and so on.
- "Walk up" means: from `event.target`, climb ancestors to the first element with a meaningful id or `data-*` attribute.
- **Ignore** `data-look`, `data-color-id`, `data-points`, `data-edge`, `aria-hidden` and ids starting with `IconifyId` (architecture icon internals). They are on almost everything and identify nothing.
- **Scope every lookup to the illustration's container.** Several types emit ids without the prefix: sequence (`root-N`, `actorN`), swimlane lanes (`id="Customer"`), and sankey (`node-N` from a page-global counter that changes on every render). Two diagrams on one page therefore collide on `document.getElementById`. Mindmap even gives a node's `g` and its shape `path` the same id.
- A counter written `-<n>` in an id is Mermaid-internal, not an ordinal the agent can use. For example, the three `A --> B` edges got suffixes `_0`, `_2`, `_3`. When the agent needs "which one", count by DOM order, which follows source order wherever it was checked.

## Summary table

"Rule" is the kind (A–D) defined in [Answer in brief](#answer-in-brief). "Text without id" says how a click on a bare label resolves.

| Type (keyword) | Elements worth commenting on | SVG identity | Rule | Text without id |
|---|---|---|---|---|
| Flowchart (`flowchart`, `graph`, `flowchart-elk`) | nodes, edges, edge labels, subgraphs | node `P`+`flowchart-<ID>-<n>`; subgraph `P`+`<ID>`; edge `data-id="L_<from>_<to>_<n>"` or explicit `e1`; label `g.label[data-id]` | A | none: labels sit inside an identified `g` |
| Swimlane (`swimlane-beta`) | lanes, nodes, edges, labels | lane `g.cluster.swimlane[id=<ID>][data-id=<ID>]` (no prefix); nodes and edges as flowchart; label `g[id="edge-label-<from>-<to>-<edgeId>"]` | A | label id ends with the edge's `data-id` |
| Agentflow (`agentflow-beta`) | flows, tasks/tools/decisions, edges | node `P`+`agentflow-<ID>-<n>` + class `af-kind-<shape>`; flow `P`+`<ID>`; edges as flowchart | A | none |
| Class (`classDiagram`) | classes, members, methods, relations, cardinalities, notes, namespaces | class `P`+`classId-<Name>-<n>`; relation `data-id="id_<A>_<B>_<k>"`; note `P`+`note<k>`; namespace `P`+`<Name>` | A (members: B) | member: *k*-th `g.label` in `members-group`/`methods-group`; cardinality: preceding `g.label[data-id]` |
| State (`stateDiagram-v2`) | states, composites, transitions, notes, start/end | state `P`+`state-<ID>-<n>` (composite also `data-id=<ID>`); transition `data-id="edge<k>"`; note `state-<ID>----note-<n>` | A (transitions: B) | none |
| ER (`erDiagram`) | entities, attributes, relationships | entity `P`+`entity-<NAME>-<n>`; relationship `data-id="id_entity-<A>-<i>_entity-<B>-<j>_<k>"`; attribute cells `g.label.attribute-{type,name,keys,comment}` | A (attributes: B) | attribute row = count of preceding `attribute-type` in the entity |
| Requirement (`requirementDiagram`) | requirements, elements, relations, fields | node `P`+`<name>` (no counter); relation `data-id="<src>-<dst>-<k>"` | A | field from the row's prefix (`ID:`, `Text:`, `Risk:`, `Verification:`, `Type:`, `Doc Ref:`) |
| Mindmap (`mindmap`) | nodes, branches | node `P`+`node_<k>`; edge `edge_<parent>_<child>`; **the agent's ids (`ch[...]`) are not emitted** | B | none |
| Kanban (`kanban`) | columns, cards, card metadata | column `P`+`<colId>`; card `P`+`<cardId>` | A | metadata labels sit inside the card `g` |
| Block (`block-beta`) | blocks, composite blocks, edges | block `P`+`<ID>`; edge `data-id="<svgId>-<k>-<from>-<to>"`; label `data-id="<k>-<from>-<to>"` | A | none |
| Use case (`usecase-beta`) | actors, use cases, boundaries, relationships | `data-usecase-id`, `data-usecase-kind`, `aria-label` ("actor Support agent", "include from Do it to Sub"); relation `edge-<k>` | A | none |
| Architecture (`architecture-beta`) | services, groups, junctions, edges | service `P`+`service-<ID>`; group `rect` `P`+`group-<ID>`; junction `P`+`node-<ID>`; edge `P`+`L_<a>_<b>_<n>` | A (group titles: D) | group title: smallest group rect containing the click |
| Sequence (`sequenceDiagram`) | participants, messages, notes, blocks, activations | participant `g[data-et=participant][data-id]`; message `[data-et=message][data-id=i<k>][data-from][data-to]`; note/block `g[data-et][data-id=i<k>]`; bottom box `rect[name=<ID>]` | A (message order: B) | message text → **next** message element; bottom label → sibling rect's `name`; activation: D |
| C4 (`C4Context`…) | people, systems, containers, boundaries, relationships | element `g.c4-shape` `P`+`<alias>`; boundaries and relationships have **no** identity | A (boundaries, rels: B) | relationship label → preceding line/path in the relationships `g` |
| Git graph (`gitGraph`) | commits, branches, tags, merges | `circle.commit` class tokens `commit <commitId> commit<branchIdx>` (`commit-merge` for merges); auto ids `<seq>-<random hex>` | A (auto ids: B) | commit label text is the id; branch/tag text is the name |
| Gantt (`gantt`) | tasks, milestones, sections | `rect` `P`+`<taskId>`, `text` `P`+`<taskId>-text`; id-less tasks `task<k>` | A | section title: text is the section name |
| Pie (`pie`) | slices, legend entries | none (`path.pieCircle`, `text.slice` shows %, `g.legend`) | B | legend entry *k* = *k*-th distinct label |
| Quadrant (`quadrantChart`) | points, quadrant labels, axes | none (`g.data-point` holds circle + name) | B | point name text sits in the point `g` |
| XY chart (`xychart`) | bars, line points, axis categories | `g.bar-plot-<p>` / `g.line-plot-<p>`; bars are bare `rect`s | B (line points: D) | category from x position |
| Sankey (`sankey`) | nodes, flows | `g.node[id=node-<global n>]` (unstable); `g.link` bare | B | label click lands on a link path → D |
| Radar (`radar-beta`) | axes, curves, legend | `path.radarCurve-<k>`, `rect.radarLegendBox-<k>`; axis lines/labels in order | B | axis label text = axis label |
| Treemap (`treemap-beta`) | sections, leaves | none (`g.treemapSection`, `g.treemapLeafGroup`) | B + D | name path via containment |
| Packet (`packet`) | fields | none (`rect.packetBlock` + label + start/end) | B | block → field whose range holds its start bit |
| Journey (`journey`) | tasks, scores, sections, actors | `line.task-line` `P`+`task<k>`; actor `circle.actor-<i>` with `<title>` | B | → preceding `line.task-line` |
| Timeline (`timeline`) | sections, periods, events | `path.node-bkg` `P`+`node-<k>` inside each `g.timeline-node` | B | wrapper: `taskWrapper` = period, `eventWrapper` = event, neither = section |
| Tree view (`treeView-beta`) | files, folders | none (`text.treeView-node-label`, `treeView-node-dir`) | B | DOM index *k* ≥ 1 = *k*-th source line (0 is a synthetic `/`) |
| Event modeling (`eventmodeling`) | frames/boxes, relations | none (`g.em-box`, `path.em-relation`) | B (relations: D) | box *k* = *k*-th `tf` line |
| Ishikawa (`ishikawa-beta`) | effect, categories, causes | none (`g.ishikawa-label-group`, `g.ishikawa-sub-group`) | B | cause → preceding label group; causes in **reverse** source order |
| Venn (`venn-beta`) | sets, intersections | `g.venn-area[data-venn-sets="A_B"]` | A, but clicks need D | set combination = circles whose fill contains the point |
| Wardley (`wardley-beta`) | components, anchors, links, evolve, notes | none (`g.wardley-node--<kind>`, `line.wardley-link`) | B | component name is unique by syntax |
| Cynefin (`cynefin-beta`) | items, transitions, domains | none (`rect.cynefinItem`, `path.cynefinArrowLine`) | B | item text; order = fixed domain order, then source order |
| Railroad (`railroad-beta`, `railroad-ebnf-beta`, `railroad-abnf-beta`, `railroad-peg-beta`) | rules, terminals, non-terminals | none (`g.railroad-rule`, `g.railroad-terminal`, `g.railroad-nonterminal`) | B | rule name + element text + occurrence within the rule |

Not covered: ZenUML ships as a separate plugin (`@mermaid-js/mermaid-zenuml@1.0.0`), not in `mermaid` itself. `info` only prints the version.

## Per-type rules

### Graph family (unified renderer: flowchart, swimlane, agentflow, class, state, ER, requirement, mindmap, kanban, block, use case)

These share one renderer. Nodes are `g.node`, edges are `path[data-et=edge][data-id]`, and every edge label renders as `g.edgeLabel > g.label[data-id=<edge data-id>]`. A click on label text lands on a `<p>` inside a `foreignObject`, and walking up reaches `g.label[data-id]`. Edge labels therefore need no position matching in any type of this family.

**Flowchart.**
- *Node.* Strip `P`, then `^flowchart-(.+)-\d+$` gives the agent's id. Hyphens in ids survive (`flowchart-other-node-1` → `other-node`).
- *Subgraph.* `g.cluster` id is `P`+`<subgraph id>`.
- *Edge.* If `data-id` starts with `L_`, split the remainder (after dropping the trailing `_<n>`) into from/to by trying every `_` position against the set of node and subgraph ids already found in the same SVG. If there is no `L_` prefix, the data-id is an explicit edge id the agent wrote (`A e1@--> B` → `data-id="e1"`).
- *Duplicate edges.* Parallel `A --> B` edges got `L_A_B_0`, `L_A_B_2`, `L_A_B_3`. The term is "the 2nd A → B edge", counted in DOM order.
- *Hazard.* `a_b --> c` together with `a --> b_c` makes both edges `L_a_b_c_0`. With ELK, `render()` throws `Cannot read properties of undefined (reading 'filter')`. With `layout: dagre` it renders two paths sharing the id. `mermaid.parse` accepts the source in both cases, so only a render catches it. Only the collision fails: `a_b --> c` with `a --> d` renders fine.

**Swimlane.**
- Nodes and edges follow the flowchart rules (`P`+`flowchart-<ID>-<n>`, `L_…`).
- Lanes are `g.cluster.swimlane` with `id` and `data-id` equal to the lane name, with no prefix.
- The edge label is `g.label.edgeLabel[id="edge-label-<from>-<to>-L_<from>_<to>_<n>"]` with no `data-id`. Match it to the edge whose `data-id` is a suffix of that id.

**Agentflow.**
- Node: `P`+`agentflow-<ID>-<n>`. Its class `af-kind-input|task|tool|decision|action` gives the shape.
- Flow container: `g.cluster.flow-cluster` `P`+`<flowId>`.
- Edges: as flowchart (`L_ok_publish_0`).

**Class.**
- *Class.* `P`+`classId-<Name>-<n>`. The id uses the class name even when a label is shown (`class Question["Question label"]` → `classId-Question-4`) and drops generics (`Round~T~` → `classId-Round-3`).
- *Namespace.* `g.cluster` `P`+`<Name>`.
- *Relation.* `data-id="id_<A>_<B>_<k>"`, where *k* counts relations from 1 in source order. Split A/B against the known class names, as for flowchart.
- *Cardinality.* The `1`/`many` texts are `g.edgeTerminals` with no id. Every relation emits a `g.label[data-id]`, even an empty one, and its terminals follow it in the DOM. So a terminal belongs to the preceding `g.label[data-id]`. The geometric check agreed: the nearest edge endpoint was the same relation's source or target end, 13–33 px away.
- *Members and methods.* A member row is the *k*-th `g.label` under `g.members-group` or `g.methods-group` of its class node. It maps to the *k*-th attribute or method line of that class; the text is the declaration.
- *Notes.* `P`+`note<k>`, where *k* counts notes from 0 in source order. `edgeNote<k>` is the dotted line to the class.

**State.**
- *State.* `P`+`state-<ID>-<n>`; strip with `^state-(.+)-\d+$`. Composites also carry `data-id=<ID>`. `state "Long name" as LN` gives id `LN`.
- *Pseudo-states.* `[*]` becomes `<parent>_start` or `<parent>_end` (`root_start`, `Review_start`). Choice and fork states have ids but no text.
- *Transition.* `data-id="edge<k>"`, where *k* is the *k*-th transition in source document order, nested ones included. Verified: nine transitions, one written inside a composite before the outer ones, numbered exactly in source order. A `g.label[data-id=edge<k>]` carries the transition text.
- *Note.* `state-<ID>----note-<n>` means the note on state `<ID>`.

**ER.**
- *Entity.* `P`+`entity-<NAME>-<n>`. The id uses the entity name even with an alias (`CUSTOMER["Customer table"]` → `entity-CUSTOMER-0`).
- *Relationship.* `data-id="id_entity-<A>-<i>_entity-<B>-<j>_<k>"`, where *k* counts relationships from 0 in source order.
- *Attribute.* Each attribute renders four `g.label` cells in DOM order: `attribute-type`, `attribute-name`, `attribute-keys`, `attribute-comment` (empty ones included), in source order. For a clicked cell, the row is the number of `attribute-type` cells before it in the entity. The term is `CUSTOMER.email`.

**Requirement.**
- *Node.* `P`+`<name>`, with no counter.
- *Relation.* `data-id="<src>-<dst>-<k>"`, with `<<contains>>`-style labels on `g.label[data-id]`.
- *Field row.* A click in a node lands on a row whose text starts with the field name, which gives "requirement `rider_safety`, field Risk".

**Mindmap.**
- *Node.* `P`+`node_<k>`, where *k* is the node's position in source line order: depth-first, root = 0, and `::icon(...)` lines don't count.
- *Lost ids.* The ids the agent writes (`ch[Channel]`) are **not** in the SVG. The adapter recovers them by reading the *k*-th node line of the source.
- *Edge.* `edge_<parent k>_<child k>`.

**Kanban.**
- Column `g.cluster` `P`+`<colId>`; card `g.node` `P`+`<cardId>`. Both are the agent's ids.
- Metadata labels (`assigned`, `ticket`, `priority`) sit inside the card `g`.

**Block.**
- *Block.* `g.node` `P`+`<ID>`, composite blocks (`block:grp`) included.
- *Edge.* `data-id="<svgId>-<k>-<from>-<to>"`, where *k* counts edges between that pair from 1. Its label's `data-id` has no svg-id prefix (`1-ui-api`).
- *Hazard.* Ids containing `-` make from/to ambiguous. Split against the known block ids.

**Use case: the best-annotated type.**
- *Elements.* Every element carries `data-usecase-id` (the agent's id), `data-usecase-kind` (`actor`, `usecase`, `boundary`, `relationship`), `role="img"` and a readable `aria-label` (`"use case Browse products"`).
- *Relationship.* `data-usecase-id="edge-<k>"` (*k* from 0 in source order), with `aria-label="include from Do it to Sub"`.
- *Boundary.* A boundary's id is its title (`usecase-Shop`).

### Sequence

- *Participant.* The top box is `g[data-et=participant][data-type=participant|actor][data-id=<ID>]` (with `id="root-N"`, unprefixed). The lifeline is `line[data-et=life-line][data-id=<ID>]`.
- *Bottom box.* It has no `data-id`, but its `rect.actor-bottom` carries `name="<ID>"`. The box's `text.actor-box` is the next sibling, so read the preceding rect's `name`.
- *Message.* `line` (or `path` for self-messages) with `[data-et=message][data-id=i<k>][data-from][data-to]`. `i<k>` indexes Mermaid's internal statement list, which also counts activations, notes and block markers. So give the agent the message's rank among `[data-et=message]` elements (DOM order = source order), plus from → to and the text: "message #3 U → S 'Submit round'".
- *Message text.* `text.messageText` has no id and comes **before** its line in the DOM. A message with `<br/>` emits one `text` per line (`"two"`, `"lines"`, then the line). The rule is: the next `[data-et=message]` element after the clicked text.
- *Notes.* `g[data-et=note][data-id=i<k>]` wraps the rect and text, so walking up works.
- *Blocks.* `alt`, `loop`, `opt` and friends: `g[data-et=control-structure][data-id=i<k>]` wraps the frame, the keyword and the condition texts.
- *Activation.* `rect.activation<n>` has no participant id. Resolve by which lifeline's x it overlaps (kind D), then order by y.
- *`box` groups.* No identity. Resolve by the box's title text or by geometry.

### Architecture

- *Elements.* Service `g.architecture-service` `P`+`service-<ID>`. Junction `rect` `P`+`node-<ID>`. Group `rect.node-bkg` `P`+`group-<ID>`. Edge `path.edge` `P`+`L_<a>_<b>_<n>`.
- *Group title.* It is a separate `g > rect.background + text`, not linked to its group. Resolve it to the smallest `rect[id^=P+"group-"]` containing the click.
- *Icon noise.* Icon internals carry `IconifyId…` ids and `data-name`. Ignore them.
- *Limit.* Two edges between the same pair of services fail to render ("Can not create second element with ID `api-db`").

### C4

- *Elements.* People, systems, containers and components are `g.node.c4-shape.c4-<kind>` with id `P`+`<alias>`, which is the agent's id. Walking up from any text in the box works.
- *Boundaries.* A boundary is an anonymous `g` holding a dashed rect and two texts (label, `[SYSTEM]`). Its alias (`b1`) is not emitted, so boundary *k* in DOM order = *k*-th boundary in source. The label text is the agent's label.
- *Relationships.* All of them sit in one anonymous `g`, as a sequence of `line`/`path` + label `text`(s) per `Rel`, in source order. A click on a line or path is the *k*-th `Rel`/`BiRel`, counting line and path elements. A click on label text belongs to the preceding line or path.

### Git graph

- *Commit.* `circle.commit` (or `rect` for `type: HIGHLIGHT`) with class tokens `commit <commitId> commit<branchIndex>`; merges add `commit-merge`. An explicit `id: "a3f82c1"` is the agent's term.
- *Auto ids.* Commits without an id get `<seq>-<7 random hex>` (`0-fbc4a5e`). The hex part changes on every parse, so the stable term is `<seq>`: the commit's position among commit-producing statements (`commit`, `merge`), counted from 0.
- *Text.* `text.commit-label` shows the id, `g.branchLabel` the branch name, `text.tag-label` the tag.
- *Branches.* `line.branch.branch<i>`, where *i* is the branch's order of declaration, `main` = 0.

### Gantt

- *Task.* `rect` `P`+`<taskId>` and `text` `P`+`<taskId>-text`. Tasks without an id get `task<k>`, counted from 1 among id-less tasks only (`First task` → `task1`, `Second` → `task2`, `Named :nm` → `nm`, `Crit` → `task3`). Task rects are **not** in source order in the DOM, so always read the id.
- *Section.* `text.sectionTitle` text is the section name. The background band `rect.section section<i mod 4>` is not unique; resolve it by y against the task rows.
- *Generated.* Date ticks and the today line have no source term.

### Charts and positional types

**Pie.**
- *Elements.* Slices (`path.pieCircle`), percentage labels (`text.slice`) and legend entries (`g.legend`) carry no ids or data. d3's bound data (`__data__`) does not survive, because `mermaid.render` returns a string.
- *Rule (from the renderer source).* Take the distinct labels in source order; a repeated label keeps its first value. Drop any whose share is under 1% (`value / sum * 100 >= 1`, and the rounded percent is not `"0"`). Slice *k* and percentage text *k* are the *k*-th survivor. Legend entry *k* is the *k*-th distinct label, including dropped ones. Verified: `"Tiny": 0.2` got no slice but kept its legend entry, and `"Big": 5` after `"Big": 60` was ignored.
- *Fallback.* With 12 or fewer labels, matching the slice `fill` to the legend rect fill also works.

**Quadrant chart.**
- *Point.* `g.data-point` holds the circle and the name. DOM order is the **reverse** of source order (verified with four points, including two named `Alpha`). The name is the agent's term; *n* − 1 − DOM index separates duplicates.
- *Other text.* `g.quadrant` labels come in `quadrant-1…4` order. Axis labels are the source's axis text.

**XY chart.**
- *Plot.* `g.bar-plot-<p>` / `g.line-plot-<p>`, where *p* is the plot's position among all `bar` and `line` statements.
- *Bar.* Bar *j* in a bar plot is x-category *j*.
- *Line.* A line is one `path` with no per-point elements, so a click resolves to the nearest category by x (kind D).
- *Generated.* Tick labels on the value axis.

**Sankey.**
- *Node.* `g.node[id=node-<n>]` from a page-global counter (`node-12`… on a later render), so it is unusable. Node *k* in DOM order is the *k*-th distinct name by first appearance in the CSV (verified from rect heights).
- *Label.* `text` in `g.node-labels` reads `"<name> <total>"`; strip the trailing number.
- *Link.* `g.link` *k* = CSV row *k* (verified: stroke widths ran 10 : 5 : 12 : 3 : 4, matching the rows).
- *Hit-testing.* Link paths are painted over node labels, so a click on a label's centre hits a link. Test the click point against label bounding boxes first.

**Radar.**
- Axis *k* (`line.radarAxisLine` + `text.radarAxisLabel`, DOM order) = *k*-th axis in source. Its source id (`m` in `m["Math"]`) comes from that position; the label is in the SVG.
- `path.radarCurve-<k>` and `rect.radarLegendBox-<k>` = *k*-th `curve` → its source id.

**Treemap.**
- *Elements.* `g.treemapSection` (header label + value) and `g.treemapNode.treemapLeafGroup` (label + value), all flat siblings, with leaves **sorted by value**.
- *Term.* The name path "Root / A / x". The parent comes from which section rect contains the leaf.
- *Limit.* Two same-named siblings under one parent can only be told apart by value.

**Packet.**
- *Elements.* `rect.packetBlock`, `text.packetLabel`, and `text.packetByte.start` / `.end`, with no ids.
- *Rule.* A field that crosses a row is split into several blocks with row-local ranges: `16-47` renders as `16–31` and `32–47`. The term is the source field whose bit range contains the block's start bit.

**Journey.**
- *Task.* `line.task-line` `P`+`task<k>`, where *k* = *k*-th task in source. The task's rect, text, score face and actor dots follow it in the DOM until the next task line, so any click resolves to the preceding `line.task-line`.
- *Actor.* Dots are `circle.actor-<i>` with a `<title>` holding the actor name.
- *Section.* A band or title resolves by DOM order and its text.

**Timeline.**
- *Item.* Every section header, period and event is a `g.timeline-node` containing `path.node-bkg` `P`+`node-<k>`, where *k* follows DOM order.
- *Kind.* Inside `g.taskWrapper` it is a period. Inside `g.eventWrapper` it is an event, and its period is the preceding `taskWrapper`. Neither means a section.
- *Term.* The text is the source term, and *k* separates duplicates.
- *Dropped.* When a diagram has sections, periods written before the first `section` are not rendered.

### Newer 12.x types

**Tree view.**
- *Elements.* `text.treeView-node-label` (plus `treeView-node-dir` for folders), with no ids.
- *Rule.* DOM index 0 is always a synthetic `/` root. Index *k* ≥ 1 = *k*-th entry line in source. Names repeat (`a/index.js`, `b/index.js`), so the adapter should rebuild the path from the source's indentation.

**Event modeling.**
- *Box.* `g.em-box` *k* = *k*-th `tf` line (the frame number is the term). Repeated names such as a second `AddItem` are separated by position.
- *Generated.* Swimlane headers (`g.em-swimlane`).
- *Relations.* `path.em-relation` are mostly inferred from frame order ("Relations among the entities are inferred by default", [eventmodeling syntax doc](https://github.com/mermaid-js/mermaid/blob/mermaid%4012.0.0/packages/mermaid/src/docs/syntax/eventmodeling.md)), so most have no source statement. Name them by their endpoint boxes, found by geometry.

**Ishikawa.**
- *Elements.* Head `text.ishikawa-head-label` (the effect). Categories `g.ishikawa-label-group`, laid out in up/down pairs (`g.ishikawa-pair`). Each category is followed by its causes (`g.ishikawa-sub-group`) in **reverse** source order (verified: `a1, a2, a3` render as `a3, a2, a1`).
- *Wrapping.* Long labels wrap into several `tspan`s; join them.
- *Term.* Category + cause text, with reverse position separating duplicates.

**Venn.**
- *Elements.* `g.venn-area[data-venn-sets]`: set names joined by `_`, the agent's own set names (`Desirable_Feasible`). The union label (`"Sweet spot"`) is the area's text.
- *Hit-testing trap.* The label of `Desirable_Feasible_Viable` sat under the path of `Feasible_Viable`, so walking up from the real click target named the wrong region.
- *Rule.* Compute the region from the click point: the set of `g.venn-circle` paths whose fill contains it (`path.isPointInFill` with the point mapped through `getScreenCTM().inverse()`). This gave the exact region for every label.
- *Generated.* Areas for intersections the agent did not declare (`Desirable_Viable`) are rendered too.

**Wardley.**
- *Component or anchor.* `g.wardley-node.wardley-node--component|--anchor` with a label. Names are unique by syntax, since links refer to them.
- *Link.* `line.wardley-link` *k* = *k*-th link statement (verified against node coordinates).
- *Evolve and notes.* `line.wardley-trend` *k* = *k*-th `evolve`. Notes are text.
- *Generated.* Stage labels and axes.

**Cynefin.**
- *Item.* `rect.cynefinItem` + `text.cynefinItemText`, ordered by fixed domain (complex, complicated, chaotic, clear, confusion), then source order within a domain (verified).
- *Transition.* `path.cynefinArrowLine` + `text.cynefinArrowLabel`.
- *Domain.* `rect.cynefinDomain` and `text.cynefinDomainLabel` correspond to source domain keywords.
- *Generated.* The subtitles ("Probe → Sense → Respond", "Emergent Practices").

**Railroad (IR, EBNF, ABNF, PEG).**
- *Rule.* `g.railroad-rule` *k* = *k*-th rule. `text.railroad-rule-name` reads `"<name> ="`; strip `" ="`.
- *Element.* `g.railroad-terminal` / `g.railroad-nonterminal` text is the symbol. Within a rule, DOM order follows source order (verified: EBNF `term ( "+" term | "-" term )*` renders `term, +, term, -, term`).
- *Term.* "rule `expression`, 2nd `term`".

## Confirmation of #4/#5

Checked under `look: neo` with ELK:

| #4/#5 finding | Status under 12.0 neo + ELK |
|---|---|
| Flowchart node `…-flowchart-C-3` → `C` | Holds. The id is `P` + `flowchart-<ID>-<n>`; *n* is an internal counter (edges advance it too), not the node's position. |
| Edge `data-id="L_A_B_0"` | Holds, with two corrections. (1) Split from/to against known node ids: the prototype's `^L_(.+?)_(.+)_\d+$` misreads `L_my_node_other-node_0` as `my` → `node_other-node`. (2) Explicit edge ids (`e1@-->`) arrive as `data-id="e1"` with no `L_`. |
| Edge labels have no id; map by position/DOM order | **Outdated.** The click lands on `g.label[data-id=<edge data-id>]`, the same data-id as the edge, in flowchart, state, class, ER, requirement, block, mindmap and agentflow. Swimlane is the exception (label `id` with the edge id as suffix). |
| Sequence participants `data-et=participant`, `data-id` | Holds. Top boxes only; bottom boxes carry `rect[name=<ID>]` instead. |
| Sequence messages `data-et=message`, `data-id`, `data-from`, `data-to` | Holds. |
| Sequence message text has no id; resolve to its neighbouring line | Holds, but the rule must be "next message element in DOM", not "*n*-th text = *n*-th message". Multi-line messages emit one `text` per line (the prototype's `msgs[e.nth.i]` would drift). |
| Sequence notes: no id | **Outdated.** Notes (and `alt`/`loop` blocks) are wrapped in `g[data-et=note|control-structure][data-id=i<k>]`. |
| State `…-state-Draft-1`, transitions `data-id="edge0"` | Holds. Transition *k* = *k*-th transition in source document order. |

## Implications for the anchoring adapter

For the anchored-comments implementation; findings, not a decision:

- One adapter per diagram type, keyed by `diagramType` from `mermaid.render`. The harness's `results[name].diagramType` shows the ids: `flowchart-v2`, `sequence`, `classDiagram`, `stateDiagram`, `er`, `railroadEbnf`, and so on. Each adapter returns `{ kind, term, label, via }`. `via` records which rule kind (A–D) produced it, so the agent can tell an id from a positional guess.
- The agent's source is already in the page, since it wrote the illustration. Positional rules (kind B) need the source split into statements. For most types, a line-based splitter is enough. `mermaid.mermaidAPI.getDiagramFromText(src)` also returns the parsed model (`diagram.db`; the pie DB exposed `getSections()` in source order), but the DB methods are internal and undocumented, so they are a convenience, not a contract.
- Render with a stable id per illustration (for example the illustration id) so `P` is known, and never look ids up with `document.getElementById`.
- Thin edges are hard to hit: centre clicks on several edge paths landed on the SVG background. The round page should add a wide transparent stroke (or use `pointer-events: stroke` on a thicker clone) before relying on edge clicks.
- Authoring guidance can raise precision cheaply:
  - give Gantt tasks and gitGraph commits ids;
  - use explicit edge ids (`e1@-->`) where edges will be discussed;
  - avoid `_` in flowchart and class ids (and `-` in block ids);
  - avoid duplicate names in treemap, Ishikawa and Cynefin.
- Validation must render, not only parse. The flowchart edge-id collision passes `mermaid.parse` and fails in `render` under ELK.

## Sources

- npm registry, `https://registry.npmjs.org/mermaid` (dist-tags, `12.0.0` published 2026-09-10) and the `mermaid@12.0.0` tarball: `dist/mermaid.esm.mjs` (detectors and `addDiagrams`), `dist/chunks/mermaid.esm/chunk-KMA2NSDO.mjs` (default config: global `"layout": "elk"`, per-type `look`), `dist/chunks/mermaid.esm/pieDiagram-P5QMDPG5.mjs` (pie filtering and ordering), `dist/mermaidAPI.d.ts` (`getDiagramFromText`).
- [mermaid@12.0.0 release notes](https://github.com/mermaid-js/mermaid/releases/tag/mermaid%4012.0.0): ELK bundled and default; the `neo`/`redux-color` default appearance; use case diagrams; the `@mermaid-js/examples@2.0.0` and `@mermaid-js/mermaid-zenuml@1.0.0` companion releases.
- Syntax docs at the tag, `https://github.com/mermaid-js/mermaid/tree/mermaid%4012.0.0/packages/mermaid/src/docs/syntax`: [agentflow](https://github.com/mermaid-js/mermaid/blob/mermaid%4012.0.0/packages/mermaid/src/docs/syntax/agentflow.md), [swimlanes](https://github.com/mermaid-js/mermaid/blob/mermaid%4012.0.0/packages/mermaid/src/docs/syntax/swimlanes.md), [usecase](https://github.com/mermaid-js/mermaid/blob/mermaid%4012.0.0/packages/mermaid/src/docs/syntax/usecase.md), [eventmodeling](https://github.com/mermaid-js/mermaid/blob/mermaid%4012.0.0/packages/mermaid/src/docs/syntax/eventmodeling.md).
- [Theming, per-diagram defaults](https://github.com/mermaid-js/mermaid/blob/mermaid%4012.0.0/packages/mermaid/src/docs/config/theming.md). Note: this page says the global default layout is `dagre`. The release notes and the shipped default config say `elk`, and ELK was fetched and used in the harness (the ELK-only render failure above confirms it).
- `@mermaid-js/examples@2.0.0` (npm): sample sources for every type except agentflow and swimlane.
- Harness and probes: [`mermaid-anchor-terms-harness.html`](mermaid-anchor-terms-harness.html), rendered in HeadlessChrome 153 via Playwright 1.63 on 2026-09-26. Every attribute, DOM-order and hit-test observation above comes from it.
- Prior findings: [illustration-libraries.md](https://github.com/jatassi/skills/blob/research/illustration-libraries/docs/research/illustration-libraries.md) (#4) and `skills/visual-grilling/PROTOTYPE-anchored-comments.html` on branch `prototype/anchored-comments` (#5).
