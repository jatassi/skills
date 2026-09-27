// The round page: one question per step, tabs Q1…Qn and Review, and one
// round submission sent from the Review step.

import type { PageEvents, PageQuestion, PageRound } from '../core/protocol.ts';
import type { PageAnswer, PageComment, PageSubmission, PageWarning, Verdict } from '../core/submission.ts';
import { IllustrationFrame, type FrameSubject } from './frame.ts';

type Draft = PageAnswer & { ownText?: string; writing?: boolean };

interface State {
  round?: PageRound;
  /** Index into the steps: 0…n-1 are questions, n is Review. */
  step: number;
  drafts: Map<number, Draft>;
  /** Anchored comments by question number, in the order they were made. */
  comments: Map<number, PageComment[]>;
  /** Comment mode: a click on an illustration pins a comment instead of acting. */
  commenting: boolean;
  submitting: boolean;
  error?: string;
  /**
   * The page's link to the server: `finished` after `end` or the idle
   * shutdown, `stopped` when the event stream dropped without that. Either way
   * nothing can be sent, but the round and its drafts stay on screen.
   */
  connection: 'open' | 'finished' | 'stopped';
}

const state: State = {
  step: 0,
  drafts: new Map(),
  comments: new Map(),
  commenting: false,
  submitting: false,
  connection: 'open',
};

/** Whether the round can still be answered and sent from this page. */
function canSend(round: PageRound): boolean {
  return !round.submitted && !round.answeredInTerminal && state.connection === 'open';
}
const app = document.getElementById('app')!;
/** One frame per illustration and mockup of the shown round, kept across re-renders. */
let frames = new Map<string, IllustrationFrame>();

// ----------------------------------------------------------------- loading

async function loadRound(which: number | 'latest'): Promise<void> {
  const response = await fetch(`/api/rounds/${which}`);
  if (response.status === 404) return;
  const round = (await response.json()) as PageRound;
  state.round = round;
  state.step = 0;
  state.error = undefined;
  state.drafts = new Map(
    round.questions.map((question) => [question.number, draftFrom(round.submitted?.[question.number])]),
  );
  state.comments = new Map(
    round.questions.map((question) => [
      question.number,
      (round.comments?.[question.number] ?? []).map(({ question: _question, crop: _crop, ...comment }) => comment),
    ]),
  );
  state.commenting = false;
  frames = new Map();
  document.title = roundHeading(round);
  render();
}

function draftFrom(verdict: Verdict | undefined): Draft {
  switch (verdict?.mode) {
    case 'accepted':
      return { mode: 'accepted' };
    case 'picked':
      return { mode: 'picked', option: verdict.option };
    case 'own':
      return { mode: 'own', text: verdict.text, ownText: verdict.text };
    case 'unsure':
      return { mode: 'unsure' };
    default:
      return { mode: 'none' };
  }
}

function listen(): void {
  const events = new EventSource('/events');
  events.addEventListener('round', (event) => {
    const { round } = JSON.parse((event as MessageEvent).data) as PageEvents['round'];
    if (round !== state.round?.number) void loadRound(round);
  });
  events.addEventListener('terminal', (event) => {
    const { round } = JSON.parse((event as MessageEvent).data) as PageEvents['terminal'];
    if (state.round?.number !== round) return;
    state.round.answeredInTerminal = true;
    render();
  });
  events.addEventListener('finished', () => {
    state.connection = 'finished';
    events.close();
    render();
  });
  // The "finished" event always comes before a clean close, so an error
  // while still open means the server went away. A restarted server has a
  // new port, so there is nothing to reconnect to.
  events.addEventListener('error', () => {
    if (state.connection !== 'open') return;
    state.connection = 'stopped';
    events.close();
    render();
  });
}

// ---------------------------------------------------------------- activity

// The user working on the page keeps the server from idling out.
const ACTIVITY_EVERY_MS = 60_000;
let lastActivity = 0;

