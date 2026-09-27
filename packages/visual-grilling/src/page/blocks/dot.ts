// The `dot` block. It loads the Graphviz chunk lazily and draws with the
// page's design tokens as Graphviz defaults; the frame calls it again on a
// theme change, so each draw reads the tokens afresh. Tall graphs are capped
// like Mermaid's. A draw that throws is shown, and reported as a warning, by
// the frame.

import type * as GraphvizChunk from '../../chunks/graphviz.ts';
import { checkDrawing } from '../readability.ts';
import { diagramView, readTokens } from './diagram-view.ts';
import { dotAnchor } from './dot-anchor.ts';
import type { BlockRenderer } from './registry.ts';
import { overridesTheme } from './theme-override.ts';

/** The chunk's URL on the server. Kept out of the page bundle on purpose. */
const CHUNK_URL = '/assets/graphviz.js';

let chunk: Promise<typeof GraphvizChunk> | undefined;
function loadChunk(): Promise<typeof GraphvizChunk> {
  chunk ??= (import(CHUNK_URL) as Promise<typeof GraphvizChunk>).catch((error: unknown) => {
    chunk = undefined;
    throw error;
  });
  return chunk;
}

let drawCount = 0;

export const dotBlock: BlockRenderer = {
  async render(target, illustration, context) {
    const graphviz = await loadChunk();
    const { svg } = await graphviz.drawDot(`vg-dot-${++drawCount}`, illustration.source, readTokens(target, graphviz.TOKEN_NAMES));
    // Graphviz escapes the labels it writes, and the chunk strips links.
    target.append(diagramView(target, svg));
    if (overridesTheme('dot', illustration.source)) checkDrawing(target, context);
  },
  anchor: dotAnchor,
};
