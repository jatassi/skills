// Event modeling: box k (`g.em-box`) is the k-th `tf` line, named by its frame
// number and its name. Swimlane headers are generated, and most relations are
// inferred from frame order rather than written, so both fall to the generic
// rules.

import { find, hasClass, match, sourceLines, VIA_POSITION, type DiagramAdapter } from './shared.ts';

export const eventModelingAdapter: DiagramAdapter = {
  read(click) {
    const box = find(click, (element) => element.tag === 'g' && hasClass(element, 'em-box'));
    if (!box?.element.nth) return null;
    const frame = frames(click.source)[box.element.nth.i];
    return frame ? match('frame', frame.number, frame.name, box.index, VIA_POSITION) : null;
  },
};

/** `tf <number> <type> <name>` lines, in source order. */
function frames(source: string): { number: string; name: string }[] {
  return sourceLines(source).flatMap(({ text }) => {
    const frame = /^tf\s+(\S+)\s+\S+\s+(\S+)/.exec(text);
    return frame ? [{ number: frame[1]!, name: frame[2]! }] : [];
  });
}
