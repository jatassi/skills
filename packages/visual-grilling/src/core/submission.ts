// The round submission: what the page sends, the structured record saved as
// `submissions/round-N.json`, and the text `await` prints for the agent.

import { anchorLine, type Anchor, type Box } from './anchor.ts';
import { MAX_CROP_DATA_URL, PNG_DATA_URL } from './frame-protocol.ts';
import type { Question, Round } from './round.ts';

/** One question's answer as the page sends it. */
export type PageAnswer =
  | { mode: 'accepted' }
  | { mode: 'picked'; option: string }
  | { mode: 'own'; text: string }
  | { mode: 'unsure' }
  | { mode: 'none' };

/**
 * An anchored comment as the page sends it: the resolved anchor plus the
 * text, and for a weak match a crop of the spot as a PNG data URL. The server
 * trusts none of it beyond its shape, takes the illustration's kind and title
 * from the round, and saves the crop as a file.
 */
export type PageComment = Anchor & { text: string; cropImage?: string };

/**
 * A problem only the page saw, reported as it happens (POST
 * /api/rounds/<n>/warnings) and carried by the round's submission: a block
 * that failed to draw on the page, or an uncaught script error in agent HTML.
 */
export interface PageWarning {
  question: number;
  /** The illustration's id. */
  illustration: string;
  kind: 'draw' | 'script';
  message: string;
}

export interface PageSubmission {
  round: number;
  answers: ({ question: number; comments?: PageComment[] } & PageAnswer)[];
}

/**
 * `comments` is "comments only, no verdict": no answer, but comments. Like
 * `unsure` and `none`, it leaves the question open.
 */
export type Verdict =
  | { mode: 'accepted'; option?: string; label?: string; recommendation: string }
  | { mode: 'picked'; option: string; label: string }
  | { mode: 'own'; text: string }
  | { mode: 'unsure' }
  | { mode: 'comments' }
  | { mode: 'none' };

/** An anchored comment in the saved record. `crop` is the absolute path of a weak match's crop image. */
export type CommentRecord = Omit<PageComment, 'cropImage'> & { question: number; crop?: string };

export interface WarningRecord {
  kind: 'draw' | 'script';
  illustration: { id: string; lang: string };
  message: string;
}

export interface QuestionRecord {
  number: number;
  title: string;
  verdict: Verdict;
  comments: CommentRecord[];
  warnings: WarningRecord[];
}

export interface SubmissionRecord {
  round: number;
  title?: string;
  submittedAt: string;
  questions: QuestionRecord[];
}

/**
 * Checks a page submission against its round and builds the saved record.
 * Throws with a readable message when the payload doesn't fit the round.
 */
export function buildRecord(
  roundNumber: number,
  round: Round,
  submission: PageSubmission,
  submittedAt: Date,
  warnings: PageWarning[] = [],
): SubmissionRecord {
  if (submission.round !== roundNumber) {
    throw new Error(`submission is for round ${submission.round}, not round ${roundNumber}`);
  }
  const byQuestion = new Map<number, PageAnswer>();
  for (const answer of submission.answers ?? []) {
    if (!round.questions.some((question) => question.number === answer.question)) {
      throw new Error(`round ${roundNumber} has no Q${answer.question}`);
    }
    byQuestion.set(answer.question, answer);
  }

  const questions = round.questions.map((question): QuestionRecord => {
    const answer = byQuestion.get(question.number) ?? { mode: 'none' };
    const rawComments: unknown = (answer as { comments?: unknown }).comments ?? [];
    if (!Array.isArray(rawComments) || rawComments.length > MAX_COMMENTS) {
      throw new Error(`Q${question.number}: comments must be a list of at most ${MAX_COMMENTS}`);
    }
    const comments = rawComments.map((comment, index) => readComment(comment, question, index + 1));
    let verdict: Verdict;
    switch (answer.mode) {
      case 'accepted': {
        const pointer = question.recommendation.option;
        const option = question.options.find((candidate) => candidate.letter === pointer);
        verdict = {
          mode: 'accepted',
          ...(option ? { option: option.letter, label: option.text } : {}),
          recommendation: question.recommendation.text,
        };
        break;
      }
      case 'picked': {
        const option = question.options.find((candidate) => candidate.letter === answer.option);
        if (!option) throw new Error(`Q${question.number} has no option ${answer.option}`);
        verdict = { mode: 'picked', option: option.letter, label: option.text };
        break;
      }
      case 'own': {
        const text = String(answer.text ?? '').trim();
        verdict = text ? { mode: 'own', text } : { mode: 'none' };
        break;
      }
      case 'unsure':
        verdict = { mode: 'unsure' };
        break;
      case 'none':
        verdict = { mode: 'none' };
        break;
      default:
        throw new Error(`Q${question.number}: unknown answer mode`);
    }
    if (verdict.mode === 'none' && comments.length > 0) verdict = { mode: 'comments' };
    const questionWarnings = warnings
      .filter((warning) => warning.question === question.number)
      .map((warning): WarningRecord => {
        const illustration = question.illustrations.find((candidate) => candidate.id === warning.illustration)!;
        return { kind: warning.kind, illustration: { id: illustration.id, lang: illustration.fence }, message: warning.message };
      });
    return { number: question.number, title: question.title, verdict, comments, warnings: questionWarnings };
  });

  return {
    round: roundNumber,
    ...(round.title ? { title: round.title } : {}),
    submittedAt: submittedAt.toISOString(),
    questions,
  };
}

