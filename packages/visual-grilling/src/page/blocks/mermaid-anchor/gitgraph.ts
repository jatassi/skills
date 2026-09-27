// Git graphs: a commit circle's classes hold its id (`commit a3f82c1 commit0`).
// A commit with no id gets `<seq>-<random hex>`, which changes on every draw,
// so it is named by its place instead: `commit #3` is the third commit or
// merge in the source. Branch and tag labels show their names.

import { classes, find, hasClass, match, type DiagramAdapter } from './shared.ts';

const NOT_ID = new Set(['commit', 'commit-merge', 'commit-highlight', 'commit-reverse', 'commit-cherry-pick']);

export const gitGraphAdapter: DiagramAdapter = {
  peers: 'g.branchLabel g.label',
  read(click) {
    const commit = find(click, (element) => (element.tag === 'circle' || element.tag === 'rect') && hasClass(element, 'commit'));
    if (commit) {
      // An id with spaces spreads over several class names.
      const id = classes(commit.element).filter((name) => !NOT_ID.has(name) && !/^commit\d+$/.test(name)).join(' ');
      return id ? match('commit', commitRef(id), null, commit.index) : null;
    }
    const label = find(click, (element) => element.tag === 'text' && hasClass(element, 'commit-label'));
    if (label) return match('commit', commitRef(label.element.text), null, label.index);
    const tag = find(click, (element) => element.tag === 'text' && hasClass(element, 'tag-label'));
    if (tag) return match('tag', tag.element.text, null, tag.index);
    const branch = find(click, (element) => hasClass(element, 'branchLabel'));
    if (branch) return match('branch', branch.element.text, null, branch.index);

    const line = find(click, (element) => element.tag === 'line' && hasClass(element, 'branch'));
    const order = line && classes(line.element).find((name) => /^branch\d+$/.test(name));
    const name = order && click.peers.find((peer) => hasClass(peer, `branch-label${order.slice('branch'.length)}`))?.text;
    return line && name ? match('branch', name, null, line.index) : null;
  },
};

function commitRef(id: string): string {
  const generated = /^(\d+)-[0-9a-f]{7}$/.exec(id);
  return generated ? `#${Number(generated[1]) + 1}` : id;
}
