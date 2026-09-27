// What the diagram blocks (Mermaid, Graphviz) share on the page: the capped
// view with its "Show full diagram" control, and the page's design tokens as
// the drawing chunks take them.

import type { DiagramTokens, TOKEN_NAMES } from '../../chunks/theme.ts';

/** A diagram up to this many times the height cap renders uncapped. */
const CAP_SLACK = 1.5;
const CAP_PX = 440;

/**
 * The drawn SVG in a view capped at min(50vh, 440 px), with the control that
 * lifts the cap. `svg` must already be safe to insert (each chunk sanitises
 * or escapes its own output).
 */
export function diagramView(target: HTMLElement, svg: string): HTMLElement {
  const viewport = document.createElement('div');
  viewport.className = 'diagram-viewport';
  const diagram = document.createElement('div');
  diagram.className = 'diagram';
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
  view.className = 'diagram-block';
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

// Guarded: unit tests import block modules (for their anchor adapters) without a DOM.
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    for (const { refit } of [...shown.values()]) refit();
  });
}

// ------------------------------------------------------------------ theme

/** The page's tokens as its CSS custom properties hold them now. */
export function readTokens(names: typeof TOKEN_NAMES): DiagramTokens {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(`--${name}`).trim()])) as DiagramTokens;
}
