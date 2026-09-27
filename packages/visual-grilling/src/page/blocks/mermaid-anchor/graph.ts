// The graph family: types Mermaid draws with its unified renderer. Nodes are
// `g.node` with the agent's id inside the element id, edges are
// `[data-et=edge][data-id]`, and every edge label is a `g.label` carrying its
// edge's data-id, so a click on label text needs no position matching.

import type { AdapterMatch, SnapshotElement, SnapshotPeer } from '../../../core/anchor.ts';
import {
  find,
  hasClass,
  idOf,
  knownIds,
  labelUnlessId,
  match,
  pairRef,
  peerIndex,
  splitPair,
  unprefixed,
  VIA_NEIGHBOUR,
  type DiagramAdapter,
  type DiagramClick,
} from './shared.ts';

const GRAPH_PEERS = 'g.node[id], g.cluster[id], [data-et="edge"], g.label[data-id]';

const isEdge = (element: { attrs: Record<string, string> }) => element.attrs['data-et'] === 'edge' && Boolean(element.attrs['data-id']);
const isEdgeLabel = (element: SnapshotElement) => element.tag === 'g' && hasClass(element, 'label') && Boolean(element.attrs['data-id']);

/** How one graph type names its edges: the agent's two ends for an edge's data-id, and what it calls an edge. */
interface EdgeNaming {
  noun: string;
  /** `from → to` for an edge's data-id, or the explicit id the agent gave it. */
  ends(click: DiagramClick, dataId: string): string | null;
}

/**
 * An edge or its label, named by its two ends (`edge b → d`), `#k` among
 * edges joining the same pair, and the label text. `chainIndex` is the
 * clicked edge or label.
 */
function edgeMatch(click: DiagramClick, naming: EdgeNaming, dataId: string, chainIndex: number, onLabel: boolean, via?: string): AdapterMatch {
  const edges = click.peers.filter(isEdge);
  const ids = edges.map((edge) => edge.attrs['data-id']!);
  const ends = ids.map((id) => naming.ends(click, id));
  const at = ids.indexOf(dataId);
  const ref = at >= 0 ? pairRef(ends, at) : naming.ends(click, dataId);
  const label = click.peers.find((peer) => peer.tag === 'g' && peer.attrs['data-id'] === dataId && hasClass(peer, 'label'))?.text;
  return match(onLabel ? `${naming.noun} label` : naming.noun, ref ?? dataId, label ?? null, chainIndex, via);
}

/** A click on an edge or on the label of one. */
function edgeClick(click: DiagramClick, naming: EdgeNaming): AdapterMatch | null {
  const hit = find(click, (element) => isEdge(element) || isEdgeLabel(element));
  if (!hit) return null;
  return edgeMatch(click, naming, hit.element.attrs['data-id']!, hit.index, !isEdge(hit.element));
}

/** The text of the chain element with class `cls` below `below`, when the click went through it. */
function textOf(click: DiagramClick, cls: string, below: number): string | null {
  const hit = find(click, (element) => hasClass(element, cls));
  return hit && hit.index < below ? hit.element.text : null;
}

/** L_<from>_<to>_<n>, split against the drawing's node and subgraph ids; anything else is the agent's own edge id. */
function lEdgeEnds(nodePattern: RegExp): EdgeNaming['ends'] {
  return (click, dataId) => {
    const body = /^L_(.+)_\d+$/.exec(dataId)?.[1];
    if (body === undefined) return dataId;
    const known = new Set([...knownIds(click, nodePattern), ...knownIds(click, /^(.+)$/, (peer) => hasClass(peer, 'cluster'))]);
    const pair = splitPair(body, '_', known);
    return pair ? `${pair[0]} → ${pair[1]}` : null;
  };
}

// ------------------------------------------------------------ flowchart

const FLOW_NODE = /^(?:flowchart|agentflow)-(.+)-\d+$/;
const FLOW_EDGES: EdgeNaming = { noun: 'edge', ends: lEdgeEnds(FLOW_NODE) };

