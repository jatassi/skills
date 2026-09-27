// The Mermaid library chunk: Mermaid 12 with ELK, and the one draw function
// both the round page and the server's draw check call. The build emits it as
// its own ESM file (page/mermaid.js); the page imports it lazily, and the
// server imports the same file after installing jsdom globals, so a block
// draws with exactly the same code in both places.

import elkLayouts from '@mermaid-js/layout-elk';
import mermaid, { type MermaidConfig } from 'mermaid';

mermaid.registerLayoutLoaders(elkLayouts);

/** The page's design tokens (hex colours) that drive Mermaid's `base` theme, by CSS custom property name. */
export const TOKEN_NAMES = ['canvas', 'panel', 'line', 'fg', 'muted', 'accent', 'answered', 'unsure', 'risk'] as const;
export type MermaidTokens = Record<(typeof TOKEN_NAMES)[number], string>;

/** The page's dark tokens (app.css), for draws with no page around them (the server's check). */
export const DARK_TOKENS: MermaidTokens = {
  canvas: '#0e1014',
  panel: '#151820',
  line: '#2a303b',
  fg: '#e7eaf0',
  muted: '#a0a8b6',
  accent: '#5b95ff',
  answered: '#49c27a',
  unsure: '#e5a843',
  risk: '#f0655b',
};

/**
 * Types whose layout ELK supports well. Every other type keeps its own
 * default (mindmap, for one, throws under ELK even with a single node).
 */
const GRAPH_FAMILY = new Set(['flowchart', 'flowchart-v2', 'flowchart-elk', 'stateDiagram', 'classDiagram', 'er']);

export interface MermaidDrawing {
  svg: string;
  /** Mermaid's name for the diagram type, e.g. `flowchart-v2`. */
  diagramType: string;
}

/** Thrown when Mermaid draws without error but nothing shows. */
export class EmptyDrawingError extends Error {
  override name = 'EmptyDrawingError';
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Draws one diagram. Throws what Mermaid throws, or an `EmptyDrawingError`
 * when the SVG has nothing drawn in it or no size. `renderId` must be unique
 * among diagrams drawn at the same time and a valid element id.
 *
 * Mermaid's configuration is global, so draws run one at a time.
 */
export function drawMermaid(renderId: string, source: string, tokens: MermaidTokens): Promise<MermaidDrawing> {
  return queued(() => draw(renderId, source, tokens));
}

function queued<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

async function draw(renderId: string, source: string, tokens: MermaidTokens): Promise<MermaidDrawing> {
  mermaid.initialize(baseConfig(tokens));
  const parsed = await mermaid.parse(source);
  if (!parsed) throw new Error('Mermaid could not parse the diagram');
  const { diagramType } = parsed;
  if (GRAPH_FAMILY.has(diagramType)) mermaid.initialize({ ...baseConfig(tokens), layout: 'elk' });
  const { svg } = await mermaid.render(renderId, await withPresetClassDefs(source, diagramType, tokens));
  const empty = emptiness(svg);
  if (empty) throw new EmptyDrawingError(empty);
  return { svg, diagramType };
}

/**
 * The diagram's parsed database, for the draw check's explainers. The shape
 * depends on the type (a flowchart's has `getEdges()` and `getVertices()`).
 */
export function mermaidDiagram(source: string): Promise<{ type: string; db: unknown }> {
  return queued(async () => {
    mermaid.initialize(baseConfig(DARK_TOKENS));
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
    return { type: diagram.type, db: diagram.db };
  });
}

// ------------------------------------------------------------ preset marks

/** Types whose grammar takes `classDef`; the others get the marks as CSS only. */
const CLASSDEF_TYPES = new Set(['flowchart', 'flowchart-v2', 'flowchart-elk', 'stateDiagram', 'classDiagram']);

/**
 * The preset marks as real `classDef`s, appended after the agent's own lines
 * so no line number moves. A mark the agent defines itself is left to them.
 * The appended source is used only when it parses; otherwise the agent's
 * source draws as written (with the marks still in themeCSS).
 */
async function withPresetClassDefs(source: string, diagramType: string, tokens: MermaidTokens): Promise<string> {
  if (!CLASSDEF_TYPES.has(diagramType)) return source;
  const own = new Set(
    [...source.matchAll(/^\s*classDef\s+([\w,-]+)/gm)].flatMap((match) => match[1]!.split(',')),
  );
  const defs = Object.entries(presetStyles(tokens))
    .filter(([name]) => !own.has(name))
    .map(([name, style]) => `  classDef ${name} ${style}`);
  if (defs.length === 0) return source;
  const withDefs = `${source.replace(/\s*$/, '')}\n${defs.join('\n')}\n`;
  return (await mermaid.parse(withDefs, { suppressErrors: true })) ? withDefs : source;
}

function presetStyles(t: MermaidTokens): Record<'recommended' | 'risk' | 'muted', string> {
  return {
    recommended: `fill:${mix(t.answered, t.panel)},stroke:${t.answered},stroke-width:2px`,
    risk: `fill:${mix(t.risk, t.panel)},stroke:${t.risk},stroke-width:2px`,
    muted: 'opacity:0.55',
  };
}

/** Elements that only define things for others to use; nothing inside them shows. */
const DEFINITIONS = 'defs, marker, clipPath, pattern, mask, symbol, style, title, desc';
const MARKS = 'path, rect, circle, ellipse, polygon, polyline, line, text, foreignObject, image, use';

/** Why an SVG shows nothing, or `undefined` when something is drawn. */
function emptiness(svg: string): string | undefined {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg') return 'the diagram came out empty (no SVG)';
  const [, , width, height] = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (!(Number(width) > 0) || !(Number(height) > 0)) return 'the diagram came out empty (zero size)';
  const drawn = [...root.querySelectorAll(MARKS)].some((mark) => !mark.closest(DEFINITIONS) && !isBlank(mark));
  return drawn ? undefined : 'the diagram came out empty (nothing drawn)';
}

/** A mark with no geometry and no text, like the empty paths Mermaid leaves behind. */
function isBlank(mark: Element): boolean {
  if (mark.localName === 'text' || mark.localName === 'foreignObject') return !mark.textContent?.trim();
  if (mark.localName === 'path') return !mark.getAttribute('d')?.trim();
  return false;
}

function baseConfig(tokens: MermaidTokens): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    look: 'neo',
    theme: 'base',
    themeVariables: themeVariables(tokens),
    themeCSS: presetMarks(tokens),
  };
}

