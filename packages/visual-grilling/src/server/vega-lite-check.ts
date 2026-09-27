// The draw check for `vega-lite` blocks: the server imports the page's own
// chunk (page/vega-lite.js) and draws every chart with the same safe settings
// the page uses. A chart that isn't JSON, loads URL data, is raw Vega, throws
// or comes out empty rejects the round.
//
// Vega needs no DOM, but the jsdom globals go in first anyway, so a chart
// measures its text the same way whether or not a Mermaid block loaded them.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as VegaLiteChunk from '../chunks/vega-lite.ts';
import type { Illustration } from '../core/round.ts';
import type { DrawFailure } from './draw-check.ts';
import { installDomGlobals } from './dom-shim.ts';

/** Chunk loads by page directory; a failed load is forgotten so the next `present` tries again. */
const loads = new Map<string, Promise<typeof VegaLiteChunk>>();

function loadChunk(pageDir: string): Promise<typeof VegaLiteChunk> {
  let load = loads.get(pageDir);
  if (!load) {
    load = (async () => {
      installDomGlobals();
      return (await import(pathToFileURL(join(pageDir, 'vega-lite.js')).href)) as typeof VegaLiteChunk;
    })();
    load.catch(() => loads.delete(pageDir));
    loads.set(pageDir, load);
  }
  return load;
}

/** Draws one chart; `undefined` when it draws, else why not and the source line to point at. */
export async function checkVegaLite(pageDir: string, illustration: Illustration): Promise<DrawFailure | undefined> {
  let chunk: typeof VegaLiteChunk;
  try {
    chunk = await loadChunk(pageDir);
  } catch (error) {
    return { message: `the draw check couldn't load Vega-Lite, so the block can't be checked: ${messageOf(error)}` };
  }
  try {
    await chunk.drawVegaLite(illustration.source, chunk.DARK_TOKENS);
    return undefined;
  } catch (error) {
    if (error instanceof chunk.ChartSourceError) {
      return { message: error.message, ...(error.sourceLine ? { sourceLine: error.sourceLine } : {}) };
    }
    if (error instanceof chunk.EmptyDrawingError) return { message: error.message };
    return { message: `Vega-Lite failed to draw it: ${messageOf(error)}` };
  }
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s*\n\s*/g, ' ');
}