/** Flowchart, swimlane and agentflow: nodes, subgraphs (lanes, flows), edges and edge labels. */
export const flowchartAdapter: DiagramAdapter = {
  peers: GRAPH_PEERS,
  read(click) {
    // A swimlane edge label has no data-id; its id ends with its edge's.
    const laneLabel = find(click, (element) => /^edge-label-/.test(element.attrs.id ?? ''));
    if (laneLabel) {
      const edge = click.peers.find((peer) => isEdge(peer) && laneLabel.element.attrs.id!.endsWith(`-${peer.attrs['data-id']}`));
      if (edge) return { ...edgeMatch(click, FLOW_EDGES, edge.attrs['data-id']!, laneLabel.index, true), label: laneLabel.element.text || null };
    }
    const edge = edgeClick(click, FLOW_EDGES);
    if (edge) return edge;

    const node = find(click, (element) => element.tag === 'g' && hasClass(element, 'node') && idOf(click, element, FLOW_NODE) !== null);
    if (node) {
      const id = idOf(click, node.element, FLOW_NODE)!;
      const kind = node.element.attrs.class?.match(/\baf-kind-(\w+)/)?.[1] ?? 'node';
      return match(kind, id, labelUnlessId(node.element.text, id), node.index);
    }

    const cluster = find(click, (element) => element.tag === 'g' && hasClass(element, 'cluster'));
    if (cluster) {
      const lane = hasClass(cluster.element, 'swimlane');
      const id = lane ? (cluster.element.attrs['data-id'] ?? null) : unprefixed(click, cluster.element.attrs.id);
      if (id === null) return null;
      const kind = lane ? 'lane' : hasClass(cluster.element, 'flow-cluster') ? 'flow' : 'subgraph';
      return match(kind, id, labelUnlessId(textOf(click, 'cluster-label', cluster.index) ?? undefined, id), cluster.index);
    }
    return null;
  },
};

// ---------------------------------------------------------------- class

const CLASS_NODE = /^classId-(.+)-\d+$/;
const CLASS_EDGES: EdgeNaming = {
  noun: 'relation',
  ends(click, dataId) {
    const body = /^id_(.+)_\d+$/.exec(dataId)?.[1];
    const pair = body === undefined ? null : splitPair(body, '_', knownIds(click, CLASS_NODE));
    return pair ? `${pair[0]} → ${pair[1]}` : null;
  },
};

/** Classes, their members and methods, relations, cardinalities, notes and namespaces. */
export const classAdapter: DiagramAdapter = {
  peers: `${GRAPH_PEERS}, g.edgeTerminals`,
  read(click) {
    // A cardinality has no id: it belongs to the relation label drawn just before it.
    const terminal = find(click, (element) => hasClass(element, 'edgeTerminals'));
    if (terminal) {
      const at = peerIndex(click, terminal.element);
      const relation = click.peers.slice(0, Math.max(at, 0)).findLast((peer) => peer.tag === 'g' && hasClass(peer, 'label') && peer.attrs['data-id']);
      if (at < 0 || !relation) return null;
      const named = edgeMatch(click, CLASS_EDGES, relation.attrs['data-id']!, terminal.index, false, VIA_NEIGHBOUR);
      return { ...named, kind: 'cardinality', label: terminal.element.text || null };
    }
    const edge = find(click, (element) => isEdge(element) || isEdgeLabel(element));
    if (edge && !/^edgeNote/.test(edge.element.attrs['data-id']!)) {
      return edgeMatch(click, CLASS_EDGES, edge.element.attrs['data-id']!, edge.index, !isEdge(edge.element));
    }

    const node = find(click, (element) => element.tag === 'g' && hasClass(element, 'node') && Boolean(element.attrs.id));
    if (node) {
      const note = idOf(click, node.element, /^(note\d+)$/);
      if (note) return match('note', null, node.element.text, node.index);
      const name = idOf(click, node.element, CLASS_NODE);
      if (!name) return null;
      for (const [group, kind] of [['members-group', 'member'], ['methods-group', 'method']] as const) {
        const row = find(click, (element) => hasClass(element, 'label'));
        if (row && row.index < node.index && find(click, (element) => hasClass(element, group))) {
          return match(kind, name, row.element.text, row.index);
        }
      }
      return match('class', name, labelUnlessId(textOf(click, 'label-group', node.index) ?? undefined, name), node.index);
    }

    const namespace = find(click, (element) => element.tag === 'g' && hasClass(element, 'cluster'));
    const id = namespace && unprefixed(click, namespace.element.attrs.id);
    return namespace && id ? match('namespace', id, null, namespace.index) : null;
  },
};

