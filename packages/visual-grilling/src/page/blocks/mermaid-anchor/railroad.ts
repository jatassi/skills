// Railroad diagrams, in all four dialects (IR, EBNF, ABNF, PEG): nothing
// carries an id. Rule k (`g.railroad-rule`) is the k-th rule, and its name
// text reads `<name> =`. Within a rule, terminals and non-terminals are drawn
// in source order, so a repeated symbol is told apart by its place:
// `nonterminal #2 in rule expression "term"`.

import { find, hasClass, match, ordinal, peerIndex, VIA_POSITION, type DiagramAdapter } from './shared.ts';

const SYMBOLS: [cls: string, kind: string][] = [
  ['railroad-terminal', 'terminal'],
  ['railroad-nonterminal', 'nonterminal'],
];
const isRule = (peer: { attrs: Record<string, string> }) => hasClass(peer, 'railroad-rule');

export const railroadAdapter: DiagramAdapter = {
  peers: 'g.railroad-rule, text.railroad-rule-name, g.railroad-terminal, g.railroad-nonterminal',
  read(click) {
    for (const [cls, kind] of SYMBOLS) {
      const symbol = find(click, (element) => element.tag === 'g' && hasClass(element, cls));
      if (!symbol) continue;
      const at = peerIndex(click, symbol.element);
      const start = click.peers.slice(0, at).findLastIndex(isRule);
      if (at < 0 || start < 0) return null;
      const next = click.peers.findIndex((peer, i) => i > start && isRule(peer));
      const inRule = click.peers.slice(start, next < 0 ? undefined : next).filter((peer) => hasClass(peer, cls));
      const ref = ordinal(
        inRule.map((peer) => peer.text),
        inRule.indexOf(click.peers[at]!),
      );
      return match(kind, `${ref ? `${ref} ` : ''}in rule ${ruleName(click.peers, start)}`, symbol.element.text, symbol.index, VIA_POSITION);
    }
    const rule = find(click, (element) => element.tag === 'g' && isRule(element));
    if (!rule) return null;
    const start = peerIndex(click, rule.element);
    return start < 0 ? null : match('rule', ruleName(click.peers, start), null, rule.index, VIA_POSITION);
  },
};

/** The name of the rule whose group is peers[start]: its name text follows its symbols. */
function ruleName(peers: { attrs: Record<string, string>; text: string }[], start: number): string {
  const name = peers.slice(start).find((peer) => hasClass(peer, 'railroad-rule-name'))?.text ?? '';
  return name.replace(/\s*(=|::=|<-|:)\s*$/, '');
}
