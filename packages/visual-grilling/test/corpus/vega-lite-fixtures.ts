// The Vega-Lite block corpus: specs the Node draw check and Chromium (under
// the round page's CSP) must give the same verdict on, and, for charts that
// draw, the anchor terms a click on each listed mark must produce. Every
// mismatch found in use becomes a fixture here.
//
// Dates are written in local time ("2026-01-01T00:00"): Vega parses a bare
// ISO date ("2026-01-01") as UTC and shows it in local time, so a chart's
// labels (and its anchor terms) would depend on the viewer's time zone.
//
// Found while building it: Vega's CSV/TSV parser (d3-dsv) compiles a row
// converter with `new Function`, which the page's CSP blocks while Node runs
// it happily. Inline CSV is rejected at `present` for that reason.

export type Verdict = 'draws' | 'throws' | 'empty';

export interface VegaLiteFixture {
  name: string;
  /** The spec: an object is written as JSON; a string is written as is. */
  spec: object | string;
  verdict: Verdict;
  /** What `present` must say, for a chart that doesn't draw. */
  says?: RegExp;
  /** For a chart that draws: marks to click, by their anchor term, e.g. `bar "runtime: Bun; ms: 60"`. */
  anchors?: string[];
}

const runtimes = {
  values: [
    { runtime: 'Bun', ms: 60 },
    { runtime: 'Node', ms: 120 },
    { runtime: 'Deno', ms: 90 },
  ],
};

const runtimeBars = {
  x: { field: 'runtime', type: 'nominal' },
  y: { field: 'ms', type: 'quantitative' },
};

const monthly = {
  values: [
    { month: '2026-01-01T00:00', region: 'EU', cost: 12 },
    { month: '2026-01-01T00:00', region: 'US', cost: 20 },
    { month: '2026-02-01T00:00', region: 'EU', cost: 15 },
    { month: '2026-02-01T00:00', region: 'US', cost: 18 },
    { month: '2026-03-01T00:00', region: 'EU', cost: 11 },
    { month: '2026-03-01T00:00', region: 'US', cost: 25 },
  ],
};