function themeVariables(t: MermaidTokens): Record<string, string | boolean> {
  return {
    darkMode: isDark(t.canvas),
    background: t.canvas,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    primaryColor: t.panel,
    primaryTextColor: t.fg,
    primaryBorderColor: t.muted,
    secondaryColor: t.panel,
    secondaryTextColor: t.fg,
    secondaryBorderColor: t.line,
    tertiaryColor: t.canvas,
    tertiaryTextColor: t.fg,
    tertiaryBorderColor: t.line,
    lineColor: t.muted,
    textColor: t.fg,
    mainBkg: t.panel,
    nodeBorder: t.muted,
    clusterBkg: t.canvas,
    clusterBorder: t.line,
    titleColor: t.fg,
    edgeLabelBackground: t.canvas,
    noteBkgColor: t.panel,
    noteTextColor: t.fg,
    noteBorderColor: t.line,
    actorBkg: t.panel,
    actorBorder: t.muted,
    actorTextColor: t.fg,
    signalColor: t.fg,
    signalTextColor: t.fg,
    labelBoxBkgColor: t.panel,
    labelBoxBorderColor: t.line,
    labelTextColor: t.fg,
    loopTextColor: t.fg,
    sectionBkgColor: t.panel,
    altSectionBkgColor: t.canvas,
    taskBkgColor: t.panel,
    taskBorderColor: t.muted,
    taskTextColor: t.fg,
    taskTextOutsideColor: t.fg,
    activeTaskBkgColor: t.accent,
    doneTaskBkgColor: t.answered,
    critBkgColor: t.risk,
    todayLineColor: t.unsure,
    gridColor: t.line,
  };
}

/**
 * The preset marks as CSS, for types with no `classDef` (`a:::risk` in a
 * mindmap, say). Types that take `classDef` get them as real ones as well, so
 * an agent's `%%{init: {themeCSS}}%%`, which replaces this, doesn't lose them.
 */
function presetMarks(t: MermaidTokens): string {
  const shapes = ':is(rect, circle, ellipse, polygon, path.basic, path.outer-path, .label-container)';
  return [
    `.recommended ${shapes}, .recommended${shapes} { fill: ${mix(t.answered, t.panel)}; stroke: ${t.answered}; stroke-width: 2px; }`,
    `.risk ${shapes}, .risk${shapes} { fill: ${mix(t.risk, t.panel)}; stroke: ${t.risk}; stroke-width: 2px; }`,
    `.muted { opacity: 0.55; }`,
  ].join('\n');
}

/** A tint of `color` over `base`, for a fill that keeps the label readable. */
function mix(color: string, base: string, amount = 0.25): string {
  const a = rgb(color);
  const b = rgb(base);
  if (!a || !b) return base;
  const channel = (i: number) => Math.round(a[i]! * amount + b[i]! * (1 - amount));
  return `#${[0, 1, 2].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
}

function isDark(color: string): boolean {
  const c = rgb(color);
  return c ? 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] < 128 : true;
}

function rgb(color: string): [number, number, number] | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return undefined;
  const n = parseInt(match[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
