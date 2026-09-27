// Sequence diagrams. Participants, messages, notes and blocks carry data-et
// and data-id. A message's data-id (`i<k>`) indexes Mermaid's own statement
// list, which counts notes and activations too, so a message is named by its
// rank among the messages instead: `message #2 U → S "Submit round"`.
//
// Message text has no id and sits before its line, one <text> per line of a
// multi-line message, so a click on it goes to the next message element. A
// bottom participant box has no data-id; its rect, just before the text,
// carries the participant's name.
//
// An activation bar has no participant id: it belongs to the lifeline it
// sits on, found by geometry, and is counted top to bottom on it.

import type { AdapterMatch, Box, SnapshotPeer } from '../../../core/anchor.ts';
import { classes, find, hasClass, labelUnlessId, match, peerIndex, sameBox, VIA_GEOMETRY, VIA_NEIGHBOUR, type DiagramAdapter, type DiagramClick } from './shared.ts';

const et = (element: { attrs: Record<string, string> }, value: string) => element.attrs['data-et'] === value;

export const sequenceAdapter: DiagramAdapter = {
  peers:
    'text.messageText, [data-et="message"], [data-et="note"], [data-et="control-structure"], rect[name], text.actor, [data-et="life-line"], rect[class^="activation"]',
  read(click) {
    const activation = find(click, (element) => element.tag === 'rect' && classes(element).some((name) => /^activation\d+$/.test(name)));
    if (activation) return activationMatch(click, activation.element.box, activation.index);

    const tagged = find(click, (element) => Boolean(element.attrs['data-et']) || (element.tag === 'g' && Boolean(element.attrs.name)));
    if (tagged) {
      const { element, index } = tagged;
      const { attrs } = element;
      if (et(element, 'message')) return messageMatch(click, attrs['data-id']!, index);
      if (et(element, 'participant')) {
        return match(attrs['data-type'] ?? 'participant', attrs['data-id']!, labelUnlessId(element.text, attrs['data-id']!), index);
      }
      if (et(element, 'life-line')) return match('lifeline', attrs['data-id']!, null, index);
      if (et(element, 'note')) return match('note', `#${rank(click, 'note', attrs['data-id']!)}`, element.text, index);
      if (et(element, 'control-structure')) {
        const [keyword = 'block', ...rest] = element.text.split(' ');
        return match(keyword, `#${rank(click, 'control-structure', attrs['data-id']!)}`, rest.join(' '), index);
      }
      // A bottom stick-figure actor: its group carries the name.
      if (attrs.name) return match('actor', attrs.name, labelUnlessId(element.text, attrs.name), index);
    }

    const text = find(click, (element) => element.tag === 'text');
    if (text && hasClass(text.element, 'messageText')) {
      const at = peerIndex(click, text.element);
      const next = at < 0 ? undefined : click.peers.slice(at).find((peer) => et(peer, 'message'));
      return next ? messageMatch(click, next.attrs['data-id']!, text.index, VIA_NEIGHBOUR) : null;
    }
    if (text && hasClass(text.element, 'actor')) {
      const at = peerIndex(click, text.element);
      const box = at < 0 ? undefined : click.peers.slice(0, at).findLast((peer) => peer.tag === 'rect' && peer.attrs.name);
      const name = box?.attrs.name;
      return name ? match('participant', name, labelUnlessId(text.element.text, name), text.index, VIA_NEIGHBOUR) : null;
    }
    const box = find(click, (element) => element.tag === 'rect' && Boolean(element.attrs.name));
    return box ? match('participant', box.element.attrs.name!, null, box.index) : null;
  },
};

/** `activation #k of P`: the lifeline the bar sits on, and its place among that lifeline's bars from the top. */
function activationMatch(click: DiagramClick, box: Box, chainIndex: number): AdapterMatch | null {
  const on = (bar: Box) => (line: SnapshotPeer) => line.box !== undefined && line.box.x >= bar.x && line.box.x <= bar.x + bar.w;
  const lifeline = click.peers.find((peer) => et(peer, 'life-line') && on(box)(peer));
  if (!lifeline) return null;
  const bars = click.peers
    .filter((peer) => peer.tag === 'rect' && classes(peer).some((name) => /^activation\d+$/.test(name)) && peer.box && on(peer.box)(lifeline))
    .map((peer) => peer.box!)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const k = bars.findIndex((bar) => sameBox(bar, box));
  const ref = bars.length > 1 && k >= 0 ? `#${k + 1} of ${lifeline.attrs['data-id']}` : `of ${lifeline.attrs['data-id']}`;
  return match('activation', ref, null, chainIndex, VIA_GEOMETRY);
}

/** 1-based rank of the element with `dataId` among the drawing's `data-et=<kind>` elements. */
function rank(click: DiagramClick, kind: string, dataId: string): number {
  return click.peers.filter((peer) => et(peer, kind)).findIndex((peer) => peer.attrs['data-id'] === dataId) + 1;
}

/** `message #k from → to "text"`: the text is every message text between the previous message and this one. */
function messageMatch(click: DiagramClick, dataId: string, chainIndex: number, via?: string): AdapterMatch {
  const at = click.peers.findIndex((peer) => et(peer, 'message') && peer.attrs['data-id'] === dataId);
  const message: SnapshotPeer | undefined = click.peers[at];
  const texts: string[] = [];
  for (let i = at - 1; i >= 0 && !et(click.peers[i]!, 'message'); i--) {
    if (hasClass(click.peers[i]!, 'messageText')) texts.unshift(click.peers[i]!.text);
  }
  const ends = message ? `${message.attrs['data-from']} → ${message.attrs['data-to']}` : '';
  return match('message', `#${rank(click, 'message', dataId)} ${ends}`.trim(), texts.join(' '), chainIndex, via);
}
