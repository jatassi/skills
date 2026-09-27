// The round file: the Markdown an agent writes and hands to `present`.
//
// The tracer parses only the plain-question subset of the grammar: an optional
// `# Round title`, then questions in grilling's form. The full grammar and every
// rejection belong to the round-file parser ticket, which extends this module.

import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { toString } from 'mdast-util-to-string';
import { gfm } from 'micromark-extension-gfm';
import type { List, Nodes, Paragraph, RootContent } from 'mdast';

export interface Option {
  letter: string;
  /** The option's label as written (Markdown source). */
  label: string;
}

export interface Recommendation {
  /** The recommendation's Markdown source, without the ➡️ marker. */
  source: string;
  /** The same text as plain text, for one-line summaries. */
  text: string;
  /** The option the recommendation opens with (`**B** …`), if any. */
  option?: string;
}

export interface Question {
  number: number;
  title: string;
  /** Markdown source of the prose (header remainder plus following blocks). */
  prose: string;
  options: Option[];
  recommendation: Recommendation;
  /** 1-based line of the question header in the round file. */
  line: number;
}

export interface Round {
  title?: string;
  questions: Question[];
}

export interface RoundError {
  line: number;
  question?: number;
  message: string;
}

export type ParseResult = { ok: true; round: Round } | { ok: false; errors: RoundError[] };

const HEADER = /^❓️?\s*\*\*Q(\d+)\*\*\s*[-–—]\s*\*\*(.+?)\*\*\s*:?\s*([\s\S]*)$/;
const RECOMMENDATION = /^➡️?\s*/;
const OPTION = /^\*\*([A-Z])\*\*\s*[-–—]\s*([\s\S]*)$/;
const POINTER = /^\*\*([A-Z])\*\*/;

export function parseRound(source: string): ParseResult {
  const tree = fromMarkdown(source, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const slice = (node: Nodes): string =>
    source.slice(node.position!.start.offset!, node.position!.end.offset!);
  const lineOf = (node: Nodes): number => node.position!.start.line;

  const errors: RoundError[] = [];
  const round: Round = { questions: [] };

  // Split top-level nodes into a preamble and one group per question header.
  const preamble: RootContent[] = [];
  const groups: { header: Paragraph; match: RegExpExecArray; nodes: RootContent[] }[] = [];
  for (const node of tree.children) {
    const match = node.type === 'paragraph' ? HEADER.exec(slice(node)) : null;
    if (node.type === 'paragraph' && match) {
      groups.push({ header: node, match, nodes: [] });
    } else if (node.type === 'thematicBreak') {
      continue;
    } else if (groups.length > 0) {
      groups.at(-1)!.nodes.push(node);
    } else {
      preamble.push(node);
    }
  }

  const [first, ...rest] = preamble;
  if (first && first.type === 'heading' && first.depth === 1) {
    round.title = toString(first).trim();
  } else if (first) {
    rest.unshift(first);
  }
  for (const node of rest) {
    errors.push({ line: lineOf(node), message: 'nothing but a # title may come before Q1' });
  }

  if (groups.length === 0) {
    errors.push({ line: 1, message: 'no question found; start one with ❓ **Q1** - **title**: body' });
  }

  let previous: number | undefined;
  for (const { header, match, nodes } of groups) {
    const number = Number(match[1]);
    const line = lineOf(header);
    if (previous !== undefined && number <= previous) {
      errors.push({
        line,
        question: number,
        message: `question numbers must increase; Q${number} follows Q${previous}`,
      });
    }
    previous = number;

    const recIndex = nodes.findIndex(
      (node) => node.type === 'paragraph' && RECOMMENDATION.test(slice(node)),
    );
    if (recIndex === -1) {
      errors.push({ line, question: number, message: 'missing ➡️ recommendation' });
      continue;
    }

    const recNodes = nodes.slice(recIndex);
    const recSource = source
      .slice(recNodes[0]!.position!.start.offset!, recNodes.at(-1)!.position!.end.offset!)
      .replace(RECOMMENDATION, '')
      .trim();

    let bodyNodes = nodes.slice(0, recIndex);
    const options: Option[] = [];
    const last = bodyNodes.at(-1);
    if (last && last.type === 'list' && isOptionList(last, slice)) {
      bodyNodes = bodyNodes.slice(0, -1);
      for (const item of last.children) {
        const [, letter, label] = OPTION.exec(slice(item.children[0]!))!;
        options.push({ letter: letter!, label: label!.trim() });
      }
    }

    const pointer = POINTER.exec(recSource)?.[1];
    if (pointer && !options.some((option) => option.letter === pointer)) {
      errors.push({
        line: lineOf(recNodes[0]!),
        question: number,
        message: `the recommendation points at option ${pointer}, which does not exist`,
      });
    }

    const prose = [match[3]!.trim(), ...bodyNodes.map(slice)].filter(Boolean).join('\n\n');
    round.questions.push({
      number,
      title: match[2]!.trim(),
      prose,
      options,
      recommendation: {
        source: recSource,
        text: plainText(recSource),
        ...(pointer ? { option: pointer } : {}),
      },
      line,
    });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, round };
}

function isOptionList(list: List, slice: (node: Nodes) => string): boolean {
  return list.children.every((item) => {
    const first = item.children[0];
    return first?.type === 'paragraph' && OPTION.test(slice(first));
  });
}

function plainText(markdown: string): string {
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  return tree.children
    .map((node) => toString(node))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `round.md:LINE · Qn: message`, the form `present` prints to stderr. */
export function formatRoundError(file: string, error: RoundError): string {
  const where = error.question === undefined ? '' : ` · Q${error.question}`;
  return `${file}:${error.line}${where}: ${error.message}`;
}
