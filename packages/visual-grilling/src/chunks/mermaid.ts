// The Mermaid library chunk: Mermaid 12 with ELK, and the one draw function
// both the round page and the server's draw check call. The build emits it as
// its own ESM file (page/mermaid.js); the page imports it lazily, and the
// server imports the same file after installing jsdom globals, so a block
// draws with exactly the same code in both places.

import elkLayouts from '@mermaid-js/layout-elk';
import mermaid, { type MermaidConfig } from 'mermaid';
import { DARK_TOKENS, isDark, presetMarks, type DiagramTokens } from './theme.ts';

mermaid.registerLayoutLoaders(elkLayouts);

export { DARK_TOKENS, TOKEN_NAMES } from './theme.ts';
export type MermaidTokens = DiagramTokens;

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
  // The agent's own directive or frontmatter config merges over this one when Mermaid renders.
  const config = baseConfig(tokens, parsed.config);
  mermaid.initialize(GRAPH_FAMILY.has(diagramType) ? { ...config, layout: 'elk' } : config);
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
  const { recommended, risk, mutedOpacity } = presetMarks(t);
  return {
    recommended: `fill:${recommended.fill},stroke:${recommended.stroke},stroke-width:${recommended.strokeWidth}`,
    risk: `fill:${risk.fill},stroke:${risk.stroke},stroke-width:${risk.strokeWidth}`,
    muted: `opacity:${mutedOpacity}`,
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

/**
 * The page's settings, under the agent's `override` (its `%%{init}%%`
 * directive or frontmatter `config:`). Mermaid merges the rest of the
 * override over them when it renders; the theme and its variables are merged
 * here, since Mermaid's own merge loses the directive's variables.
 */
function baseConfig(tokens: MermaidTokens, override: MermaidConfig = {}): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    look: 'neo',
    theme: override.theme ?? 'base',
    themeVariables: { ...themeVariablesUnder(themeVariables(tokens), override), ...(override.themeVariables as object) },
    themeCSS: presetMarkCss(tokens),
  };
}

/**
 * The page's theme variables, minus those the agent's own should decide.
 * Mermaid derives most variables from a few (`mainBkg` from `primaryColor`,
 * `textColor` from `primaryTextColor`…) but only when they're unset, so a
 * page variable derived from one the agent set would hide the agent's colour.
 * Another named theme than `base` takes none of the page's colours.
 */
function themeVariablesUnder(page: Record<string, string | boolean>, override: MermaidConfig): Record<string, string | boolean> {
  if (override.theme && override.theme !== 'base') return { fontFamily: page.fontFamily! };
  const set = new Set(Object.keys((override.themeVariables ?? {}) as object));
  if (set.size === 0) return page;
  const decidedByAgent = (name: string, seen = new Set<string>()): boolean => {
    if (seen.has(name)) return false;
    seen.add(name);
    return (DERIVED_FROM[name] ?? []).some((source) => set.has(source) || decidedByAgent(source, seen));
  };
  return Object.fromEntries(Object.entries(page).filter(([name]) => !set.has(name) && !decidedByAgent(name)));
}

/** What Mermaid's base theme derives each page-set variable from, when it's unset (themes/theme-base.js). */
const DERIVED_FROM: Record<string, string[]> = {
  primaryTextColor: ['darkMode'],
  secondaryColor: ['primaryColor'],
  tertiaryColor: ['primaryColor'],
  primaryBorderColor: ['primaryColor', 'darkMode'],
  secondaryBorderColor: ['secondaryColor', 'darkMode'],
  tertiaryBorderColor: ['tertiaryColor', 'darkMode'],
  noteBorderColor: ['noteBkgColor', 'darkMode'],
  secondaryTextColor: ['secondaryColor'],
  tertiaryTextColor: ['tertiaryColor'],
  lineColor: ['background'],
  textColor: ['primaryTextColor'],
  mainBkg: ['primaryColor'],
  nodeBorder: ['primaryBorderColor'],
  clusterBkg: ['tertiaryColor'],
  clusterBorder: ['tertiaryBorderColor'],
  titleColor: ['tertiaryTextColor'],
  edgeLabelBackground: ['secondaryColor', 'darkMode'],
  actorBorder: ['primaryBorderColor'],
  actorBkg: ['mainBkg'],
  actorTextColor: ['primaryTextColor'],
  signalColor: ['textColor'],
  signalTextColor: ['textColor'],
  labelBoxBkgColor: ['actorBkg'],
  labelBoxBorderColor: ['actorBorder'],
  labelTextColor: ['actorTextColor'],
  loopTextColor: ['actorTextColor'],
  sectionBkgColor: ['tertiaryColor'],
  taskBorderColor: ['primaryBorderColor'],
  taskBkgColor: ['primaryColor'],
  activeTaskBkgColor: ['primaryColor'],
  taskTextColor: ['textColor'],
  taskTextOutsideColor: ['textColor'],
};

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
function presetMarkCss(t: MermaidTokens): string {
  const shapes = ':is(rect, circle, ellipse, polygon, path.basic, path.outer-path, .label-container)';
  const { recommended, risk, mutedOpacity } = presetMarks(t);
  return [
    `.recommended ${shapes}, .recommended${shapes} { fill: ${recommended.fill}; stroke: ${recommended.stroke}; stroke-width: ${recommended.strokeWidth}; }`,
    `.risk ${shapes}, .risk${shapes} { fill: ${risk.fill}; stroke: ${risk.stroke}; stroke-width: ${risk.strokeWidth}; }`,
    `.muted { opacity: ${mutedOpacity}; }`,
  ].join('\n');
}
