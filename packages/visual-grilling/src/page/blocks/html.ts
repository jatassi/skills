// The `html` block: the agent's own HTML, in a sandboxed frame that never
// shares the round page's origin.
//
// The frame is loaded by URL (/frame/r<N>/<illustration-id>, never srcdoc)
// with the sandbox below and no allow-same-origin, so its scripts can neither
// read this page nor send its round submission (page writes need this page's
// exact Origin; the frame's is "null"). The server injects the frame script
// (src/frame/inject.ts), which is the frame's only way to talk to the page:
// postMessage, read here as data only (readFrameMessage), and only from one
// of this page's own frames.

import { FRAME_SANDBOX, readFrameMessage, type FrameMessage, type PageMessage } from '../../core/frame-protocol.ts';
import { sourceBlock, type BlockRenderer, type BlockState } from './registry.ts';

const CROP_TIMEOUT_MS = 5_000;
const FRAME_CLASS = 'agent-frame';

const hosts = new WeakMap<HTMLIFrameElement, (message: FrameMessage) => void>();
let listening = false;

function listen(): void {
  if (listening) return;
  listening = true;
  addEventListener('message', (event) => {
    // A sandboxed frame without allow-same-origin always posts from the opaque origin.
    if (event.origin !== 'null' || !event.source) return;
    for (const iframe of document.querySelectorAll<HTMLIFrameElement>(`iframe.${FRAME_CLASS}`)) {
      if (iframe.contentWindow !== event.source) continue;
      const message = readFrameMessage(event.data);
      if (message) hosts.get(iframe)?.(message);
      return;
    }
  });
}

export const htmlBlock: BlockRenderer = {
  render(target, illustration, context) {
    // Only illustrations have a frame so far; an option's mockup shows its source.
    if (!illustration.frame) return sourceBlock.render(target, illustration, context);
    listen();

    const iframe = document.createElement('iframe');
    iframe.className = FRAME_CLASS;
    iframe.setAttribute('sandbox', FRAME_SANDBOX);
    iframe.title = illustration.title ?? illustration.id;
    iframe.src = `${illustration.frame}?theme=${context.theme}`;

    let state: BlockState | undefined;
    let requests = 0;
    const crops = new Map<number, (image: string | null) => void>();
    const send = (message: PageMessage) => iframe.contentWindow?.postMessage(message, '*');

    hosts.set(iframe, (message) => {
      switch (message.type) {
        case 'size':
          iframe.style.height = `${message.height}px`;
          break;
        case 'readability':
          context.events.readability(message.unreadable);
          break;
        case 'pick':
          context.events.pick(message.snapshot);
          break;
        case 'error':
          context.events.scriptError(message.message);
          break;
        case 'crop':
          crops.get(message.request)?.(message.image);
          crops.delete(message.request);
          break;
      }
    });
    // A state sent before the frame's script ran is lost; send it again once it has.
    iframe.addEventListener('load', () => {
      if (state) send({ type: 'state', ...state });
    });
    target.append(iframe);

    return {
      setState(next) {
        state = next;
        send({ type: 'state', ...next });
      },
      crop(rect) {
        return new Promise((resolve) => {
          const request = ++requests;
          crops.set(request, resolve);
          send({ type: 'crop', request, rect });
          setTimeout(() => {
            if (crops.delete(request)) resolve(null);
          }, CROP_TIMEOUT_MS);
        });
      },
    };
  },
};
