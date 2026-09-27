// Ishikawa: the effect, categories (`g.ishikawa-label-group`) and causes
// (`g.ishikawa-sub-group`) carry no ids. Categories come in source order,
// each followed by its causes: siblings in reverse source order, each cause
// followed by its own causes. The term is the cause's path from its
// category, rebuilt from the source's indentation.

import { find, findPeer, hasClass, match, ordinal, sourceLines, VIA_POSITION, type DiagramAdapter } from './shared.ts';

interface Cause {
  name: string;
  indent: number;
  children: Cause[];
}

const isPart = (element: { tag: string; attrs: Record<string, string> }) =>
  element.tag === 'g' && (hasClass(element, 'ishikawa-label-group') || hasClass(element, 'ishikawa-sub-group'));

export const ishikawaAdapter: DiagramAdapter = {
  peers: 'g.ishikawa-label-group, g.ishikawa-sub-group',
  read(click) {
    const { effect, categories } = parse(click.source);
    const head = find(click, (element) => hasClass(element, 'ishikawa-head-group'));
    if (head) return match('effect', null, effect, head.index, VIA_POSITION);

    const part = findPeer(click, isPart);
    if (!part) return null;
    const drawn = categories.flatMap((category) => [[category.name], ...reversed(category.children, [category.name])]);
    const path = drawn[part.at];
    if (!path) return null;
    const paths = drawn.map((other) => other.join(' / '));
    const kind = path.length === 1 ? 'category' : 'cause';
    return match(kind, ordinal(paths, part.at), path.join(' / '), part.index, VIA_POSITION);
  },
};

/** Causes in drawing order, as paths: siblings last-first, each followed by its own causes. */
function reversed(causes: Cause[], above: string[]): string[][] {
  return [...causes].reverse().flatMap((cause) => {
    const path = [...above, cause.name];
    return [path, ...reversed(cause.children, path)];
  });
}

/** The effect (the first line) and the tree of categories and causes under it, by indentation. */
function parse(source: string): { effect: string | null; categories: Cause[] } {
  const [, first, ...rest] = sourceLines(source);
  const root: Cause = { name: '', indent: -1, children: [] };
  const stack = [root];
  for (const { text, indent } of rest) {
    while (stack.length > 1 && stack.at(-1)!.indent >= indent) stack.pop();
    const cause = { name: text, indent, children: [] };
    stack.at(-1)!.children.push(cause);
    stack.push(cause);
  }
  return { effect: first?.text ?? null, categories: root.children };
}
