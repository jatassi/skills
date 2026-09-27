// The readability check behind the automatic light backdrop: is a block's
// text, in its own colours, unreadable on the dark backdrop? Agent HTML is
// judged inside its sandboxed frame (frame/inject.ts); a page-drawn block
// whose theme the agent overrode is judged here (checkDrawing). Either way
// the block only reports a verdict, and the illustration frame (frame.ts)
// decides on the backdrop.

import type { BlockContext } from './blocks/registry.ts';

/** Text with less contrast than this against what's behind it is unreadable. */
const UNREADABLE_CONTRAST = 3;
/** The block is unreadable when more than this share of its text is. */
const UNREADABLE_SHARE = 0.3;
/** A fill or background at least this opaque is what text is read against. */
const OPAQUE = 0.5;
/** No one piece of text weighs more than this many characters. */
const MAX_WEIGHT = 200;

export type Rgba = [number, number, number, number];

/** Tallies text by length (capped, so one paragraph can't outweigh every label). */
export class Tally {
  private total = 0;
  private unreadable = 0;

  add(text: string, colour: Rgba, under: Rgba): void {
    const weight = Math.min(text.length, MAX_WEIGHT);
    this.total += weight;
    if (contrast(blend(colour, under), under) < UNREADABLE_CONTRAST) this.unreadable += weight;
  }

  get verdict(): boolean {
    return this.total > 0 && this.unreadable / this.total > UNREADABLE_SHARE;
  }
}

// ------------------------------------------------------ page-drawn blocks

const SHAPES = 'rect, polygon, ellipse, circle, path';

/** A filled shape a label may sit on, where it was laid out. */
interface Shape {
  element: SVGGraphicsElement;
  fill: Rgba;
  box: DOMRect;
}

/**
 * Reports, once the drawing is laid out, whether a page-drawn block (an SVG
 * the agent coloured itself) is unreadable on the dark backdrop. Only a draw
 * on the dark theme without the light backdrop is judged; other draws report
 * nothing and the frame keeps its verdict.
 */
export function checkDrawing(target: HTMLElement, context: BlockContext): void {
  if (context.theme !== 'dark' || context.backdrop) return;
  // Steps that aren't showing are mounted but hidden: judge once there's a layout.
  const observer = new ResizeObserver(() => {
    // Replaced by a redraw before it was ever shown: nothing left to judge.
    if (!target.isConnected) return observer.disconnect();
    if (target.getClientRects().length === 0) return;
    observer.disconnect();
    context.events.readability(drawingUnreadable(target));
  });
  observer.observe(target);
}

/**
 * Each piece of text against what a user sees behind it: its own background
 * (an HTML label's), else the topmost filled shape painted before it under
 * its centre, else the backdrop.
 */
export function drawingUnreadable(target: HTMLElement): boolean {
  const backdrop = backdropColour(target);
  const shapes = [...target.querySelectorAll<SVGGraphicsElement>(SHAPES)]
    .map((element) => ({ element, fill: shapeFill(element), box: element.getBoundingClientRect() }))
    .filter((shape): shape is Shape => shape.fill !== null);
  const tally = new Tally();
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue?.trim() ?? '';
    const element = node.parentElement;
    if (!text || !element || /^(script|style|title|desc)$/i.test(element.tagName)) continue;
    // SVG text is painted with its fill; HTML labels (in a foreignObject) with their colour.
    const svgText = element.closest('text');
    const style = getComputedStyle(svgText ?? element);
    if (style.visibility === 'hidden' || style.display === 'none' || element.getClientRects().length === 0) continue;
    const colour = parseColour(svgText ? style.fill : style.color);
    if (!colour || colour[3] === 0) continue;
    const box = (svgText ?? element).getBoundingClientRect();
    const own = ownBackground(element, element.closest('foreignObject') ?? target);
    const under = own ? blend(own, backdrop) : shapeUnder(svgText ?? element, box, shapes, backdrop);
    tally.add(text, colour, under);
  }
  return tally.verdict;
}

/** The first opaque background from `element` up to (not including) `root`, or up to the document's root. */
function ownBackground(element: Element, root?: Element): Rgba | null {
  for (let current: Element | null = element; current && current !== root; current = current.parentElement) {
    const colour = parseColour(getComputedStyle(current).backgroundColor);
    if (colour && colour[3] >= OPAQUE) return colour;
  }
  return null;
}

function shapeUnder(
  text: Element,
  box: DOMRect,
  shapes: Shape[],
  backdrop: Rgba,
): Rgba {
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  let under = backdrop;
  for (const shape of shapes) {
    // Painted later means painted over the text: not behind it.
    if (!(shape.element.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    if (shape.element.contains(text)) continue;
    const { left, right, top, bottom } = shape.box;
    if (x >= left && x <= right && y >= top && y <= bottom) under = blend(shape.fill, backdrop);
  }
  return under;
}

/** A shape's fill as painted (fill-opacity and opacity applied), or null when it paints nothing to speak of. */
function shapeFill(element: SVGGraphicsElement): Rgba | null {
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return null;
  const colour = parseColour(style.fill);
  if (!colour) return null;
  const alpha = colour[3] * Number(style.fillOpacity || 1) * Number(style.opacity || 1);
  return alpha >= OPAQUE ? [colour[0], colour[1], colour[2], alpha] : null;
}

/** The colour the block sits on: the first opaque background above it. */
function backdropColour(target: HTMLElement): Rgba {
  const colour = ownBackground(target);
  if (colour) return [colour[0], colour[1], colour[2], 1];
  return parseColour(getComputedStyle(document.documentElement).getPropertyValue('--canvas')) ?? [14, 16, 20, 1];
}

// ----------------------------------------------------------------- colour

let pixel: CanvasRenderingContext2D | null | undefined;

/** Any CSS colour (Tailwind's are oklch) as sRGB, by painting one pixel with it. `none` and `url(…)` come out transparent. */
export function parseColour(value: string): Rgba | null {
  if (pixel === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    pixel = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!pixel || !value) return null;
  pixel.clearRect(0, 0, 1, 1);
  pixel.fillStyle = '#0000';
  pixel.fillStyle = value;
  pixel.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
  return [r!, g!, b!, a! / 255];
}

export function blend(top: Rgba, under: Rgba): Rgba {
  const a = top[3];
  return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
}

function contrast(a: Rgba, b: Rgba): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

function luminance([r, g, b]: Rgba): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
