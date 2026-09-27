// The Vega-Lite library chunk: Vega 6 and Vega-Lite 6, and the one draw
// function both the round page and the server's draw check call. The build
// emits it as its own ESM file (page/vega-lite.js); the page imports it
// lazily, and the server imports the same file, so a chart draws with exactly
// the same code and the same safe settings in both places:
//
//   - the source is JSON with inline data only (no URL data, no raw Vega);
//   - Vega parses expressions to an AST (`ast: true`) and evaluates them with
//     the interpreter, so nothing needs eval under the page's strict CSP;
//   - the loader rejects every URL, so nothing is fetched.

import * as vega from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import { compile, type Config, type TopLevelSpec } from 'vega-lite';

/** The page's design tokens (hex colours) that drive the chart `config`, by CSS custom property name. */
export const TOKEN_NAMES = ['canvas', 'panel', 'line', 'fg', 'muted', 'accent', 'answered', 'unsure', 'risk'] as const;
export type ChartTokens = Record<(typeof TOKEN_NAMES)[number], string>;

/** The dark tokens, for draws with no page around them (the server's check). */
export const DARK_TOKENS: ChartTokens = {
  canvas: '#0d1117',
  panel: '#161b22',
  line: '#30363d',
  fg: '#e6edf3',
  muted: '#8b949e',
  accent: '#2f81f7',
  answered: '#3fb950',
  unsure: '#d29922',
  risk: '#f85149',
};

/**
 * The colour scheme holding the preset marks, in `PRESET_MARKS` order. A
 * chart uses it as
 * `"scale": {"domain": ["recommended", "risk", "muted"], "scheme": "marks"}`.
 */
const MARKS_SCHEME = 'marks';
const PRESET_MARKS = {
  recommended: (t: ChartTokens) => t.answered,
  risk: (t: ChartTokens) => t.risk,
  muted: (t: ChartTokens) => t.muted,
};

const SCHEMA = 'https://vega.github.io/schema/vega-lite/v6.json';

/** Thrown when the source isn't a chart the page will draw: not JSON, URL data, or raw Vega. */
export class ChartSourceError extends Error {
  override name = 'ChartSourceError';
  /** The source line to point at, 1-based, when there is one. */
  constructor(
    message: string,
    readonly sourceLine?: number,
  ) {
    super(message);
  }
}

/** Thrown when the chart draws without error but no mark shows. */
export class EmptyDrawingError extends Error {
  override name = 'EmptyDrawingError';
}

interface ChartDrawing {
  svg: string;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Draws one chart as SVG. Throws a `ChartSourceError` for a source the page
 * won't draw, an `EmptyDrawingError` when no mark comes out, and otherwise
 * what Vega-Lite or Vega throws or logs as an error (a bad expression, a
 * missing field).
 *
 * The preset-marks scheme is global to Vega, so draws run one at a time.
 */
export function drawVegaLite(source: string, tokens: ChartTokens): Promise<ChartDrawing> {
  const run = queue.then(() => draw(source, tokens));
  queue = run.catch(() => undefined);
  return run;
}

async function draw(source: string, tokens: ChartTokens): Promise<ChartDrawing> {
  const spec = readSpec(source);
  vega.scheme(MARKS_SCHEME, Object.values(PRESET_MARKS).map((colour) => colour(tokens)));

  const errors: string[] = [];
  const logger = collectingLogger(errors);
  let view: vega.View;
  try {
    const compiled = compile(spec, { config: pageConfig(tokens), logger }).spec;
    view = new vega.View(vega.parse(compiled, undefined, { ast: true }), {
      expr: expressionInterpreter,
      loader: noUrls(),
      renderer: 'none',
      logger,
      logLevel: vega.Warn,
    });
    await view.runAsync();
  } catch (error) {
    // Vega often logs the real cause before a later step trips over it.
    throw new Error(errors[0] ?? messageOf(error));
  }
  // A dataflow error (datum.a.b on a missing field) is logged, not thrown.
  if (errors[0]) throw new Error(errors[0]);
  if (!drawsAMark((view.scenegraph() as unknown as { root: unknown }).root)) throw new EmptyDrawingError('the chart came out empty (no marks drawn): check its fields and filters');
  const svg = await view.toSVG();
  view.finalize();
  return { svg };
}

// ------------------------------------------------------------ the source

/** Parses and checks the source; the page adds `$schema`. */
function readSpec(source: string): TopLevelSpec {
  let spec: unknown;
  try {
    spec = JSON.parse(source);
  } catch (error) {
    throw new ChartSourceError(`the chart must be JSON: ${messageOf(error)}`, jsonErrorLine(source, error));
  }
  if (!isObject(spec)) throw new ChartSourceError('the chart must be a JSON object: a Vega-Lite spec');

  const schema = typeof spec.$schema === 'string' ? spec.$schema : '';
  const vegaLiteView = ['mark', 'layer', 'concat', 'hconcat', 'vconcat', 'facet', 'repeat', 'spec'].some((key) => key in spec);
  if (/\/schema\/vega\/v/.test(schema) || (!vegaLiteView && ['marks', 'signals', 'scales', 'axes'].some((key) => key in spec))) {
    throw new ChartSourceError('raw Vega is not supported: write a Vega-Lite spec (mark, layer, concat, facet or repeat)');
  }

  const bad = badData(spec);
  if (bad) throw new ChartSourceError(bad.message, lineOf(source, bad.line));
  return { ...spec, $schema: SCHEMA } as TopLevelSpec;
}

/**
 * The first `data` object anywhere in the spec (top level, layers, lookups…)
 * the page won't read: URL data, which is never loaded, and inline CSV or
 * TSV, whose parser compiles code at runtime and so can't run under the
 * page's CSP.
 */
function badData(node: unknown): { message: string; line: RegExp } | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = badData(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!isObject(node)) return undefined;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'data' && isObject(value)) {
      if ('url' in value) {
        return {
          message: `data must be inline in data.values; URL data (${JSON.stringify(value.url)}) is never loaded`,
          line: /"url"\s*:/,
        };
      }
      const format = isObject(value.format) ? value.format.type : undefined;
      if (typeof value.values === 'string' && typeof format === 'string' && ['csv', 'tsv', 'dsv'].includes(format)) {
        return {
          message: `inline ${format.toUpperCase()} can't be parsed under the page's security policy; write data.values as JSON rows`,
          line: /"values"\s*:/,
        };
      }
    }
    // Rows are the agent's data, not spec: a row may have a `data` field.
    if (key === 'values' || key === 'datasets' || key === 'usermeta') continue;
    const found = badData(value);
    if (found) return found;
  }
  return undefined;
}

