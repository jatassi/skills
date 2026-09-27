// The `vega-lite` block. It loads the Vega-Lite chunk lazily and draws the
// chart as SVG with the page's design tokens; the frame calls it again on a
// theme change, so each draw reads the tokens afresh. A draw that throws is
// shown, and reported as a warning, by the frame.
//
// Anchors name a mark by the datum Vega-Lite writes into its aria-label:
// `bar "runtime: Bun; ms: 60"`.

import type { AdapterMatch, Snapshot } from '../../core/anchor.ts';
import type * as VegaLiteChunk from '../../chunks/vega-lite.ts';
import type { BlockRenderer } from './registry.ts';

/** The chunk's URL on the server. Kept out of the page bundle on purpose. */
const CHUNK_URL = '/assets/vega-lite.js';

let chunk: Promise<typeof VegaLiteChunk> | undefined;
function loadChunk(): Promise<typeof VegaLiteChunk> {
  chunk ??= (import(CHUNK_URL) as Promise<typeof VegaLiteChunk>).catch((error: unknown) => {
    chunk = undefined;
    throw error;
  });
  return chunk;
}

export const vegaLiteBlock: BlockRenderer = {
  async render(target, illustration) {
    const vegaLite = await loadChunk();
    const { svg } = await vegaLite.drawVegaLite(illustration.source, readTokens(vegaLite.TOKEN_NAMES));
    const chart = document.createElement('div');
    chart.className = 'vega-lite-block';
    // Vega's SVG writer escapes every text and attribute, and the loader
    // refuses every URL; the page's CSP runs no inline script either way.
    chart.innerHTML = svg;
    target.append(chart);
  },
  anchor: vegaLiteAnchor,
};

/**
 * A mark names itself by its role description (`bar`, `point`, `arc`…) and
 * the datum in its aria-label. A line or area is one path for many data,
 * which Vega labels with its first datum. Axes, legends and titles that carry an
 * aria-label name themselves the same way. Anything else is left to the
 * generic fallback.
 */
export function vegaLiteAnchor(snapshot: Snapshot): AdapterMatch | null {
  const { chain } = snapshot;
  for (let i = 0; i < chain.length - 1; i++) {
    const { attrs } = chain[i]!;
    const role = attrs['aria-roledescription'];
    const label = attrs['aria-label'];
    if (attrs.role === 'graphics-symbol' && role && label) {
      // Vega calls some marks `arc mark` or `line mark`; the agent wrote `arc`.
      return { kind: role.replace(/ mark$/, ''), ref: null, label, via: 'datum', chainIndex: i };
    }
  }
  return null;
}

/** The page's tokens as its CSS custom properties hold them now. */
function readTokens(names: typeof VegaLiteChunk.TOKEN_NAMES): VegaLiteChunk.ChartTokens {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(`--${name}`).trim()])) as VegaLiteChunk.ChartTokens;
}
