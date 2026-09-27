// Quadrant chart: points and quadrants carry no ids. Points are drawn in
// reverse source order, each `g.data-point` holding its circle and name; the
// quadrants come in quadrant-1…4 order. Axis labels and the title are plain
// text, which the generic rules name.

import { find, hasClass, match, ordinal, sourceLines, unquote, VIA_POSITION, type DiagramAdapter } from './shared.ts';

export const quadrantAdapter: DiagramAdapter = {
  read(click) {
    const point = find(click, (element) => element.tag === 'g' && hasClass(element, 'data-point'));
    if (point?.element.nth) {
      const names = pointNames(click.source);
      const at = names.length - 1 - point.element.nth.i;
      const name = names[at];
      return name === undefined ? null : match('point', ordinal(names, at), name, point.index, VIA_POSITION);
    }
    const quadrant = find(click, (element) => element.tag === 'g' && hasClass(element, 'quadrant'));
    if (quadrant?.element.nth) {
      return match(`quadrant-${quadrant.element.nth.i + 1}`, null, quadrant.element.text, quadrant.index, VIA_POSITION);
    }
    return null;
  },
};

/** Each `Name: [x, y]` point's name, in source order. */
function pointNames(source: string): string[] {
  return sourceLines(source).flatMap(({ text }) => {
    const point = /^(.+?)(?::::[\w-]+)?\s*:\s*\[/.exec(text);
    return point ? [unquote(point[1]!)] : [];
  });
}