// ---------------------------------------------------------------- state

const STATE_NODE = /^state-(.+)-\d+$/;

/** States (simple and composite), start and end points, and notes. Transitions are matched by position, elsewhere. */
export const stateAdapter: DiagramAdapter = {
  peers: GRAPH_PEERS,
  read(click) {
    const note = find(click, (element) => /----note-\d+$/.test(element.attrs.id ?? ''));
    if (note) {
      const on = idOf(click, note.element, /^state-(.+)----note-\d+$/);
      return on === null ? null : match('note', `on ${on}`, note.element.text, note.index);
    }
    const composite = find(click, (element) => element.tag === 'g' && hasClass(element, 'statediagram-cluster') && Boolean(element.attrs['data-id']));
    const node = find(click, (element) => element.tag === 'g' && hasClass(element, 'node') && idOf(click, element, STATE_NODE) !== null);
    if (node && (!composite || node.index < composite.index)) {
      const id = idOf(click, node.element, STATE_NODE)!;
      const point = /^(.*)_(start|end)$/.exec(id);
      if (point && !labelUnlessId(node.element.text, null)) {
        return match(point[2]!, point[1] === 'root' ? null : `of ${point[1]}`, null, node.index);
      }
      return match('state', id, labelUnlessId(node.element.text, id), node.index);
    }
    if (composite) {
      const id = composite.element.attrs['data-id']!;
      return match('state', id, labelUnlessId(textOf(click, 'cluster-label', composite.index) ?? undefined, id), composite.index);
    }
    return null;
  },
};

// ------------------------------------------------------------------- ER

const ENTITY = /^entity-(.+)-\d+$/;
const ER_EDGES: EdgeNaming = {
  noun: 'relationship',
  ends(click, dataId) {
    const body = /^id_(.+)_\d+$/.exec(dataId)?.[1];
    if (body === undefined) return null;
    const known = knownIds(click, ENTITY);
    for (let at = body.indexOf('_entity-'); at > 0; at = body.indexOf('_entity-', at + 1)) {
      const from = ENTITY.exec(body.slice(0, at))?.[1];
      const to = ENTITY.exec(body.slice(at + 1))?.[1];
      if (from && to && known.has(from) && known.has(to)) return `${from} → ${to}`;
    }
    return null;
  },
};

/** Entities, their attributes (`CUSTOMER.email`), and relationships. */
export const erAdapter: DiagramAdapter = {
  // Every g.label: an attribute cell finds its row by the cells before it.
  peers: `${GRAPH_PEERS}, g.label`,
  read(click) {
    const edge = edgeClick(click, ER_EDGES);
    if (edge) return edge;
    const entity = find(click, (element) => element.tag === 'g' && hasClass(element, 'node') && idOf(click, element, ENTITY) !== null);
    if (!entity) return null;
    const name = idOf(click, entity.element, ENTITY)!;

    const cell = find(click, (element) => element.tag === 'g' && hasClass(element, 'label'));
    if (cell && cell.index < entity.index && /\battribute-/.test(cell.element.attrs.class ?? '')) {
      const attribute = attributeName(click, cell.element);
      if (attribute) {
        const own = hasClass(cell.element, 'attribute-name') ? null : cell.element.text;
        return match('attribute', `${name}.${attribute}`, own, cell.index, VIA_NEIGHBOUR);
      }
    }
    return match('entity', name, labelUnlessId(textOf(click, 'name', entity.index) ?? undefined, name), entity.index);
  },
};

