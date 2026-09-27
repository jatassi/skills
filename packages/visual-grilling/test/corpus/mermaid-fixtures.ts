// The Mermaid block corpus: sources the Node draw check and Chromium must give
// the same verdict on. Every mismatch found in use becomes a fixture here.
//
// The Node side runs under jsdom with size shims (src/server/dom-shim.ts).
// Besides the three the spec names (getBBox, getBoundingClientRect,
// getComputedTextLength), it needs:
//   - offsetWidth/offsetHeight/clientWidth/clientHeight: gantt sizes itself
//     from its container's offsetWidth, and comes out zero wide without it;
//   - a canvas 2D context with measureText: mindmap's cytoscape layout
//     measures text on a canvas, and throws without one (jsdom has no canvas);
//   - text estimates that skip <style>, <script>, <title>, <desc> and <defs>,
//     or the SVG's own stylesheet counts as label text and inflates sizes.

export type Verdict = 'draws' | 'throws' | 'empty';

export interface MermaidFixture {
  name: string;
  source: string;
  verdict: Verdict;
  /** For a known failure class: what `present`'s explainer must say. */
  explains?: RegExp;
}

export const MERMAID_FIXTURES: MermaidFixture[] = [
  // ------------------------------------------------ a sample of the types
  {
    name: 'flowchart with preset marks',
    verdict: 'draws',
    source: `flowchart LR
  a[Browser] --> b{Server}
  b -->|ok| c[Agent]
  b --> d[Error]
  class c recommended
  d:::risk`,
  },
  {
    name: 'flowchart with subgraphs',
    verdict: 'draws',
    source: `flowchart TB
  subgraph cli [CLI]
    present --> await
  end
  subgraph server [Server]
    check --> page
  end
  present --> check`,
  },
  {
    name: 'sequence',
    verdict: 'draws',
    source: `sequenceDiagram
  participant A as Agent
  participant S as Server
  A->>S: present
  S-->>A: link
  Note over A,S: the user answers
  A->>S: await`,
  },
  {
    name: 'class',
    verdict: 'draws',
    source: `classDiagram
  class Round {
    +number
    +questions
  }
  Round "1" --> "*" Question`,
  },
  {
    name: 'state',
    verdict: 'draws',
    source: `stateDiagram-v2
  [*] --> Open
  Open --> Submitted: submit
  Open --> Superseded: present
  Submitted --> [*]`,
  },
  {
    name: 'entity relationship',
    verdict: 'draws',
    source: `erDiagram
  SESSION ||--o{ ROUND : holds
  ROUND ||--|{ QUESTION : asks`,
  },
  {
    name: 'gantt',
    verdict: 'draws',
    source: `gantt
  dateFormat YYYY-MM-DD
  section Build
  Parser :done, p1, 2026-01-05, 3d
  Server :active, s1, after p1, 5d
  section Ship
  Release :crit, r1, after s1, 1d`,
  },
  {
    name: 'pie',
    verdict: 'draws',
    source: `pie title Bundle size
  "mermaid" : 5700
  "server" : 1200
  "page" : 8`,
  },
  {
    name: 'mindmap',
    verdict: 'draws',
    source: `mindmap
  root((Grilling))
    Rounds
      Questions
    Session`,
  },
  {
    name: 'timeline',
    verdict: 'draws',
    source: `timeline
  title Releases
  section 2026
    v1 : tracer
    v2 : blocks`,
  },
  {
    name: 'user journey',
    verdict: 'draws',
    source: `journey
  title Answering a round
  section Page
    Read question: 5: User
    Pick option: 4: User`,
  },
  {
    name: 'git graph',
    verdict: 'draws',
    source: `gitGraph
  commit
  branch feature
  commit
  checkout main
  merge feature`,
  },
  {
    name: 'quadrant chart',
    verdict: 'draws',
    source: `quadrantChart
  title Effort and value
  x-axis Low effort --> High effort
  y-axis Low value --> High value
  Tracer: [0.2, 0.8]
  Corpus: [0.7, 0.6]`,
  },

  // --------------------------------------------------- failures that throw
  {
    name: 'parse error',
    verdict: 'throws',
    source: `flowchart LR
  a -->`,
  },
  {
    name: 'edge-id collision from "_" in node ids',
    verdict: 'throws',
    explains: /the edges "a_b --> c" and "a --> b_c" both get the id "L_a_b_c_0"/,
    source: `flowchart LR
  a_b --> c
  a --> b_c`,
  },
  {
    name: 'user edge id clashing with a generated one',
    verdict: 'throws',
    explains: /the edge id "L_b_c_0" given to "a --> b" is the id Mermaid generates for "b --> c"/,
    source: `flowchart LR
  a L_b_c_0@--> b
  b --> c`,
  },
  {
    name: 'node id equal to an edge id',
    verdict: 'throws',
    explains: /"e1" is used as a node in "e1 --> c" but is already the id of the edge "a --> b"/,
    source: `flowchart LR
  a e1@--> b
  e1 --> c`,
  },
  {
    name: 'gantt task with an empty metadata item',
    verdict: 'throws',
    explains: /task "Task A" has an empty metadata item/,
    source: `gantt
  dateFormat YYYY-MM-DD
  section S
  Task A :a1, 2024-01-01, 30d,`,
  },
  {
    name: 'gantt task with four metadata items',
    verdict: 'throws',
    explains: /task "Beta" has 4 metadata items after its tags/,
    source: `gantt
  dateFormat YYYY-MM-DD
  Alpha :a1, 2026-01-05, 3d
  Beta :b1, 2026-01-12, 2d, extra`,
  },
  {
    name: 'gantt task with an invalid date',
    verdict: 'throws',
    source: `gantt
  dateFormat YYYY-MM-DD
  Alpha :a1, 2026-13-45, 3d`,
  },

  // ------------------------------------------------ draws, but shows nothing
  {
    name: 'empty flowchart',
    verdict: 'empty',
    source: 'flowchart LR',
  },
  {
    name: 'empty sequence',
    verdict: 'empty',
    source: 'sequenceDiagram',
  },
];
