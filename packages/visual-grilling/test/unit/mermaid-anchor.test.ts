// The Mermaid adapters over hand-written snapshots. The corpus
// (test/corpus/mermaid-anchors.test.ts) clicks real drawings in Chromium;
// these pin the rules that are easy to get subtly wrong.

import { describe, expect, it } from 'vitest';
import { targetText, resolveAnchor, type Snapshot, type SnapshotElement, type SnapshotPeer } from '../../src/core/anchor.ts';
import type { PageIllustration } from '../../src/core/protocol.ts';
import { mermaidAnchor } from '../../src/page/blocks/mermaid-anchor/index.ts';
import { pairRef, splitPair } from '../../src/page/blocks/mermaid-anchor/shared.ts';

type Node = Partial<Omit<SnapshotElement, 'tag'>> & { tag: string };

const P = 'vg-mermaid-3';

function snap(type: string, nodes: Node[], peers: SnapshotPeer[] = []): Snapshot {
  const box = { x: 0, y: 0, w: 10, h: 10 };
  return {
    chain: [...nodes, { tag: 'svg', attrs: { id: P, 'aria-roledescription': type } }, { tag: 'div', attrs: { class: 'block-content' } }].map(
      (node) => ({ attrs: {}, text: '', title: null, nth: null, box, ...node }),
    ),
    root: { w: 400, h: 200 },
    click: { x: 100, y: 50 },
    selector: 'x',
    peers,
    texts: [],
    clickSvg: 0,
  };
}

const peer = (tag: string, attrs: Record<string, string>, text = ''): SnapshotPeer => ({ tag, attrs, text });

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
    expect(term(snap('pie', [{ tag: 'path', attrs: { class: 'pieCircle' } }]))).toBeNull();
  });
});
