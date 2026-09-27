// The `code` and `diff` blocks. Code fences draw with Shiki, with the file's
// own line numbers in the gutter and the `highlight` lines marked; `diff`
// fences draw with @pierre/diffs in inline display, one shadow root per file.
// Both come from the lazily loaded code chunk, and colour through CSS
// variables the page sets from its tokens: a theme flip draws again from the
// cached output, so nothing is highlighted twice.
//
// Every line, code or diff, carries the same data-code-* attributes, so one
// adapter names a click `line 12 of src/app.ts`, or on a diff `new line 12`,
// `old line 11` or `context line 13 (old 12)`.

import type * as CodeChunk from '../../chunks/code.ts';
import type { AdapterMatch, Snapshot } from '../../core/anchor.ts';
import type { PageIllustration } from '../../core/protocol.ts';
import { chunkLoader } from './chunk.ts';
import type { BlockRenderer } from './registry.ts';

const loadChunk = chunkLoader<typeof CodeChunk>('/assets/code.js');

/** Highlighted output by source, so a redraw (a theme flip) doesn't highlight again. */
const highlighted = new Map<string, Promise<unknown>>();
function highlightOnce<T>(key: string, highlight: () => Promise<T>): Promise<T> {
  let result = highlighted.get(key) as Promise<T> | undefined;
  if (!result) {
    result = highlight();
    highlighted.set(key, result);
    result.catch(() => highlighted.delete(key));
  }
  return result;
}

export const codeBlock: BlockRenderer = {
  async render(target, illustration) {
    target.append(illustration.kind === 'diff' ? await diffView(illustration) : await codeView(illustration));
  },
  anchor: codeAnchor,
};

// ------------------------------------------------------------------- code

async function codeView(illustration: PageIllustration): Promise<HTMLElement> {
  const settings = illustration.code ?? { lang: 'text' };
  const { lines } = await highlightOnce(`code\0${settings.lang}\0${illustration.source}`, async () =>
    (await loadChunk()).highlightCode(illustration.source, settings.lang),
  );
  const texts = illustration.source.replace(/\n$/, '').split('\n');
  const first = settings.startLine ?? 1;
  const marked = (line: number) => (settings.highlight ?? []).some(([from, to]) => line >= from && line <= to);

  const view = document.createElement('div');
  view.className = 'code-block';
  if (settings.file) {
    view.dataset.codeFile = settings.file;
    const header = document.createElement('div');
    header.className = 'code-file';
    header.dataset.codeHeader = '';
    header.textContent = settings.file;
    view.append(header);
  }
  const body = document.createElement('div');
  body.className = 'code-lines';
  lines.forEach((html, index) => {
    const number = first + index;
    const row = document.createElement('div');
    row.className = 'code-line';
    lineAttributes(row, { line: number, text: texts[index] ?? '' });
    const gutter = document.createElement('span');
    gutter.className = 'code-number';
    gutter.textContent = String(number);
    const text = document.createElement(marked(number) ? 'mark' : 'span');
    text.className = 'code-text';
    // The chunk escapes the source; the spans only carry colour variables.
    text.innerHTML = html || ' ';
    row.classList.toggle('highlighted', marked(number));
    row.append(gutter, text);
    body.append(row);
  });
  view.append(body);
  return view;
}

// ------------------------------------------------------------------- diff

async function diffView(illustration: PageIllustration): Promise<HTMLElement> {
  const files = await highlightOnce(`diff\0${illustration.source}`, async () => (await loadChunk()).drawDiff(illustration.source));
  const view = document.createElement('div');
  view.className = 'diff-block';
  for (const file of files) {
    const host = document.createElement('div');
    host.className = 'diff-file';
    host.dataset.codeFile = file.name;
    const root = host.attachShadow({ mode: 'open' });
    // @pierre/diffs output: the diff's text is escaped, its styles are the library's.
    root.innerHTML = file.html;
    markDiffLines(root);
    view.append(host);
  }
  return view;
}

/**
 * Gives every diff line, content and gutter alike, the data-code-* terms the
 * adapter reads, from @pierre/diffs' own row attributes: a row's type says the
 * side, `data-line` is its line on that side, and a context row's
 * `data-alt-line` is its old line.
 */
function markDiffLines(root: ShadowRoot): void {
  const byIndex = new Map<string, LineTerms>();
  for (const row of root.querySelectorAll<HTMLElement>('[data-line][data-line-type][data-line-index]')) {
    const side = diffSide(row.dataset.lineType!);
    if (!side) continue;
    const terms: LineTerms = {
      line: Number(row.dataset.line),
      side,
      ...(side === 'context' && row.dataset.altLine ? { old: Number(row.dataset.altLine) } : {}),
      text: row.textContent ?? '',
    };
    byIndex.set(row.dataset.lineIndex!, terms);
    lineAttributes(row, terms);
  }
  for (const gutter of root.querySelectorAll<HTMLElement>('[data-column-number][data-line-index]')) {
    const terms = byIndex.get(gutter.dataset.lineIndex!);
    if (terms) lineAttributes(gutter, terms);
  }
  for (const header of root.querySelectorAll<HTMLElement>('[data-diffs-header]')) header.dataset.codeHeader = '';
}

type DiffSide = 'old' | 'new' | 'context';

/** What names a line: its number (on its side, for a diff), a context line's old number, and its text. */
interface LineTerms {
  line: number;
  side?: DiffSide;
  old?: number;
  text: string;
}

function diffSide(type: string): DiffSide | undefined {
  if (type === 'change-deletion') return 'old';
  if (type === 'change-addition') return 'new';
  if (type.startsWith('context')) return 'context';
  return undefined;
}

function lineAttributes(element: HTMLElement, terms: LineTerms): void {
  element.dataset.codeLine = String(terms.line);
  if (terms.side) element.dataset.codeSide = terms.side;
  if (terms.old !== undefined) element.dataset.codeOldLine = String(terms.old);
  element.dataset.codeText = terms.text.trim().slice(0, 120);
}

// ---------------------------------------------------------------- anchors

const SIDE_KIND: Record<DiffSide, string> = { old: 'old line', new: 'new line', context: 'context line' };

/**
 * A code line names its file and its line in the file's own numbers; a diff
 * line adds its side (old, new, or context, which gives both numbers). The
 * line's text is the label. A diff file's header names the file.
 */
export function codeAnchor(snapshot: Snapshot): AdapterMatch | null {
  const { chain } = snapshot;
  const file = chain.find((element) => element.attrs['data-code-file'])?.attrs['data-code-file'];
  const of = file ? ` of ${file}` : '';
  for (let i = 0; i < chain.length - 1; i++) {
    const { attrs } = chain[i]!;
    const line = attrs['data-code-line'];
    if (line) {
      const side = attrs['data-code-side'] as DiffSide | undefined;
      const old = attrs['data-code-old-line'];
      return {
        kind: (side && SIDE_KIND[side]) ?? 'line',
        ref: `${line}${of}${old ? ` (old ${old})` : ''}`,
        label: attrs['data-code-text'] || null,
        via: 'code',
        chainIndex: i,
      };
    }
    if (attrs['data-code-header'] !== undefined && file) {
      return { kind: 'file', ref: file, label: null, via: 'code', chainIndex: i };
    }
  }
  return null;
}
