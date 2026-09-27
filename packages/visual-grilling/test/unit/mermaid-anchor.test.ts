// The Mermaid adapters over hand-written snapshots. The corpus
// (test/corpus/mermaid-anchors.test.ts) clicks real drawings in Chromium;
// these pin the rules that are easy to get subtly wrong.

import { describe, expect, it } from 'vitest';
import { targetText, resolveAnchor, type Box, type Snapshot, type SnapshotElement, type SnapshotPeer } from '../../src/core/anchor.ts';
import type { PageIllustration } from '../../src/core/protocol.ts';
import { mermaidAnchor } from '../../src/page/blocks/mermaid-anchor/index.ts';
import { pairRef, splitPair } from '../../src/page/blocks/mermaid-anchor/shared.ts';

type Node = Partial<Omit<SnapshotElement, 'tag'>> & { tag: string };

const P = 'vg-mermaid-3';

function snap(type: string, nodes: Node[], peers: SnapshotPeer[] = [], click = { x: 100, y: 50 }, texts: Snapshot['texts'] = []): Snapshot {
  const box = { x: 0, y: 0, w: 10, h: 10 };
  return {
    chain: [...nodes, { tag: 'svg', attrs: { id: P, 'aria-roledescription': type } }, { tag: 'div', attrs: { class: 'block-content' } }].map(
      (node) => ({ attrs: {}, text: '', title: null, nth: null, box, ...node }),
    ),
    root: { w: 400, h: 200 },
    click,
    selector: 'x',
    peers,
    texts,
    clickSvg: 0,
  };
}

const peer = (tag: string, attrs: Record<string, string>, text = '', box?: Box): SnapshotPeer => ({ tag, attrs, text, ...(box ? { box } : {}) });
const at = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });
const nth = (cls: string, i: number) => ({ cls, i, of: i + 1 });

function term(snapshot: Snapshot, source = ''): string | null {
  const illustration = { id: 'd', kind: 'mermaid', source } as PageIllustration;
  const anchor = resolveAnchor(snapshot, { illustration: { id: 'd', kind: 'mermaid' } }, (shot) => mermaidAnchor(shot, illustration));
  return anchor.target.via.startsWith('mermaid') ? targetText(anchor.target) : null;
}

describe('splitting Mermaid edge ids', () => {
  it('splits against the known ids, since ids may hold the separator', () => {
    const known = new Set(['my_node', 'other-node', 'my', 'node_other']);
    expect(splitPair('my_node_other-node', '_', known)).toEqual(['my_node', 'other-node']);
    expect(splitPair('a_b', '_', known)).toBeNull();
  });

  it('numbers connections only when several join the same pair', () => {
    const pairs = ['A → B', 'A → C', 'A → B'];
    expect(pairRef(pairs, 1)).toBe('A → C');
    expect(pairRef(pairs, 2)).toBe('A → B #2');
  });
});