/** V8 says where JSON broke as `(line 3 column 5)` or `at position 42`. */
function jsonErrorLine(source: string, error: unknown): number | undefined {
  const message = messageOf(error);
  const line = /\(line (\d+) column \d+\)/.exec(message);
  if (line) return Number(line[1]);
  const position = /at position (\d+)/.exec(message);
  if (position) return source.slice(0, Number(position[1])).split('\n').length;
  return undefined;
}

function lineOf(source: string, pattern: RegExp): number | undefined {
  const index = source.split('\n').findIndex((line) => pattern.test(line));
  return index >= 0 ? index + 1 : undefined;
}

// ------------------------------------------------------------ the drawing

/** A loader that refuses every URL: charts carry their data inline. */
function noUrls(): ReturnType<typeof vega.loader> {
  const loader = vega.loader();
  loader.sanitize = (uri: string) => Promise.reject(new Error(`charts load nothing, and "${uri}" is a URL`));
  return loader;
}

/** True when some data mark (not an axis, legend or title) has at least one item. */
function drawsAMark(node: unknown): boolean {
  if (!isObject(node)) return false;
  const items = Array.isArray(node.items) ? node.items : [];
  if (typeof node.marktype === 'string' && node.role === 'mark' && node.marktype !== 'group' && items.length > 0) return true;
  return items.some(drawsAMark);
}

/** Records errors (for the throw) and drops everything else. Both Vega-Lite and Vega take it. */
function collectingLogger(errors: string[]): vega.LoggerInterface {
  let level = vega.Warn;
  const logger: vega.LoggerInterface = {
    level(value?: number) {
      if (value === undefined) return level;
      level = value;
      return logger;
    },
    error(...args: readonly unknown[]) {
      errors.push(args.map(messageOf).join(' '));
      return logger;
    },
    warn: () => logger,
    info: () => logger,
    debug: () => logger,
  } as vega.LoggerInterface;
  return logger;
}

// ------------------------------------------------------------------ theme

/** The page's tokens as a Vega-Lite `config`; a chart's own `config` merges over it. */
function pageConfig(t: ChartTokens): Config {
  const font = "system-ui, -apple-system, 'Segoe UI', sans-serif";
  return {
    background: 'transparent',
    font,
    view: { stroke: t.line },
    mark: { color: t.accent },
    text: { color: t.fg },
    axis: {
      domainColor: t.line,
      gridColor: t.line,
      tickColor: t.line,
      labelColor: t.muted,
      titleColor: t.fg,
    },
    legend: { labelColor: t.muted, titleColor: t.fg },
    header: { labelColor: t.fg, titleColor: t.fg },
    title: { color: t.fg, subtitleColor: t.muted },
  };
}

// ---------------------------------------------------------------- helpers

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
