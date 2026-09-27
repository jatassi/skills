// The draw check for `dot` blocks: the server imports the page's own Graphviz
// chunk (page/graphviz.js) and draws each block with it. Graphviz is
// WebAssembly and needs no DOM, so no shims are involved. The import is lazy
// and kept warm for the rest of the grilling session.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as GraphvizChunk from '../chunks/graphviz.ts';
import type { Illustration } from '../core/round.ts';

/** Why a block failed the check, and the line of its source to point at. */
export interface DrawFailure {
  message: string;
  sourceLine?: number;
}

export class DotCheck {
  private chunk: Promise<typeof GraphvizChunk> | undefined;
  private drawn = 0;

  constructor(private readonly pageDir: string) {}

  warm(): void {
    void this.load().catch(() => undefined);
  }

  /** Draws one block; `undefined` when it draws. */
  async draw(illustration: Illustration): Promise<DrawFailure | undefined> {
    let chunk: typeof GraphvizChunk;
    try {
      chunk = await this.load();
    } catch (error) {
      return { message: `the draw check couldn't load Graphviz, so the block can't be checked: ${oneLine(error)}` };
    }
    try {
      await chunk.drawDot(`vg-check-dot-${++this.drawn}`, illustration.source, chunk.DARK_TOKENS);
      return undefined;
    } catch (error) {
      if (error instanceof chunk.EmptyDrawingError) return { message: oneLine(error) };
      const lines = illustration.source.replace(/\n+$/, '').split('\n').length;
      const line = error instanceof chunk.DotError ? error.sourceLine : undefined;
      return {
        message: `Graphviz failed to draw it: ${oneLine(error)}`,
        ...(line ? { sourceLine: Math.min(line, lines) } : {}),
      };
    }
  }

  /** Loads the chunk once; a failed load is forgotten so the next `present` tries again. */
  private load(): Promise<typeof GraphvizChunk> {
    this.chunk ??= (import(pathToFileURL(join(this.pageDir, 'graphviz.js')).href) as Promise<typeof GraphvizChunk>).catch(
      (error: unknown) => {
        this.chunk = undefined;
        throw error;
      },
    );
    return this.chunk;
  }
}

function oneLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s*\n\s*/g, ' ').trim();
}
