// The server's request guards and security headers, kept apart from routing so
// every route gets them from one place.
//
// Three kinds of request reach the server:
//   control     /control/*, from the CLI. POST-only, and never from a browser:
//               any Origin or Sec-Fetch-* header is refused.
//   page write  any other POST, from the round page. Origin must be exactly
//               http://<the request's Host>, so the page's own address
//               (127.0.0.1 or localhost) and only that; the body JSON.
//   page read   GET (only) for the page, its assets, rounds, the event stream,
//               and agent-HTML frames with their scripts.
// Every request must name the server in Host (127.0.0.1:<port> or
// localhost:<port>), which blocks DNS rebinding. The server never answers a
// preflight and never sends CORS headers, so a browser keeps every other
// origin's reads and non-simple writes out on its own.

import type { IncomingMessage, OutgoingHttpHeaders } from 'node:http';
import { FRAME_SANDBOX } from '../core/frame-protocol.ts';

export interface Rejection {
  status: number;
  error: string;
}

/**
 * Headers every response carries. Nothing but a frame document may be framed:
 * the round page's iframes have no sandbox attribute (the frame's own CSP
 * sandboxes it), so a frame that navigated itself to any other response here
 * would get the page's origin. The page and frame headers set their own CSP.
 */
export const BASE_HEADERS: OutgoingHttpHeaders = {
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "frame-ancestors 'none'",
};

const ROUND_PAGE_CSP = [
  "default-src 'self'",
  // WebAssembly compiles only (Graphviz); JavaScript eval stays blocked.
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Headers for the round page document itself. */
export const ROUND_PAGE_HEADERS: OutgoingHttpHeaders = {
  ...BASE_HEADERS,
  'content-security-policy': ROUND_PAGE_CSP,
};

/**
 * An agent-HTML frame's own policy: permissive, since the agent may write any
 * HTML (any script, eval included; any style; images, fonts and connections
 * from anywhere), and sandboxed by the response itself, so the document never
 * gets the page's origin, in the page's iframe or opened on its own. The
 * iframe carries no sandbox attribute: some browsers (Claude's built-in one
 * among them) refuse to load an iframe that has one.
 */
const FRAME_CSP = [
  "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
  "script-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
  "style-src * data: blob: 'unsafe-inline'",
  'img-src * data: blob:',
  'font-src * data: blob:',
  'connect-src * data: blob:',
  'media-src * data: blob:',
  `sandbox ${FRAME_SANDBOX}`,
].join('; ');

/** Headers for an agent-HTML frame document (/frame/r<N>/<illustration-id>). */
export const FRAME_HEADERS: OutgoingHttpHeaders = {
  ...BASE_HEADERS,
  'content-security-policy': FRAME_CSP,
};

/**
 * Checks a request before any route sees it. Returns why it is refused, or
 * `undefined` when routing may go on. It reads headers only, never the body.
 *
 * `route` must be the very pathname the router dispatches on (dot segments
 * already resolved), so the guard and the router can never disagree about
 * which kind of route a request is.
 */
export function guardRequest(req: IncomingMessage, route: string, port: number): Rejection | undefined {
  const host = (req.headers.host ?? '').toLowerCase();
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
    return { status: 403, error: 'Host must be 127.0.0.1:<port> or localhost:<port>' };
  }

  const method = req.method ?? '';

  if (route.startsWith('/control/')) {
    if (method !== 'POST') return { status: 405, error: 'control routes are POST-only' };
    if (fromBrowser(req)) return { status: 403, error: 'control routes refuse requests from a browser' };
    return undefined;
  }

  if (method === 'POST') {
    // Host is already one of our two names, so this admits only the page
    // itself, at whichever of them it was opened, and never a mixed pair.
    if (req.headers.origin !== `http://${host}`) {
      return { status: 403, error: `page writes must come from the round page's own Origin, http://${host}` };
    }
    if (!isJson(req.headers['content-type'])) {
      return { status: 415, error: 'page writes must be application/json' };
    }
    return undefined;
  }

  if (method !== 'GET') return { status: 405, error: 'method not allowed' };
  return undefined;
}

/** A browser sends Origin on every non-GET request and Sec-Fetch-* on every request. */
function fromBrowser(req: IncomingMessage): boolean {
  return Object.keys(req.headers).some((name) => name === 'origin' || name.startsWith('sec-fetch-'));
}

function isJson(contentType: string | undefined): boolean {
  return contentType?.split(';')[0]!.trim().toLowerCase() === 'application/json';
}