/** An attribute row is a type cell followed by its name, keys and comment cells. */
function attributeName(click: DiagramClick, cell: SnapshotElement): string | null {
  const at = peerIndex(click, cell);
  if (at < 0) return null;
  let start = at;
  while (start >= 0 && !hasClass(click.peers[start]!, 'attribute-type')) start--;
  if (start < 0) return null;
  return click.peers.slice(start + 1).find((peer) => hasClass(peer, 'attribute-name'))?.text ?? null;
}

// ---------------------------------------------------------- requirement

const REQUIREMENT_EDGES: EdgeNaming = {
  noun: 'relation',
  ends(click, dataId) {
    const body = /^(.+)-\d+$/.exec(dataId)?.[1];
    const known = knownIds(click, /^(.+)$/, (peer) => hasClass(peer, 'node'));
    const pair = body === undefined ? null : splitPair(body, '-', known);
    return pair ? `${pair[0]} → ${pair[1]}` : null;
  },
};

/** Requirements and elements (kind from their «stereotype»), their field rows, and relations. */
export const requirementAdapter: DiagramAdapter = {
  peers: GRAPH_PEERS,
  read(click) {
    const edge = edgeClick(click, REQUIREMENT_EDGES);
    if (edge) return edge;
    const node = find(click, (element) => element.tag === 'g' && hasClass(element, 'node') && unprefixed(click, element.attrs.id) !== null);
    if (!node) return null;
    const name = unprefixed(click, node.element.attrs.id)!;
    const stereotype = /^<<(.+?)>>/.exec(node.element.text)?.[1];
    const kind = stereotype ? stereotype.toLowerCase() : 'requirement';
    const row = find(click, (element) => element.tag === 'g' && hasClass(element, 'label'));
    const field = row && row.index < node.index && !/^<<.*>>$/.test(row.element.text) ? row.element.text : null;
    return match(kind, name, labelUnlessId(field ?? undefined, name), node.index);
  },
};

// --------------------------------------------------------------- kanban

/** Columns and cards; a click on a card's metadata names the card with that text. */
export const kanbanAdapter: DiagramAdapter = {
  read(click) {
    const card = find(click, (element) => element.tag === 'g' && hasClass(element, 'node') && unprefixed(click, element.attrs.id) !== null);
    if (card) {
      const id = unprefixed(click, card.element.attrs.id)!;
      const row = find(click, (element) => element.tag === 'g' && hasClass(element, 'label'));
      const label = row && row.index < card.index ? row.element.text : null;
      return match('card', id, labelUnlessId(label ?? undefined, id), card.index);
    }
    const column = find(click, (element) => element.tag === 'g' && hasClass(element, 'cluster') && unprefixed(click, element.attrs.id) !== null);
    if (!column) return null;
    const id = unprefixed(click, column.element.attrs.id)!;
    return match('column', id, labelUnlessId(textOf(click, 'cluster-label', column.index) ?? undefined, id), column.index);
  },
};

// ---------------------------------------------------------------- block

/** Edges are `<svg id>-<k>-<from>-<to>`, their labels `<k>-<from>-<to>`; ids may hold "-", so split against the block ids. */
const BLOCK_EDGES: EdgeNaming = {
  noun: 'edge',
  ends(click, dataId) {
    const bare = dataId.startsWith(click.prefix) ? dataId.slice(click.prefix.length) : dataId;
    const body = /^\d+-(.+)$/.exec(bare)?.[1];
    const known = knownIds(click, /^(.+)$/, (peer) => hasClass(peer, 'node'));
    const pair = body === undefined ? null : splitPair(body, '-', known);
    return pair ? `${pair[0]} → ${pair[1]}` : null;
  },
};

