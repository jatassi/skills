// The messages between the round page and a sandboxed agent-HTML frame.
//
// A frame never shares the page's origin: it is served by URL
// (/frame/r<N>/<illustration-id>, or /frame/r<N>/q<M>/<option> for a
// mockup) with the sandbox below and no
// allow-same-origin, so all it can do is postMessage. The page accepts a
// message only when event.source is one of its own frames, and reads it with
// readFrameMessage: plain data of a known shape, never markup or code.

import type { Box, Snapshot, SnapshotElement } from './anchor.ts';
import type { ThemeName } from './frame-tokens.ts';

/** Exactly what the iframe's sandbox attribute and the frame's CSP `sandbox` directive allow. */
export const FRAME_SANDBOX =
  'allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads';

/** Frame → page. */
export type FrameMessage =
  /** The frame's content height, so the page can size the iframe to it. */
  | { type: 'size'; height: number }
  /** Whether the agent's colours are unreadable on the dark backdrop. Sent once, from a dark draw. */
  | { type: 'readability'; unreadable: boolean }
  /** A click in comment mode, snapshotted for the resolver. */
  | { type: 'pick'; snapshot: Snapshot }
  /** The answer to a crop request: a PNG data URL, or null when it couldn't be drawn. */
  | { type: 'crop'; request: number; image: string | null }
  /** An uncaught script error or unhandled rejection. */
  | { type: 'error'; message: string };

/** Page → frame. */
export type PageMessage =
  | { type: 'state'; theme: ThemeName; backdrop: boolean; commenting: boolean }
  /** Rasterise this part of the frame (relative to its root) for a weak match's crop. */
  | { type: 'crop'; request: number; rect: Box };

const MAX_CHAIN = 64;
const MAX_PEERS = 400;
const MAX_TEXTS = 300;
const MAX_ATTRS = 40;
/** A crop is a small region; a bigger image is not one of ours. */
export const MAX_CROP_DATA_URL = 1_500_000;
export const PNG_DATA_URL = 'data:image/png;base64,';

/** Reads a message from a frame, or null when it isn't one of ours. Everything is copied and bounded. */
export function readFrameMessage(data: unknown): FrameMessage | null {
  const input = object(data);
  if (!input) return null;
  switch (input.type) {
    case 'size':
      return isNumber(input.height) ? { type: 'size', height: Math.max(0, Math.min(Math.round(input.height), 100_000)) } : null;
    case 'readability':
      return typeof input.unreadable === 'boolean' ? { type: 'readability', unreadable: input.unreadable } : null;
    case 'pick': {
      const snapshot = readSnapshot(input.snapshot);
      return snapshot ? { type: 'pick', snapshot } : null;
    }
    case 'crop': {
      if (!isNumber(input.request)) return null;
      const image =
        typeof input.image === 'string' && input.image.startsWith(PNG_DATA_URL) && input.image.length <= MAX_CROP_DATA_URL
          ? input.image
          : null;
      return { type: 'crop', request: input.request, image };
    }
    case 'error':
      return typeof input.message === 'string' ? { type: 'error', message: input.message.slice(0, 500) } : null;
    default:
      return null;
  }
}

function readSnapshot(raw: unknown): Snapshot | null {
  const input = object(raw);
  if (!input || !Array.isArray(input.chain) || input.chain.length === 0) return null;
  const root = object(input.root);
  const click = object(input.click);
  if (!root || !click || !isNumber(root.w) || !isNumber(root.h) || !isNumber(click.x) || !isNumber(click.y)) return null;

  const chain: SnapshotElement[] = [];
  for (const item of input.chain.slice(0, MAX_CHAIN)) {
    const element = object(item);
    const box = readBox(element?.box);
    if (!element || !box) return null;
    const nth = object(element.nth);
    chain.push({
      tag: text(element.tag, 40),
      attrs: attrs(element.attrs),
      text: text(element.text, 140),
      title: typeof element.title === 'string' ? element.title.slice(0, 140) : null,
      nth:
        nth && isNumber(nth.i) && isNumber(nth.of) ? { cls: text(nth.cls, 100), i: nth.i, of: nth.of } : null,
      box,
    });
  }
  const list = (value: unknown, max: number) => (Array.isArray(value) ? value.slice(0, max) : []);
  return {
    chain,
    root: { w: root.w, h: root.h },
    click: { x: click.x, y: click.y },
    selector: text(input.selector, 1_000),
    peers: list(input.peers, MAX_PEERS).flatMap((item) => {
      const peer = object(item);
      if (!peer) return [];
      const box = readBox(peer.box);
      return [{ tag: text(peer.tag, 40), attrs: attrs(peer.attrs), text: text(peer.text, 80), ...(box ? { box } : {}) }];
    }),
    texts: list(input.texts, MAX_TEXTS).flatMap((item) => {
      const entry = object(item);
      const box = readBox(entry?.box);
      return entry && box ? [{ text: text(entry.text, 40), box, svg: isNumber(entry.svg) ? entry.svg : -1 }] : [];
    }),
    clickSvg: isNumber(input.clickSvg) ? input.clickSvg : -1,
  };
}

function readBox(raw: unknown): Box | null {
  const box = object(raw);
  if (!box || !isNumber(box.x) || !isNumber(box.y) || !isNumber(box.w) || !isNumber(box.h)) return null;
  return { x: box.x, y: box.y, w: box.w, h: box.h };
}

function attrs(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const input = object(raw);
  if (!input) return out;
  for (const [name, value] of Object.entries(input).slice(0, MAX_ATTRS)) {
    if (typeof value === 'string' && /^[a-z][a-z0-9_:-]{0,60}$/.test(name)) out[name] = value.slice(0, 200);
  }
  return out;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
