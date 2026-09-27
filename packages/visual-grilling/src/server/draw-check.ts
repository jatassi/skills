// The draw check `present` runs: every block is drawn with the same library
// chunk the round page uses, and a block that throws or comes out empty
// rejects the round with the usual `round.md:LINE · Qn · illustration` error.
//
// Mermaid needs a DOM, so the server installs jsdom globals and size shims and
// then imports the page's own chunk (page/mermaid.js). The import is lazy and
// kept warm for the rest of the grilling session.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as MermaidChunk from '../chunks/mermaid.ts';
import type { Illustration, Round, RoundError } from '../core/round.ts';
import { installDomGlobals } from './dom-shim.ts';
import { explainMermaidFailure } from './mermaid-explain.ts';

export class DrawCheck {
  private mermaid: Promise<typeof MermaidChunk> | undefined;
  private drawn = 0;

  constructor(private readonly pageDir: string) {}

  /** Starts loading the drawing libraries so the first `present` doesn't wait on them. */
  warm(): void {
    void this.loadMermaid().catch(() => undefined);
  }

  /** Draws every block in the round; returns one error per block that fails. */
  async check(round: Round): Promise<RoundError[]> {
    const errors: RoundError[] = [];
    for (const question of round.questions) {
      for (const illustration of question.illustrations) {
        if (illustration.kind !== 'mermaid') continue;
        const failure = await this.drawMermaid(illustration);
        if (!failure) continue;
        errors.push({
          line: illustration.line + (failure.sourceLine ?? 0),
          question: question.number,
          illustration: { id: illustration.id, fence: illustration.fence },
          message: failure.message,
        });
      }
    }
    return errors;
  }

  /** Loads the chunk once; a failed load is forgotten so the next `present` tries again. */
  private loadMermaid(): Promise<typeof MermaidChunk> {
    this.mermaid ??= (async () => {
      installDomGlobals();
      return (await import(pathToFileURL(join(this.pageDir, 'mermaid.js')).href)) as typeof MermaidChunk;
    })().catch((error: unknown) => {
      this.mermaid = undefined;
      throw error;
    });
    return this.mermaid;
  }

  private async drawMermaid(illustration: Illustration): Promise<{ message: string; sourceLine?: number } | undefined> {
    let chunk: typeof MermaidChunk;
    try {
      chunk = await this.loadMermaid();
    } catch (error) {
      return { message: `the draw check couldn't load Mermaid, so the block can't be checked: ${errorMessage(error)}` };
    }
    try {
      await chunk.drawMermaid(`vg-check-${++this.drawn}`, illustration.source, chunk.DARK_TOKENS);
      return undefined;
    } catch (error) {
      const raw = errorMessage(error);
      if (error instanceof chunk.EmptyDrawingError) return { message: raw };
      const diagram = await chunk.mermaidDiagram(illustration.source).catch(() => undefined);
      const explained = explainMermaidFailure({ source: illustration.source, ...(diagram ? { diagram } : {}) });
      if (!explained) {
        const parseLine = Number(/Parse error on line (\d+)/.exec(raw)?.[1]);
        const lines = illustration.source.replace(/\n+$/, '').split('\n').length;
        return {
          message: `Mermaid failed to draw it: ${raw}`,
          ...(parseLine ? { sourceLine: Math.min(parseLine, lines) } : {}),
        };
      }
      return { message: `${explained.message} (Mermaid: ${raw})`, ...(explained.sourceLine ? { sourceLine: explained.sourceLine } : {}) };
    }
  }
}

/** Mermaid's messages can span lines (parse errors draw a caret); errors print on one. */
function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^-*\^$/.test(line))
    .join(' ');
}
