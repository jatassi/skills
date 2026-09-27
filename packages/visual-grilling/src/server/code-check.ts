// The draw check for code fences and `diff` blocks: the server imports the
// page's own code chunk (page/code.js), which renders with no DOM. Code must
// highlight; a diff must parse, and parse to at least one file.
//
// Not warmed at startup: the chunk loads at the first round with code in it,
// since loading it alongside Mermaid and Graphviz slowed the new server's
// first answers. It stays loaded for the rest of the grilling session.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as CodeChunk from '../chunks/code.ts';
import type { Illustration } from '../core/round.ts';
import type { DrawFailure } from './draw-check.ts';

export class CodeCheck {
  private chunk: Promise<typeof CodeChunk> | undefined;

  constructor(private readonly pageDir: string) {}

  /** Highlights one code block, or draws one diff; `undefined` when it draws. */
  async draw(illustration: Illustration): Promise<DrawFailure | undefined> {
    let chunk: typeof CodeChunk;
    try {
      chunk = await this.load();
    } catch (error) {
      return { message: `the draw check couldn't load the code highlighter, so the block can't be checked: ${oneLine(error)}` };
    }
    try {
      if (illustration.kind === 'diff') await chunk.drawDiff(illustration.source);
      else await chunk.highlightCode(illustration.source, illustration.code?.lang ?? 'text');
      return undefined;
    } catch (error) {
      return { message: oneLine(error) };
    }
  }

  /** Loads the chunk once; a failed load is forgotten so the next `present` tries again. */
  private load(): Promise<typeof CodeChunk> {
    this.chunk ??= (import(pathToFileURL(join(this.pageDir, 'code.js')).href) as Promise<typeof CodeChunk>).catch(
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