/** Blocks and the edges between them. */
export const blockAdapter: DiagramAdapter = {
  peers: GRAPH_PEERS,
  read(click) {
    const label = find(click, isEdgeLabel);
    if (label) {
      // A label's data-id lacks the edge's svg-id prefix: find the edge it belongs to.
      const edge = click.peers.find((peer) => isEdge(peer) && peer.attrs['data-id'] === `${click.prefix}${label.element.attrs['data-id']}`);
      const named = edgeMatch(click, BLOCK_EDGES, edge?.attrs['data-id'] ?? label.element.attrs['data-id']!, label.index, true);
      return { ...named, label: label.element.text || null };
    }
    const edge = find(click, isEdge);
    if (edge) {
      const named = edgeMatch(click, BLOCK_EDGES, edge.element.attrs['data-id']!, edge.index, false);
      const bare = edge.element.attrs['data-id']!.slice(click.prefix.length);
      const text = click.peers.find((peer) => peer.tag === 'g' && hasClass(peer, 'label') && peer.attrs['data-id'] === bare)?.text;
      return { ...named, label: text || null };
    }
    const node = find(click, (element) => element.tag === 'g' && hasClass(element, 'node') && unprefixed(click, element.attrs.id) !== null);
    if (!node) return null;
    const id = unprefixed(click, node.element.attrs.id)!;
    return match('block', id, labelUnlessId(node.element.text, id), node.index);
  },
};

// ------------------------------------------------------------- use case

const USE_CASE_KINDS: Record<string, string> = { actor: 'actor', usecase: 'use case', boundary: 'boundary' };

/**
 * Use case diagrams carry the agent's ids in data-usecase-id and readable
 * aria-labels. A relationship's aria-label names its ends by their labels
 * ("association asks from Customer to Support agent"), which map back to ids.
 */
export const useCaseAdapter: DiagramAdapter = {
  peers: '[data-usecase-id], g.label[data-id]',
  read(click) {
    const label = find(click, isEdgeLabel);
    const edge = find(click, (element) => element.attrs['data-usecase-kind'] === 'relationship');
    if (label || edge) {
      const dataId = (label ?? edge)!.element.attrs['data-id'];
      const relation = click.peers.find((peer) => peer.attrs['data-usecase-kind'] === 'relationship' && peer.attrs['data-id'] === dataId);
      if (!relation) return null;
      return relationshipMatch(click, relation, label ? label.index : edge!.index, Boolean(label));
    }
    const element = find(click, (candidate) => Boolean(candidate.attrs['data-usecase-kind']) && Boolean(candidate.attrs['data-usecase-id']));
    if (!element) return null;
    const { attrs } = element.element;
    const kind = USE_CASE_KINDS[attrs['data-usecase-kind']!] ?? attrs['data-usecase-kind']!;
    const id = attrs['data-usecase-id']!;
    return match(kind, id, labelUnlessId(useCaseLabel(attrs['aria-label']), id), element.index);
  },
};

/** "use case Browse products" → "Browse products"; "rect system boundary Shop" → "Shop". */
function useCaseLabel(ariaLabel: string | undefined): string | undefined {
  return ariaLabel?.replace(/^(actor|use case|.*?system boundary) /, '');
}

function relationshipMatch(click: DiagramClick, relation: SnapshotPeer, chainIndex: number, onLabel: boolean): AdapterMatch {
  const aria = relation.attrs['aria-label'] ?? '';
  const noun = aria.split(' ')[0] || 'relationship';
  const byLabel = new Map<string, string>();
  for (const peer of click.peers) {
    const kind = peer.attrs['data-usecase-kind'];
    if (kind && kind !== 'relationship' && peer.attrs['data-usecase-id']) {
      byLabel.set(useCaseLabel(peer.attrs['aria-label']) ?? peer.attrs['data-usecase-id'], peer.attrs['data-usecase-id']);
    }
  }
  let ref: string | null = null;
  for (const [toLabel, to] of byLabel) {
    if (!aria.endsWith(` to ${toLabel}`)) continue;
    const head = aria.slice(0, -` to ${toLabel}`.length);
    for (const [fromLabel, from] of byLabel) {
      if (head.endsWith(` from ${fromLabel}`)) ref = `${from} → ${to}`;
    }
  }
  const text = click.peers.find((peer) => peer.tag === 'g' && hasClass(peer, 'label') && peer.attrs['data-id'] === relation.attrs['data-id'])?.text;
  return match(onLabel ? `${noun} label` : noun, ref ?? relation.attrs['data-usecase-id'] ?? null, text || null, chainIndex);
}