export const VEGA_LITE_FIXTURES: VegaLiteFixture[] = [
  // ------------------------------------------------------------- draws
  {
    name: 'bar',
    verdict: 'draws',
    spec: { data: runtimes, mark: 'bar', encoding: runtimeBars },
    anchors: ['bar "runtime: Bun; ms: 60"', 'bar "runtime: Deno; ms: 90"'],
  },
  {
    name: 'bar sorted by value, with the preset marks scheme',
    verdict: 'draws',
    spec: {
      data: {
        values: [
          { option: 'A', score: 7, mark: 'recommended' },
          { option: 'B', score: 4, mark: 'risk' },
          { option: 'C', score: 5, mark: 'muted' },
        ],
      },
      mark: 'bar',
      encoding: {
        y: { field: 'option', type: 'nominal', sort: '-x' },
        x: { field: 'score', type: 'quantitative' },
        color: { field: 'mark', type: 'nominal', scale: { domain: ['recommended', 'risk', 'muted'], scheme: 'marks' }, legend: null },
      },
    },
    anchors: ['bar "score: 7; option: A; mark: recommended"', 'bar "score: 4; option: B; mark: risk"'],
  },
  {
    name: 'stacked bar over time (timeUnit, aggregate, stack)',
    verdict: 'draws',
    spec: {
      data: monthly,
      mark: 'bar',
      encoding: {
        x: { timeUnit: 'month', field: 'month', type: 'ordinal', title: 'Month' },
        y: { aggregate: 'sum', field: 'cost', type: 'quantitative', title: 'Cost (k$)' },
        color: { field: 'region', type: 'nominal' },
      },
    },
    anchors: ['bar "Month: Jan; Cost (k$): 20; region: US"'],
  },
  {
    name: 'line with points',
    verdict: 'draws',
    spec: {
      data: monthly,
      mark: { type: 'line', point: true },
      encoding: {
        x: { field: 'month', type: 'temporal', title: 'Month' },
        y: { field: 'cost', type: 'quantitative', title: 'Cost' },
        color: { field: 'region', type: 'nominal' },
      },
    },
    anchors: ['point "Month: Feb 01, 2026; Cost: 18; region: US"'],
  },
  {
    name: 'scatter with a calculated field and a filter',
    verdict: 'draws',
    spec: {
      data: runtimes,
      transform: [{ calculate: 'datum.ms / 1000', as: 'seconds' }, { filter: 'datum.seconds < 0.1' }],
      mark: 'point',
      encoding: { x: { field: 'runtime', type: 'nominal' }, y: { field: 'seconds', type: 'quantitative' } },
    },
    anchors: ['point "runtime: Bun; seconds: 0.06"'],
  },
  {
    name: 'arc (pie)',
    verdict: 'draws',
    spec: {
      data: runtimes,
      mark: 'arc',
      encoding: { theta: { field: 'ms', type: 'quantitative' }, color: { field: 'runtime', type: 'nominal' } },
    },
    anchors: ['arc "ms: 120; runtime: Node"'],
  },
  {
    name: 'layer: bars with a rule and text labels',
    verdict: 'draws',
    spec: {
      data: runtimes,
      layer: [
        { mark: 'bar', encoding: runtimeBars },
        { mark: { type: 'text', dy: -6 }, encoding: { ...runtimeBars, text: { field: 'ms' } } },
        { mark: 'rule', encoding: { y: { datum: 100 } } },
      ],
    },
    anchors: ['bar "runtime: Node; ms: 120"'],
  },
  {
    name: 'histogram (bin) with window and fold transforms',
    verdict: 'draws',
    spec: {
      data: { values: [{ a: 1, b: 3 }, { a: 2, b: 5 }, { a: 2, b: 8 }, { a: 7, b: 1 }] },
      transform: [
        { fold: ['a', 'b'], as: ['key', 'value'] },
        { window: [{ op: 'rank', as: 'rank' }], sort: [{ field: 'value', order: 'descending' }] },
      ],
      mark: 'bar',
      encoding: { x: { bin: true, field: 'value' }, y: { aggregate: 'count' } },
    },
  },
  {
    name: 'faceted heatmap with a lookup from inline datasets',
    verdict: 'draws',
    spec: {
      datasets: { names: [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }] },
      data: { values: [{ id: 1, day: 'Mon', load: 3 }, { id: 2, day: 'Mon', load: 5 }, { id: 1, day: 'Tue', load: 4 }] },
      transform: [{ lookup: 'id', from: { data: { name: 'names' }, key: 'id', fields: ['name'] } }],
      mark: 'rect',
      encoding: {
        x: { field: 'day', type: 'ordinal' },
        y: { field: 'name', type: 'nominal' },
        color: { field: 'load', type: 'quantitative' },
      },
    },
    anchors: ['rect "day: Mon; name: Beta; load: 5"'],
  },
  {
    name: 'boxplot',
    verdict: 'draws',
    spec: {
      data: { values: [1, 2, 3, 4, 5, 9, 12].map((v) => ({ group: 'g', v })) },
      mark: 'boxplot',
      encoding: { x: { field: 'group', type: 'nominal' }, y: { field: 'v', type: 'quantitative' } },
    },
  },
  {
    name: "the agent's own $schema and config",
    verdict: 'draws',
    spec: {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      config: { mark: { color: '#ff00ff' }, axis: { labelFontSize: 14 } },
      data: runtimes,
      mark: 'bar',
      encoding: runtimeBars,
    },
    anchors: ['bar "runtime: Node; ms: 120"'],
  },

  // ------------------------------------------------------------ throws
  {
    name: 'not JSON',
    verdict: 'throws',
    spec: '{"data": {"values": []}, mark: "bar"}',
    says: /the chart must be JSON/,
  },
  {
    name: 'URL data in a layer',
    verdict: 'throws',
    spec: { layer: [{ data: { url: 'data/cars.json' }, mark: 'point' }] },
    says: /URL data \("data\/cars\.json"\) is never loaded/,
  },
  {
    name: 'URL data in a lookup',
    verdict: 'throws',
    spec: {
      data: runtimes,
      transform: [{ lookup: 'runtime', from: { data: { url: 'https://example.com/x.csv' }, key: 'r', fields: ['v'] } }],
      mark: 'bar',
      encoding: runtimeBars,
    },
    says: /URL data/,
  },
  {
    name: 'raw Vega',
    verdict: 'throws',
    spec: { marks: [{ type: 'rect' }], scales: [] },
    says: /raw Vega is not supported/,
  },
  {
    name: 'inline CSV',
    verdict: 'throws',
    spec: { data: { values: 'runtime,ms\nBun,60', format: { type: 'csv' } }, mark: 'bar', encoding: runtimeBars },
    says: /inline CSV can't be parsed/,
  },
  {
    name: 'a bad expression',
    verdict: 'throws',
    spec: { data: runtimes, transform: [{ calculate: 'datum.ms +* 2', as: 'z' }], mark: 'bar', encoding: runtimeBars },
    says: /Vega-Lite failed to draw it: Unexpected token/,
  },
  {
    name: 'an unknown function',
    verdict: 'throws',
    spec: { data: runtimes, transform: [{ calculate: 'fetch("x")', as: 'z' }], mark: 'bar', encoding: runtimeBars },
    says: /Unrecognized function: fetch/,
  },
  {
    name: 'a field of a missing field',
    verdict: 'throws',
    spec: { data: runtimes, transform: [{ calculate: 'datum.cost.usd', as: 'z' }], mark: 'bar', encoding: runtimeBars },
    says: /Cannot read properties of undefined/,
  },
  {
    name: 'an unknown colour scheme',
    verdict: 'throws',
    spec: { data: runtimes, mark: 'bar', encoding: { ...runtimeBars, color: { field: 'runtime', scale: { scheme: 'nosuch' } } } },
    says: /Unrecognized scheme name: nosuch/,
  },

  // ------------------------------------------------------------- empty
  {
    name: 'a filter that drops every row',
    verdict: 'empty',
    spec: { data: runtimes, transform: [{ filter: 'datum.ms > 1000' }], mark: 'bar', encoding: runtimeBars },
  },
  {
    name: 'no rows',
    verdict: 'empty',
    spec: { data: { values: [] }, mark: 'bar', encoding: runtimeBars },
  },
  {
    name: 'a missing quantitative field',
    verdict: 'empty',
    spec: { data: runtimes, mark: 'bar', encoding: { ...runtimeBars, y: { field: 'cost', type: 'quantitative' } } },
  },
];

export function sourceOf(fixture: VegaLiteFixture): string {
  return typeof fixture.spec === 'string' ? fixture.spec : JSON.stringify(fixture.spec, null, 2);
}
