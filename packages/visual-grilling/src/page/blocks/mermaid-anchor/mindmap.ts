// Mindmap: Mermaid drops the ids the agent writes (`ch[Channel]`). Node k is
// `<P>node_<k>`, the k-th node line of the source (depth first, `::icon` and
// `:::class` lines left out), which gives the id back; a branch is
// `<P>edge_<parent k>_<child k>`.

import { find, idOf, match, sourceLines, VIA_POSITION, type DiagramAdapter } from './shared.ts';

const SHAPE = /^([^\s([{)]*?)\s*(\(\(|\)\)|\{\{|\(|\)|\[)(.*?)(\)\)|\(\(|\}\}|\)|\(|\])$/;

export const mindmapAdapter: DiagramAdapter = {
  read(click) {
    const nodes = nodeLines(click.source);
    const branch = find(click, (element) => idOf(click, element, /^edge_(\d+_\d+)$/) !== null);
    if (branch) {
      const [from, to] = idOf(click, branch.element, /^edge_(\d+_\d+)$/)!.split('_').map((k) => nodes[Number(k)]);
      return from && to ? match('branch', `${from.id ?? quoted(from.text)} → ${to.id ?? quoted(to.text)}`, null, branch.index, VIA_POSITION) : null;
    }
    const node = find(click, (element) => idOf(click, element, /^node_(\d+)$/) !== null);
    const found = node && nodes[Number(idOf(click, node.element, /^node_(\d+)$/))];
    return found ? match('node', found.id, found.text, node.index, VIA_POSITION) : null;
  },
};

const quoted = (text: string) => JSON.stringify(text);

/** Each node line's id (null for a bare-text node) and text, in source order. */
function nodeLines(source: string): { id: string | null; text: string }[] {
  return sourceLines(source)
    .slice(1)
    .filter(({ text }) => !text.startsWith('::icon(') && !text.startsWith(':::'))
    .map(({ text }) => {
      const bare = text.replace(/\s*:::[\w\s-]+$/, '');
      const shape = SHAPE.exec(bare);
      if (!shape) return { id: null, text: bare };
      const inner = shape[3]!.trim().replace(/^"(.*)"$/, '$1');
      return { id: shape[1] || null, text: inner };
    });
}
