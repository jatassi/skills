// XY chart: plot p is `g.bar-plot-<p>` or `g.line-plot-<p>`, p counting the
// source's `bar` and `line` statements together. Bar j of a bar plot is
// x-axis category j. A line is one path with no per-point elements, so a
// click on it is matched by geometry: the category whose axis label is
// nearest along the category axis (the x axis, or the y axis when the chart
// is horizontal). Axis ticks and value labels are generated, and fall to the
// generic rules.

import type { AdapterMatch } from '../../../core/anchor.ts';
import { find, match, peerAt, sourceLines, unquote, VIA_GEOMETRY, VIA_POSITION, type DiagramAdapter, type DiagramClick } from './shared.ts';

const PLOT = /^(bar|line)-plot-(\d+)$/;
const plotOf = (element: { attrs: Record<string, string> }) => PLOT.exec(element.attrs.class?.trim() ?? '');

export const xyChartAdapter: DiagramAdapter = {
  peers: '[class^="bar-plot-"], [class^="bar-plot-"] > rect',
  read(click) {
    const plot = find(click, (element) => element.tag === 'g' && plotOf(element) !== null);
    if (!plot || plot.index === 0) return null;
    const [, kind, number] = plotOf(plot.element)!;
    const chart = parse(click.source);
    const statement = chart.plots[Number(number)];
    if (!statement || statement.kind !== kind) return null;
    const ref = chart.plots.filter((other) => other.kind === kind).length > 1 ? `#${statement.rank}` : null;
    const clicked = click.chain[plot.index - 1]!;
    return kind === 'bar'
      ? barMatch(click, chart, statement, ref, plot.index - 1)
      : lineMatch(click, chart, statement, ref, plot.index - 1, clicked.tag === 'path');
  },
};

interface Plot {
  kind: string;
  /** 1-based, among statements of its kind. */
  rank: number;
  values: string[];
}

interface Chart {
  horizontal: boolean;
  categories: string[];
  plots: Plot[];
}

function barMatch(click: DiagramClick, chart: Chart, plot: Plot, ref: string | null, chainIndex: number): AdapterMatch | null {
  // Bars and their plot groups, in drawing order: count the bars since this plot's group.
  const isBarPart = (peer: { tag: string; attrs: Record<string, string> }) => peer.tag === 'rect' || /^bar-plot-/.test(peer.attrs.class ?? '');
  const at = peerAt(click, click.chain[chainIndex]!, isBarPart);
  if (at < 0) return null;
  const parts = click.peers.filter(isBarPart);
  const start = parts.slice(0, at).findLastIndex((peer) => peer.tag === 'g');
  return match('bar', ref, point(chart, plot, at - start - 1), chainIndex, VIA_POSITION);
}

function lineMatch(click: DiagramClick, chart: Chart, plot: Plot, ref: string | null, chainIndex: number, onLine: boolean): AdapterMatch | null {
  if (!onLine) return null;
  // The category whose axis label is nearest the click along the category axis.
  const along = (box: { x: number; y: number; w: number; h: number }) => (chart.horizontal ? box.y + box.h / 2 : box.x + box.w / 2);
  const position = chart.horizontal ? click.snapshot.click.y : click.snapshot.click.x;
  let best = -1;
  let distance = Infinity;
  for (const [j, category] of chart.categories.entries()) {
    const label = click.snapshot.texts.find((text) => text.svg === click.snapshot.clickSvg && text.text === category);
    if (!label) continue;
    const gap = Math.abs(along(label.box) - position);
    if (gap < distance) [best, distance] = [j, gap];
  }
  if (best < 0) return match('line', ref, null, chainIndex, VIA_POSITION);
  return match('line point', ref, point(chart, plot, best), chainIndex, VIA_GEOMETRY);
}

/** `category: value`, or `#j: value` when the x axis has no categories. */
function point(chart: Chart, plot: Plot, j: number): string {
  const name = chart.categories[j] ?? `#${j + 1}`;
  const value = plot.values[j];
  return value === undefined ? name : `${name}: ${value}`;
}

function parse(source: string): Chart {
  const [header, ...lines] = sourceLines(source);
  const chart: Chart = { horizontal: /\bhorizontal\b/.test(header?.text ?? ''), categories: [], plots: [] };
  const ranks: Record<string, number> = {};
  for (const { text } of lines) {
    const axis = /^x-axis\b.*\[(.*)\]/.exec(text);
    if (axis) chart.categories = list(axis[1]!);
    const plot = /^(bar|line)\b.*\[(.*)\]/.exec(text);
    if (plot) {
      const kind = plot[1]!;
      ranks[kind] = (ranks[kind] ?? 0) + 1;
      chart.plots.push({ kind, rank: ranks[kind]!, values: list(plot[2]!) });
    }
  }
  return chart;
}

/** A bracketed list's items: `a, "b c", 3` → a, b c, 3. */
function list(items: string): string[] {
  return (items.match(/\s*(?:"[^"]*"|[^,]+)/g) ?? []).map((item) => unquote(item)).filter(Boolean);
}
