// Treemap: sections and leaves are flat siblings with no ids, leaves sorted
// by value, so an element's parents are found by geometry: the sections
// whose boxes contain it, largest first. The term is its name path,
// `leaf "Budget / Housing / Rent"`. Two same-named siblings differ only by
// value, which the agent may not have meant to compare; they fall to the
// generic rules.

import type { Box, SnapshotPeer } from '../../../core/anchor.ts';
import { contains, find, hasClass, match, peerAt, VIA_GEOMETRY, type DiagramAdapter } from './shared.ts';

interface Named {
  box: Box;
  name: string;
}

export const treemapAdapter: DiagramAdapter = {
  peers: 'rect.treemapSection, text.treemapSectionLabel, g.treemapLeafGroup, text.treemapLabel',
  read(click) {
    const sections = named(click.peers, 'treemapSection', 'treemapSectionLabel');
    const leaves = named(click.peers, 'treemapLeafGroup', 'treemapLabel');

    const leaf = find(click, (element) => element.tag === 'g' && hasClass(element, 'treemapLeafGroup'));
    if (leaf) {
      const at = peerAt(click, leaf.element, (peer) => hasClass(peer, 'treemapLeafGroup'));
      const path = at < 0 ? null : unique(leaves, at, sections);
      return path ? match('leaf', null, path, leaf.index, VIA_GEOMETRY) : null;
    }
    const section = find(click, (element) => element.tag === 'g' && hasClass(element, 'treemapSection'));
    if (section) {
      // The smallest section holding the click: its header and padding aren't covered by its children.
      const holding = sections.filter((other) => contains(other.box, click.snapshot.click));
      const smallest = holding.sort((a, b) => area(a.box) - area(b.box))[0];
      const path = smallest ? unique(sections, sections.indexOf(smallest), sections) : null;
      return path ? match('section', null, path, section.index, VIA_GEOMETRY) : null;
    }
    return null;
  },
};

/** Each `cls` element's box, named by the `labelCls` text drawn after it; zero-size ones (the hidden root) left out. */
function named(peers: SnapshotPeer[], cls: string, labelCls: string): Named[] {
  const out: Named[] = [];
  for (const [i, peer] of peers.entries()) {
    if (!hasClass(peer, cls) || !peer.box) continue;
    const label = peers.slice(i + 1).find((other) => hasClass(other, labelCls) || hasClass(other, cls));
    if (peer.box.w > 0 && label && hasClass(label, labelCls)) out.push({ box: peer.box, name: label.text });
  }
  return out;
}

/** `Root / A / x` for items[at], or null when a same-named sibling has the same path. */
function unique(items: Named[], at: number, sections: Named[]): string | null {
  const paths = items.map((item) => pathOf(item, sections));
  return paths.filter((path) => path === paths[at]).length === 1 ? paths[at]! : null;
}

function pathOf(item: Named, sections: Named[]): string {
  const parents = sections
    .filter((section) => section.box !== item.box && within(item.box, section.box) && area(section.box) > area(item.box))
    .sort((a, b) => area(b.box) - area(a.box));
  return [...parents, item].map((part) => part.name).join(' / ');
}

function within(inner: Box, outer: Box): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

const area = (box: Box) => box.w * box.h;
