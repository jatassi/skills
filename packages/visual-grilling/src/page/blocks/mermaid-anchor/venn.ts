// Venn: every area is `g.venn-area[data-venn-sets="A_B"]`, in the agent's set
// names. Mermaid also draws intersections the agent never declared; those
// aren't named here. Set names may hold "_", so areas are matched against
// the source's declarations rather than split. A label drawn under another
// area's path is matched by geometry, elsewhere.

import { find, match, type DiagramAdapter, type DiagramClick } from './shared.ts';

export const vennAdapter: DiagramAdapter = {
  read(click) {
    const area = find(click, (element) => Boolean(element.attrs['data-venn-sets']));
    if (!area) return null;
    const joined = area.element.attrs['data-venn-sets']!;
    const text = area.element.text || null;
    const union = unions(click.source).find((sets) => orders(sets).some((order) => order.join('_') === joined));
    if (union) return match('region', union.join(' ∩ '), text, area.index);
    // A set's own area; its name may hold "_", which also joins intersections.
    if (setNames(click.source).has(joined)) return match('set', joined, text === joined ? null : text, area.index);
    return null;
  },
};

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