function reportActivity(): void {
  if (state.connection !== 'open' || Date.now() - lastActivity < ACTIVITY_EVERY_MS) return;
  lastActivity = Date.now();
  void fetch('/api/activity', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(
    () => {},
  );
}

function watchActivity(): void {
  for (const type of ['pointerdown', 'keydown', 'input']) {
    document.addEventListener(type, reportActivity, { capture: true, passive: true });
  }
}

// --------------------------------------------------------------- rendering

type Child = Node | string | false | undefined;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string | boolean | ((event: Event) => void)>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'function') element.addEventListener(key.replace(/^on/, ''), value);
    else if (value === true) element.setAttribute(key, '');
    else if (typeof value === 'string') element.setAttribute(key, value);
  }
  for (const child of children) {
    if (child === false || child === undefined) continue;
    element.append(child);
  }
  return element;
}

function html(className: string, markup: string): HTMLDivElement {
  const element = h('div', { class: className });
  // Rendered by the server from Markdown with raw HTML escaped.
  element.innerHTML = markup;
  return element;
}

function render(): void {
  const notice = serverNotice();
  const round = state.round;
  if (!round) {
    if (notice) app.replaceChildren(notice);
    return;
  }
  const readOnly = !canSend(round);
  const reviewStep = round.questions.length;

  const tabs = h(
    'nav',
    { class: 'tabs', role: 'tablist', 'aria-label': 'Questions' },
    ...round.questions.map((question, index) =>
      h(
        'button',
        {
          role: 'tab',
          'aria-selected': String(state.step === index),
          onclick: () => go(index),
        },
        `Q${question.number}`,
      ),
    ),
    h('button', { role: 'tab', 'aria-selected': String(state.step === reviewStep), onclick: () => go(reviewStep) }, 'Review'),
  );

  const question = round.questions[state.step];
  const body = question ? questionPanel(question, readOnly) : reviewPanel(round, readOnly);

  const roundState = round.answeredInTerminal
    ? 'Answered in the terminal'
    : round.submitted
      ? state.connection === 'open'
        ? 'Round submitted · waiting for the next round'
        : 'Round submitted'
      : undefined;
  const comments = commentCount();
  app.replaceChildren(
    ...(notice ? [notice] : []),
    h('h1', {}, roundHeading(round)),
    ...(comments > 0
      ? [h('p', { class: 'review-bar muted' }, h('span', { class: 'comment-count' }, count(comments, 'comment')))]
      : []),
    ...(roundState ? [h('p', { class: 'banner', role: 'status' }, roundState)] : []),
    tabs,
    body,
  );
}

function serverNotice(): HTMLElement | undefined {
  switch (state.connection) {
    case 'open':
      return undefined;
    case 'finished':
      return h(
        'div',
        { class: 'notice', role: 'alert' },
        h('strong', {}, 'Grilling finished'),
        ' · no more rounds are coming.',
      );
    case 'stopped':
      return h(
        'div',
        { class: 'notice stopped', role: 'alert' },
        h('strong', {}, 'Server stopped'),
        ' · this round can no longer be sent. Your answers stay here to copy.',
      );
  }
}

