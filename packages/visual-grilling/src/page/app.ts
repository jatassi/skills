// The round page: a sticky review bar, one question per step (tabs Q1…Qn and
// Review), the design tree beside them, and one round submission sent from the
// Review step. Past rounds of the session open read-only from the bar.
//
// A round's question panels are built once while it is on screen and updated
// in place, so illustrations (and their frames) are never rebuilt by answering.
// Steps that aren't showing stay mounted, just hidden. Each illustration and
// mockup sits in an IllustrationFrame (frame.ts), which draws its block and
// holds its pinned comments.

import type {
  PageEvents,
  PageQuestion,
  PageRound,
  RoundIndex,
  RoundSummary,
} from '../core/protocol.ts';
import type { PageAnswer, PageComment, PageSubmission, PageWarning, Verdict } from '../core/submission.ts';
import { fill, h, html, icon, kbd, plain, type Child, type IconName } from './dom.ts';
import { IllustrationFrame, type FrameSubject } from './frame.ts';
import { keyCommand, type KeyCommand } from './keys.ts';
import { currentTheme, initTheme, toggleTheme } from './theme.ts';
import { designTree } from './tree.ts';

type Draft = PageAnswer & { ownText?: string; writing?: boolean };

/** One round as this page holds it: the round, the user's drafts, and the step on screen. */
interface RoundView {
  round: PageRound;
  drafts: Map<number, Draft>;
  /** Anchored comments by question number, in the order they were made. */
  comments: Map<number, PageComment[]>;
  /** Index into the steps: 0…n-1 are questions, n is Review. */
  step: number;
}

interface State {
  /** The newest round of the session: the only one that can be answered. */
  latest: number;
  /** The round on screen. */
  shown?: number;
  views: Map<number, RoundView>;
  index: RoundSummary[];
  submitting: boolean;
  error?: string;
  /**
   * The page's link to the server: `finished` after `end` or the idle
   * shutdown, `stopped` when the event stream dropped without that. Either way
   * nothing can be sent, but the round and its drafts stay on screen.
   */
  connection: 'open' | 'finished' | 'stopped';
  drawer: boolean;
  menu: boolean;
  /** Comment mode: a click on an illustration pins a comment instead of acting. */
  commenting: boolean;
}

const state: State = {
  latest: 0,
  views: new Map(),
  index: [],
  submitting: false,
  connection: 'open',
  drawer: false,
  menu: false,
  commenting: false,
};

/** Whether the round can still be answered and sent from this page. */
function canSend(round: PageRound): boolean {
  return (
    round.number === state.latest && !round.submitted && !round.answeredInTerminal && state.connection === 'open'
  );
}

function shownView(): RoundView | undefined {
  return state.shown === undefined ? undefined : state.views.get(state.shown);
}

const SUBMIT_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘↵' : 'Ctrl ↵';

// ----------------------------------------------------------------- loading

async function refreshIndex(): Promise<void> {
  const response = await fetch('/api/rounds');
  if (!response.ok) return;
  state.index = ((await response.json()) as RoundIndex).rounds;
  state.latest = Math.max(state.latest, ...state.index.map((round) => round.number));
}

/** Puts round `n` on screen, keeping any drafts this page already holds for it. */
async function showRound(n: number, step?: number): Promise<void> {
  const response = await fetch(`/api/rounds/${n}`);
  if (!response.ok) return;
  const round = (await response.json()) as PageRound;
  let view = state.views.get(n);
  if (!view) {
    view = { round, drafts: draftsFrom(round), comments: commentsFrom(round), step: 0 };
    state.views.set(n, view);
  } else {
    view.round = round;
    if (round.submitted) {
      view.drafts = draftsFrom(round);
      view.comments = commentsFrom(round);
    }
  }
  if (step !== undefined) view.step = step;
  const moved = state.shown !== n;
  if (moved) state.commenting = false;
  state.shown = n;
  state.menu = false;
  state.drawer = false;
  state.error = undefined;
  document.title = roundHeading(round);
  render();
  if (moved) window.scrollTo({ top: 0 });
}

function commentsFrom(round: PageRound): Map<number, PageComment[]> {
  return new Map(
    round.questions.map((question) => [
      question.number,
      (round.comments?.[question.number] ?? []).map(({ question: _question, crop: _crop, ...comment }) => comment),
    ]),
  );
}

