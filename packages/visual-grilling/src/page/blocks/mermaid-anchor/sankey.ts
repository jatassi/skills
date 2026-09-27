// Sankey: nothing carries an id the source wrote (`node-<n>` comes from a
// page-wide counter). Node k, and label k, is the k-th distinct name by first
// appearance in the CSV; link k is CSV row k. Links are painted over the
// node labels, so a click on a label usually lands on a link: labels are
// matched by geometry first.

import { contains, find, hasClass, match, pairRef, sourceLines, VIA_GEOMETRY, VIA_POSITION, type DiagramAdapter } from './shared.ts';

const isLabel = (peer: { tag: string; attrs: Record<string, string> }) => peer.tag === 'text';

export const sankeyAdapter: DiagramAdapter = {
  peers: 'g.node-labels > text',
  read(click) {
    const { names, rows } = parse(click.source);
    const labels = click.peers.filter(isLabel);
    const under = labels.findIndex((label) => contains(label.box, click.snapshot.click));
    const onText = click.chain[0]!.tag === 'text' || click.chain[0]!.tag === 'tspan';
    if (under >= 0 && names[under] !== undefined) {
      return match('node', null, names[under]!, onText ? 0 : -1, onText ? VIA_POSITION : VIA_GEOMETRY);
    }
    const node = find(click, (element) => element.tag === 'g' && hasClass(element, 'node'));
    if (node?.element.nth) {
      const name = names[node.element.nth.i];
      return name === undefined ? null : match('node', null, name, node.index, VIA_POSITION);
    }
    const link = find(click, (element) => element.tag === 'g' && hasClass(element, 'link'));
    if (link?.element.nth) {
      const pairs = rows.map(([from, to]) => `${from} → ${to}`);
      const ref = pairRef(pairs, link.element.nth.i);
      const value = rows[link.element.nth.i]?.[2];
      return ref ? match('flow', ref, value ?? null, link.index, VIA_POSITION) : null;
    }
    return null;
  },
};

/** The CSV's rows (source, target, value) and its node names by first appearance. */
function parse(source: string): { names: string[]; rows: string[][] } {
  const rows = sourceLines(source)
    .slice(1)
    .map(({ text }) => csv(text))
    .filter((row) => row.length >= 3);
  const names = [...new Set(rows.flatMap(([from, to]) => [from!, to!]))];
  return { names, rows };
}

/** One CSV line's fields: quoted fields may hold commas, and `""` for a quote. */
function csv(line: string): string[] {
  return [...line.matchAll(/\s*(?:"((?:[^"]|"")*)"|([^,]*))\s*(?:,|$)/g)]
    .filter((field) => field[0] !== '')
    .map((field) => (field[1] !== undefined ? field[1].replace(/""/g, '"') : field[2]!.trim()));
}
