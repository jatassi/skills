// Venn: every area is `g.venn-area[data-venn-sets="A_B"]`, in the agent's set
// names. A label can sit under another area's path, so the element clicked
// may belong to the wrong area: the region is found by geometry instead, as
// the set circles that contain the click point. Mermaid also draws
// intersections the agent never declared; those aren't named here. Set names
// may hold "_", so areas are matched against the source's declarations
// rather than split.

import type { AdapterMatch } from '../../../core/anchor.ts';
import { find, hasClass, match, VIA_GEOMETRY, VIA_ID, type DiagramAdapter, type DiagramClick } from './shared.ts';

export const vennAdapter: DiagramAdapter = {
  peers: 'g.venn-area',
  read(click) {
    const circles = click.peers.filter((peer) => hasClass(peer, 'venn-circle') && peer.box && peer.attrs['data-venn-sets']);
    const area = find(click, (element) => Boolean(element.attrs['data-venn-sets']));
    if (circles.length === 0) return area ? named(click, area.element.attrs['data-venn-sets']!, area.element.text || null, area.index) : null;

    const { x, y } = click.snapshot.click;
    const inside = circles.filter(({ box }) => Math.hypot(x - (box!.x + box!.w / 2), y - (box!.y + box!.h / 2)) <= box!.w / 2);
    if (inside.length === 0) return null;
    const sets = inside.map((circle) => circle.attrs['data-venn-sets']!);
    const joined = orders(sets).map((order) => order.join('_'));
    const text = click.peers.find((peer) => joined.includes(peer.attrs['data-venn-sets'] ?? ''))?.text || null;
    // The area clicked names the region only when it is the one the point is in.
    const own = area && joined.includes(area.element.attrs['data-venn-sets']!) ? area.index : -1;
    return named(click, sets.length === 1 ? sets[0]! : sets.join('_'), text, own, VIA_GEOMETRY, sets);
  },
};

/** The set or declared region for `joined` (data-venn-sets), or null for a region the agent didn't declare. */
function named(click: DiagramClick, joined: string, text: string | null, chainIndex: number, via = VIA_ID, sets?: string[]): AdapterMatch | null {
  const union = unions(click.source).find((declared) =>
    sets ? declared.length === sets.length && sets.every((set) => declared.includes(set)) : orders(declared).some((order) => order.join('_') === joined),
  );
  if (union) return match('region', union.join(' ∩ '), text, chainIndex, via);
  // A set's own area; its name may hold "_", which also joins intersections.
  if (setNames(click.source).has(joined)) return match('set', joined, text === joined ? null : text, chainIndex, via);
  return null;
}

/** `set <name>` declarations. */
function setNames(source: string): Set<string> {
  return new Set([...source.matchAll(/^\s*set\s+([^\s[]+)/gm)].map((set) => set[1]!));
}

/** Each `union A,B[...]` as its set names, sorted in the order the sets were declared. */
function unions(source: string): string[][] {
  const declared = [...setNames(source)];
  return [...source.matchAll(/^\s*union\s+([^[\n]+)/gm)].map((union) =>
    union[1]!
      .split(',')
      .map((name) => name.trim())
      .sort((a, b) => declared.indexOf(a) - declared.indexOf(b)),
  );
}

/** Every order of a few set names: which one data-venn-sets joins them in isn't pinned down. */
function orders(sets: string[]): string[][] {
  if (sets.length <= 1) return [sets];
  return sets.flatMap((first, i) => orders(sets.filter((_, j) => j !== i)).map((rest) => [first, ...rest]));
}
