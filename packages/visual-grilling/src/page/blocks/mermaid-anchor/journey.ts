// User journey: task k's line is `line.task-line#<P>task<k>`, the k-th task
// in the source. Its box, label, score face and actor dots follow the line in
// the drawing until the next task's line, so a click on any of them is named
// through the preceding task line. The legend lists the actors.

import type { SnapshotPeer } from '../../../core/anchor.ts';
import {
  classes,
  find,
  findPeer,
  hasClass,
  match,
  ordinal,
  sourceLines,
  VIA_NEIGHBOUR,
  VIA_POSITION,
  type DiagramAdapter,
} from './shared.ts';

const isActor = (peer: { tag: string; attrs: Record<string, string> }) => peer.tag === 'circle' && classes(peer).some((name) => /^actor-\d+$/.test(name));
const isFace = (peer: { tag: string; attrs: Record<string, string> }) => hasClass(peer, 'face') || hasClass(peer, 'mouth');
const isTaskLine = (peer: { tag: string; attrs: Record<string, string> }) => peer.tag === 'line' && hasClass(peer, 'task-line');
const isTaskPart = (peer: SnapshotPeer) =>
  isTaskLine(peer) || isActor(peer) || isFace(peer) || ((peer.tag === 'rect' || peer.tag === 'div' || peer.tag === 'text') && hasClass(peer, 'task'));

export const journeyAdapter: DiagramAdapter = {
  peers: 'line.task-line, rect.task, div.task, text.task, circle, path.mouth, line.mouth, text.legend',
  read(click) {
    const section = find(click, (element) => hasClass(element, 'journey-section'));
    if (section) {
      const name = click.chain.slice(section.index).find((element) => element.text)?.text ?? null;
      return match('section', null, name, section.index, VIA_POSITION);
    }
    const legend = find(click, (element) => element.tag === 'text' && hasClass(element, 'legend'));
    if (legend) return match('actor', legend.element.text, null, legend.index, VIA_POSITION);

    const part = findPeer(click, isTaskPart);
    if (!part) return null;
    const parts = click.peers.filter(isTaskPart);
    const k = parts.slice(0, part.at + 1).filter(isTaskLine).length - 1;
    if (k < 0 && isActor(part.element)) {
      // A legend dot: its name is the legend text after it.
      const at = click.peers.findIndex((peer) => peer === parts[part.at]);
      const name = click.peers.slice(at).find((peer) => hasClass(peer, 'legend'))?.text;
      return name ? match('actor', name, null, part.index, VIA_NEIGHBOUR) : null;
    }
    const tasks = taskLines(click.source);
    const task = tasks[k];
    if (!task) return null;
    const names = tasks.map((other) => other.name);
    const ref = ordinal(names, k);
    if (isTaskLine(part.element)) return match('task', ref, task.name, part.index, VIA_POSITION);
    if (isFace(part.element)) {
      return match('score', `${task.score} of task${ref ? ` ${ref}` : ''}`, task.name, part.index, VIA_NEIGHBOUR);
    }
    if (isActor(part.element)) {
      const actor = part.element.title ?? '';
      return match('actor', `${actor} of task${ref ? ` ${ref}` : ''}`.trim(), task.name, part.index, VIA_NEIGHBOUR);
    }
    return match('task', ref, task.name, part.index, VIA_NEIGHBOUR);
  },
};

/** `Name: score: actors` lines, in source order. */
function taskLines(source: string): { name: string; score: string }[] {
  return sourceLines(source).flatMap(({ text }) => {
    if (/^(title|section|accTitle|accDescr)\b/.test(text)) return [];
    const task = /^(.+?)\s*:\s*(\d+)\b/.exec(text);
    return task ? [{ name: task[1]!.trim(), score: task[2]! }] : [];
  });
}