describe('the Mermaid adapter', () => {
  const nodes = [
    peer('g', { class: 'node default', id: `${P}-flowchart-my_node-0` }),
    peer('g', { class: 'node default', id: `${P}-flowchart-other-node-1` }),
  ];

  it('reads a hit area over an edge as the edge it widens', () => {
    const edge = { 'data-et': 'edge', 'data-id': 'L_my_node_other-node_0' };
    const hit = { tag: 'path', attrs: { ...edge, class: 'vg-hit', 'data-vg-id': `${P}-L_my_node_other-node_0`, 'data-vg-class': 'flowchart-link' } };
    const peers = [...nodes, peer('path', { ...edge, class: 'flowchart-link' }), peer('path', { ...edge, class: 'vg-hit' })];
    expect(term(snap('flowchart-v2', [hit, { tag: 'g', attrs: { class: 'edgePaths' } }], peers))).toBe('edge my_node → other-node');
  });

  it("gives an explicit edge id back as the agent's", () => {
    const edge = { tag: 'path', attrs: { 'data-et': 'edge', 'data-id': 'e1', class: 'flowchart-link' } };
    expect(term(snap('flowchart-v2', [edge], nodes))).toBe('edge e1');
  });

  it('sends a line of a multi-line message to the next message, with all its lines', () => {
    const text = (value: string, i: number): Node => ({ tag: 'text', attrs: { class: 'messageText' }, text: value, nth: { cls: 'messageText', i, of: 3 } });
    const peers = [
      peer('text', { class: 'messageText' }, 'one'),
      peer('line', { 'data-et': 'message', 'data-id': 'i0', 'data-from': 'U', 'data-to': 'S' }),
      peer('g', { 'data-et': 'note', 'data-id': 'i1' }, 'a note'),
      peer('text', { class: 'messageText' }, 'two'),
      peer('text', { class: 'messageText' }, 'lines'),
      peer('line', { 'data-et': 'message', 'data-id': 'i2', 'data-from': 'S', 'data-to': 'U' }),
    ];
    expect(term(snap('sequence', [text('two', 1)], peers))).toBe('message #2 S → U "two lines"');
    expect(term(snap('sequence', [text('one', 0)], peers))).toBe('message #1 U → S "one"');
  });

  it('names a Venn intersection only when the source declares it', () => {
    const area = { tag: 'g', attrs: { class: 'venn-area venn-intersection', 'data-venn-sets': 'A_B' }, text: 'Both' };
    expect(term(snap('venn', [area]), 'venn-beta\n  set A\n  set B\n  union B, A["Both"]')).toBe('region A ∩ B "Both"');
    expect(term(snap('venn', [area]), 'venn-beta\n  set A\n  set B')).toBeNull();
  });

  it('reads Venn set names that hold "_" from the source instead of splitting them', () => {
    const source = 'venn-beta\n  set Must_have\n  set Cheap\n  union Cheap,Must_have["Easy wins"]';
    const area = (sets: string, text: string): Node => ({ tag: 'g', attrs: { class: 'venn-area', 'data-venn-sets': sets }, text });
    expect(term(snap('venn', [area('Must_have', 'Must_have')]), source)).toBe('set Must_have');
    expect(term(snap('venn', [area('Must_have_Cheap', 'Easy wins')]), source)).toBe('region Must_have ∩ Cheap "Easy wins"');
  });

  it('joins a commit id with spaces back from the class names it spreads over', () => {
    const circle = { tag: 'circle', attrs: { class: 'commit Fix login bug commit1' } };
    expect(term(snap('gitGraph', [circle]))).toBe('commit Fix login bug');
  });

  it('leaves a type with no adapter to the generic rules', () => {
    expect(term(snap('zenuml', [{ tag: 'g', attrs: { id: `${P}-a` } }]))).toBeNull();
  });
});

