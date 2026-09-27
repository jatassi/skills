// Packet: each block is a rect, its label, and its start and end bit texts,
// in that order, with no ids. A field that crosses a row is drawn as several
// blocks with row-local ranges, so a block is named by the source field whose
// bit range holds its start bit.

import { find, hasClass, match, peerIndex, sourceLines, unquote, VIA_POSITION, type DiagramAdapter } from './shared.ts';

export const packetAdapter: DiagramAdapter = {
  peers: 'rect.packetBlock, text.packetLabel, text.packetByte',
  read(click) {
    const part = find(click, (element) => ['packetBlock', 'packetLabel', 'packetByte'].some((name) => hasClass(element, name)));
    if (!part) return null;
    const at = peerIndex(click, part.element);
    const block = click.peers.slice(0, at + 1).findLastIndex((peer) => hasClass(peer, 'packetBlock'));
    const start = block < 0 ? undefined : click.peers.slice(block).find((peer) => hasClass(peer, 'start'));
    if (!start) return null;
    const bit = Number(start.text);
    const field = fields(click.source).find(({ from, to }) => bit >= from && bit <= to);
    return field ? match('field', field.range, field.name, part.index, VIA_POSITION) : null;
  },
};

interface Field {
  from: number;
  to: number;
  /** As written: `0-15`, `16`, or `+8`. */
  range: string;
  name: string;
}

/** Fields in source order: `0-15: "Name"`, `16: "Name"`, or `+8: "Name"` (the next 8 bits). */
function fields(source: string): Field[] {
  const out: Field[] = [];
  let next = 0;
  for (const { text } of sourceLines(source)) {
    const field = /^(\+?\d+)(?:\s*-\s*(\d+))?\s*:\s*(.+)$/.exec(text);
    if (!field) continue;
    const [, first, last, name] = field;
    const from = first!.startsWith('+') ? next : Number(first);
    const to = first!.startsWith('+') ? next + Number(first!.slice(1)) - 1 : last === undefined ? from : Number(last);
    const range = last === undefined ? first! : `${first}-${last}`;
    out.push({ from, to, range, name: unquote(name!) });
    next = to + 1;
  }
  return out;
}
