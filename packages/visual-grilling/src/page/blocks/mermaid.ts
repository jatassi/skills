// The `mermaid` block. It loads the Mermaid chunk lazily and draws with the
// page's design tokens; the frame calls it again on a theme change, so each
// draw reads the tokens afresh. Tall diagrams are capped. A draw that throws
// is shown, and reported as a warning, by the frame. Clicks are read per
// diagram type (mermaid-anchor/), with wide hit areas over thin lines.

import type * as MermaidChunk from '../../chunks/mermaid.ts';
import { checkDrawing } from '../readability.ts';
import { diagramView, readTokens } from './diagram-view.ts';
import { addHitAreas } from './mermaid-anchor/hit.ts';
import { MERMAID_PEERS, mermaidAnchor } from './mermaid-anchor/index.ts';
import type { BlockRenderer } from './registry.ts';
import { overridesTheme } from './theme-override.ts';

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
  async render(target, illustration, context) {
    const mermaid = await loadChunk();
    const { svg } = await mermaid.drawMermaid(
      `vg-mermaid-${++drawCount}`,
      illustration.source,
      readTokens(target, mermaid.TOKEN_NAMES),
    );
    // Mermaid sanitises its own output (securityLevel: 'strict').
    const view = diagramView(target, svg);
    const drawing = view.querySelector<SVGSVGElement>('.diagram > svg');
    if (drawing) addHitAreas(drawing);
    target.append(view);
    if (overridesTheme('mermaid', illustration.source)) checkDrawing(target, context);
  },
  anchor: mermaidAnchor,
  peers: MERMAID_PEERS,
};
