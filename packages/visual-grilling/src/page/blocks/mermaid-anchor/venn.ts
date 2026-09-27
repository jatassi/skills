// Venn: every area is `g.venn-area[data-venn-sets="A_B"]`, in the agent's set
// names. Mermaid also draws intersections the agent never declared; those
// aren't named here. A label drawn under another area's path is matched by
// geometry, elsewhere.

import { find, match, type DiagramAdapter, type DiagramClick } from './shared.ts';

export const vennAdapter: DiagramAdapter = {
  read(click) {
    const area = find(click, (element) => Boolean(element.attrs['data-venn-sets']));
    if (!area) return null;
    const sets = area.element.attrs['data-venn-sets']!.split('_');
    const text = area.element.text || null;
    if (sets.length === 1) return match('set', sets[0]!, text === sets[0] ? null : text, area.index);
    return declared(click, sets) ? match('region', sets.join(' ∩ '), text, area.index) : null;
  },
};

/** Whether the source has a `union` of exactly these sets. */
function declared(click: DiagramClick, sets: string[]): boolean {
  const key = [...sets].sort().join('\n');
  return [...click.source.matchAll(/^\s*union\s+([^[\n]+)/gm)].some(
    (union) => union[1]!.split(',').map((name) => name.trim()).sort().join('\n') === key,
  );
}
