// A browser-like global scope for the draw check: a jsdom window with its
// globals copied onto `globalThis`, plus size shims, because jsdom does no
// layout. Sizes are estimated from text length, which is enough to tell a
// diagram that draws from one that throws or comes out empty; the draw check
// never judges layout quality.

import { JSDOM } from 'jsdom';

const CHAR_WIDTH = 8;
const LINE_HEIGHT = 19;

let installed: JSDOM | undefined;

/** Installs the globals once per process; later calls return the same window. */
export function installDomGlobals(): JSDOM {
  if (installed) return installed;
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    pretendToBeVisual: true,
    url: 'http://127.0.0.1/',
  });
  const { window } = dom;
  const target = globalThis as Record<string, unknown>;

  // Everything the window has that Node's global scope lacks, walking the
  // prototype chain so inherited globals (addEventListener…) come along.
  const seen = new Set<string>();
  for (let source: object | null = window; source && source !== Object.prototype; source = Object.getPrototypeOf(source)) {
    for (const key of Object.getOwnPropertyNames(source)) {
      if (seen.has(key)) continue;
      seen.add(key);
      if (key in target) continue;
      Object.defineProperty(target, key, {
        configurable: true,
        get: () => (window as unknown as Record<string, unknown>)[key],
        set: (value) => {
          (window as unknown as Record<string, unknown>)[key] = value;
        },
      });
    }
  }
  // Node has its own versions of these; libraries expect the DOM's.
  for (const key of ['window', 'self', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'Event', 'EventTarget', 'CustomEvent', 'MutationObserver', 'DOMParser', 'getComputedStyle']) {
    Object.defineProperty(target, key, {
      configurable: true,
      writable: true,
      value: (window as unknown as Record<string, unknown>)[key],
    });
  }
  installSizeShims(window);
  installed = dom;
  return dom;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The width a block-level container gets: about a narrow side pane. */
const CONTAINER_WIDTH = 700;
const NOT_DRAWN = new Set(['style', 'script', 'title', 'desc', 'defs']);

/** The element's visible text, one entry per line (`<br>` and block breaks split lines). */
function visibleLines(element: Element): string[] {
  const lines: string[] = [''];
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      const parts = (node.nodeValue ?? '').split('\n');
      lines[lines.length - 1] += parts[0]!;
      for (const part of parts.slice(1)) lines.push(part);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node as Element).localName;
    if (NOT_DRAWN.has(tag)) return;
    if (tag === 'br' || tag === 'tspan') lines.push('');
    for (const child of node.childNodes) walk(child);
  };
  walk(element);
  return lines.map((line) => line.trim()).filter(Boolean);
}

function estimate(element: Element): Box {
  return measureText(visibleLines(element));
}

function measureText(lines: string[]): Box {
  const longest = Math.max(0, ...lines.map((line) => line.length));
  return { x: 0, y: 0, width: longest * CHAR_WIDTH, height: lines.length * LINE_HEIGHT };
}

function installSizeShims(window: JSDOM['window']): void {
  const htmlProto = window.HTMLElement.prototype;
  const blockTags = new Set(['div', 'body', 'html', 'section', 'main', 'figure', 'p']);
  for (const [name, axis] of [
    ['offsetWidth', 'width'],
    ['clientWidth', 'width'],
    ['offsetHeight', 'height'],
    ['clientHeight', 'height'],
  ] as const) {
    Object.defineProperty(htmlProto, name, {
      configurable: true,
      get(this: HTMLElement) {
        const box = estimate(this);
        return axis === 'width' && blockTags.has(this.localName) ? Math.max(CONTAINER_WIDTH, box.width) : box[axis];
      },
    });
  }
  // Some diagram types measure text on a canvas (mindmap's cytoscape layout).
  window.HTMLCanvasElement.prototype.getContext = function getContext() {
    return new Proxy(
      {
        measureText: (text: string) => {
          const box = measureText([String(text)]);
          return { width: box.width, actualBoundingBoxAscent: 14, actualBoundingBoxDescent: 4, fontBoundingBoxAscent: 14, fontBoundingBoxDescent: 4 };
        },
      } as Record<string | symbol, unknown>,
      { get: (target, key) => (key in target ? target[key] : () => undefined), set: () => true },
    ) as unknown as null;
  } as typeof window.HTMLCanvasElement.prototype.getContext;

  const svgProto = window.SVGElement.prototype as unknown as Record<string, unknown>;
  svgProto.getBBox = function getBBox(this: Element) {
    return estimate(this);
  };
  svgProto.getComputedTextLength = function getComputedTextLength(this: Element) {
    return estimate(this).width;
  };
  window.Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element) {
    const { x, y, width, height } = estimate(this);
    return { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height, toJSON: () => ({}) } as DOMRect;
  };
}
