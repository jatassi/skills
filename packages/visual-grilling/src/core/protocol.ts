// The server's HTTP surface, shared by the CLI, the server and the page.
//
// Control routes (CLI → server), all POST with a JSON body:
//   /control/ping                         → PingResponse
//   /control/present  PresentRequest      → PresentResponse (422: PresentRejection)
//   /control/await    AwaitRequest        → AwaitResponse   (409: { error })
//   /control/end                          → {}
//
// Page routes (page → server):
//   GET  /                                 the round page
//   GET  /assets/<file>                    page scripts and styles
//   GET  /events                           server-sent events: `round`, `submitted`, `finished`
//   GET  /api/rounds/latest | /api/rounds/<n>   → PageRound (404 before the first round)
//   POST /api/rounds/<n>/submission  PageSubmission → {}

import type { RoundError } from './round.ts';
import type { Verdict } from './submission.ts';

export interface PingResponse {
  pid: number;
}

export interface PresentRequest {
  source: string;
}

export interface PresentResponse {
  round: number;
  url: string;
}

export interface PresentRejection {
  errors: RoundError[];
}

export interface AwaitRequest {
  timeoutMs: number;
}

export interface AwaitResponse {
  outcome: 'submitted' | 'pending' | 'superseded';
  /** Everything `await` prints; the first line names the outcome. */
  text: string;
}

export interface PageQuestion {
  number: number;
  title: string;
  proseHtml: string;
  options: { letter: string; labelHtml: string }[];
  recommendation: { html: string; option?: string };
}

export interface PageRound {
  number: number;
  title?: string;
  questions: PageQuestion[];
  /** Present once the round has been submitted: each question's verdict by number. */
  submitted?: Record<number, Verdict>;
}

/** Server-sent event payloads, keyed by event name. */
export interface PageEvents {
  round: { round: number };
  submitted: { round: number };
  finished: Record<string, never>;
}
