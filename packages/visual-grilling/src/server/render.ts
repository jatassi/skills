// Turns a parsed round into what the page draws. Markdown renders with raw
// HTML off (micromark escapes it) and unsafe link protocols dropped.

import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import type { PageRound } from '../core/protocol.ts';
import type { Round } from '../core/round.ts';
import type { SubmissionRecord } from '../core/submission.ts';

export function markdownHtml(source: string): string {
  return micromark(source, { extensions: [gfm()], htmlExtensions: [gfmHtml()] });
}

/** Markdown for a single line (an option label): the paragraph wrapper is dropped. */
export function inlineHtml(source: string): string {
  const html = markdownHtml(source).trim();
  const match = /^<p>([\s\S]*)<\/p>$/.exec(html);
  return match ? match[1]! : html;
}

export function pageRound(number: number, round: Round, record: SubmissionRecord | undefined): PageRound {
  return {
    number,
    ...(round.title ? { title: round.title } : {}),
    questions: round.questions.map((question) => ({
      number: question.number,
      title: question.title,
      proseHtml: markdownHtml(question.prose),
      options: question.options.map((option) => ({ letter: option.letter, labelHtml: inlineHtml(option.label) })),
      recommendation: {
        html: markdownHtml(question.recommendation.source),
        ...(question.recommendation.option ? { option: question.recommendation.option } : {}),
      },
    })),
    ...(record
      ? { submitted: Object.fromEntries(record.questions.map((question) => [question.number, question.verdict])) }
      : {}),
  };
}
