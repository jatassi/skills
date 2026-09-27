// The round submission: what the page sends, the structured record saved as
// `submissions/round-N.json`, and the text `await` prints for the agent.

import type { Round } from './round.ts';

/** One question's answer as the page sends it. */
export type PageAnswer =
  | { mode: 'accepted' }
  | { mode: 'picked'; option: string }
  | { mode: 'own'; text: string }
  | { mode: 'unsure' }
  | { mode: 'none' };

export interface PageSubmission {
  round: number;
  answers: ({ question: number } & PageAnswer)[];
}

export type Verdict =
  | { mode: 'accepted'; option?: string; label?: string; recommendation: string }
  | { mode: 'picked'; option: string; label: string }
  | { mode: 'own'; text: string }
  | { mode: 'unsure' }
  | { mode: 'none' };

/**
 * An anchored comment. `anchor` is the `anchorLine` form (illustration and
 * element in the source's own terms); `weak` carries the fallback detail that
 * only weak matches print.
 */
export interface CommentRecord {
  anchor: string;
  text: string;
  weak?: { near?: string; across: number; down: number; crop?: string };
}

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
    return { number: question.number, title: question.title, verdict, comments: [], warnings: [] };
  });

  return {
    round: roundNumber,
    ...(round.title ? { title: round.title } : {}),
    submittedAt: submittedAt.toISOString(),
    questions,
  };
}

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
    case 'none':
      return question.comments.length > 0 ? 'comments only, no verdict' : 'no answer (sent as unsure)';
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
    case 'none':
      return question.comments.length > 0 ? 'comments only' : 'no answer';
  }
}

function commentLine(comment: CommentRecord, index: number): string {
  let detail = '';
  if (comment.weak) {
    const parts: string[] = [];
    if (comment.weak.near) parts.push(`near ${quote(comment.weak.near)}`);
    parts.push(`at ${comment.weak.across}% across, ${comment.weak.down}% down`);
    if (comment.weak.crop) parts.push(`crop ${comment.weak.crop}`);
    detail = `  [${parts.join('; ')}]`;
  }
  return `comment ${index} · ${comment.anchor}${detail}: ${quote(comment.text)}`;
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