function draftsFrom(round: PageRound): Map<number, Draft> {
  return new Map(round.questions.map((question) => [question.number, draftFrom(round.submitted?.[question.number])]));
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
    if (round <= state.latest && state.views.has(round)) return;
    state.latest = Math.max(state.latest, round);
    void refreshIndex().then(() => showRound(round));
  });
  events.addEventListener('terminal', (event) => {
    const { round } = JSON.parse((event as MessageEvent).data) as PageEvents['terminal'];
    const view = state.views.get(round);
    if (view) view.round.answeredInTerminal = true;
    for (const summary of state.index) if (summary.number === round) summary.state = 'terminal';
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

// ------------------------------------------------------------------ shell

const root = document.getElementById('app')!;
const bar = h('header', { class: 'bar' });
const notices = h('div', { class: 'notices' });
const tabs = h('nav', { class: 'steps', role: 'tablist', 'aria-label': 'Questions' });
const stepHost = h('div', { class: 'step-host' });
const stepNav = h('div', { class: 'stepnav' });
const side = h('aside', { class: 'side', 'aria-label': 'Design tree' });
const shell = h(
  'div',
  { class: 'shell' },
  h('main', { class: 'main' }, h('div', { class: 'col' }, notices, tabs, stepHost, stepNav)),
  side,
);
const scrim = h('div', { class: 'scrim', onclick: () => setDrawer(false) });
const drawer = h('aside', { class: 'drawer', id: 'tree-drawer', 'aria-label': 'Design tree' });
const menu = h('div', { class: 'pop menu', role: 'menu', 'aria-label': 'Rounds', hidden: true });

// ------------------------------------------------------------- rendering

/** The question panels of the round on screen, built once per showing. */
interface Mounted {
  view: RoundView;
  panels: QuestionPanel[];
  review: HTMLElement;
  /** Every illustration and mockup frame of the round. */
  frames: IllustrationFrame[];
}
let mounted: Mounted | undefined;

function render(): void {
  const view = shownView();
  if (!view) {
    const notice = serverNotice();
    if (notice) root.replaceChildren(notice);
    return;
  }
  if (!root.contains(bar)) root.replaceChildren(bar, shell, scrim, drawer, menu);

  // Controls rebuilt below get their focus back through data-key.
  const focusKey = document.activeElement?.getAttribute('data-key');

  if (mounted?.view !== view) mount(view);
  const readOnly = !canSend(view.round);
  const reviewStep = view.round.questions.length;

  fill(bar, barContent(view, readOnly));
  fill(notices, [serverNotice(), roundBanner(view)]);
  tabs.replaceChildren(...stepTabs(view));
  mounted!.panels.forEach((panel, index) => {
    panel.el.hidden = view.step !== index;
    panel.update();
  });
  mounted!.review.hidden = view.step !== reviewStep;
  fill(mounted!.review, reviewContent(view, readOnly));
  fill(stepNav, stepNavContent(view));
  renderTree(view);
  renderMenu();

  const active = document.activeElement;
  if (focusKey && (!active || active === document.body || !root.contains(active))) {
    root.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
  }
}

function mount(view: RoundView): void {
  const panels = view.round.questions.map((question) => questionPanel(view, question));
  const review = h('section', { class: 'review', id: 'review', 'aria-label': 'Review' });
  stepHost.replaceChildren(...panels.map((panel) => panel.el), review);
  mounted = { view, panels, review, frames: panels.flatMap((panel) => panel.frames) };
}

function barContent(view: RoundView, readOnly: boolean): Child[] {
  const round = view.round;
  const answered = countAnswered(view);
  const tree = Boolean(round.designTree);
  const current = round.number === state.latest;
  return [
    tree &&
      h(
        'button',
        {
          class: 'btn ghost icon-btn tree-toggle',
          'aria-label': 'Design tree',
          'aria-expanded': String(state.drawer),
          'aria-controls': 'tree-drawer',
          'data-key': 'tree-toggle',
          onclick: () => setDrawer(!state.drawer),
        },
        icon('tree'),
      ),
    h(
      'h1',
      { class: 'round-h' },
      h(
        'button',
        {
          class: 'btn ghost round-btn',
          'aria-haspopup': 'menu',
          'aria-expanded': String(state.menu),
          'data-key': 'rounds',
          onclick: () => void setMenu(!state.menu),
        },
        `Round ${round.number}`,
        icon('down'),
      ),
      round.title && h('span', { class: 'subject' }, ` · ${round.title}`),
    ),
    h('span', { class: 'grow' }),
    h(
      'span',
      { class: 'count' },
      h('b', {}, String(answered)),
      ` / ${round.questions.length}`,
      h('span', { class: 'w' }, ' answered'),
    ),
    commentTotal(view) > 0 &&
      h(
        'span',
        { class: 'comment-count', title: 'Anchored comments' },
        icon('comment'),
        String(commentTotal(view)),
        h('span', { class: 'w' }, commentTotal(view) === 1 ? ' comment' : ' comments'),
      ),
    h(
      'button',
      {
        class: 'btn ghost icon-btn',
        'aria-label': `Switch to ${currentTheme() === 'dark' ? 'light' : 'dark'} theme`,
        'data-key': 'theme',
        onclick: () => {
          toggleTheme();
          render();
        },
      },
      icon(currentTheme() === 'dark' ? 'sun' : 'moon'),
    ),
    current &&
      h(
        'button',
        {
          class: 'btn primary',
          'aria-keyshortcuts': 'Meta+Enter Control+Enter',
          'data-key': 'submit',
          disabled: readOnly || state.submitting,
          onclick: () => requestSubmit(view),
        },
        ...(round.submitted
          ? [icon('check'), 'Submitted']
          : [icon('up'), 'Submit round', !readOnly && kbd(SUBMIT_KEY)]),
      ),
  ];
}

function serverNotice(): HTMLElement | undefined {
  switch (state.connection) {
    case 'open':
      return undefined;
    case 'finished':
      return h(
        'div',
        { class: 'banner notice', role: 'alert' },
        h('span', {}, h('b', {}, 'Grilling finished'), ' · no more rounds are coming.'),
      );
    case 'stopped':
      return h(
        'div',
        { class: 'banner notice stopped', role: 'alert' },
        h('span', {}, h('b', {}, 'Server stopped'), ' · this round can no longer be sent. Your answers stay here to copy.'),
      );
  }
}

function roundBanner(view: RoundView): HTMLElement | undefined {
  const round = view.round;
  if (round.number !== state.latest) {
    const how = round.submitted ? ' was submitted' : round.answeredInTerminal ? ' was answered in the terminal' : '';
    return h(
      'div',
      { class: 'banner past' },
      icon('lock'),
      h('span', {}, `Round ${round.number}${how}. It is read-only.`),
      h('span', { class: 'grow' }),
      h(
        'button',
        { class: 'btn sm', 'data-key': 'back', onclick: () => void showRound(state.latest) },
        `Back to round ${state.latest}`,
      ),
    );
  }
  if (round.answeredInTerminal) {
    return h('div', { class: 'banner' }, icon('terminal'), h('span', { role: 'status' }, 'Answered in the terminal'));
  }
  if (round.submitted) {
    const waiting = state.connection === 'open';
    return h(
      'div',
      { class: 'banner sent' },
      waiting && h('span', { class: 'wait-dot', 'aria-hidden': 'true' }),
      h('span', { role: 'status' }, waiting ? 'Round submitted · waiting for the next round' : 'Round submitted'),
    );
  }
  return undefined;
}

function stepTabs(view: RoundView): HTMLElement[] {
  const reviewStep = view.round.questions.length;
  return [
    ...view.round.questions.map((question, index) =>
      h(
        'button',
        {
          class: 'step',
          role: 'tab',
          'aria-selected': String(view.step === index),
          'aria-controls': `q${question.number}`,
          'data-key': `tab-${index}`,
          onclick: () => go(view, index),
        },
        stateIcon(questionState(view, question.number)),
        `Q${question.number}`,
      ),
    ),
    h(
      'button',
      {
        class: 'step',
        role: 'tab',
        'aria-selected': String(view.step === reviewStep),
        'aria-controls': 'review',
        'data-key': 'tab-review',
        onclick: () => go(view, reviewStep),
      },
      icon('up'),
      'Review',
    ),
  ];
}

function stepNavContent(view: RoundView): Child[] {
  const last = view.round.questions.length;
  if (view.step === last) return [];
  return [
    h(
      'button',
      { class: 'btn ghost nav', 'data-key': 'previous', disabled: view.step === 0, onclick: () => go(view, view.step - 1) },
      icon('left'),
      'Previous',
      kbd('K'),
    ),
    h('span', { class: 'grow' }),
    h(
      'button',
      { class: 'btn nav', 'data-key': 'next', onclick: () => go(view, view.step + 1) },
      view.step === last - 1 ? 'Review round' : 'Next',
      icon('right'),
      kbd('J'),
    ),
  ];
}

// --------------------------------------------------------- question panel

interface QuestionPanel {
  el: HTMLElement;
  /** Brings the panel's answer parts in line with the draft. */
  update(): void;
  /** Focuses the own-answer box. */
  focusAnswer(): void;
  frames: IllustrationFrame[];
}

function questionPanel(view: RoundView, question: PageQuestion): QuestionPanel {
  const n = question.number;
  const frames: { frame: IllustrationFrame; subject: FrameSubject }[] = [];
  const comments = () => view.comments.get(n)!;
  const frame = (subject: FrameSubject): HTMLElement => {
    const made = new IllustrationFrame(subject, {
      toggleCommenting,
      addComment: (comment) => {
        comments().push(comment);
        render();
      },
      removeComment: (comment) => {
        comments().splice(comments().indexOf(comment), 1);
        render();
      },
      reportWarning: (kind, message) => {
        const about = subject.option ? { option: subject.option } : { illustration: subject.illustration.id };
        void reportWarning(view.round, { question: n, ...about, kind, message });
      },
    });
    frames.push({ frame: made, subject });
    return made.element;
  };
  const header = h('header', { class: 'qp-h' });
  const recommendation = h('div', { class: 'rec-slot' });

  const optionButtons = question.options.map((option) => {
    const label = h('span', { class: 'opt-l' });
    label.innerHTML = option.labelHtml;
    return h(
      'button',
      {
        class: 'opt',
        'aria-label': `Option ${option.letter}: ${plain(option.labelHtml)}`,
        'aria-keyshortcuts': option.letter,
        'data-key': `option-${n}-${option.letter}`,
        onclick: () => act(view, n, { kind: 'pick', letter: option.letter }),
      },
      h('span', { class: 'radio', 'aria-hidden': 'true' }),
      h('span', { class: 'opt-k', 'aria-hidden': 'true' }, option.letter),
      label,
    );
  });
  const options =
    question.options.length > 0 &&
    h(
      'div',
      { class: 'opts', role: 'group', 'aria-label': 'Options' },
      ...question.options.map((_, index) => h('div', { class: 'opt-row' }, optionButtons[index])),
    );
  // Mockups sit side by side as cards keyed by letter, above the options they
  // illustrate; a click on a card picks its option.
  const withMockups = question.options.filter((option) => option.mockup);
  const mockups =
    withMockups.length > 0 &&
    h(
      'div',
      { class: 'mockups', role: 'group', 'aria-label': 'Mockups' },
      ...withMockups.map((option) => {
        const mockup = option.mockup!;
        const title = `Mockup ${option.letter}`;
        return frame({
          illustration: {
            id: `mockup-${option.letter.toLowerCase()}`,
            kind: 'html',
            fence: 'html',
            title,
            source: mockup.source,
            tailwind: mockup.tailwind,
            frame: mockup.frame,
          },
          option: option.letter,
          title,
          kindLabel: 'html mockup',
          card: {
            labelHtml: option.labelHtml,
            recommended: question.recommendation.option === option.letter,
            pick: () => act(view, n, { kind: 'pick', letter: option.letter }),
          },
        });
      }),
    );

  // Read-only rather than disabled, so a draft stays selectable and copyable.
  const textarea = h('textarea', {
    'aria-label': `Your answer to Q${n}`,
    placeholder: 'Your answer, in your own words. It replaces the recommendation.',
    rows: '3',
    oninput: () => {
      const text = textarea.value;
      const next: Draft = text.trim() ? { mode: 'own', text } : { mode: 'none' };
      view.drafts.set(n, { ...next, ownText: text, writing: true });
      render();
    },
  });
  const note = h('div');
  const foot = h('div', { class: 'ans-foot' });

  const el = h(
    'section',
    { class: 'qp', id: `q${n}`, 'aria-label': `Q${n}` },
    header,
    h(
      'div',
      { class: 'qp-b' },
      html('prose', question.proseHtml),
      recommendation,
      ...question.illustrations.map((illustration) =>
        frame({ illustration, title: illustration.title ?? illustration.id, kindLabel: illustration.kind }),
      ),
      mockups,
      options,
      textarea,
      note,
      foot,
    ),
  );

  function update(): void {
    const draft = view.drafts.get(n)!;
    const readOnly = !canSend(view.round);
    const accepted = draft.mode === 'accepted';
    const all = comments();
    /** The option is the answer: picked, or accepted through the recommendation's letter. */
    const chosen = (letter: string) =>
      (draft.mode === 'picked' && draft.option === letter) || (accepted && question.recommendation.option === letter);

    fill(header, [
      stateIcon(questionState(view, n)),
      h('span', { class: 'num' }, `Q${n}`),
      h('h2', { class: 'qp-title' }, question.title),
      h('span', { class: 'grow' }),
      draft.mode !== 'none' && all.length > 0 && commentCount(all.length),
      stateChip(questionState(view, n), draft, all.length),
    ]);

    for (const { frame: each, subject } of frames) {
      each.sync({
        comments: all
          .map((comment, index) => ({ number: index + 1, comment }))
          .filter(({ comment }) =>
            subject.option
              ? comment.option === subject.option
              : !comment.option && comment.illustration?.id === subject.illustration.id,
          ),
        nextNumber: all.length + 1,
        commenting: state.commenting,
        readOnly,
        chosen: subject.option !== undefined && chosen(subject.option),
      });
    }

    recommendation.replaceChildren(
      h(
        'div',
        { class: `rec${accepted ? ' is-on' : ''}` },
        h(
          'div',
          { class: 'rec-t' },
          h('span', { class: 'rec-k' }, accepted ? 'Accepted' : 'Recommended'),
          question.recommendation.option && h('span', { class: 'ref' }, question.recommendation.option),
          html('prose', question.recommendation.html),
        ),
        h(
          'button',
          {
            class: `btn sm${accepted ? ' ok' : ''}`,
            'aria-pressed': String(accepted),
            'aria-keyshortcuts': 'Enter',
            'data-key': `accept-${n}`,
            disabled: readOnly,
            onclick: () => act(view, n, { kind: 'accept' }),
          },
          ...(accepted ? [icon('check'), 'Accepted'] : ['Accept']),
          !readOnly && kbd('↵'),
        ),
      ),
    );

    question.options.forEach((option, index) => {
      const button = optionButtons[index]!;
      const on = chosen(option.letter);
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
      button.disabled = readOnly;
    });

    const ownText = draft.ownText ?? '';
    textarea.hidden = !(draft.writing || draft.mode === 'own' || (readOnly && ownText.trim()));
    textarea.readOnly = readOnly;
    if (textarea.value !== ownText) textarea.value = ownText;

    note.replaceChildren(
      ...(draft.mode === 'unsure'
        ? [
            h(
              'p',
              { class: 'note un' },
              icon('help'),
              h('span', {}, 'Unsure. This stays on the frontier and comes back in a later round.'),
            ),
          ]
        : []),
    );

    const writing = !textarea.hidden;
    foot.hidden = readOnly;
    foot.replaceChildren(
      ...(readOnly
        ? []
        : [
            h(
              'button',
              {
                class: 'btn ghost sm',
                'aria-pressed': String(writing),
                'aria-keyshortcuts': 'W',
                'data-key': `write-${n}`,
                onclick: () =>
                  writing
                    ? answer(view, n, { mode: 'none', ownText: '', writing: false })
                    : act(view, n, { kind: 'write' }),
              },
              icon(writing ? 'x' : 'pen'),
              writing ? 'Discard my answer' : 'Write my own answer',
              !writing && kbd('W'),
            ),
            h(
              'button',
              {
                class: `btn ghost sm${draft.mode === 'unsure' ? ' on-un' : ''}`,
                'aria-pressed': String(draft.mode === 'unsure'),
                'aria-keyshortcuts': 'U',
                'data-key': `unsure-${n}`,
                onclick: () => act(view, n, { kind: 'unsure' }),
              },
              icon('help'),
              'Unsure',
              kbd('U'),
            ),
          ]),
    );
  }

  return {
    el,
    update,
    focusAnswer: () => textarea.focus(),
    frames: frames.map(({ frame: each }) => each),
  };
}

/**
 * A block that failed only on the page, or a script error in agent HTML: the
 * server keeps it for the round's submission, where the agent reads it as a
 * warning. Failing to report is fine; a draw failure still shows in its frame.
 */
async function reportWarning(round: PageRound, warning: PageWarning): Promise<void> {
  if (!canSend(round)) return;
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

// ------------------------------------------------------------ Review step

function reviewContent(view: RoundView, readOnly: boolean): Child[] {
  const round = view.round;
  const unanswered = round.questions.filter((question) => questionState(view, question.number) === 'none').length;
  return [
    h(
      'div',
      { class: 'review-h' },
      h('h2', {}, `Review round ${round.number}`),
      h(
        'p',
        {},
        `${countAnswered(view)} of ${round.questions.length} answered.`,
        !readOnly && ' The whole round goes back to the agent at once.',
      ),
    ),
    h(
      'ul',
      { class: 'rv-list' },
      ...round.questions.map((question, index) => {
        const draft = view.drafts.get(question.number)!;
        const questionComments = view.comments.get(question.number)!.length;
        const verb = readOnly ? 'View' : 'Edit';
        return h(
          'li',
          { class: 'rv' },
          stateIcon(questionState(view, question.number)),
          h('span', { class: 'num' }, `Q${question.number}`),
          h('span', { class: 'rv-t' }, question.title),
          h(
            'button',
            {
              class: 'btn ghost sm nav',
              'aria-label': `${verb} Q${question.number}`,
              'data-key': `edit-${question.number}`,
              onclick: () => go(view, index),
            },
            verb,
          ),
          h('span', { class: 'rv-a' }, summaryLine(question, draft, questionComments)),
        );
      }),
    ),
    h(
      'div',
      { class: 'review-f' },
      !readOnly &&
        unanswered > 0 &&
        h(
          'p',
          { class: 'warn' },
          icon('help'),
          `${unanswered} unanswered question${unanswered === 1 ? '' : 's'} will be sent as unsure.`,
        ),
      state.error && h('p', { class: 'warn', role: 'alert' }, state.error),
      !readOnly && h('p', { class: 'hint' }, 'Send it with Submit round in the bar, or ', kbd(SUBMIT_KEY), '.'),
    ),
  ];
}

function summaryLine(question: PageQuestion, draft: Draft, comments: number): string {
  const verdict = verdictLine(question, draft);
  if (draft.mode === 'none') return comments > 0 ? `Comments only · ${plural(comments, 'comment')}, no verdict` : verdict;
  return comments > 0 ? `${verdict} · ${plural(comments, 'comment')}` : verdict;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function verdictLine(question: PageQuestion, draft: Draft): string {
  const optionLabel = (letter: string) => {
    const option = question.options.find((candidate) => candidate.letter === letter);
    return option ? `${letter}: ${plain(option.labelHtml)}` : letter;
  };
  switch (draft.mode) {
    case 'accepted': {
      const letter = question.recommendation.option;
      return letter ? `Accepted ${optionLabel(letter)}` : `Accepted: ${firstSentence(plain(question.recommendation.html))}`;
    }
    case 'picked':
      return `Picked ${optionLabel(draft.option)}`;
    case 'own':
      return `Own answer: “${draft.text.trim()}”`;
    case 'unsure':
      return 'Unsure, stays on the frontier';
    case 'none':
      return 'No answer';
  }
}

function firstSentence(text: string): string {
  const sentence = /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
  return sentence.length > 80 ? `${sentence.slice(0, 79).trimEnd()}…` : sentence;
}

// ------------------------------------------------------------ design tree

function renderTree(view: RoundView): void {
  const nodes = view.round.designTree;
  side.hidden = drawer.hidden = scrim.hidden = !nodes;
  if (!nodes) return;
  const current = view.round.questions[view.step]?.number;
  const roundOf = (question: number) => view.round.questionRounds?.[question] ?? view.round.number;
  const open = (question: number) => {
    state.drawer = false;
    void openQuestion(roundOf(question), question);
  };
  const elsewhere = (question: number) => (roundOf(question) === view.round.number ? undefined : roundOf(question));
  side.replaceChildren(designTree(nodes, { current, open, elsewhere, keyPrefix: 'side' }));
  drawer.replaceChildren(
    h(
      'button',
      {
        class: 'btn ghost icon-btn drawer-close',
        'aria-label': 'Close design tree',
        'data-key': 'drawer-close',
        onclick: () => setDrawer(false),
      },
      icon('x'),
    ),
    designTree(nodes, { current, open, elsewhere, keyPrefix: 'drawer' }),
  );
  drawer.classList.toggle('open', state.drawer);
  scrim.classList.toggle('open', state.drawer);
}

/** Opens a question the design tree links to, switching to its round first when it's an earlier one. */
async function openQuestion(round: number, question: number): Promise<void> {
  // A failed fetch leaves this round on screen; the render below still closes the drawer.
  if (round !== state.shown) await showRound(round).catch(() => undefined);
  const view = state.views.get(round);
  if (!view || state.shown !== round) return render();
  const index = view.round.questions.findIndex((candidate) => candidate.number === question);
  if (index >= 0) go(view, index);
  else render();
}

function setDrawer(open: boolean): void {
  state.drawer = open;
  render();
  if (open) drawer.querySelector<HTMLElement>('.qref, .drawer-close')?.focus();
}

// ---------------------------------------------------------- round switcher

async function setMenu(open: boolean): Promise<void> {
  if (open) await refreshIndex();
  state.menu = open;
  render();
  if (open) menu.querySelector<HTMLElement>('[aria-checked="true"], [role="menuitemradio"]')?.focus();
}

function renderMenu(): void {
  menu.hidden = !state.menu;
  if (!state.menu) return;
  const anchor = bar.querySelector('.round-btn')?.getBoundingClientRect();
  menu.style.left = `${Math.max(12, anchor?.left ?? 12)}px`;
  menu.replaceChildren(
    ...[...state.index].reverse().map((summary) =>
      h(
        'button',
        {
          class: 'rm',
          role: 'menuitemradio',
          'aria-checked': String(summary.number === state.shown),
          'data-key': `round-${summary.number}`,
          onclick: () => void showRound(summary.number),
        },
        summary.number === state.shown ? icon('check') : h('span'),
        h(
          'span',
          {},
          `Round ${summary.number}`,
          summary.title && h('span', { class: 'rm-t' }, ` · ${summary.title}`),
          h('small', {}, roundStatus(summary)),
        ),
        h('span', { class: 'meta' }, `${summary.questions} Q`),
      ),
    ),
  );
}

function roundStatus(summary: RoundSummary): string {
  const how = { open: '', submitted: 'Submitted', terminal: 'Answered in the terminal' }[summary.state];
  if (summary.number === state.latest) return how ? `Current round · ${how.toLowerCase()}` : 'Current round';
  return `${how} · read-only`;
}

// ---------------------------------------------------------------- answers

function answer(view: RoundView, n: number, next: Draft): void {
  const previous = view.drafts.get(n)!;
  view.drafts.set(n, { ...next, ownText: next.ownText ?? previous.ownText });
  render();
}

function act(view: RoundView, n: number, command: KeyCommand): boolean {
  if (!canSend(view.round)) return false;
  const question = view.round.questions.find((candidate) => candidate.number === n)!;
  const draft = view.drafts.get(n)!;
  switch (command.kind) {
    case 'accept':
      answer(view, n, { mode: 'accepted' });
      return true;
    case 'pick':
      if (!question.options.some((option) => option.letter === command.letter)) return false;
      answer(view, n, { mode: 'picked', option: command.letter });
      return true;
    case 'unsure':
      answer(view, n, draft.mode === 'unsure' ? { mode: 'none' } : { mode: 'unsure' });
      return true;
    case 'write': {
      const text = draft.ownText ?? '';
      if (!draft.writing && draft.mode !== 'own') {
        answer(view, n, text.trim() ? { mode: 'own', text, writing: true } : { mode: 'none', writing: true });
      }
      mounted?.panels.find((panel) => panel.el.id === `q${n}`)?.focusAnswer();
      return true;
    }
    default:
      return false;
  }
}

function go(view: RoundView, step: number): void {
  const next = Math.max(0, Math.min(step, view.round.questions.length));
  const moved = next !== view.step;
  view.step = next;
  render();
  if (moved) window.scrollTo({ top: 0 });
}

function onKey(event: KeyboardEvent): void {
  const command = keyCommand(event);
  const view = shownView();
  if (!command || !view) return;

  if (command.kind === 'escape') {
    // Innermost first: an unsaved comment, comment mode, then the menu, drawer or answer box.
    if (mounted?.frames.some((frame) => frame.cancel())) return;
    if (state.commenting) toggleCommenting();
    else if (state.menu) void setMenu(false).then(() => bar.querySelector<HTMLElement>('.round-btn')?.focus());
    else if (state.drawer) setDrawer(false);
    else if (document.activeElement instanceof HTMLTextAreaElement) document.activeElement.blur();
    return;
  }
  if (state.menu) return;

  switch (command.kind) {
    case 'submit':
      event.preventDefault();
      requestSubmit(view);
      return;
    case 'next':
      go(view, view.step + 1);
      return;
    case 'previous':
      go(view, view.step - 1);
      return;
    case 'comment':
      if (!canSend(view.round)) return;
      event.preventDefault();
      toggleCommenting();
      return;
  }
  const question = view.round.questions[view.step];
  if (question && act(view, question.number, command)) event.preventDefault();
}

/** Submit round (bar or ⌘↵): from a question it opens the Review step; from Review it sends. */
function requestSubmit(view: RoundView): void {
  if (!canSend(view.round) || state.submitting) return;
  const reviewStep = view.round.questions.length;
  if (view.step !== reviewStep) {
    go(view, reviewStep);
    return;
  }
  void submit(view);
}

// Arrow keys move through the round switcher's items.
menu.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
  const at = items.indexOf(document.activeElement as HTMLElement);
  items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
});

document.addEventListener('click', (event) => {
  const target = event.target as Element;
  // A mouse click on a control leaves no focus behind, so Enter goes on
  // accepting rather than pressing that control again. (The control itself
  // may already be replaced by the render the click caused.) Controls that
  // open something move focus into it, and W moves it to the answer box.
  if (event.detail > 0 && target.closest('button, a') && !target.closest('.round-btn, .tree-toggle, .menu')) {
    queueMicrotask(() => {
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement || active instanceof HTMLAnchorElement) active.blur();
    });
  }
  if (state.menu && !target.closest('.menu, .round-btn')) void setMenu(false);
});

// ------------------------------------------------------------------ status

/** A question's state: its verdict, or `comments` when it has only comments. */
type QuestionState = Draft['mode'] | 'comments';

function questionState(view: RoundView, n: number): QuestionState {
  const mode = view.drafts.get(n)!.mode;
  return mode === 'none' && view.comments.get(n)!.length > 0 ? 'comments' : mode;
}

/** How each state shows: its tone (green decided, purple commented, amber unsure) and icons. */
const STATE_LOOK: Record<QuestionState, { tone?: 'ok' | 'cm' | 'un'; icon: IconName; chipIcon?: IconName }> = {
  accepted: { tone: 'ok', icon: 'done', chipIcon: 'check' },
  picked: { tone: 'ok', icon: 'done', chipIcon: 'check' },
  own: { tone: 'ok', icon: 'done', chipIcon: 'check' },
  unsure: { tone: 'un', icon: 'help', chipIcon: 'help' },
  comments: { tone: 'cm', icon: 'comment', chipIcon: 'comment' },
  none: { icon: 'open' },
};

function countAnswered(view: RoundView): number {
  return view.round.questions.filter((question) => questionState(view, question.number) !== 'none').length;
}

function commentTotal(view: RoundView): number {
  let total = 0;
  for (const list of view.comments.values()) total += list.length;
  return total;
}

function roundHeading(round: PageRound): string {
  return `Round ${round.number}${round.title ? ` · ${round.title}` : ''}`;
}

function stateIcon(questionState: QuestionState): HTMLElement {
  const look = STATE_LOOK[questionState];
  return h('span', { class: `st${look.tone ? ` ${look.tone}` : ''}` }, icon(look.icon));
}

function stateChip(questionState: QuestionState, draft: Draft, comments: number): HTMLElement {
  const label = {
    accepted: 'Accepted',
    picked: `Picked ${draft.mode === 'picked' ? draft.option : ''}`,
    own: 'Own answer',
    unsure: 'Unsure',
    comments: `Comments only · ${comments}`,
    none: 'No answer',
  }[questionState];
  const look = STATE_LOOK[questionState];
  return h(
    'span',
    { class: `chip${look.tone ? ` tone-${look.tone}` : ''}` },
    look.chipIcon && icon(look.chipIcon),
    label,
  );
}

/** A question's comment count beside its verdict chip. */
function commentCount(n: number): HTMLElement {
  return h('span', { class: 'cm-count', title: plural(n, 'comment') }, icon('comment'), String(n));
}

// ------------------------------------------------------------- submission

async function submit(view: RoundView): Promise<void> {
  const round = view.round;
  if (!canSend(round)) return;
  const payload: PageSubmission = {
    round: round.number,
    answers: round.questions.map((question) => {
      const draft = view.drafts.get(question.number)!;
      const answer: PageAnswer =
        draft.mode === 'picked'
          ? { mode: 'picked', option: draft.option }
          : draft.mode === 'own'
            ? { mode: 'own', text: draft.text }
            : { mode: draft.mode };
      return { question: question.number, ...answer, comments: view.comments.get(question.number) ?? [] };
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
    await showRound(round.number, round.questions.length);
    void refreshIndex();
  } catch (error) {
    state.error = `Couldn't submit: ${(error as Error).message}`;
  } finally {
    state.submitting = false;
    render();
  }
}

// ------------------------------------------------------------------- start

initTheme();
// Blocks draw with the theme's tokens: a theme change (data-theme on <html>) redraws them.
new MutationObserver(() => {
  for (const frame of mounted?.frames ?? []) frame.retheme();
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
document.addEventListener('keydown', onKey);
void refreshIndex().then(() => (state.latest > 0 ? showRound(state.latest) : undefined));
listen();
watchActivity();
