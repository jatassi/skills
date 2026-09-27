// The `mermaid` block. It loads the Mermaid chunk lazily and draws with the
// page's design tokens; the frame calls it again on a theme change, so each
// draw reads the tokens afresh. Tall diagrams are capped. A draw that throws
// is shown, and reported as a warning, by the frame.

import type * as MermaidChunk from '../../chunks/mermaid.ts';
import { diagramView, readTokens } from './diagram-view.ts';
import type { BlockRenderer } from './registry.ts';

/** The chunk's URL on the server. Kept out of the page bundle on purpose. */
const CHUNK_URL = '/assets/mermaid.js';

let chunk: Promise<typeof MermaidChunk> | undefined;
function loadChunk(): Promise<typeof MermaidChunk> {
  chunk ??= (import(CHUNK_URL) as Promise<typeof MermaidChunk>).catch((error: unknown) => {
    chunk = undefined;
    throw error;
  });
  return chunk;
}

let drawCount = 0;

export const mermaidBlock: BlockRenderer = {
  async render(target, illustration) {
    const mermaid = await loadChunk();
    const { svg } = await mermaid.drawMermaid(
      `vg-mermaid-${++drawCount}`,
      illustration.source,
      readTokens(mermaid.TOKEN_NAMES),
    );
    // Mermaid sanitises its own output (securityLevel: 'strict').
    target.append(diagramView(target, svg));
  },
};
