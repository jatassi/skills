// The round page: one question per step, tabs Q1…Qn and Review, and one
// round submission sent from the Review step.

import type { PageEvents, PageQuestion, PageRound } from '../core/protocol.ts';
import type { PageAnswer, PageSubmission, Verdict } from '../core/submission.ts';

type Draft = PageAnswer & { ownText?: string; writing?: boolean };

interface State {
  round?: PageRound;
  /** Index into the steps: 0…n-1 are questions, n is Review. */
  step: number;
  drafts: Map<number, Draft>;
  submitting: boolean;
  error?: string;
  finished: boolean;
}

const state: State = { step: 0, drafts: new Map(), submitting: false, finished: false };
const app = document.getElementById('app')!;

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
  events.addEventListener('finished', () => {
    state.finished = true;
    events.close();
    render();
  });
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
  const round = state.round;
  if (!round) return;
  const readOnly = Boolean(round.submitted) || state.finished;
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

  const banner = state.finished
    ? 'Grilling finished.'
    : round.submitted
      ? 'Round submitted · waiting for the next round'
      : undefined;
  app.replaceChildren(
    h('h1', {}, roundHeading(round)),
    ...(banner ? [h('p', { class: 'banner', role: 'status' }, banner)] : []),
    tabs,
    body,
  );
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
    );
  });

  const writing = draft.writing || draft.mode === 'own';
  const textarea = h('textarea', {
    'aria-label': `Your answer to Q${question.number}`,
    disabled: readOnly,
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
    h('h2', {}, `Q${question.number} · ${question.title} `, h('span', { class: 'muted' }, `(${stateLabel(draft)})`)),
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

function reviewPanel(round: PageRound, readOnly: boolean): HTMLElement {
  const unanswered = round.questions.filter((question) => state.drafts.get(question.number)!.mode === 'none');
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

function stateLabel(draft: Draft): string {
  switch (draft.mode) {
    case 'accepted':
    case 'picked':
    case 'own':
      return 'answered';
    case 'unsure':
      return 'unsure';
    case 'none':
      return 'open';
  }
}

function summary(question: PageQuestion, draft: Draft): string {
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
      return 'no answer';
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
  if (!round || round.submitted) return;
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
      return { question: question.number, ...answer };
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

void loadRound('latest');
listen();
