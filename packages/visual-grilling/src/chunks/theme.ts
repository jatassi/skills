// The page's design tokens as the diagram chunks take them, and the preset
// marks every diagram block shares. Each chunk bundles its own copy, so the
// Mermaid and Graphviz drawings of `recommended`, `risk` and `muted` match.

/** The page's design tokens (hex colours) that theme a drawing, by CSS custom property name. */
export const TOKEN_NAMES = ['canvas', 'panel', 'line', 'fg', 'muted', 'accent', 'answered', 'unsure', 'risk'] as const;
export type DiagramTokens = Record<(typeof TOKEN_NAMES)[number], string>;

/** The page's dark tokens (app.css), for draws with no page around them (the server's check). */
export const DARK_TOKENS: DiagramTokens = {
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

export interface PresetMark {
  fill: string;
  stroke: string;
  strokeWidth: string;
}

/** The preset marks' colours: a tinted fill and a strong stroke, or a fade for `muted`. */
export function presetMarks(t: DiagramTokens): { recommended: PresetMark; risk: PresetMark; mutedOpacity: number } {
  return {
    recommended: { fill: mix(t.answered, t.panel), stroke: t.answered, strokeWidth: '2px' },
    risk: { fill: mix(t.risk, t.panel), stroke: t.risk, strokeWidth: '2px' },
    mutedOpacity: 0.55,
  };
}

/** A tint of `color` over `base`, for a fill that keeps the label readable. */
function mix(color: string, base: string, amount = 0.25): string {
  const a = rgb(color);
  const b = rgb(base);
  if (!a || !b) return base;
  const channel = (i: number) => Math.round(a[i]! * amount + b[i]! * (1 - amount));
  return `#${[0, 1, 2].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
}

export function isDark(color: string): boolean {
  const c = rgb(color);
  return c ? 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] < 128 : true;
}

function rgb(color: string): [number, number, number] | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return undefined;
  const n = parseInt(match[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
