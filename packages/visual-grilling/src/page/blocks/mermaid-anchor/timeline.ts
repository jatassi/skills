// Timeline: every section, period and event is a `g.timeline-node`, in
// source order. Inside a `g.taskWrapper` it is a period; inside a
// `g.eventWrapper` an event, whose period is the task wrapper drawn before
// it; neither makes it a section. The text is the source's own term; `#k`
// tells repeated texts apart. Periods written before the first `section`
// aren't drawn when the diagram has sections, so they can't be clicked.

import { findPeer, hasClass, match, ordinal, VIA_POSITION, type DiagramAdapter } from './shared.ts';

const WRAPPERS = ['taskWrapper', 'eventWrapper'];

export const timelineAdapter: DiagramAdapter = {
  peers: 'g.timeline-node, g.taskWrapper, g.eventWrapper',
  read(click) {
    const node = findPeer(click, (element) => element.tag === 'g' && hasClass(element, 'timeline-node'));
    if (!node) return null;
    const parent = click.chain[node.index + 1];
    const kind = parent && hasClass(parent, 'taskWrapper') ? 'period' : parent && hasClass(parent, 'eventWrapper') ? 'event' : 'section';

    // Every node's kind and text, in drawing order, to count repeats and find an event's period.
    const nodes: { kind: string; text: string }[] = [];
    let wrapper = 'section';
    for (const peer of click.peers) {
      const own = WRAPPERS.find((name) => hasClass(peer, name));
      if (own) wrapper = own === 'taskWrapper' ? 'period' : 'event';
      else if (hasClass(peer, 'timeline-node')) {
        nodes.push({ kind: wrapper, text: peer.text });
        wrapper = 'section';
      }
    }
    const { at } = node;
    const text = node.element.text;
    let label = text;
    if (kind === 'event') {
      const period = nodes.slice(0, at).findLast((other) => other.kind === 'period');
      if (period) label = `${period.text} / ${text}`;
    }
    const same = nodes.map((other) => (other.kind === kind ? other.text : null));
    return match(kind, ordinal(same, at), label, node.index, VIA_POSITION);
  },
};