function questionPanel(question: PageQuestion, readOnly: boolean): HTMLElement {
  const draft = state.drafts.get(question.number)!;
  const set = (next: Draft) => {
    state.drafts.set(question.number, { ...next, ownText: draft.ownText });
    render();
  };

  const optionItems = question.options.map((option) => {
    const label = h('span');
    label.innerHTML = option.labelHtml;
    return h(
      'li',
      {},
      h(
        'button',
        {
          'aria-pressed': String(draft.mode === 'picked' && draft.option === option.letter),
          'aria-label': `Option ${option.letter}: ${label.textContent ?? ''}`,
          disabled: readOnly,
          onclick: () => set({ mode: 'picked', option: option.letter }),
        },
        h('span', { class: 'key' }, option.letter),
        label,
      ),
      option.mockup &&
        frameFor(question, readOnly, {
          illustration: {
            id: `mockup-${option.letter.toLowerCase()}`,
            kind: 'html',
            fence: 'html',
            source: option.mockup.source,
            tailwind: option.mockup.tailwind,
          },
          option: option.letter,
          title: `Mockup ${option.letter}`,
          kindLabel: 'html mockup',
        }),
    );
  });

  const writing = draft.writing || draft.mode === 'own' || Boolean(readOnly && draft.ownText?.trim());
  // Read-only rather than disabled, so a draft stays selectable and copyable.
  const textarea = h('textarea', {
    'aria-label': `Your answer to Q${question.number}`,
    readonly: readOnly,
    oninput: (event) => {
      const text = (event.target as HTMLTextAreaElement).value;
      const next: Draft = text.trim() ? { mode: 'own', text } : { mode: 'none' };
      state.drafts.set(question.number, { ...next, ownText: text, writing: true });
    },
  });
  textarea.value = draft.ownText ?? '';

  const isLast = state.step === (state.round?.questions.length ?? 0) - 1;
  return h(
    'section',
    { class: 'panel', 'aria-label': `Q${question.number}` },
    h(
      'h2',
      {},
      `Q${question.number} · ${question.title} `,
      h('span', { class: 'muted' }, `(${stateLabel(draft, commentsOn(question))})`),
    ),
    html('prose', question.proseHtml),
    h(
      'div',
      { class: 'recommendation' },
      h('strong', {}, 'Recommendation'),
      html('prose', question.recommendation.html),
      h(
        'button',
        {
          'aria-pressed': String(draft.mode === 'accepted'),
          disabled: readOnly,
          onclick: () => set({ mode: 'accepted' }),
        },
        'Accept',
      ),
    ),
    ...question.illustrations.map((illustration) =>
      frameFor(question, readOnly, {
        illustration,
        title: illustration.title ?? illustration.id,
        kindLabel: illustration.kind,
      }),
    ),
    optionItems.length > 0 && h('ul', { class: 'options', 'aria-label': 'Options' }, ...optionItems),
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          'aria-pressed': String(writing),
          disabled: readOnly,
          onclick: () => {
            const text = draft.ownText ?? '';
            set(text.trim() ? { mode: 'own', text, writing: true } : { mode: 'none', writing: true });
          },
        },
        'Write my own answer',
      ),
      h(
        'button',
        {
          'aria-pressed': String(draft.mode === 'unsure'),
          disabled: readOnly,
          onclick: () => set(draft.mode === 'unsure' ? { mode: 'none' } : { mode: 'unsure' }),
        },
        'Unsure',
      ),
      h('button', { onclick: () => go(state.step + 1) }, isLast ? 'Review' : 'Next'),
    ),
    writing && textarea,
  );
}

/** The illustration's frame (its block drawn by the block registry), synced with the question's comments. */
function frameFor(question: PageQuestion, readOnly: boolean, subject: FrameSubject): HTMLElement {
  const key = `${question.number}:${subject.option ? `option ${subject.option}` : subject.illustration.id}`;
  let frame = frames.get(key);
  if (!frame) {
    frame = new IllustrationFrame(subject, {
      toggleCommenting,
      addComment: (comment) => {
        state.comments.get(question.number)!.push(comment);
        render();
      },
      removeComment: (comment) => {
        const list = state.comments.get(question.number)!;
        list.splice(list.indexOf(comment), 1);
        render();
      },
      reportFailure: (message) => {
        // Mockups have no illustration id; their script errors travel another way.
        if (!subject.option) void reportDrawFailure(question.number, subject.illustration.id, message);
      },
    });
    frames.set(key, frame);
  }
  const all = state.comments.get(question.number) ?? [];
  frame.sync({
    comments: all
      .map((comment, index) => ({ number: index + 1, comment }))
      .filter(({ comment }) =>
        subject.option ? comment.option === subject.option : !comment.option && comment.illustration?.id === subject.illustration.id,
      ),
    nextNumber: all.length + 1,
    commenting: state.commenting,
    readOnly,
  });
  return frame.element;
}

/**
 * A block that failed only on the page: the server keeps it for the round's
 * submission, where the agent reads it as a warning. Failing to report is
 * fine; the frame still shows the error.
 */