const WARNING_MESSAGE_LIMIT = 2_000;

/** Checks a page warning against its round. Throws with a readable message when it doesn't fit. */
export function checkWarning(round: Round, payload: unknown): PageWarning {
  const body = (typeof payload === 'object' && payload !== null ? payload : {}) as Partial<Record<keyof PageWarning, unknown>>;
  const question = round.questions.find((candidate) => candidate.number === body.question);
  if (!question) throw new Error(`the round has no Q${String(body.question)}`);
  const illustration = question.illustrations.find((candidate) => candidate.id === body.illustration);
  if (!illustration) throw new Error(`Q${question.number} has no illustration "${String(body.illustration)}"`);
  if (body.kind !== 'draw' && body.kind !== 'script') throw new Error('unknown warning kind');
  if (body.kind === 'script' && illustration.kind !== 'html') throw new Error('only html illustrations run scripts');
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, WARNING_MESSAGE_LIMIT) : '';
  if (!message) throw new Error('a warning needs a message');
  return { question: question.number, illustration: illustration.id, kind: body.kind, message };
}

/**
 * The crop images a submission carries, decoded, keyed `<question>:<comment
 * number>`. Throws with a readable message on anything but a modest PNG.
 */
export function cropImages(submission: PageSubmission): Map<string, Buffer> {
  const crops = new Map<string, Buffer>();
  // Like buildRecord, the last answer for a question is the one that counts.
  const answers = new Map((submission.answers ?? []).map((answer) => [answer.question, answer]));
  for (const answer of answers.values()) {
    const comments: unknown = (answer as { comments?: unknown }).comments;
    if (!Array.isArray(comments)) continue;
    comments.forEach((comment: unknown, index) => {
      const image = record(comment)?.cropImage;
      if (image === undefined || image === null) return;
      const where = `Q${answer.question} comment ${index + 1}`;
      if (typeof image !== 'string' || !image.startsWith(PNG_DATA_URL) || image.length > MAX_CROP_DATA_URL) {
        throw new Error(`${where}: cropImage must be a PNG data URL of at most ${MAX_CROP_DATA_URL} characters`);
      }
      const png = Buffer.from(image.slice(PNG_DATA_URL.length), 'base64');
      if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${where}: cropImage is not a PNG`);
      crops.set(`${answer.question}:${index + 1}`, png);
    });
  }
  return crops;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The text `await` prints for a submitted round. */
export function renderSubmission(record: SubmissionRecord, recordPath: string): string {
  const warningCount = record.questions.reduce((sum, question) => sum + question.warnings.length, 0);
  const head = ['submitted', `round ${record.round}`];
  if (record.title) head.push(record.title);
  if (warningCount > 0) head.push(count(warningCount, 'warning'));

  const lines = [head.join(' · '), `record: ${recordPath}`, ''];
  for (const question of record.questions) {
    lines.push(`Q${question.number} ${question.title}`);
    lines.push(`   ${verdictLine(question)}`);
    question.comments.forEach((comment, index) => {
      lines.push(`   ${commentLine(comment, index + 1)}`);
    });
    for (const warning of question.warnings) {
      lines.push(`   ⚠ ${warningLine(warning)}`);
    }
  }

  lines.push('', 'summary:');
  for (const question of record.questions) {
    const parts = [`Q${question.number} ${question.title}`, summaryVerdict(question)];
    if (question.comments.length > 0) parts.push(count(question.comments.length, 'comment'));
    if (question.warnings.length > 0) parts.push(count(question.warnings.length, 'warning'));
    lines.push(parts.join(' · '));
  }
  return `${lines.join('\n')}\n`;
}

function verdictLine(question: QuestionRecord): string {
  const { verdict } = question;
  switch (verdict.mode) {
    case 'accepted':
      return verdict.option
        ? `accepted: ${verdict.option} · ${verdict.label}`
        : `accepted: ${firstSentence(verdict.recommendation)}`;
    case 'picked':
      return `picked ${verdict.option}: ${verdict.label}`;
    case 'own':
      return `own answer: ${quote(verdict.text)}`;
    case 'unsure':
      return 'unsure';
    case 'comments':
      return 'comments only, no verdict';
    case 'none':
      return 'no answer (sent as unsure)';
  }
}

function summaryVerdict(question: QuestionRecord): string {
  const { verdict } = question;
  switch (verdict.mode) {
    case 'accepted':
      return verdict.option ? `accepted ${verdict.option}` : 'accepted';
    case 'picked':
      return `picked ${verdict.option}`;
    case 'own':
      return 'own answer';
    case 'unsure':
      return 'unsure';
    case 'comments':
      return 'comments only';
    case 'none':
      return 'no answer';
  }
}

function commentLine(comment: CommentRecord, index: number): string {
  return `comment ${index} · ${anchorLine(comment, comment.crop)}: ${quote(comment.text)}`;
}

// ------------------------------------------------------- comment checking

const MAX_COMMENTS = 200;
const MAX_COMMENT_TEXT = 4_000;

/**
 * Checks one comment from the page and builds its record. The page resolved
 * the anchor; this only bounds its shape and ties it to an illustration (or a
 * mockup) the question really has.
 */
function readComment(raw: unknown, question: Question, index: number): CommentRecord {
  const where = `Q${question.number} comment ${index}`;
  const fail = (message: string): never => {
    throw new Error(`${where}: ${message}`);
  };
  const input = record(raw) ?? fail('must be an object');
  const field = (value: unknown, name: string, max: number): string =>
    typeof value === 'string' ? value.slice(0, max) : fail(`${name} must be a string`);
  const optional = (value: unknown, name: string, max: number): string | null =>
    value === null || value === undefined ? null : field(value, name, max);
  const number = (value: unknown, name: string): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fail(`${name} must be a number`);

  const text = field(input.text, 'text', MAX_COMMENT_TEXT).trim();
  if (!text) fail('text is empty');

  let subject: Pick<CommentRecord, 'illustration' | 'option'>;
  if (input.option !== undefined && input.option !== null) {
    const letter = field(input.option, 'option', 2);
    if (!question.options.some((option) => option.letter === letter && option.mockup)) {
      fail(`option ${letter} has no mockup`);
    }
    subject = { option: letter };
  } else {
    const id = field(record(input.illustration)?.id, 'illustration.id', 100);
    const illustration =
      question.illustrations.find((candidate) => candidate.id === id) ??
      fail(`Q${question.number} has no illustration "${id}"`);
    subject = {
      illustration: { id, kind: illustration.kind, ...(illustration.title ? { title: illustration.title } : {}) },
    };
  }

  const target = record(input.target) ?? fail('target must be an object');
  const clicked = record(input.clicked) ?? fail('clicked must be an object');
  const position = record(input.position) ?? fail('position must be an object');
  const near = Array.isArray(input.near) ? input.near.slice(0, 3).map((item) => field(item, 'near', 60)) : [];
  const box = input.box === null || input.box === undefined ? null : readBox(record(input.box) ?? fail('box must be an object'));

  function readBox(value: Record<string, unknown>): Box {
    return { x: number(value.x, 'box.x'), y: number(value.y, 'box.y'), w: number(value.w, 'box.w'), h: number(value.h, 'box.h') };
  }
  const clamp = (value: number) => Math.min(100, Math.max(0, value));

  return {
    question: question.number,
    ...subject,
    target: {
      kind: field(target.kind, 'target.kind', 80),
      ref: optional(target.ref, 'target.ref', 300),
      label: optional(target.label, 'target.label', 300),
      via: field(target.via, 'target.via', 60),
      weak: target.weak === true,
    },
    clicked: {
      tag: field(clicked.tag, 'clicked.tag', 40),
      role: optional(clicked.role, 'clicked.role', 60),
      text: field(clicked.text ?? '', 'clicked.text', 80),
    },
    within: optional(input.within, 'within', 200),
    near,
    position: { x: clamp(number(position.x, 'position.x')), y: clamp(number(position.y, 'position.y')) },
    selector: field(input.selector ?? '', 'selector', 1_000),
    box,
    text,
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function warningLine(warning: WarningRecord): string {
  const { id, lang } = warning.illustration;
  const what = warning.kind === 'draw' ? 'failed to draw on the page' : 'script error';
  return `${lang} "${id}" ${what}: ${oneLine(warning.message)}`;
}

const SENTENCE_LIMIT = 80;

/** The first sentence of a free-text recommendation, cut to about 80 characters. */
export function firstSentence(text: string): string {
  const flat = oneLine(text);
  const end = /[.!?](?=\s|$)/.exec(flat);
  const sentence = end ? flat.slice(0, end.index + 1) : flat;
  if (sentence.length <= SENTENCE_LIMIT) return sentence;
  // Whole words while they fit with the ellipsis; a single huge word is cut hard.
  let cut = '';
  for (const word of sentence.split(' ')) {
    const next = cut ? `${cut} ${word}` : word;
    if (next.replace(/[,;:]+$/, '').length + 1 > SENTENCE_LIMIT) break;
    cut = next;
  }
  if (!cut) cut = sentence.slice(0, SENTENCE_LIMIT - 1);
  return `${cut.replace(/[,;:]+$/, '')}…`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function quote(text: string): string {
  return JSON.stringify(oneLine(text));
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
