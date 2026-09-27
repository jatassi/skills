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
//   GET  /events                           server-sent events: `round`, `finished`
//   GET  /api/rounds/latest | /api/rounds/<n>   → PageRound (404 before the first round)
//   POST /api/rounds/<n>/submission  PageSubmission → {}

import type { DesignTreeNode, Illustration, RoundError } from './round.ts';
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

/** An illustration as the round file declared it; block tickets draw it on the page. */
export type PageIllustration = Omit<Illustration, 'line'>;

export interface PageOption {
  letter: string;
  labelHtml: string;
  mockup?: { source: string; tailwind: boolean };
}

export interface PageQuestion {
  number: number;
  title: string;
  proseHtml: string;
  illustrations: PageIllustration[];
  options: PageOption[];
  recommendation: { html: string; option?: string };
}

export interface PageRound {
  number: number;
  title?: string;
  /** The whole design tree as of this round; absent when the round has none. */
  designTree?: DesignTreeNode[];
  questions: PageQuestion[];
  /** Present once the round has been submitted: each question's verdict by number. */
  submitted?: Record<number, Verdict>;
}

/** Server-sent event payloads, keyed by event name. */
export interface PageEvents {
  round: { round: number };
  finished: Record<string, never>;
}
