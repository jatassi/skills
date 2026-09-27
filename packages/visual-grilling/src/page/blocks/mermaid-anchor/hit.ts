// Hit areas for thin lines. Mermaid's edges and messages are a pixel or two
// wide, so a click meant for one usually lands on the background. After each
// draw the block lays a transparent, wide copy over every such line. The copy
// keeps the line's data-* attributes and carries its id and class in
// data-vg-id / data-vg-class, so the adapters read it as the line itself.

export const HIT_CLASS = 'vg-hit';
export const HIT_ORIGINAL_ID = 'data-vg-id';
export const HIT_ORIGINAL_CLASS = 'data-vg-class';

/** The lines a click should be able to find: graph edges, sequence messages, architecture edges, git branches. */
const THIN = '[data-et="edge"], [data-et="message"], path.edge, line.branch';
const HIT_STYLE = 'fill:none;stroke:transparent;stroke-width:12px;pointer-events:stroke';

export function addHitAreas(svg: SVGSVGElement): void {
  for (const line of [...svg.querySelectorAll(THIN)]) {
    const hit = line.cloneNode(false) as SVGElement;
    for (const name of ['id', 'class', 'style', 'marker-start', 'marker-end', 'marker-mid']) hit.removeAttribute(name);
    hit.setAttribute('class', HIT_CLASS);
    hit.setAttribute('style', HIT_STYLE);
    hit.setAttribute(HIT_ORIGINAL_ID, line.id);
    hit.setAttribute(HIT_ORIGINAL_CLASS, line.getAttribute('class') ?? '');
    hit.setAttribute('aria-hidden', 'true');
    line.after(hit);
  }
}
