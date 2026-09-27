// The Graphviz library chunk: @viz-js/viz (Graphviz compiled to WebAssembly)
// and the one draw function both the round page and the server's draw check
// call. The build emits it as its own ESM file (page/graphviz.js); the page
// imports it lazily, and the server imports the same file. Graphviz needs no
// DOM, so the server draws it directly.

import { instance, type Viz } from '@viz-js/viz';
import { presetMarks, type DiagramTokens } from './theme.ts';

export { DARK_TOKENS, TOKEN_NAMES, type DiagramTokens } from './theme.ts';

export interface DotDrawing {
  svg: string;
}

/** Graphviz rejected the source: its first error, and the source line it names, if any. */
export class DotError extends Error {
  override name = 'DotError';
  constructor(
    message: string,
    readonly sourceLine?: number,
  ) {
    super(message);
  }
}

/** Thrown when Graphviz draws without error but nothing shows. */
export class EmptyDrawingError extends Error {
  override name = 'EmptyDrawingError';
}

const FONT = 'Helvetica,Arial,sans-serif';

let viz: Promise<Viz> | undefined;

/**
 * Draws one DOT source with the page's tokens as Graphviz defaults, so the
 * source's own attributes (colours, `layout=`) win. The layout engine is
 * `dot` unless the source sets `layout=`. `renderId` must be unique among
 * drawings on the page and a valid element id; it scopes the preset marks.
 *
 * Throws a `DotError` for what Graphviz rejects, an `EmptyDrawingError` when
 * nothing is drawn.
 */
export async function drawDot(renderId: string, source: string, tokens: DiagramTokens): Promise<DotDrawing> {
  const graphviz = await (viz ??= instance());
  let result: ReturnType<Viz['render']>;
  try {
    result = graphviz.render(source, {
      format: 'svg',
      engine: 'dot',
      graphAttributes: { bgcolor: 'transparent', fontname: FONT, fontcolor: tokens.fg, color: tokens.line },
      nodeAttributes: { fontname: FONT, fontcolor: tokens.fg, color: tokens.muted, fillcolor: tokens.panel, style: 'filled' },
      edgeAttributes: { fontname: FONT, fontcolor: tokens.fg, color: tokens.muted },
    });
  } catch (error) {
    // A crash inside the WebAssembly module can leave it unusable: start afresh next time.
    viz = undefined;
    throw error;
  }
  if (result.status === 'failure') {
    const errors = result.errors.filter((error) => error.level !== 'warning');
    const message = (errors[0] ?? result.errors[0])?.message.trim() || 'Graphviz could not draw the graph';
    const line = Number(/\bline (\d+)/.exec(message)?.[1]);
    throw new DotError(message, line > 0 ? line : undefined);
  }
  const empty = emptiness(result.output);
  if (empty) throw new EmptyDrawingError(empty);
  return { svg: forPage(result.output, renderId, tokens) };
}

/** Why an SVG shows nothing, or `undefined` when something is drawn. */
function emptiness(svg: string): string | undefined {
  const viewBox = /<svg\b[^>]*\bviewBox="([^"]*)"/.exec(svg)?.[1] ?? '';
  const [, , width, height] = viewBox.trim().split(/[\s,]+/).map(Number);
  if (!(Number(width) > 0) || !(Number(height) > 0)) return 'the graph came out empty (zero size)';
  // Graphviz writes nothing at all for what it doesn't draw (`style=invis`, no statements).
  const drawn = /<(?:ellipse|polygon|polyline|path|text|image)\b/.test(svg);
  return drawn ? undefined : 'the graph came out empty (nothing drawn)';
}

/**
 * Graphviz's SVG, made ready for the page: the prolog goes, the root gets
 * `renderId` and the preset marks, links lose their targets, and the element ids Graphviz writes on
 * graph, node, edge and cluster groups move to `data-id`, so the agent's ids
 * can't collide with the page's or another drawing's.
 */
function forPage(svg: string, renderId: string, tokens: DiagramTokens): string {
  const start = svg.indexOf('<svg');
  const body = svg
    .slice(start)
    .replace(/<g id="([^"]*)" class="(graph|node|edge|cluster)\b/g, '<g data-id="$1" class="$2')
    // `URL`/`href` attributes become links; a click on the drawing must never leave the round page.
    .replace(/\s(?:xlink:)?href="[^"]*"|\starget="[^"]*"/g, '')
    .replace(/<svg\b/, `<svg id="${renderId}"`);
  return body.replace(/(<svg\b[^>]*>)/, `$1\n<style>${presetStyle(renderId, tokens)}</style>`);
}

/**
 * The preset marks, used as `class=recommended` (or `risk`, `muted`) on a
 * node, edge or cluster. They recolour only what still has the page's default
 * colour, so a colour the agent set on the element itself wins.
 */
function presetStyle(id: string, t: DiagramTokens): string {
  const { recommended, risk, mutedOpacity } = presetMarks(t);
  const rules = (name: string, mark: typeof recommended) => {
    const scope = `#${id} :is(.node, .edge, .cluster).${name}`;
    return [
      `${scope} :is(polygon, ellipse, path, polyline)[fill="${t.panel}"] { fill: ${mark.fill}; }`,
      `${scope} :is(polygon, ellipse, path, polyline):is([stroke="${t.muted}"], [stroke="${t.line}"]) { stroke: ${mark.stroke}; stroke-width: ${mark.strokeWidth}; }`,
      `${scope} polygon[fill="${t.muted}"] { fill: ${mark.stroke}; }`,
    ].join('\n');
  };
  return [
    rules('recommended', recommended),
    rules('risk', risk),
    `#${id} .muted { opacity: ${mutedOpacity}; }`,
    // A cluster is unfilled by default; a mark tints it, as it does a Mermaid subgraph.
    `#${id} .cluster.recommended > :is(polygon, path)[fill="none"] { fill: ${recommended.fill}; }`,
    `#${id} .cluster.risk > :is(polygon, path)[fill="none"] { fill: ${risk.fill}; }`,
    // A cluster is unfilled by default; a click anywhere in its frame is still on it.
    `#${id} .cluster > :is(polygon, path) { pointer-events: all; }`,
  ].join('\n');
}
