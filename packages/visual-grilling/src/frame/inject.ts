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
import { parseColour, Tally } from '../page/readability.ts';

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
  const tally = new Tally();
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
    tally.add(text, colour, backdropColour);
  }
  post({ type: 'readability', unreadable: tally.verdict });
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
