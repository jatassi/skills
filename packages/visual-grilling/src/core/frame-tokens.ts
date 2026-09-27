// The page tokens agent HTML sees in its sandboxed frame. The server injects
// them into every frame as CSS variables (`--vg-surface`) and, with Tailwind,
// as theme colours (`bg-surface`, `text-fg`, `border-line`, `accent-*`), for
// both themes; the frame switches between them live on the theme toggle.
//
// The values mirror the round page's own theme (app.css). The names are the
// agent's contract: illustrating.md lists them, so rename none lightly.

export type ThemeName = 'dark' | 'light';

export const FRAME_TOKEN_NAMES = [
  'canvas',
  'surface',
  'surface-2',
  'line',
  'line-strong',
  'fg',
  'fg-muted',
  'fg-subtle',
  'accent-blue',
  'accent-green',
  'accent-purple',
  'accent-amber',
  'accent-red',
] as const;

export type FrameToken = (typeof FRAME_TOKEN_NAMES)[number];

export const FRAME_TOKENS: Record<ThemeName, Record<FrameToken, string>> = {
  dark: {
    canvas: '#0e1014',
    surface: '#151820',
    'surface-2': '#1a1e27',
    line: '#2a303b',
    'line-strong': '#3a4250',
    fg: '#e7eaf0',
    'fg-muted': '#a0a8b6',
    'fg-subtle': '#7f8898',
    'accent-blue': '#5b95ff',
    'accent-green': '#49c27a',
    'accent-purple': '#ad93fb',
    'accent-amber': '#e5a843',
    'accent-red': '#f07178',
  },
  light: {
    canvas: '#f4f5f7',
    surface: '#ffffff',
    'surface-2': '#f7f8fa',
    line: '#d7dbe2',
    'line-strong': '#bfc6d0',
    fg: '#1a1e26',
    'fg-muted': '#525b69',
    'fg-subtle': '#667080',
    'accent-blue': '#1f63e0',
    'accent-green': '#17784a',
    'accent-purple': '#6b43d4',
    'accent-amber': '#8f5e07',
    'accent-red': '#c62f3a',
  },
};

/** The frame's theme attribute on <html>: the page theme, or `light` under the light backdrop. */
export const FRAME_THEME_ATTRIBUTE = 'data-vg-theme';

/**
 * The injected base style: both token sets, and the frame's own backdrop
 * (the surface colour, with the theme's text colour) that agent HTML sits on.
 */
export function frameTokenCss(): string {
  const vars = (theme: ThemeName) =>
    FRAME_TOKEN_NAMES.map((name) => `--vg-${name}: ${FRAME_TOKENS[theme][name]};`).join(' ');
  return [
    `:root { color-scheme: dark; ${vars('dark')} }`,
    `:root[${FRAME_THEME_ATTRIBUTE}='light'] { color-scheme: light; ${vars('light')} }`,
    'html { background: var(--vg-surface); color: var(--vg-fg); }',
    'html.vg-commenting, html.vg-commenting * { cursor: crosshair !important; }',
  ].join('\n');
}

/** Tailwind theme colours that follow the variables, so they switch with the theme. */
export function tailwindThemeCss(): string {
  return `@theme inline { ${FRAME_TOKEN_NAMES.map((name) => `--color-${name}: var(--vg-${name});`).join(' ')} }`;
}
