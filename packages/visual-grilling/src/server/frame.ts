// The document an agent-HTML frame is served as: the injected head (page
// tokens and backdrop, the frame script, Tailwind unless the fence says
// tailwind=false) and then the agent's HTML exactly as written.
//
// The agent's HTML may be a fragment or a whole document. The HTML parser
// ignores its doctype, merges its <html> attributes into ours and folds its
// <head> into ours, so either way the injected parts come first.
//
// The frame's scripts are written inline, never fetched by URL: some browsers
// (Claude's built-in one among them) refuse every request from an opaque
// origin, and the frame's document is one.

import { FRAME_THEME_ATTRIBUTE, frameTokenCss, tailwindThemeCss, type ThemeName } from '../core/frame-tokens.ts';

/** The frame's scripts, built into the bundle's frame/ folder and inlined into every frame. */
export const FRAME_ASSETS = ['inject.js', 'tailwind.js'] as const;

export type FrameScripts = Record<(typeof FRAME_ASSETS)[number], string>;

export function frameDocument(
  source: string,
  options: { tailwind: boolean; theme: ThemeName; scripts: FrameScripts },
): string {
  const head = [
    '<!doctype html>',
    `<html ${FRAME_THEME_ATTRIBUTE}="${options.theme}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style id="vg-tokens">\n${frameTokenCss()}\n</style>`,
    // First, so its error and click listeners come before anything the agent wrote.
    inlineScript('vg-inject', options.scripts['inject.js']),
    ...(options.tailwind
      ? [
          `<style type="text/tailwindcss">\n${tailwindThemeCss()}\n</style>`,
          inlineScript('vg-tailwind', options.scripts['tailwind.js']),
        ]
      : []),
    '</head>',
  ];
  return `${head.join('\n')}\n${source}\n`;
}

/** A script element holding `code`, with any `</script` in it escaped so it can't close the element early. */
function inlineScript(id: string, code: string): string {
  return `<script id="${id}">\n${code.replace(/<\/(script)/gi, '<\\/$1')}\n</script>`;
}
