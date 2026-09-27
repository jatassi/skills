// Tree view: labels carry no ids. Label 0 is a `/` root Mermaid adds; label
// k ≥ 1 is the k-th entry line of the source. Names repeat across folders
// (`a/index.js`, `b/index.js`), so the term is the entry's path, rebuilt from
// the source's indentation. The added root falls to the generic rules.

import { find, hasClass, match, sourceLines, VIA_POSITION, type DiagramAdapter } from './shared.ts';

export const treeViewAdapter: DiagramAdapter = {
  read(click) {
    const label = find(click, (element) => element.tag === 'text' && hasClass(element, 'treeView-node-label'));
    if (!label?.element.nth || label.element.nth.i < 1) return null;
    const path = paths(click.source)[label.element.nth.i - 1];
    if (path === undefined) return null;
    return match(hasClass(label.element, 'treeView-node-dir') ? 'folder' : 'file', null, path, label.index, VIA_POSITION);
  },
};

/** Each entry line's path from the top, `my-project/src/App.tsx`, in source order. */
function paths(source: string): string[] {
  const stack: { indent: number; name: string }[] = [];
  return sourceLines(source)
    .slice(1)
    .map(({ text, indent }) => {
      while (stack.length > 0 && stack.at(-1)!.indent >= indent) stack.pop();
      stack.push({ indent, name: text.replace(/\/$/, '') });
      return stack.map((entry) => entry.name).join('/');
    });
}
