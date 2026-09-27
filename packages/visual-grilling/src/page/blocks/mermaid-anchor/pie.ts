// Pie: slices, their percentages and legend entries carry no ids, so they are
// matched by position. Mermaid keeps each label's first value, leaves out
// slices under 1% of the total, and draws the rest in source order; the
// legend lists every label, left-out ones too. A left-out slice can't be
// clicked at all.

import { find, hasClass, match, sourceLines, VIA_POSITION, type DiagramAdapter } from './shared.ts';

export const pieAdapter: DiagramAdapter = {
  read(click) {
    const { labels, drawn } = slices(click.source);
    const slice = find(click, (element) => hasClass(element, 'pieCircle') || (element.tag === 'text' && hasClass(element, 'slice')));
    if (slice?.element.nth) {
      const label = drawn[slice.element.nth.i];
      return label === undefined ? null : match('slice', null, label, slice.index, VIA_POSITION);
    }
    const legend = find(click, (element) => element.tag === 'g' && hasClass(element, 'legend'));
    if (legend?.element.nth) {
      const label = labels[legend.element.nth.i];
      return label === undefined ? null : match('legend entry', null, label, legend.index, VIA_POSITION);
    }
    return null;
  },
};

/** Every distinct label in source order, and the ones drawn as slices. */
export function slices(source: string): { labels: string[]; drawn: string[] } {
  const values = new Map<string, number>();
  for (const { text } of sourceLines(source)) {
    const slice = /^"(.*)"\s*:\s*([\d.]+)/.exec(text);
    if (slice && !values.has(slice[1]!)) values.set(slice[1]!, Number(slice[2]));
  }
  const sum = [...values.values()].reduce((total, value) => total + value, 0);
  return {
    labels: [...values.keys()],
    drawn: [...values].filter(([, value]) => (value / sum) * 100 >= 1).map(([label]) => label),
  };
}
