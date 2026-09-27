// Gantt: a task's bar is `rect#<P><taskId>` and its text `text#<P><taskId>-text`.
// A task the agent gave no id gets `task<k>` from Mermaid, which the agent
// never wrote, so it is named by its text alone. Section titles are text.

import { find, hasClass, match, unprefixed, type DiagramAdapter, type DiagramClick } from './shared.ts';

export const ganttAdapter: DiagramAdapter = {
  peers: 'text[id]',
  read(click) {
    const task = find(click, (element) => (element.tag === 'rect' || element.tag === 'text') && unprefixed(click, element.attrs.id) !== null);
    if (task) {
      const id = unprefixed(click, task.element.attrs.id)!.replace(/-text$/, '');
      const text =
        task.element.tag === 'text' ? task.element.text : click.peers.find((peer) => peer.attrs.id === `${click.prefix}${id}-text`)?.text;
      const milestone = hasClass(task.element, 'milestone') || hasClass(task.element, 'milestoneText');
      return match(milestone ? 'milestone' : 'task', writtenId(click, id), text ?? null, task.index);
    }
    const section = find(click, (element) => element.tag === 'text' && hasClass(element, 'sectionTitle'));
    return section ? match('section', null, section.element.text, section.index) : null;
  },
};

/** The task id, unless Mermaid made it up: a `task<k>` the source never gives as a task's id. */
function writtenId(click: DiagramClick, id: string): string | null {
  if (!/^task\d+$/.test(id)) return id;
  // After the task's colon, as one of its comma-separated metadata items.
  const given = new RegExp(`^[^:\\n]*:(?:[^\\n,]*,)*[ \\t]*${id}[ \\t]*(?:,|$)`, 'm');
  return given.test(click.source) ? id : null;
}
