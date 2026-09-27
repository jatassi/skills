// Cynefin: nothing carries an id. Items are drawn domain by domain in a fixed
// order (complex, complicated, chaotic, clear, confusion), in source order
// within each; transition k (arrow and label) is the k-th `a --> b`
// statement. Domains are named by their keyword. The practice subtitles
// are generated.

import { find, findPeer, hasClass, match, ordinal, sourceLines, unquote, VIA_POSITION, words, type DiagramAdapter } from './shared.ts';

const DOMAINS = ['complex', 'complicated', 'chaotic', 'clear', 'confusion'];
const TRANSITION = /^(\w+)\s*-+>\s*(\w+)\s*(?::\s*(.*))?$/;

export const cynefinAdapter: DiagramAdapter = {
  peers: 'path.cynefinArrowLine',
  read(click) {
    const { items, transitions } = parse(click.source);
    const item = find(click, (element) => hasClass(element, 'cynefinItem') || hasClass(element, 'cynefinItemText'));
    if (item?.element.nth) {
      const found = items[item.element.nth.i];
      const names = items.map((other) => `${other.domain} ${other.name}`);
      return found ? match('item', words(`in ${found.domain}`, ordinal(names, item.element.nth.i)), found.name, item.index, VIA_POSITION) : null;
    }
    const arrow = findPeer(click, (element) => hasClass(element, 'cynefinArrowLine'));
    const label = find(click, (element) => hasClass(element, 'cynefinArrowLabel'));
    const k = arrow ? arrow.at : label?.element.nth?.i;
    if (k !== undefined) {
      const transition = transitions[k];
      const index = arrow ? arrow.index : label!.index;
      return transition ? match('transition', `${transition.from} → ${transition.to}`, transition.label, index, VIA_POSITION) : null;
    }
    const domain = find(click, (element) => hasClass(element, 'cynefinDomain') || hasClass(element, 'cynefinDomainLabel'));
    if (domain?.element.nth) {
      const name = DOMAINS[domain.element.nth.i];
      return name ? match('domain', name, null, domain.index, VIA_POSITION) : null;
    }
    const confusion = find(click, (element) => hasClass(element, 'cynefinConfusion'));
    return confusion ? match('domain', 'confusion', null, confusion.index, VIA_POSITION) : null;
  },
};

/** Items in drawing order (by domain, then source order), and the transitions in source order. */
function parse(source: string): {
  items: { domain: string; name: string }[];
  transitions: { from: string; to: string; label: string | null }[];
} {
  const byDomain = new Map<string, string[]>(DOMAINS.map((domain) => [domain, []]));
  const transitions: { from: string; to: string; label: string | null }[] = [];
  let domain: string | null = null;
  for (const { text } of sourceLines(source).slice(1)) {
    const transition = TRANSITION.exec(text);
    if (transition) {
      transitions.push({ from: transition[1]!, to: transition[2]!, label: transition[3] ? unquote(transition[3]) : null });
    } else if (byDomain.has(text)) {
      domain = text;
    } else if (domain && !/^(title|accTitle|accDescr)\b/.test(text)) {
      byDomain.get(domain)!.push(unquote(text));
    }
  }
  return { items: DOMAINS.flatMap((name) => byDomain.get(name)!.map((item) => ({ domain: name, name: item }))), transitions };
}
