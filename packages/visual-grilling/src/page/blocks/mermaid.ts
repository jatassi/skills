// The `mermaid` block. It loads the Mermaid chunk lazily and draws with the
// page's design tokens; the frame calls it again on a theme change, so each
// draw reads the tokens afresh. Tall diagrams are capped. A draw that throws
// is shown, and reported as a warning, by the frame.

import type * as MermaidChunk from '../../chunks/mermaid.ts';
import type { BlockRenderer } from './registry.ts';

/** The chunk's URL on the server. Kept out of the page bundle on purpose. */
const CHUNK_URL = '/assets/mermaid.js';
/** A diagram up to this many times the height cap renders uncapped. */
const CAP_SLACK = 1.5;
const CAP_PX = 440;

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
    target.append(diagramView(target, svg));
  },
};

function diagramView(target: HTMLElement, svg: string): HTMLElement {
  const viewport = document.createElement('div');
  viewport.className = 'diagram-viewport';
  const diagram = document.createElement('div');
  diagram.className = 'diagram';
  // Mermaid sanitises its own output (securityLevel: 'strict').
  diagram.innerHTML = svg;
  viewport.append(diagram);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'show-full';
  toggle.textContent = 'Show full diagram';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    const expanded = viewport.classList.toggle('expanded');
    toggle.textContent = expanded ? 'Show less' : 'Show full diagram';
    toggle.setAttribute('aria-expanded', String(expanded));
  });

  const view = document.createElement('div');
  view.className = 'mermaid-block';
  view.append(viewport, toggle);
  watchHeight(target, viewport, diagram);
  return view;
}

// ------------------------------------------------------------- height cap

/** Diagrams on the page and their re-check, while they stay in the document. */
const shown = new Map<HTMLElement, { refit: () => void; observer: ResizeObserver }>();

/**
 * Caps the view at min(50vh, 440 px). A diagram within 1.5× the cap shows
 * whole; a taller one is cut with a fade and gets "Show full diagram".
 * Re-checked when the drawing's size or the window's height changes, and
 * forgotten once a redraw has replaced the frame's target.
 */
function watchHeight(target: HTMLElement, viewport: HTMLElement, diagram: HTMLElement): void {
  const refit = () => {
    if (!target.parentElement) return forget(diagram);
    const cap = Math.min(window.innerHeight * 0.5, CAP_PX);
    viewport.classList.toggle('capped', diagram.getBoundingClientRect().height > cap * CAP_SLACK);
  };
  const observer = new ResizeObserver(refit);
  observer.observe(diagram);
  shown.set(diagram, { refit, observer });
}

function forget(diagram: HTMLElement): void {
  shown.get(diagram)?.observer.disconnect();
  shown.delete(diagram);
}

window.addEventListener('resize', () => {
  for (const { refit } of [...shown.values()]) refit();
});

// ------------------------------------------------------------------ theme

/** The page's tokens as its CSS custom properties hold them now. */
function readTokens(names: typeof MermaidChunk.TOKEN_NAMES): MermaidChunk.MermaidTokens {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(`--${name}`).trim()])) as MermaidChunk.MermaidTokens;
}
