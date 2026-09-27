// Turns a parsed round into what the page draws. Markdown renders with raw
// HTML off (micromark escapes it) and unsafe link protocols dropped.

import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import type { PageRound, PageTable } from '../core/protocol.ts';
import type { Round } from '../core/round.ts';
import type { TableData } from '../core/table.ts';
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

export function pageRound(
  number: number,
  round: Round,
  record: SubmissionRecord | undefined,
  answeredInTerminal = false,
  questionRounds: Record<number, number> = {},
): PageRound {
  return {
    number,
    ...(round.title ? { title: round.title } : {}),
    ...(round.designTree ? { designTree: round.designTree, questionRounds } : {}),
    questions: round.questions.map((question) => ({
      number: question.number,
      title: question.title,
      proseHtml: markdownHtml(question.prose),
      illustrations: question.illustrations.map(({ line: _line, table, ...illustration }) => ({
        ...illustration,
        ...(table ? { table: pageTable(table) } : {}),
        ...(illustration.kind === 'html' ? { frame: framePath(number, illustration.id) } : {}),
      })),
      options: question.options.map((option) => ({
        letter: option.letter,
        labelHtml: inlineHtml(option.label),
        ...(option.mockup
          ? {
              mockup: {
                source: option.mockup.source,
                tailwind: option.mockup.tailwind,
                frame: mockupFramePath(number, question.number, option.letter),
              },
            }
          : {}),
      })),
      recommendation: {
        html: markdownHtml(question.recommendation.source),
        ...(question.recommendation.option ? { option: question.recommendation.option } : {}),
      },
    })),
    ...(record
      ? {
          submitted: Object.fromEntries(record.questions.map((question) => [question.number, question.verdict])),
          comments: Object.fromEntries(record.questions.map((question) => [question.number, question.comments])),
        }
      : {}),
    ...(answeredInTerminal ? { answeredInTerminal: true as const } : {}),
  };
}

/** Where an html illustration's sandboxed frame is served. */
export function framePath(round: number, illustration: string): string {
  return `/frame/r${round}/${illustration}`;
}

/**
 * Where an option's mockup frame is served. A mockup has no id of its own, so
 * it goes by its question and letter; the extra segment keeps it apart from
 * illustration ids.
 */
export function mockupFramePath(round: number, question: number, option: string): string {
  return `/frame/r${round}/q${question}/${option}`;
}

function pageTable(table: TableData): PageTable {
  const cell = ({ markdown, text }: TableData['header'][number]) => ({ html: inlineHtml(markdown), text });
  return { align: table.align, header: table.header.map(cell), rows: table.rows.map((row) => row.map(cell)) };
}