describe('the Mermaid adapters that match by position', () => {
  it('counts pie slices among the labels Mermaid draws: first value kept, under 1% left out', () => {
    const source = 'pie\n  "Small" : 10\n  "Big" : 60\n  "Tiny" : 0.2\n  "Big" : 5';
    const slice = (i: number): Node => ({ tag: 'path', attrs: { class: 'pieCircle' }, nth: nth('pieCircle', i) });
    expect(term(snap('pie', [slice(1)]), source)).toBe('slice "Big"');
    expect(term(snap('pie', [slice(2)]), source)).toBeNull();
    const legend: Node = { tag: 'g', attrs: { class: 'legend' }, nth: nth('legend', 2) };
    expect(term(snap('pie', [{ tag: 'text' }, legend]), source)).toBe('legend entry "Tiny"');
  });

  it('reads quadrant points in reverse, telling same-named ones apart', () => {
    const source = 'quadrantChart\n  Alpha: [0.1, 0.2]\n  Beta: [0.3, 0.4]\n  Alpha: [0.5, 0.6]';
    const point = (i: number): Node => ({ tag: 'g', attrs: { class: 'data-point' }, nth: nth('data-point', i) });
    expect(term(snap('quadrantChart', [{ tag: 'circle' }, point(0)]), source)).toBe('point #2 "Alpha"');
    expect(term(snap('quadrantChart', [{ tag: 'circle' }, point(1)]), source)).toBe('point "Beta"');
  });

  it('names a packet block by the field holding its start bit, "+n" fields included', () => {
    const source = 'packet\n  +8: "Kind"\n  8-39: "Spans rows"';
    const peers = [
      peer('rect', { class: 'packetBlock' }),
      peer('text', { class: 'packetByte start' }, '0'),
      peer('rect', { class: 'packetBlock' }),
      peer('text', { class: 'packetByte start' }, '8'),
      peer('rect', { class: 'packetBlock' }),
      peer('text', { class: 'packetByte start' }, '32'),
    ];
    const block = (i: number): Node => ({ tag: 'rect', attrs: { class: 'packetBlock' }, nth: nth('packetBlock', i) });
    expect(term(snap('packet', [block(0)], peers), source)).toBe('field +8 "Kind"');
    expect(term(snap('packet', [block(2)], peers), source)).toBe('field 8-39 "Spans rows"');
  });

  it("orders Ishikawa causes as Mermaid draws them: siblings last-first, each before its own causes", () => {
    const source = 'ishikawa-beta\n  Late\n  People\n    A\n      A1\n      A2\n    B';
    // Drawn: People, B, A, A2, A1.
    const peers = ['People', 'B', 'A', 'A2', 'A1'].map((text, i) =>
      peer('g', { class: i === 0 ? 'ishikawa-label-group' : 'ishikawa-sub-group' }, text, at(0, i * 20, 10, 10)),
    );
    const part = (i: number): Node => ({ tag: 'g', attrs: { class: 'ishikawa-sub-group' }, box: at(0, i * 20, 10, 10) });
    expect(term(snap('ishikawa', [{ tag: 'text' }, part(3)], peers), source)).toBe('cause "People / A / A2"');
    expect(term(snap('ishikawa', [{ tag: 'text' }, part(1)], peers), source)).toBe('cause "People / B"');
  });

  it('reads C4 boundaries inner first, and a relationship label through the line before it', () => {
    const source = 'C4Context\n  Boundary(outer, "Outer") {\n    Boundary(inner, "Inner") {\n    }\n  }\n  Rel(a, b, "Uses")\n  RelIndex(1, c, d, "Numbered")\n  BiRel(b, c, "Syncs")';
    const peers = [
      peer('rect', {}, '', at(10, 10, 50, 50)),
      peer('rect', {}, '', at(0, 0, 100, 100)),
      peer('line', {}, '', at(1, 1, 5, 5)),
      peer('text', {}, 'Uses', at(2, 2, 5, 5)),
      peer('path', {}, '', at(3, 3, 5, 5)),
      peer('text', {}, 'Numbered', at(4, 4, 5, 5)),
      peer('path', {}, '', at(5, 5, 5, 5)),
      peer('text', {}, 'Syncs', at(6, 6, 5, 5)),
    ];
    const top = (box: Box): Node => ({ tag: 'g', box });
    expect(term(snap('c4', [{ tag: 'rect', box: at(0, 0, 100, 100) }, top(at(0, 0, 100, 100))], peers), source)).toBe('boundary outer "Outer"');
    expect(term(snap('c4', [{ tag: 'text', box: at(10, 10, 5, 5) }, top(at(10, 10, 50, 50))], peers), source)).toBe('boundary inner "Inner"');
    expect(term(snap('c4', [{ tag: 'tspan' }, { tag: 'text', box: at(6, 6, 5, 5) }, top(at(1, 1, 8, 8))], peers), source)).toBe(
      'relationship b ↔ c "Syncs"',
    );
  });

  it('numbers state transitions in source order, composites included', () => {
    const source = 'stateDiagram-v2\n  state R {\n    [*] --> C\n  }\n  D --> R : submit\n  D --> R : again';
    const edge = (k: number): Node => ({ tag: 'path', attrs: { 'data-et': 'edge', 'data-id': `edge${k}` } });
    expect(term(snap('stateDiagram', [edge(0)]), source)).toBe('transition [*] → C');
    expect(term(snap('stateDiagram', [edge(2)]), source)).toBe('transition D → R #2 "again"');
  });

  it('gives a mindmap node back the id Mermaid drops', () => {
    const source = 'mindmap\n  root((Top))\n    a[Alpha]\n    ::icon(fa fa-book)\n    Beta';
    expect(term(snap('mindmap', [{ tag: 'g', attrs: { id: `${P}-node_1` } }]), source)).toBe('node a "Alpha"');
    expect(term(snap('mindmap', [{ tag: 'g', attrs: { id: `${P}-node_2` } }]), source)).toBe('node "Beta"');
    expect(term(snap('mindmap', [{ tag: 'path', attrs: { id: `${P}-edge_0_2` } }]), source)).toBe('branch root → "Beta"');
  });
});

