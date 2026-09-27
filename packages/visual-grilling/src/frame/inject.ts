// The script the server injects into every sandboxed agent-HTML frame, ahead
// of the agent's own markup. It is the frame's only link to the round page:
//
//   - reports the content height, so the page sizes the iframe to it;
//   - applies the page's theme and the light backdrop (tokens switch live);
//   - in comment mode, snapshots clicks for the page's anchor resolver;
//   - rasterises crops for weak matches;
//   - checks once whether the agent's colours are unreadable on dark;
//   - forwards uncaught script errors, which reach the agent as warnings.
//
// It posts to the page's origin only, and takes messages from its parent only.

import { FRAME_THEME_ATTRIBUTE, FRAME_TOKENS, type ThemeName } from '../core/frame-tokens.ts';
import type { FrameMessage, PageMessage } from '../core/frame-protocol.ts';
import { takeSnapshot } from '../page/anchor-snapshot.ts';
import { rasterCrop } from '../page/crop.ts';

const root = document.documentElement;
// The frame's own origin is opaque; its URL still names the server, which is the page's origin.
const pageOrigin = new URL(location.href).origin;

let theme: ThemeName = root.getAttribute(FRAME_THEME_ATTRIBUTE) === 'light' ? 'light' : 'dark';
let backdrop = false;
let commenting = false;
let loaded = false;
let checked = false;

function post(message: FrameMessage): void {
  parent.postMessage(message, pageOrigin);
}

// ------------------------------------------------------------ page → frame

addEventListener('message', (event: MessageEvent) => {
  if (event.source !== parent) return;
  const message = event.data as PageMessage;
  if (message?.type === 'state') {
    theme = message.theme === 'light' ? 'light' : 'dark';
    backdrop = message.backdrop === true;
    commenting = message.commenting === true;
    apply();
  } else if (message?.type === 'crop') {
    void crop(message.rect).then((image) => post({ type: 'crop', request: message.request, image }));
  }
});

function apply(): void {
  root.setAttribute(FRAME_THEME_ATTRIBUTE, backdrop ? 'light' : theme);
  root.classList.toggle('vg-commenting', commenting);
  checkReadability();
}

// ------------------------------------------------------------- commenting

// Registered before any agent script, so in comment mode a click is a pick
// and nothing the agent wrote sees it.
for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'auxclick']) {
  addEventListener(
    type,
    (event) => {
      if (!commenting) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (type !== 'click') return;
      const { target, clientX, clientY } = event as MouseEvent;
      if (!(target instanceof Element)) return;
      post({ type: 'pick', snapshot: takeSnapshot(target, root, clientX, clientY) });
    },
    { capture: true },
  );
}

// ------------------------------------------------------------------- size

let lastHeight = -1;
function reportSize(): void {
  const height = Math.ceil(root.getBoundingClientRect().height);
  if (height === lastHeight) return;
  lastHeight = height;
  post({ type: 'size', height });
}

const sizes = new ResizeObserver(reportSize);
sizes.observe(root);
document.addEventListener('DOMContentLoaded', () => {
  if (document.body) sizes.observe(document.body);
  reportSize();
});
addEventListener('load', () => {
  reportSize();
  // Let Tailwind (which compiles after the DOM is in) settle before judging colours.
  setTimeout(() => {
    loaded = true;
    checkReadability();
  }, 150);
});

// ----------------------------------------------------------------- errors

addEventListener('error', (event) => {
  if (!(event instanceof ErrorEvent)) return;
  post({ type: 'error', message: event.message || String(event.error) });
});
addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as unknown;
  post({ type: 'error', message: `unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}` });
});

// ------------------------------------------------------------------ crops

async function crop(rect: { x: number; y: number; w: number; h: number }): Promise<string | null> {
  const body = document.body;
  if (!body) return null;
  return rasterCrop(body, root, rect, { backgroundColor: getComputedStyle(root).backgroundColor });
}

// ------------------------------------------------------------ readability

const UNREADABLE_CONTRAST = 3;
const UNREADABLE_SHARE = 0.3;

/**
 * Judged once, on the dark backdrop: text that sits straight on the backdrop
 * (no background of its own on the way up) and has too little contrast with
 * it. When enough of the text is like that, the page gives this frame the
 * light backdrop.
 */
function checkReadability(): void {
  if (checked || !loaded || backdrop || theme !== 'dark' || !document.body) return;
  checked = true;
  const backdropColour = parseColour(FRAME_TOKENS.dark.surface)!;
  let total = 0;
  let unreadable = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue?.trim() ?? '';
    const element = node.parentElement;
    if (!text || !element || /^(script|style|noscript|template)$/i.test(element.tagName)) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none' || element.getClientRects().length === 0) continue;
    if (hasOwnBackground(element)) continue;
    const colour = parseColour(style.color);
    if (!colour) continue;
    const weight = Math.min(text.length, 200);
    total += weight;
    if (contrast(blend(colour, backdropColour), backdropColour) < UNREADABLE_CONTRAST) unreadable += weight;
  }
  post({ type: 'readability', unreadable: total > 0 && unreadable / total > UNREADABLE_SHARE });
}

function hasOwnBackground(element: Element): boolean {
  for (let current: Element | null = element; current && current !== root; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.backgroundImage !== 'none') return true;
    const colour = parseColour(style.backgroundColor);
    if (colour && colour[3] >= 0.5) return true;
  }
  return false;
}

type Rgba = [number, number, number, number];

let pixel: CanvasRenderingContext2D | null | undefined;

/** Any CSS colour (Tailwind's are oklch) as sRGB, by painting one pixel with it. */
function parseColour(value: string): Rgba | null {
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

function blend(top: Rgba, under: Rgba): Rgba {
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
