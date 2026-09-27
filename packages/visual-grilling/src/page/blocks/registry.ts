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

import type { AnchorAdapter, Box, Snapshot } from '../../core/anchor.ts';
import type { ThemeName } from '../../core/frame-tokens.ts';
import type { PageIllustration } from '../../core/protocol.ts';
import type { IllustrationKind } from '../../core/round.ts';

export interface BlockContext {
  /** The page theme when this draw started. A theme change calls `render` again (or `BlockView.setState`). */
  theme: ThemeName;
  /** What a block that runs apart from the page (a sandboxed frame) reports to its illustration frame. */
  events: BlockEvents;
}

export interface BlockEvents {
  /** A click in comment mode, snapshotted where the page can't reach (inside a sandboxed frame). */
  pick(snapshot: Snapshot): void;
  /** Whether the block's own colours are unreadable on the dark backdrop; the frame then offers the light one. */
  readability(unreadable: boolean): void;
  /** An uncaught script error; it reaches the agent as a warning. */
  scriptError(message: string): void;
}

/** What the illustration frame tells a live block. */
export interface BlockState {
  theme: ThemeName;
  /** Show the block on the light backdrop (automatic when unreadable on dark, or the user's toggle). */
  backdrop: boolean;
  commenting: boolean;
}

/**
 * A block that stays live after drawing (a sandboxed frame): the illustration
 * frame pushes state into it rather than drawing again, and asks it for crops.
 */
export interface BlockView {
  /** Called on every change of theme, backdrop or comment mode, instead of a redraw. */
  setState(state: BlockState): void;
  /** Rasterises `rect` (relative to the anchoring root) for a weak match's crop, as a PNG data URL. */
  crop(rect: Box): Promise<string | null>;
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
   * changes, unless it returned a BlockView, which gets `setState` instead.
   */
  render(
    target: HTMLElement,
    illustration: PageIllustration,
    context: BlockContext,
  ): void | BlockView | Promise<void | BlockView>;
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