describe('the Mermaid adapters that match by geometry', () => {
  it('names a Venn region by the circles holding the click, not the area clicked', () => {
    const source = 'venn-beta\n  set A\n  set B\n  union A,B["Both"]';
    const peers = [
      peer('g', { class: 'venn-area venn-circle', 'data-venn-sets': 'A' }, 'A', at(0, 0, 100, 100)),
      peer('g', { class: 'venn-area venn-circle', 'data-venn-sets': 'B' }, 'B', at(60, 0, 100, 100)),
      peer('g', { class: 'venn-area venn-intersection', 'data-venn-sets': 'A_B' }, 'Both'),
    ];
    const onB: Node = { tag: 'g', attrs: { class: 'venn-area venn-circle', 'data-venn-sets': 'B' } };
    expect(term(snap('venn', [{ tag: 'path' }, onB], peers, { x: 80, y: 50 }), source)).toBe('region A ∩ B "Both"');
    expect(term(snap('venn', [{ tag: 'path' }, onB], peers, { x: 140, y: 50 }), source)).toBe('set B');
  });

  it('puts a sequence activation on the lifeline it covers, counted from the top', () => {
    const peers = [
      peer('line', { 'data-et': 'life-line', 'data-id': 'S' }, '', at(50, 0, 0, 300)),
      peer('rect', { class: 'activation0' }, '', at(45, 20, 10, 40)),
      peer('rect', { class: 'activation0' }, '', at(45, 100, 10, 40)),
    ];
    const bar: Node = { tag: 'rect', attrs: { class: 'activation0' }, box: at(45, 100, 10, 40) };
    expect(term(snap('sequence', [bar], peers))).toBe('activation #2 of S');
  });

  it('builds a treemap name path from the sections containing it, and leaves same-named siblings alone', () => {
    const source = 'treemap-beta\n"R"\n  "A"\n    "x": 5\n    "x": 50\n    "y": 1';
    const peers = [
      peer('rect', { class: 'treemapSection' }, '', at(0, 0, 100, 100)),
      peer('text', { class: 'treemapSectionLabel' }, 'R'),
      peer('rect', { class: 'treemapSection' }, '', at(5, 5, 90, 90)),
      peer('text', { class: 'treemapSectionLabel' }, 'A'),
      peer('g', { class: 'treemapNode treemapLeafGroup' }, '', at(10, 10, 40, 40)),
      peer('text', { class: 'treemapLabel' }, 'x'),
      peer('g', { class: 'treemapNode treemapLeafGroup' }, '', at(50, 10, 20, 40)),
      peer('text', { class: 'treemapLabel' }, 'x'),
      peer('g', { class: 'treemapNode treemapLeafGroup' }, '', at(70, 10, 20, 40)),
      peer('text', { class: 'treemapLabel' }, 'y'),
    ];
    const leaf = (box: Box): Node => ({ tag: 'g', attrs: { class: 'treemapNode treemapLeafGroup' }, box });
    expect(term(snap('treemap', [{ tag: 'text' }, leaf(at(70, 10, 20, 40))], peers), source)).toBe('leaf "R / A / y"');
    expect(term(snap('treemap', [{ tag: 'text' }, leaf(at(10, 10, 40, 40))], peers), source)).toBeNull();
  });

  it('puts a click on an XY line at the nearest category along the x axis', () => {
    const source = 'xychart\n  x-axis [jan, feb, mar]\n  line [1, 2, 3]';
    const texts = ['jan', 'feb', 'mar'].map((text, i) => ({ text, box: at(i * 100, 200, 20, 10), svg: 0 }));
    const path: Node[] = [{ tag: 'path' }, { tag: 'g', attrs: { class: 'line-plot-0' } }];
    expect(term(snap('xychart', path, [], { x: 95, y: 50 }, texts), source)).toBe('line point "feb: 2"');
  });
});
