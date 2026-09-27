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

/**
 * One click the anchor corpus makes (test/corpus/mermaid-anchors.test.ts)
 * and the term the agent must read back.
 */
export interface AnchorCheck {
  /** Click the element showing exactly this text... */
  text?: string;
  /**
   * ...or the element matching this selector inside the drawing (a line or
   * path a third of the way along). The page lays a `.vg-hit` copy after each thin line.
   */
  css?: string;
  /** Which match, when several: 0 is the first in document order. */
  nth?: number;
  /** The anchor as the comment line shows it after the arrow, e.g. `node api "Browser"`. */
  term: string;
}

export interface MermaidFixture {
  name: string;
  source: string;
  verdict: Verdict;
  /** For a known failure class: what `present`'s explainer must say. */
  explains?: RegExp;
  /** Clicks and the anchor terms they must give; a fixture without them isn't clicked. */
  anchors?: AnchorCheck[];
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
    anchors: [
      { text: 'Browser', term: 'node a "Browser"' },
      { text: 'ok', term: 'edge label b → c "ok"' },
      { css: 'path[data-id="L_b_c_0"]', term: 'edge b → c "ok"' },
      { css: 'path[data-id="L_b_d_0"]', term: 'edge b → d' },
    ],
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
    anchors: [
      { text: 'CLI', term: 'subgraph cli "CLI"' },
      { text: 'present', term: 'node present' },
      { css: 'path[data-id="L_present_check_0"]', term: 'edge present → check' },
    ],
  },
  {
    name: 'flowchart ids with "_" and "-", repeated and named edges',
    verdict: 'draws',
    source: `flowchart LR
  my_node[U] --> other-node[H]
  A --> B
  A -->|again| B
  A e1@--> C`,
    anchors: [
      { text: 'U', term: 'node my_node "U"' },
      { css: 'path[data-id="L_my_node_other-node_0"]', term: 'edge my_node → other-node' },
      { css: 'path[data-id="L_A_B_0"]', term: 'edge A → B #1' },
      { text: 'again', term: 'edge label A → B #2 "again"' },
      { css: 'path[data-id="e1"]', term: 'edge e1' },
    ],
  },
  {
    name: 'swimlane',
    verdict: 'draws',
    source: `swimlane-beta LR
  subgraph Customer
    Browse[Browse catalogue]
    Pay[Pay]
  end
  subgraph Warehouse
    Pick[Pick items]
  end
  Browse --> Pay
  Pay -- "paid" --> Pick`,
    anchors: [
      { text: 'Customer', term: 'lane Customer' },
      { text: 'Browse catalogue', term: 'node Browse "Browse catalogue"' },
      { text: 'paid', term: 'edge label Pay → Pick "paid"' },
      { css: 'path[data-id="L_Browse_Pay_0"]', term: 'edge Browse → Pay' },
    ],
  },
  {
    name: 'agentflow',
    verdict: 'draws',
    source: `agentflow-beta TB
  flow reviewer["Review Agent"]
    changes["Gather changes"]@{ shape: input }
    lint["run_linter"]@{ shape: tool }
    ok["Clean?"]@{ shape: decision }
    changes --> lint --> ok
  end
  publish["Publish"]@{ shape: action }
  ok -- "yes" --> publish`,
    anchors: [
      { text: 'Review Agent', term: 'flow reviewer "Review Agent"' },
      { text: 'run_linter', term: 'tool lint "run_linter"' },
      { text: 'Clean?', term: 'decision ok "Clean?"' },
      { text: 'yes', term: 'edge label ok → publish "yes"' },
    ],
  },
  {
    name: 'sequence',
    verdict: 'draws',
    source: `sequenceDiagram
  participant A as Agent
  participant S as Server
  A->>S: present
  Note over A,S: the user answers
  activate S
  S-->>A: link
  A->>S: await
  deactivate S`,
    anchors: [
      // The bottom box comes first in the document, then the top one.
      { text: 'Agent', nth: 0, term: 'participant A "Agent"' },
      { text: 'Server', nth: 1, term: 'participant S "Server"' },
      { text: 'present', term: 'message #1 A → S "present"' },
      { css: '[data-et="message"]:not(.vg-hit)', nth: 1, term: 'message #2 S → A "link"' },
      { text: 'the user answers', term: 'note #1 "the user answers"' },
      { css: 'rect.activation0', term: 'activation of S' },
    ],
  },
  {
    name: 'sequence with multi-line messages, blocks and actors',
    verdict: 'draws',
    source: `sequenceDiagram
  actor U as User
  participant B
  U->>B: one
  B-->>U: two<br/>lines
  loop every hour
    U->>U: self
  end
  alt valid
    B-->>U: ok
  else invalid
    B-->>U: fail
  end
  Note right of B: a note`,
    anchors: [
      { text: 'two', term: 'message #2 B → U "two lines"' },
      { text: 'lines', term: 'message #2 B → U "two lines"' },
      { text: 'self', term: 'message #3 U → U "self"' },
      { css: 'text.loopText', nth: 0, term: 'loop #1 "[every hour]"' },
      { css: 'text.sectionTitle', nth: 0, term: 'alt #2 "[valid] [invalid]"' },
      { text: 'User', nth: 0, term: 'actor U "User"' },
      { text: 'User', nth: 1, term: 'actor U "User"' },
      { text: 'a note', term: 'note #1 "a note"' },
    ],
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
    anchors: [
      { text: 'Round', term: 'class Round' },
      { text: '+questions', term: 'member Round "+questions"' },
      { text: '*', term: 'cardinality Round → Question "*"' },
      { css: 'path[data-id="id_Round_Question_1"]', term: 'relation Round → Question' },
    ],
  },
  {
    name: 'class with a label, methods, a note and "_" in names',
    verdict: 'draws',
    source: `classDiagram
  class Order_Line["Order line"] {
    +submit() bool
  }
  Order_Line "1" --> "many" Order : belongs
  note for Order "Holds lines"`,
    anchors: [
      { text: 'Order line', term: 'class Order_Line "Order line"' },
      { text: '+submit() : bool', term: 'method Order_Line "+submit() : bool"' },
      { text: 'belongs', term: 'relation label Order_Line → Order "belongs"' },
      { text: 'many', term: 'cardinality Order_Line → Order "many"' },
      { text: 'Holds lines', term: 'note #1 "Holds lines"' },
    ],
  },
  {
    name: 'state',
    verdict: 'draws',
    source: `stateDiagram-v2
  [*] --> Open
  Open --> Submitted: submit
  Open --> Superseded: present
  Submitted --> [*]`,
    anchors: [
      { text: 'Open', term: 'state Open' },
      { css: 'g.node[id*="-state-root_start-"]', term: 'start' },
      { css: 'path[data-id="edge1"]', term: 'transition Open → Submitted "submit"' },
      { text: 'present', term: 'transition label Open → Superseded "present"' },
    ],
  },
  {
    name: 'state with a composite and a note',
    verdict: 'draws',
    source: `stateDiagram-v2
  state "Waiting for review" as Review {
    [*] --> Checking
  }
  Draft --> Review
  note right of Draft : editable`,
    anchors: [
      { text: 'Waiting for review', term: 'state Review "Waiting for review"' },
      { text: 'Checking', term: 'state Checking' },
      { css: 'g.node[id*="-state-Review_start-"]', term: 'start of Review' },
      { text: 'editable', term: 'note on Draft "editable"' },
      { css: 'path[data-id="edge1"]', term: 'transition Draft → Review' },
    ],
  },
  {
    name: 'entity relationship',
    verdict: 'draws',
    source: `erDiagram
  SESSION ||--o{ ROUND : holds
  ROUND ||--|{ QUESTION : asks`,
    anchors: [
      { text: 'SESSION', term: 'entity SESSION' },
      { text: 'holds', term: 'relationship label SESSION → ROUND "holds"' },
      { css: 'path[data-et="edge"]:not(.vg-hit)', nth: 1, term: 'relationship ROUND → QUESTION "asks"' },
    ],
  },
  {
    name: 'entity relationship with an alias and attributes',
    verdict: 'draws',
    source: `erDiagram
  CUSTOMER["Customer table"] {
    string name PK "the name"
    string email UK
  }
  CUSTOMER ||--o{ ORDER : places`,
    anchors: [
      { text: 'Customer table', term: 'entity CUSTOMER "Customer table"' },
      { text: 'email', term: 'attribute CUSTOMER.email' },
      { text: 'UK', term: 'attribute CUSTOMER.email "UK"' },
      { text: 'the name', term: 'attribute CUSTOMER.name "the name"' },
    ],
  },
  {
    name: 'requirement',
    verdict: 'draws',
    source: `requirementDiagram
  requirement rider_safety {
    id: 1
    text: Riders stop safely.
    risk: high
    verifymethod: test
  }
  functionalRequirement brake_response {
    id: 1.1
    text: Brakes engage fast.
    risk: medium
    verifymethod: test
  }
  element brake_controller {
    type: hardware
  }
  rider_safety - contains -> brake_response
  brake_controller - satisfies -> brake_response`,
    anchors: [
      { text: 'rider_safety', term: 'requirement rider_safety' },
      { text: 'Risk: Medium', term: 'functional requirement brake_response "Risk: Medium"' },
      { text: 'brake_controller', term: 'element brake_controller' },
      { text: '<<contains>>', term: 'relation label rider_safety → brake_response "<<contains>>"' },
    ],
  },
  {
    name: 'kanban',
    verdict: 'draws',
    source: `kanban
  todo[Todo]
    docs[Create documentation]
  doing[In progress]
    renderer[Improve renderer]@{ assigned: 'knsv', priority: 'High' }`,
    anchors: [
      { text: 'In progress', term: 'column doing "In progress"' },
      { text: 'Improve renderer', term: 'card renderer "Improve renderer"' },
      { text: 'knsv', term: 'card renderer "knsv"' },
    ],
  },
  {
    name: 'block',
    verdict: 'draws',
    source: `block-beta
  columns 3
  ui["Web UI"] api["API Server"] db[("Database")]
  ui -- "calls" --> api
  api --> db`,
    anchors: [
      { text: 'API Server', term: 'block api "API Server"' },
      { text: 'calls', term: 'edge label ui → api "calls"' },
      { css: 'path[data-et="edge"]:not(.vg-hit)', nth: 1, term: 'edge api → db' },
    ],
  },
  {
    name: 'use case',
    verdict: 'draws',
    source: `usecase-beta
actor Customer("Customer")
actor Agent("Support agent")
systemBoundary "Shop"
  Browse("Browse products")
  Order("Place order")
end
Customer --> Browse
Customer --> Order
Customer -- "asks" --> Agent`,
    anchors: [
      { text: 'Support agent', term: 'actor Agent "Support agent"' },
      { text: 'Browse products', term: 'use case Browse "Browse products"' },
      { text: 'Shop', term: 'boundary Shop' },
      { text: 'asks', term: 'association label Customer → Agent "asks"' },
      { css: 'path[data-id="edge-1"]', term: 'association Customer → Order' },
    ],
  },
  {
    name: 'architecture',
    verdict: 'draws',
    source: `architecture-beta
  group cloud(cloud)[API tier]
  service db(database)[Database] in cloud
  service server(server)[Server] in cloud
  junction j1 in cloud
  db:L -- R:server
  j1:T -- B:server`,
    anchors: [
      { text: 'Database', term: 'service db "Database"' },
      { css: 'rect[id$="-node-j1"]', term: 'junction j1' },
      { css: 'path[id$="-L_db_server_0"]', term: 'edge db → server' },
      // The group's title sits outside its rect's subtree.
      { text: 'API', term: 'group cloud "API tier"' },
    ],
  },
  {
    name: 'C4 context',
    verdict: 'draws',
    source: `C4Context
  title System context
  Person(cust, "Customer", "Buys things")
  System_Boundary(b1, "Shop") {
    System(web, "Web shop", "Sells things")
    SystemDb(orders, "Orders DB")
  }
  Rel(cust, web, "Uses", "HTTPS")`,
    anchors: [
      { text: 'Customer', term: 'person cust "Customer"' },
      { text: 'Orders', term: 'system db orders "Orders DB"' },
      { text: 'Sells', term: 'system web "Web shop"' },
      { text: 'Shop', term: 'boundary b1 "Shop"' },
      { css: 'line:not(.vg-hit)', term: 'relationship cust → web "Uses"' },
      { text: '[HTTPS]', term: 'relationship cust → web "Uses"' },
    ],
  },
  {
    name: 'C4 with nested boundaries and a bidirectional relationship',
    verdict: 'draws',
    source: `C4Context
  Enterprise_Boundary(e1, "Corp") {
    Person(u, "User")
    System_Boundary(b1, "Shop") {
      System(web, "Web")
    }
  }
  System_Boundary(b2, "Other") {
    System(x, "X")
  }
  BiRel(u, web, "Uses")
  Rel_Back(x, web, "Calls")`,
    anchors: [
      { text: 'Corp', term: 'boundary e1 "Corp"' },
      { text: 'Shop', term: 'boundary b1 "Shop"' },
      { text: 'Other', term: 'boundary b2 "Other"' },
      { text: 'Uses', term: 'relationship u ↔ web "Uses"' },
      { text: 'Calls', term: 'relationship x → web "Calls"' },
    ],
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
    anchors: [
      { text: 'Parser', term: 'task p1 "Parser"' },
      { css: 'rect[id$="-s1"]', term: 'task s1 "Server"' },
      { text: 'Ship', term: 'section "Ship"' },
    ],
  },
  {
    name: 'gantt with generated ids and a milestone',
    verdict: 'draws',
    source: `gantt
  dateFormat YYYY-MM-DD
  section Alpha
    First task :2026-09-01, 2d
    Launch :milestone, m1, after task1, 0d`,
    anchors: [
      { text: 'First task', term: 'task "First task"' },
      { text: 'Launch', term: 'milestone m1 "Launch"' },
    ],
  },
  {
    name: 'venn',
    verdict: 'draws',
    source: `venn-beta
  set Desirable
  set Feasible
  set Viable
  union Desirable,Feasible["Worth prototyping"]
  union Desirable,Feasible,Viable["Sweet spot"]`,
    anchors: [
      { text: 'Desirable', term: 'set Desirable' },
      { text: 'Worth prototyping', term: 'region Desirable ∩ Feasible "Worth prototyping"' },
      // Drawn under the Desirable ∩ Feasible area's path: only geometry names it.
      { text: 'Sweet spot', term: 'region Desirable ∩ Feasible ∩ Viable "Sweet spot"' },
    ],
  },
  {
    name: 'pie',
    verdict: 'draws',
    source: `pie title Bundle size
  "mermaid" : 5700
  "server" : 1200
  "page" : 8`,
    anchors: [
      { css: 'path.pieCircle', nth: 1, term: 'slice "server"' },
      { text: '83%', term: 'slice "mermaid"' },
      // Under 1%: Mermaid draws no slice for it, only the legend entry.
      { text: 'page', term: 'legend entry "page"' },
    ],
  },
  {
    name: 'mindmap',
    verdict: 'draws',
    source: `mindmap
  root((Grilling))
    rounds[Rounds]
      Questions
      ::icon(fa fa-book)
    Session`,
    anchors: [
      { text: 'Grilling', term: 'node root "Grilling"' },
      { text: 'Rounds', term: 'node rounds "Rounds"' },
      { text: 'Session', term: 'node "Session"' },
      { css: 'path[data-id="edge_1_2"]', term: 'branch rounds → "Questions"' },
    ],
  },
  {
    name: 'timeline',
    verdict: 'draws',
    source: `timeline
  title Releases
  section 2026
    v1 : tracer
    v2 : blocks`,
    anchors: [
      { text: '2026', term: 'section "2026"' },
      { text: 'v1', term: 'period "v1"' },
      { text: 'blocks', term: 'event "v2 / blocks"' },
    ],
  },
  {
    name: 'timeline with a period before the first section',
    verdict: 'draws',
    // "2001" isn't drawn: with sections, periods before the first one are dropped.
    source: `timeline
  2001 : early
  section Later
    2002 : late : later`,
    anchors: [
      { text: '2002', term: 'period "2002"' },
      { text: 'later', term: 'event "2002 / later"' },
    ],
  },
  {
    name: 'user journey',
    verdict: 'draws',
    source: `journey
  title Answering a round
  section Page
    Read question: 5: User
    Pick option: 4: User`,
    anchors: [
      { text: 'Read question', term: 'task "Read question"' },
      { css: 'circle.face', nth: 1, term: 'score 4 of task "Pick option"' },
      { text: 'Page', term: 'section "Page"' },
      { css: 'text.legend', term: 'actor User' },
    ],
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
    anchors: [
      { css: 'circle.commit', nth: 0, term: 'commit #1' },
      { text: 'feature', term: 'branch feature' },
      { css: 'text.commit-label', nth: 1, term: 'commit #2' },
    ],
  },
  {
    name: 'git graph with commit ids and a tag',
    verdict: 'draws',
    source: `gitGraph
  commit id: "a3f82c1"
  branch develop
  checkout develop
  commit id: "b7e41d9" tag: "v1"
  checkout main
  merge develop id: "d4e8f3a"`,
    anchors: [
      { text: 'a3f82c1', term: 'commit a3f82c1' },
      { css: 'circle.commit', nth: 1, term: 'commit b7e41d9' },
      { text: 'v1', term: 'tag v1' },
      { text: 'develop', term: 'branch develop' },
    ],
  },
  {
    name: 'quadrant chart',
    verdict: 'draws',
    source: `quadrantChart
  title Effort and value
  x-axis Low effort --> High effort
  y-axis Low value --> High value
  quadrant-1 Do next
  Tracer: [0.2, 0.8]
  Corpus: [0.7, 0.6]`,
    anchors: [
      // Points are drawn in reverse source order.
      { text: 'Tracer', term: 'point "Tracer"' },
      { css: 'g.data-point circle', nth: 0, term: 'point "Corpus"' },
      { text: 'Do next', term: 'quadrant-1 "Do next"' },
    ],
  },
  {
    name: 'XY chart',
    verdict: 'draws',
    source: `xychart
  title "Cold start"
  x-axis [bun, node, deno]
  y-axis "ms" 0 --> 100
  bar [60, 80, 70]
  line [50, 90, 40]`,
    anchors: [
      { css: 'g.bar-plot-0 rect', nth: 1, term: 'bar "node: 80"' },
      // A third of the way along the line, nearest the "node" category.
      { css: 'g.line-plot-1 path:not(.vg-hit)', term: 'line point "node: 90"' },
      // A generated value tick.
      { text: '100', term: 'text "100"' },
    ],
  },
  {
    name: 'XY chart, horizontal with two bar plots',
    verdict: 'draws',
    source: `xychart horizontal
  x-axis [a, b, c]
  y-axis 0 --> 10
  bar [1, 5, 3]
  bar [1, 1, 1]`,
    anchors: [
      // The second plot's bars are drawn over the first's: click past their ends.
      { css: 'g.bar-plot-0 rect', nth: 1, term: 'bar #1 "b: 5"' },
      { css: 'g.bar-plot-1 rect', nth: 2, term: 'bar #2 "c: 1"' },
    ],
  },
  {
    name: 'sankey',
    verdict: 'draws',
    source: `sankey-beta
Agent,Server,30
Server,Page,20
Server,Disk,10`,
    anchors: [
      { css: 'g.node rect', nth: 0, term: 'node "Agent"' },
      { css: 'g.link path', nth: 1, term: 'flow Server → Page "20"' },
      // Links are painted over labels: the click lands on a link.
      { css: 'g.node-labels text', nth: 1, term: 'node "Server"' },
    ],
  },
  {
    name: 'radar',
    verdict: 'draws',
    source: `radar-beta
  axis m["Math"], s["Science"], e["English"]
  curve a["Alice"]{85, 90, 80}
  curve b["Bob"]{70, 75, 85}
  max 100
  min 0`,
    anchors: [
      { text: 'Science', term: 'axis s "Science"' },
      { text: 'English', term: 'axis e "English"' },
      { text: 'Bob', term: 'curve b "Bob"' },
      { css: 'rect.radarLegendBox-0', term: 'curve a "Alice"' },
    ],
  },
  {
    name: 'packet',
    verdict: 'draws',
    source: `packet
  0-15: "Source"
  16-47: "Spans rows"
  +8: "Kind"`,
    anchors: [
      { text: 'Source', term: 'field 0-15 "Source"' },
      // A field crossing a row is drawn twice, with row-local ranges.
      { text: 'Spans rows', nth: 1, term: 'field 16-47 "Spans rows"' },
      { css: 'rect.packetBlock', nth: 3, term: 'field +8 "Kind"' },
    ],
  },
  {
    name: 'treemap',
    verdict: 'draws',
    source: `treemap-beta
"Budget"
  "Housing"
    "Rent": 1400
    "Utilities": 220
  "Food"
    "Groceries": 480`,
    anchors: [
      { text: 'Rent', term: 'leaf "Budget / Housing / Rent"' },
      { text: 'Food', term: 'section "Budget / Food"' },
    ],
  },
  {
    name: 'treemap with same-named siblings',
    verdict: 'draws',
    source: `treemap-beta
"Root"
  "A"
    "x": 5
    "x": 50`,
    anchors: [
      // Told apart only by value: no precise term.
      { text: 'x', nth: 0, term: 'text "x"' },
      { text: 'A', term: 'section "Root / A"' },
    ],
  },
  {
    name: 'tree view',
    verdict: 'draws',
    source: `treeView-beta
  root/
    a/
      index.js
    b/
      index.js`,
    anchors: [
      { text: 'index.js', nth: 1, term: 'file "root/b/index.js"' },
      { text: 'a', term: 'folder "root/a"' },
      // The "/" root Mermaid adds.
      { text: '/', term: 'text "/"' },
    ],
  },
  {
    name: 'event modeling',
    verdict: 'draws',
    source: `eventmodeling
tf 01 ui ShopUI
tf 02 cmd AddItemToCart
tf 03 evt ItemAdded
tf 04 rmo CartView ->> 03`,
    anchors: [
      { text: 'AddItemToCart', term: 'frame 02 "AddItemToCart"' },
      { text: 'CartView', term: 'frame 04 "CartView"' },
      // A generated swimlane header.
      { text: 'Events', term: 'text "Events"' },
    ],
  },
  {
    name: 'ishikawa',
    verdict: 'draws',
    source: `ishikawa-beta
  Late release
  People
    A
      A1
      A2
    B
  Tools
    T`,
    anchors: [
      { css: 'text.ishikawa-head-label', term: 'effect "Late release"' },
      { text: 'Tools', term: 'category "Tools"' },
      { text: 'A2', term: 'cause "People / A / A2"' },
      { text: 'B', term: 'cause "People / B"' },
    ],
  },
  {
    name: 'wardley',
    verdict: 'draws',
    source: `wardley-beta
title Tea Shop
anchor Business [0.95, 0.63]
component Cup of Tea [0.79, 0.61]
component Hot Water [0.52, 0.80]
component Kettle [0.43, 0.35]
Business -> Cup of Tea
Cup of Tea -> Hot Water
Hot Water -> Kettle
evolve Kettle 0.62`,
    anchors: [
      { text: 'Business', term: 'anchor "Business"' },
      { text: 'Cup of Tea', term: 'component "Cup of Tea"' },
      { css: 'line.wardley-link', nth: 1, term: 'link Cup of Tea → Hot Water' },
      { css: 'line.wardley-trend', term: 'evolve "Kettle"' },
      // A generated stage label.
      { text: 'Genesis', term: 'text "Genesis"' },
    ],
  },
  {
    name: 'cynefin',
    verdict: 'draws',
    source: `cynefin-beta
  title Incident Response
  complex
    "Investigate root cause"
  complicated
    "Expert review"
  clear
    "Restart service"
  chaotic
    "Page on-call"
  complex --> complicated : "Pattern identified"`,
    anchors: [
      { text: 'Expert review', term: 'item in complicated "Expert review"' },
      { text: 'Page on-call', term: 'item in chaotic "Page on-call"' },
      { text: 'Pattern identified', term: 'transition complex → complicated "Pattern identified"' },
      { text: 'Chaotic', term: 'domain chaotic' },
      // A generated subtitle.
      { text: 'Novel Practices', term: 'text "Novel Practices"' },
    ],
  },
  {
    name: 'railroad',
    verdict: 'draws',
    source: `railroad-beta
  expression = sequence(nonterminal("term"), zeroOrMore(sequence(choice(terminal("+"), terminal("-")), nonterminal("term")))) ;
  term = choice(terminal("x"), terminal("1")) ;`,
    anchors: [
      { text: 'term', nth: 1, term: 'nonterminal #2 in rule expression "term"' },
      { text: 'x', term: 'terminal in rule term "x"' },
    ],
  },
  {
    name: 'railroad EBNF',
    verdict: 'draws',
    source: `railroad-ebnf-beta
  expression = term ( "+" term | "-" term )* ;
  term = "x" | "1" ;`,
    anchors: [
      { text: 'term', nth: 2, term: 'nonterminal #3 in rule expression "term"' },
      { text: '+', term: 'terminal in rule expression "+"' },
      { text: 'term =', term: 'rule term' },
    ],
  },
  {
    name: 'railroad ABNF',
    verdict: 'draws',
    source: `railroad-abnf-beta
  address = local "@" domain ;
  domain = label *( "." label ) ;`,
    anchors: [
      { text: 'label', nth: 1, term: 'nonterminal #2 in rule domain "label"' },
      { text: '@', term: 'terminal in rule address "@"' },
    ],
  },
  {
    name: 'railroad PEG',
    verdict: 'draws',
    source: `railroad-peg-beta
  Expression <- Term (("+" / "-") Term)* ;
  Term <- "x" / "1" ;`,
    anchors: [
      { text: 'Term', nth: 0, term: 'nonterminal #1 in rule Expression "Term"' },
      { text: '-', term: 'terminal in rule Expression "-"' },
    ],
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
