// Architecture: services `g#<P>service-<id>`, junctions `rect#<P>node-<id>`,
// groups `rect#<P>group-<id>` and edges `path.edge#<P>L_<a>_<b>_<n>`. A group's
// title and icon aren't inside its group's rect, so they are matched by
// geometry: the smallest group rect containing the click.

import { contains, ends, find, hasClass, idOf, knownIds, labelUnlessId, match, pairRef, VIA_GEOMETRY, type DiagramAdapter, type DiagramClick } from './shared.ts';

const PARTS: [RegExp, string][] = [
  [/^service-(.+)$/, 'service'],
  [/^node-(.+)$/, 'junction'],
  [/^group-(.+)$/, 'group'],
];
const EDGE = /^(L_.+_\d+)$/;
const GROUP = /^group-(.+)$/;

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
    const titles = find(click, (element) => hasClass(element, 'architecture-groups'));
    if (!titles) return null;
    const group = click.peers
      .filter((peer) => idOf(click, peer, GROUP) !== null && contains(peer.box, click.snapshot.click))
      .sort((a, b) => a.box!.w * a.box!.h - b.box!.w * b.box!.h)[0];
    if (!group) return null;
    const id = idOf(click, group, GROUP)!;
    const title = click.chain.slice(0, titles.index).find((element) => element.tag === 'text');
    return match('group', id, labelUnlessId(title?.text, id), -1, VIA_GEOMETRY);
  },
};

function edgeEnds(click: DiagramClick, edgeId: string): string | null {
  const known = new Set([...knownIds(click, /^service-(.+)$/), ...knownIds(click, /^node-(.+)$/)]);
  const body = /^L_(.+)_\d+$/.exec(edgeId)?.[1];
  return ends(body, '_', known);
}
