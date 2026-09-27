// Reads a click on a Graphviz drawing in the agent's terms: the agent's own
// `id` first, then the node name or the edge `a -> b`. Pure, like the
// resolver it plugs into (src/core/anchor.ts).
//
// It reads the SVG the Graphviz chunk writes: each node, edge and cluster is
// a <g class="node|edge|cluster"> whose <title> holds the name (`a->b` for an
// edge), and whose Graphviz id the chunk moved to `data-id`.

import type { AdapterMatch, Snapshot } from '../../core/anchor.ts';

const KINDS = ['node', 'edge', 'cluster'] as const;
/** The ids Graphviz makes up when the agent gives none. */
const GENERATED_ID = /^(node|edge|clust|graph)\d+$/;

export function dotAnchor(snapshot: Snapshot): AdapterMatch | null {
  const { chain } = snapshot;
  for (let i = 0; i < chain.length - 1; i++) {
    const element = chain[i]!;
    if (element.tag !== 'g') continue;
    const classes = (element.attrs.class ?? '').split(/\s+/);
    if (classes.includes('graph')) {
      // Straight on the graph: its label, or the background.
      const first = chain[0]!;
      if (i === 1 && first.tag === 'text' && first.text) {
        return { kind: 'label', ref: null, label: first.text, via: 'dot', chainIndex: 0 };
      }
      return { kind: 'area', ref: null, label: null, via: 'position only', chainIndex: -1 };
    }
    const kind = KINDS.find((name) => classes.includes(name));
    if (!kind) continue;
    const id = element.attrs['data-id'];
    const name = element.title ?? '';
    const ref = id && !GENERATED_ID.test(id) ? id : kind === 'edge' ? edgeName(name) : bare(name);
    const text = element.text.trim();
    const label = text && text !== name && text !== id ? text : null;
    return { kind, ref: ref || null, label, via: 'dot', chainIndex: i };
  }
  return null;
}

/** Graphviz titles an edge `a->b` (or `a--b`); the agent reads `a -> b`. */
function edgeName(title: string): string {
  const match = /^(.*?)(->|--)(.*)$/s.exec(title);
  return match ? `${bare(match[1]!)} ${match[2]} ${bare(match[3]!)}` : bare(title);
}

/** A name as DOT would take it unquoted, or quoted when it wouldn't. */
function bare(name: string): string {
  return /^[\w.:\u0080-￿-]+$/.test(name) ? name : JSON.stringify(name);
}
