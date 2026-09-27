// Wardley map: nothing carries an id. Components and anchors show their
// names, which are unique by syntax since links refer to them. Link k
// (`line.wardley-link`) is the k-th link statement, and trend k
// (`line.wardley-trend`) the k-th `evolve`. Stage labels and axes are
// generated.

import { classes, find, findPeer, hasClass, match, sourceLines, VIA_POSITION, type DiagramAdapter } from './shared.ts';

const LINK = /^(.+?)\s*(\+<>|\+<|\+>|->)\s*(.+?)(?:\s*;.*)?$/;
const KEYWORD = /^(title|anchor|component|evolve|note|pipeline|market|ecosystem|annotations?|size|style|evolution|build|buy|outsource|accelerator|deaccelerator|submap|x-axis|y-axis)\b/;

export const wardleyAdapter: DiagramAdapter = {
  peers: 'line.wardley-link, line.wardley-trend',
  read(click) {
    const lines = sourceLines(click.source).slice(1);
    const link = findPeer(click, (element) => element.tag === 'line' && hasClass(element, 'wardley-link'));
    if (link) {
      const statement = lines.filter(({ text }) => !KEYWORD.test(text) && LINK.test(text))[link.at];
      const [, from, , to] = statement ? LINK.exec(statement.text)! : [];
      return from ? match('link', `${from} → ${to}`, null, link.index, VIA_POSITION) : null;
    }
    const trend = findPeer(click, (element) => element.tag === 'line' && hasClass(element, 'wardley-trend'));
    if (trend) {
      const statement = lines.filter(({ text }) => /^evolve\s/.test(text))[trend.at];
      const name = statement && /^evolve\s+(.+?)\s+[\d.]+\s*$/.exec(statement.text)?.[1];
      return name ? match('evolve', null, name, trend.index, VIA_POSITION) : null;
    }
    const node = find(click, (element) => element.tag === 'g' && hasClass(element, 'wardley-node'));
    if (node) {
      const kind = classes(node.element).find((name) => name.startsWith('wardley-node--'))?.slice('wardley-node--'.length) ?? 'component';
      return match(kind, null, node.element.text, node.index, VIA_POSITION);
    }
    const note = find(click, (element) => hasClass(element, 'wardley-notes'));
    if (note && note.index > 0) return match('note', null, click.chain[note.index - 1]!.text, note.index - 1, VIA_POSITION);
    return null;
  },
};
