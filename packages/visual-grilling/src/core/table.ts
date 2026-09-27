// The `table` block's source: exactly one GFM table. Parsed at `present`, so a
// source that isn't one well-formed table rejects the round, and handed to the
// page as cells, so the page needs no Markdown parser.

import type { Table } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { toString } from 'mdast-util-to-string';
import { gfm } from 'micromark-extension-gfm';

export interface TableCell {
  /** The cell's Markdown source, for the page to render inline. */
  markdown: string;
  /** The same as plain text: the cell's identity in anchored comments. */
  text: string;
}

export interface TableData {
  align: ('left' | 'center' | 'right' | null)[];
  header: TableCell[];
  rows: TableCell[][];
}

export interface TableProblem {
  /** 1-based line within the source. */
  line: number;
  message: string;
}

export type TableResult = { ok: true; table: TableData } | { ok: false; problems: TableProblem[] };

const SHAPE = 'a table block holds exactly one GFM table: a header row, a |---| delimiter row, then rows';

export function parseTable(source: string): TableResult {
  const root = fromMarkdown(source, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const tables = root.children.filter((node): node is Table => node.type === 'table');
  const others = root.children.filter((node) => node.type !== 'table');

  if (tables.length === 0) {
    return { ok: false, problems: [{ line: others[0]?.position?.start.line ?? 1, message: `no table found; ${SHAPE}` }] };
  }
  const problems: TableProblem[] = [];
  if (tables.length > 1) {
    problems.push({
      line: tables[1]!.position!.start.line,
      message: `found ${tables.length} tables; a table block holds exactly one`,
    });
  }
  for (const node of others) {
    problems.push({
      line: node.position!.start.line,
      message: 'only the table may be in a table block; put prose in the question',
    });
  }

  const table = tables[0]!;
  const [head, ...body] = table.children;
  const width = head!.children.length;
  if (body.length === 0) {
    problems.push({ line: table.position!.start.line, message: 'the table has a header but no rows' });
  }
  for (const row of body) {
    if (row.children.length !== width) {
      problems.push({
        line: row.position!.start.line,
        message: `this row has ${row.children.length} ${row.children.length === 1 ? 'cell' : 'cells'}; the header has ${width}`,
      });
    }
  }
  if (problems.length > 0) return { ok: false, problems };

  const cell = (node: Table['children'][number]['children'][number]): TableCell => ({
    markdown: node.children.length
      ? source.slice(node.children[0]!.position!.start.offset!, node.children.at(-1)!.position!.end.offset!)
      : '',
    text: toString(node).replace(/\s+/g, ' ').trim(),
  });
  return {
    ok: true,
    table: {
      align: head!.children.map((_, index) => table.align?.[index] ?? null),
      header: head!.children.map(cell),
      rows: body.map((row) => row.children.map(cell)),
    },
  };
}