async function reportDrawFailure(question: number, illustration: string, message: string): Promise<void> {
  const round = state.round;
  if (!round || round.submitted) return;
  const warning: PageWarning = { question, illustration, kind: 'draw', message };
  await fetch(`/api/rounds/${round.number}/warnings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(warning),
  }).catch(() => undefined);
}

function toggleCommenting(): void {
  state.commenting = !state.commenting;
  render();
}

function commentCount(): number {
  let total = 0;
  for (const list of state.comments.values()) total += list.length;
  return total;
}

function reviewPanel(round: PageRound, readOnly: boolean): HTMLElement {
  const unanswered = round.questions.filter(
    (question) => state.drafts.get(question.number)!.mode === 'none' && commentsOn(question) === 0,
  );
  return h(
    'section',
    { class: 'panel', 'aria-label': 'Review' },
    h('h2', {}, 'Review'),
    h(
      'ul',
      { class: 'review' },
      ...round.questions.map((question, index) =>
        h(
          'li',
          {},
          h('span', {}, `Q${question.number} ${question.title} · ${summary(question, state.drafts.get(question.number)!)}`),
          !readOnly && h('button', { onclick: () => go(index), 'aria-label': `Edit Q${question.number}` }, 'Edit'),
        ),
      ),
    ),
    !readOnly &&
      unanswered.length > 0 &&
      h(
        'p',
        { class: 'warning' },
        `${unanswered.length === 1 ? '1 question has' : `${unanswered.length} questions have`} no answer and will be sent as unsure.`,
      ),
    state.error && h('p', { class: 'warning', role: 'alert' }, state.error),
    h(
      'button',
      { class: 'primary', disabled: readOnly || state.submitting, onclick: () => void submit() },
      'Submit round',
    ),
  );
}

function roundHeading(round: PageRound): string {
  return `Round ${round.number}${round.title ? ` · ${round.title}` : ''}`;
}

function stateLabel(draft: Draft, comments: number): string {
  switch (draft.mode) {
    case 'accepted':
    case 'picked':
    case 'own':
      return 'answered';
    case 'unsure':
      return 'unsure';
    case 'none':
      return comments > 0 ? 'comments only' : 'open';
  }
}

function commentsOn(question: PageQuestion): number {
  return state.comments.get(question.number)?.length ?? 0;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function summary(question: PageQuestion, draft: Draft): string {
  const comments = commentsOn(question);
  const verdict = verdictSummary(question, draft, comments);
  return comments > 0 && draft.mode !== 'none' ? `${verdict} · ${count(comments, 'comment')}` : verdict;
}

function verdictSummary(question: PageQuestion, draft: Draft, comments: number): string {
  switch (draft.mode) {
    case 'accepted':
      return question.recommendation.option ? `accepted ${question.recommendation.option}` : 'accepted';
    case 'picked':
      return `picked ${draft.option}`;
    case 'own':
      return `own answer: “${draft.text.trim()}”`;
    case 'unsure':
      return 'unsure';
    case 'none':
      return comments > 0 ? `comments only · ${count(comments, 'comment')}` : 'no answer';
  }
}

function go(step: number): void {
  const last = state.round?.questions.length ?? 0;
  state.step = Math.max(0, Math.min(step, last));
  render();
}

// ------------------------------------------------------------- submission

async function submit(): Promise<void> {
  const round = state.round;
  if (!round || !canSend(round)) return;
  const payload: PageSubmission = {
    round: round.number,
    answers: round.questions.map((question) => {
      const draft = state.drafts.get(question.number)!;
      const answer: PageAnswer =
        draft.mode === 'picked'
          ? { mode: 'picked', option: draft.option }
          : draft.mode === 'own'
            ? { mode: 'own', text: draft.text }
            : { mode: draft.mode };
      return { question: question.number, ...answer, comments: state.comments.get(question.number) ?? [] };
    }),
  };

  state.submitting = true;
  state.error = undefined;
  render();
  try {
    const response = await fetch(`/api/rounds/${round.number}/submission`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `the server answered ${response.status}`);
    }
    await loadRound(round.number);
    state.step = round.questions.length;
  } catch (error) {
    state.error = `Couldn't submit: ${(error as Error).message}`;
  } finally {
    state.submitting = false;
    render();
  }
}

// M toggles comment mode; Escape drops an unsaved comment, then leaves comment mode.
document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || typingIn(event.target)) return;
  if (event.key === 'm' || event.key === 'M') {
    if (!state.round || !canSend(state.round)) return;
    event.preventDefault();
    toggleCommenting();
  } else if (event.key === 'Escape') {
    const cancelled = [...frames.values()].some((frame) => frame.cancel());
    if (!cancelled && state.commenting) toggleCommenting();
  }
});

function typingIn(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
}

// Blocks draw with the theme's tokens: a theme change (data-theme on <html>) redraws them.
new MutationObserver(() => {
  for (const frame of frames.values()) void frame.draw();
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

void loadRound('latest');
listen();
watchActivity();
