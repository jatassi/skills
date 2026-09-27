import { describe, expect, it } from 'vitest';
import { anchorLine, resolveAnchor, type AnchorSubject, type Box, type Snapshot, type SnapshotElement } from '../../src/core/anchor.ts';
import { dotAnchor } from '../../src/page/blocks/dot-anchor.ts';

// Snapshots shaped like a click on the SVG the Graphviz chunk draws: Graphviz
// ids moved to data-id, the node name or edge in the group's <title>.

type Node = Partial<Omit<SnapshotElement, 'tag'>> & { tag: string };

function snap(nodes: Node[]): Snapshot {
  const box: Box = { x: 0, y: 0, w: 10, h: 10 };
  const above: Node[] = [
    { tag: 'g', attrs: { class: 'graph', 'data-id': 'graph0' }, title: 'G' },
    { tag: 'svg', attrs: { id: 'vg-dot-1' } },
    { tag: 'div', attrs: { class: 'diagram' } },
    { tag: 'div', attrs: { class: 'block-content' } },
  ];
  return {
    chain: [...nodes, ...above].map((node) => ({ attrs: {}, text: '', title: null, nth: null, box, ...node })),
    root: { w: 400, h: 200 },
    click: { x: 100, y: 50 },
    selector: 'x',
    peers: [],
    texts: [],
    clickSvg: 0,
  };
}

const DOT: AnchorSubject = { illustration: { id: 'deps', kind: 'dot', title: 'Dependencies' } };
const line = (nodes: Node[]) => anchorLine(resolveAnchor(snap(nodes), DOT, dotAnchor));

const node = (name: string, text: string, dataId = 'node1', cls = 'node'): Node => ({
  tag: 'g',
  attrs: { class: cls, 'data-id': dataId },
  title: name,
  text,
});

describe('the dot adapter', () => {
  it('names a node by its name', () => {
    expect(line([{ tag: 'ellipse' }, node('api', 'api')])).toBe('dot "Dependencies" → node api');
  });

  it('adds the label when it differs from the name', () => {
    expect(line([{ tag: 'text', text: 'API server' }, node('api', 'API server')])).toBe(
      'dot "Dependencies" → node api "API server"',
    );
  });

  it("prefers the agent's id to the name", () => {
    expect(line([{ tag: 'polygon' }, node('a', 'Gateway', 'gateway', 'node recommended')])).toBe(
      'dot "Dependencies" → node gateway "Gateway"',
    );
  });

  it('quotes a name that is not a bare word', () => {
    expect(line([{ tag: 'ellipse' }, node('job queue', 'job queue')])).toBe('dot "Dependencies" → node "job queue"');
  });

  it('names an edge a -> b, with its label', () => {
    expect(line([{ tag: 'path' }, node('api->db', 'reads', 'edge3', 'edge')])).toBe('dot "Dependencies" → edge api -> db "reads"');
  });

  it('names an undirected edge a -- b, with ports kept', () => {
    expect(line([{ tag: 'path' }, node('a:out--job queue', '', 'edge1', 'edge')])).toBe(
      'dot "Dependencies" → edge a:out -- "job queue"',
    );
  });

  it("names an edge by the agent's id", () => {
    expect(line([{ tag: 'path' }, node('api->db', '', 'e_read', 'edge risk')])).toBe('dot "Dependencies" → edge e_read');
  });

  it('names a cluster by its name and label', () => {
    expect(line([{ tag: 'polygon' }, node('cluster_back', 'Backend', 'clust1', 'cluster')])).toBe(
      'dot "Dependencies" → cluster cluster_back "Backend"',
    );
  });

  it('names text inside a node through a link group', () => {
    expect(line([{ tag: 'text', text: 'API' }, { tag: 'a' }, { tag: 'g', attrs: { id: 'a_node1' } }, node('api', 'API')])).toBe(
      'dot "Dependencies" → node api "API"',
    );
  });

  it("names the graph's own label", () => {
    expect(line([{ tag: 'text', text: 'Service map' }])).toBe('dot "Dependencies" → label "Service map"');
  });

  it('calls the background an empty area', () => {
    expect(line([{ tag: 'polygon' }])).toBe('dot "Dependencies" → empty area  [at 25% across, 25% down]');
  });
});
