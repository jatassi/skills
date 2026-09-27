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
//   GET  /events                           server-sent events: `round`, `terminal`, `finished`
//   GET  /api/rounds                       → RoundIndex (every round of the session, oldest first)
//   GET  /api/rounds/latest | /api/rounds/<n>   → PageRound (404 before the first round)
//   POST /api/rounds/<n>/submission  PageSubmission → {}  (409: submitted or answered in the terminal)
//   POST /api/rounds/<n>/warnings    PageWarning → {}  a page-only draw failure or a frame script error
//   POST /api/activity                     → {}  the user is interacting (keeps the server from idling out)
//   GET  /frame/r<n>/<illustration-id>     an html illustration's sandboxed frame document
//   GET  /frame/r<n>/q<m>/<option>         an option's mockup, framed the same way
//   GET  /frame/assets/<file>              the frame's scripts (inject.js, tailwind.js)

import type { DesignTreeNode, Illustration, RoundError, RoundNote } from './round.ts';
import type { CommentRecord, Verdict } from './submission.ts';

/** The server's identity: a live pid that answers with a different start time is a reused pid. */
export interface PingResponse {
  pid: number;
  startTime: number;
}

export interface PresentRequest {
  source: string;
}

export interface PresentResponse {
  round: number;
  url: string;
  /** What the agent should know about a round that was still shown (an unknown code language). */
  notes: RoundNote[];
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

/** An illustration as the round file declared it, for its block to draw on the page. */
export type PageIllustration = Omit<Illustration, 'line' | 'table'> & {
  table?: PageTable;
  /** For `html`: the path its sandboxed frame is served at, /frame/r<N>/<illustration-id>. */
  frame?: string;
};

export interface PageTableCell {
  /** Rendered from the cell's Markdown with raw HTML escaped. */
  html: string;
  text: string;
}

export interface PageTable {
  align: ('left' | 'center' | 'right' | null)[];
  header: PageTableCell[];
  rows: PageTableCell[][];
}

export interface PageOption {
  letter: string;
  labelHtml: string;
  /** `frame` is the path its sandboxed frame is served at, /frame/r<N>/q<M>/<option>. */
  mockup?: { source: string; tailwind: boolean; frame: string };
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
  /** The round was closed without a submission: the user replied in the terminal. */
  answeredInTerminal?: true;
  /** Present once the round has been submitted: each question's anchored comments by number. */
  comments?: Record<number, CommentRecord[]>;
}

/** A round as the page's round switcher lists it. */
export interface RoundSummary {
  number: number;
  title?: string;
  questions: number;
  state: 'open' | 'submitted' | 'terminal';
}

export interface RoundIndex {
  rounds: RoundSummary[];
}

/** Server-sent event payloads, keyed by event name. */
export interface PageEvents {
  round: { round: number };
  /** An open round was closed by the next `present` or by `end`. */
  terminal: { round: number };
  /** The grilling session is over (`end` or the idle shutdown); no more events follow. */
  finished: Record<string, never>;
}
