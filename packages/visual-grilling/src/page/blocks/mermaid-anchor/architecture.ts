// Architecture: services `g#<P>service-<id>`, junctions `rect#<P>node-<id>`,
// groups `rect#<P>group-<id>` and edges `path.edge#<P>L_<a>_<b>_<n>`. A group's
// title isn't inside its group; it is matched by geometry, elsewhere.

import { find, idOf, knownIds, labelUnlessId, match, pairRef, splitPair, type DiagramAdapter, type DiagramClick } from './shared.ts';

const PARTS: [RegExp, string][] = [
  [/^service-(.+)$/, 'service'],
  [/^node-(.+)$/, 'junction'],
  [/^group-(.+)$/, 'group'],
];
const EDGE = /^(L_.+_\d+)$/;

export const architectureAdapter: DiagramAdapter = {
  peers: 'g.architecture-service, rect[id], path.edge',
  read(click) {
    const edge = find(click, (element) => idOf(click, element, EDGE) !== null);
    if (edge) {
      const edges = click.peers.filter((peer) => idOf(click, peer, EDGE) !== null);
      const pairs = edges.map((peer) => edgeEnds(click, idOf(click, peer, EDGE)!));
      const at = edges.findIndex((peer) => peer.attrs.id === edge.element.attrs.id);
      const ref = at >= 0 ? pairRef(pairs, at) : edgeEnds(click, idOf(click, edge.element, EDGE)!);
      return ref ? match('edge', ref, null, edge.index) : null;
    }
    for (const [index, element] of click.chain.entries()) {
      for (const [pattern, kind] of PARTS) {
        const id = idOf(click, element, pattern);
        if (id !== null) return match(kind, id, kind === 'service' ? labelUnlessId(element.text, id) : null, index);
      }
    }
    return null;
  },
};

function edgeEnds(click: DiagramClick, edgeId: string): string | null {
  const known = new Set([...knownIds(click, /^service-(.+)$/), ...knownIds(click, /^node-(.+)$/)]);
  const body = /^L_(.+)_\d+$/.exec(edgeId)?.[1];
  const pair = body === undefined ? null : splitPair(body, '_', known);
  return pair ? `${pair[0]} → ${pair[1]}` : null;
}
