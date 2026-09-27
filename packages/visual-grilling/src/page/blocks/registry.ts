// The block-renderer registry: one renderer per illustration kind. The frame
// around an illustration (title, kind, Comment toggle, pins, threads) is the
// same for every block; a block only draws its content and, optionally, reads
// clicks in its own terms.
//
// A block module exports its renderer, and blocks/index.ts registers it:
//
//   registerBlock('mermaid', mermaidBlock);
//
// A kind with no renderer shows its raw source.

import type { AnchorAdapter } from '../../core/anchor.ts';
import type { PageIllustration } from '../../core/protocol.ts';
import type { IllustrationKind } from '../../core/round.ts';

export interface BlockContext {
  /** The page theme when this draw started. A theme change calls `render` again. */
  theme: 'dark' | 'light';
}

export interface BlockRenderer {
  /**
   * Draws the illustration into `target`, a fresh empty element for each
   * draw. It may be async (to load a lazy chunk). A throw or rejection shows
   * the error in the frame instead of the block.
   *
   * `target` sits alone in the frame's positioned content box, which is the
   * anchoring root: comment positions are percentages of that box, and pins
   * are laid over it, so they scroll with the content. The page calls
   * `render` again, on a new target, when the theme (data-theme on <html>)
   * changes.
   */
  render(target: HTMLElement, illustration: PageIllustration, context: BlockContext): void | Promise<void>;
  /** The block's adapter for anchored comments, tried before the generic fallback. */
  anchor?: AnchorAdapter;
  /** A CSS selector for elements the adapter needs to see besides the clicked chain (Snapshot.peers). */
  peers?: string;
}

const renderers = new Map<IllustrationKind, BlockRenderer>();

export function registerBlock(kind: IllustrationKind, renderer: BlockRenderer): void {
  renderers.set(kind, renderer);
}

/** The renderer for a kind, or the raw-source fallback. */
export function blockFor(kind: IllustrationKind): BlockRenderer {
  return renderers.get(kind) ?? sourceBlock;
}

/** Until a kind has its renderer, its illustration shows as its raw source. */
export const sourceBlock: BlockRenderer = {
  render(target, illustration) {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = illustration.source;
    pre.append(code);
    target.append(pre);
  },
};
