// The document an agent-HTML frame is served as: the injected head (page
// tokens and backdrop, the frame script, Tailwind unless the fence says
// tailwind=false) and then the agent's HTML exactly as written.
//
// The agent's HTML may be a fragment or a whole document. The HTML parser
// ignores its doctype, merges its <html> attributes into ours and folds its
// <head> into ours, so either way the injected parts come first.

import { FRAME_THEME_ATTRIBUTE, frameTokenCss, tailwindThemeCss, type ThemeName } from '../core/frame-tokens.ts';

/** The frame's scripts, served from the local server (never a CDN) at /frame/assets/<file>. */
export const FRAME_ASSETS = ['inject.js', 'tailwind.js'] as const;

export function frameDocument(source: string, options: { tailwind: boolean; theme: ThemeName }): string {
  const head = [
    '<!doctype html>',
    `<html ${FRAME_THEME_ATTRIBUTE}="${options.theme}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style id="vg-tokens">\n${frameTokenCss()}\n</style>`,
    // First, so its error and click listeners come before anything the agent wrote.
    '<script src="/frame/assets/inject.js"></script>',
    ...(options.tailwind
      ? [
          `<style type="text/tailwindcss">\n${tailwindThemeCss()}\n</style>`,
          '<script src="/frame/assets/tailwind.js"></script>',
        ]
      : []),
    '</head>',
  ];
  return `${head.join('\n')}\n${source}\n`;
}
