// The DOT block corpus: sources the Node draw check and Chromium must give the
// same verdict on, and, for the ones that draw, the anchor terms a click on
// each named part must come back as. Graphviz is the same WebAssembly build in
// both places, so a mismatch here means the chunk, not a shim, went wrong.

export type Verdict = 'draws' | 'throws' | 'empty';

/**
 * What to click: a node, edge or cluster by its Graphviz <title> (the node
 * name, `a->b` or `a--b` for an edge, the cluster's name), or the graph's own
 * label by its text.
 */
export type Target = { title: string } | { graphLabel: string };

export interface DotFixture {
  name: string;
  source: string;
  verdict: Verdict;
  /** For a fixture that draws: each click and the anchor term it must give. */
  anchors?: { click: Target; term: string }[];
}

export const DOT_FIXTURES: DotFixture[] = [
  // ------------------------------------------------------------- draws
  {
    name: 'digraph with labels and preset marks',
    verdict: 'draws',
    source: `digraph {
  rankdir=LR
  api [label="API server", class=recommended]
  db [class=risk]
  cache [class=muted]
  api -> db [label="reads"]
  api -> cache
}`,
    anchors: [
      { click: { title: 'api' }, term: 'node api "API server"' },
      { click: { title: 'db' }, term: 'node db' },
      { click: { title: 'api->db' }, term: 'edge api -> db "reads"' },
      { click: { title: 'api->cache' }, term: 'edge api -> cache' },
    ],
  },
  {
    name: "the agent's ids",
    verdict: 'draws',
    source: `digraph {
  gw [id=gateway, label="Gateway"]
  gw -> auth [id=e_login, label="login"]
}`,
    anchors: [
      { click: { title: 'gw' }, term: 'node gateway "Gateway"' },
      { click: { title: 'gw->auth' }, term: 'edge e_login "login"' },
      { click: { title: 'auth' }, term: 'node auth' },
    ],
  },
  {
    name: 'undirected, neato layout, quoted names',
    verdict: 'draws',
    source: `graph {
  layout=neato
  "job queue" -- worker
  worker -- store
}`,
    anchors: [
      { click: { title: 'job queue' }, term: 'node "job queue"' },
      { click: { title: 'job queue--worker' }, term: 'edge "job queue" -- worker' },
    ],
  },
  {
    name: 'cluster',
    verdict: 'draws',
    source: `digraph {
  subgraph cluster_back {
    label="Backend"
    api; db
  }
  web -> api
  api -> db
}`,
    anchors: [
      { click: { title: 'cluster_back' }, term: 'cluster cluster_back "Backend"' },
      { click: { title: 'web' }, term: 'node web' },
    ],
  },
  {
    name: 'HTML-like label and record shape',
    verdict: 'draws',
    source: `digraph {
  t [shape=plain, label=<<b>Round</b><br/>questions>]
  r [shape=record, label="{id|title}"]
  t -> r
}`,
    anchors: [
      { click: { title: 't' }, term: 'node t "Round questions"' },
      { click: { title: 'r' }, term: 'node r "id title"' },
    ],
  },
  {
    name: 'a graph label alone',
    verdict: 'draws',
    source: 'graph { label="Only a caption" }',
    anchors: [{ click: { graphLabel: 'Only a caption' }, term: 'label "Only a caption"' }],
  },
  {
    name: 'links are drawn but not followed',
    verdict: 'draws',
    source: 'digraph { docs [URL="https://example.com", tooltip="Docs"] }',
    anchors: [{ click: { title: 'docs' }, term: 'node docs' }],
  },

  // ------------------------------------------------------------ throws
  { name: 'syntax error', verdict: 'throws', source: 'digraph {\n  a -> b\n  b -> [\n}' },
  { name: 'unclosed graph', verdict: 'throws', source: 'digraph { a -> b' },
  { name: 'unknown layout', verdict: 'throws', source: 'digraph { layout=nope; a -> b }' },
  { name: 'not DOT at all', verdict: 'throws', source: 'flowchart LR\n  a --> b' },

  // ------------------------------------------------------------- empty
  { name: 'no statements', verdict: 'empty', source: 'digraph {}' },
  { name: 'only invisible parts', verdict: 'empty', source: 'digraph {\n  a [style=invis]\n  b [style=invis]\n  a -> b [style=invis]\n}' },
  { name: 'only defaults', verdict: 'empty', source: 'strict graph G {\n  node [shape=box]\n  edge [color=red]\n}' },
];
