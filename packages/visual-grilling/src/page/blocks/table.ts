// The `table` block: one GFM table, parsed at `present` and handed over as
// cells. Every cell carries its row and column identity, so an anchored
// comment reads `cell row "MCP server", column "Install"`.

import type { AdapterMatch, Snapshot } from '../../core/anchor.ts';
import type { PageTable } from '../../core/protocol.ts';
import type { BlockRenderer } from './registry.ts';

export const tableBlock: BlockRenderer = {
  render(target, illustration) {
    const table = illustration.table;
    if (!table) throw new Error('the table block arrived without its table');
    target.append(tableElement(table));
  },
  anchor: tableAnchor,
};

function tableElement(data: PageTable): HTMLTableElement {
  const columns = uniqueLabels(data.header.map((cell) => cell.text), '#');
  const rows = uniqueLabels(data.rows.map((row) => row[0]?.text ?? ''), '#');

  const table = document.createElement('table');
  table.className = 'block-table';
  const cell = (tag: 'th' | 'td', html: string, column: number) => {
    const element = document.createElement(tag);
    // Rendered by the server from Markdown with raw HTML escaped.
    element.innerHTML = html;
    element.dataset.col = String(column);
    element.dataset.colLabel = columns[column]!;
    const align = data.align[column];
    if (align) element.style.textAlign = align;
    return element;
  };

  const head = table.createTHead().insertRow();
  data.header.forEach((header, column) => head.append(cell('th', header.html, column)));

  const body = table.createTBody();
  data.rows.forEach((row, index) => {
    const tr = body.insertRow();
    tr.dataset.row = String(index);
    tr.dataset.rowLabel = rows[index]!;
    row.forEach((value, column) => {
      const td = cell('td', value.html, column);
      td.dataset.row = String(index);
      td.dataset.rowLabel = rows[index]!;
      tr.append(td);
    });
  });
  return table;
}

/** Labels as written; an empty one becomes its position, and a repeat gets its position added. */
function uniqueLabels(texts: string[], mark: string): string[] {
  const counts = new Map<string, number>();
  for (const text of texts) counts.set(text, (counts.get(text) ?? 0) + 1);
  return texts.map((text, index) => {
    if (!text) return `${mark}${index + 1}`;
    return counts.get(text)! > 1 ? `${text} (${mark}${index + 1})` : text;
  });
}

/** A body cell names its row and column, a header cell its column, and the gap between cells its row. */
export function tableAnchor(snapshot: Snapshot): AdapterMatch | null {
  const { chain } = snapshot;
  for (let i = 0; i < chain.length - 1; i++) {
    const { tag, attrs } = chain[i]!;
    const column = attrs['data-col-label'];
    const row = attrs['data-row-label'];
    if (tag === 'th' && column !== undefined) {
      return { kind: 'column', ref: null, label: column, via: 'table', chainIndex: i };
    }
    if (tag === 'td' && row !== undefined && column !== undefined) {
      return {
        kind: 'cell',
        ref: `row ${JSON.stringify(row)}, column ${JSON.stringify(column)}`,
        label: null,
        via: 'table',
        chainIndex: i,
      };
    }
    if (tag === 'tr' && row !== undefined) return { kind: 'row', ref: null, label: row, via: 'table', chainIndex: i };
  }
  return null;
}
