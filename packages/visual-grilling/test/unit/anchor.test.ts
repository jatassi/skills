import { describe, expect, it } from 'vitest';
import {
  anchorLine,
  resolveAnchor,
  type AnchorSubject,
  type Box,
  type Snapshot,
  type SnapshotElement,
} from '../../src/core/anchor.ts';
import { tableAnchor } from '../../src/page/blocks/table.ts';

// Snapshots written by hand: the clicked element first, up to the root.

type Node = Partial<Omit<SnapshotElement, 'tag'>> & { tag: string };

function snap(nodes: Node[], rest: Partial<Snapshot> = {}): Snapshot {
  const box: Box = { x: 0, y: 0, w: 10, h: 10 };
  return {
    chain: [...nodes, { tag: 'div', attrs: { class: 'block-content' } }].map((node) => ({
      attrs: {},
      text: '',
      title: null,
      nth: null,
      box,
      ...node,
    })),
    root: { w: 400, h: 200 },
    click: { x: 100, y: 50 },
    selector: 'x',
    peers: [],
    texts: [],
    clickSvg: -1,
    ...rest,
  };
}

const TABLE: AnchorSubject = { illustration: { id: 'compare', kind: 'table', title: 'Compare' } };
const HTML: AnchorSubject = { illustration: { id: 'banner', kind: 'html', title: 'Error banner' } };
const line = (snapshot: Snapshot, subject = HTML, adapter?: typeof tableAnchor) =>
  anchorLine(resolveAnchor(snapshot, subject, adapter));

describe('the table adapter', () => {
  const cell = (row: string, col: number, colLabel: string, text = 'x'): Node => ({
    tag: 'td',
    text,
    attrs: { 'data-row': '0', 'data-row-label': row, 'data-col': String(col), 'data-col-label': colLabel },
  });
  const tr = (row: string): Node => ({ tag: 'tr', attrs: { 'data-row': '0', 'data-row-label': row } });

  it('names a cell by its row and column', () => {
    const snapshot = snap([cell('MCP server', 2, 'Install', 'npx'), tr('MCP server'), { tag: 'tbody' }, { tag: 'table' }]);
    const anchor = resolveAnchor(snapshot, TABLE, tableAnchor);
    expect(anchor.target).toEqual({
      kind: 'cell',
      ref: 'row "MCP server", column "Install"',
      label: null,
      via: 'table',
      weak: false,
    });
    expect(anchorLine(anchor)).toBe('table "Compare" → cell row "MCP server", column "Install"');
  });

  it('keeps the named container above the cell in the record', () => {
    const snapshot = snap([cell('CLI', 1, 'Install'), tr('CLI'), { tag: 'tbody' }, { tag: 'table', attrs: { 'aria-label': 'Pricing' } }]);
    expect(resolveAnchor(snapshot, TABLE, tableAnchor).within).toBe('Pricing');
  });

  it('names text inside a cell by the cell', () => {
    const snapshot = snap([{ tag: 'strong', text: 'yes' }, cell('CLI', 1, 'Install'), tr('CLI'), { tag: 'tbody' }, { tag: 'table' }]);
    expect(line(snapshot, TABLE, tableAnchor)).toBe('table "Compare" → cell row "CLI", column "Install"');
  });

  it('names a first-column cell by its row', () => {
    const snapshot = snap([cell('MCP server', 0, 'Tool'), tr('MCP server'), { tag: 'tbody' }, { tag: 'table' }]);
    expect(line(snapshot, TABLE, tableAnchor)).toBe('table "Compare" → row "MCP server"');
  });

  it('names a header cell by its column', () => {
    const header: Node = { tag: 'th', text: 'Install', attrs: { 'data-col': '1', 'data-col-label': 'Install' } };
    expect(line(snap([header, { tag: 'tr' }, { tag: 'thead' }, { tag: 'table' }]), TABLE, tableAnchor)).toBe(
      'table "Compare" → column "Install"',
    );
  });

  it('names the gap between cells by its row', () => {
    expect(line(snap([tr('CLI'), { tag: 'tbody' }, { tag: 'table' }]), TABLE, tableAnchor)).toBe('table "Compare" → row "CLI"');
  });

  it('falls back to the generic reading outside the cells', () => {
    const snapshot = snap([{ tag: 'table' }], { texts: [{ text: 'Install', box: { x: 90, y: 40, w: 30, h: 10 }, svg: -1 }] });
    expect(line(snapshot, TABLE, tableAnchor)).toBe(
      'table "Compare" → unlabeled table  [clicked <table>; near "Install"; at 25% across, 25% down]',
    );
  });
});

describe('the generic fallback', () => {
  it('prefers an author-given data-anchor', () => {
    const snapshot = snap([{ tag: 'span', text: 'Retry' }, { tag: 'button', text: 'Retry', attrs: { 'data-anchor': 'retry-button', id: 'r' } }]);
    const anchor = resolveAnchor(snapshot, HTML);
    expect(anchor.target).toMatchObject({ kind: 'button', ref: 'retry-button', label: 'Retry', via: 'data-anchor', weak: false });
    expect(anchor.box).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(anchorLine(anchor)).toBe('html "Error banner" → button retry-button "Retry"');
  });

  it('takes a hand-written id but not a generated one', () => {
    expect(line(snap([{ tag: 'rect', attrs: { id: 'cache' } }]))).toBe('html "Error banner" → rect cache');
    expect(line(snap([{ tag: 'rect', attrs: { id: 'mermaid-1234' } }, { tag: 'g', attrs: { 'aria-label': 'Cache' } }]))).toBe(
      'html "Error banner" → g "Cache"',
    );
  });

  it('takes aria-label, with its role as the kind', () => {
    expect(line(snap([{ tag: 'div', attrs: { role: 'alert', 'aria-label': 'Upload failed' } }]))).toBe(
      'html "Error banner" → alert "Upload failed"',
    );
  });

  it('takes an SVG <title>', () => {
    expect(line(snap([{ tag: 'circle', title: 'Primary region' }]))).toBe('html "Error banner" → circle "Primary region"');
  });

  it("describes a form control by its own description", () => {
    expect(line(snap([{ tag: 'input', attrs: { type: 'email', name: 'email', placeholder: 'you@example.com' } }]))).toBe(
      'html "Error banner" → email input email "you@example.com"',
    );
    expect(line(snap([{ tag: 'textarea', attrs: { placeholder: 'Notes' } }]))).toBe('html "Error banner" → textarea "Notes"');
  });

  it('takes short text on the clicked element as a strong match', () => {
    const anchor = resolveAnchor(snap([{ tag: 'button', text: 'Retry' }]), HTML);
    expect(anchor.target).toMatchObject({ kind: 'button', label: 'Retry', via: 'text', weak: false });
    expect(anchor.near).toEqual([]);
    expect(anchorLine(anchor)).toBe('html "Error banner" → button "Retry"');
  });

  it('takes text up to two levels above as a weak match, with the element clicked', () => {
    const snapshot = snap(
      [{ tag: 'path' }, { tag: 'svg' }, { tag: 'li', text: 'Retry upload' }, { tag: 'ul' }],
      { texts: [
        { text: 'Retry upload', box: { x: 100, y: 50, w: 50, h: 10 }, svg: -1 },
        { text: 'Cancel', box: { x: 100, y: 70, w: 30, h: 10 }, svg: -1 },
      ] },
    );
    const anchor = resolveAnchor(snapshot, HTML);
    expect(anchor.target).toMatchObject({ kind: 'list item', label: 'Retry upload', via: 'text', weak: true });
    expect(anchorLine(anchor)).toBe(
      'html "Error banner" → list item "Retry upload"  [clicked <path>; near "Cancel"; at 25% across, 25% down]',
    );
  });

  it("doesn't take text three levels above", () => {
    const snapshot = snap([{ tag: 'rect' }, { tag: 'g' }, { tag: 'g' }, { tag: 'li', text: 'Far away' }]);
    expect(resolveAnchor(snapshot, HTML).target).toMatchObject({ kind: 'unlabeled shape', via: 'position only', weak: true });
  });

  it('calls an unnamed shape an unlabeled shape, near the closest text in the same SVG', () => {
    const snapshot = snap([{ tag: 'rect' }, { tag: 'svg' }], {
      clickSvg: 0,
      texts: [
        { text: 'Other SVG', box: { x: 100, y: 50, w: 5, h: 5 }, svg: 1 },
        { text: 'Far', box: { x: 300, y: 150, w: 10, h: 10 }, svg: 0 },
        { text: 'Near', box: { x: 110, y: 50, w: 10, h: 10 }, svg: 0 },
        { text: 'Near', box: { x: 112, y: 52, w: 10, h: 10 }, svg: 0 },
        { text: 'Hidden', box: { x: 100, y: 50, w: 0, h: 0 }, svg: 0 },
      ],
    });
    expect(line(snapshot)).toBe('html "Error banner" → unlabeled shape  [clicked <rect>; near "Near", "Far"; at 25% across, 25% down]');
  });

  it('calls a click on nothing an empty area', () => {
    const snapshot = snap([], { click: { x: 400, y: 0 } });
    const anchor = resolveAnchor(snapshot, HTML);
    expect(anchor.target).toEqual({ kind: 'area', ref: null, label: null, via: 'position only', weak: true });
    expect(anchor.box).toBeNull();
    expect(anchorLine(anchor)).toBe('html "Error banner" → empty area  [at 100% across, 0% down]');
  });

  it('keeps the clicked element, selector and position in the record', () => {
    const anchor = resolveAnchor(snap([{ tag: 'button', text: 'Retry', attrs: { role: 'button' } }], { selector: 'div > button' }), HTML);
    expect(anchor).toMatchObject({
      illustration: HTML.illustration,
      clicked: { tag: 'button', role: 'button', text: 'Retry' },
      selector: 'div > button',
      position: { x: 25, y: 25 },
    });
    expect(anchorLine(anchor)).not.toContain('div > button');
  });
});

describe('anchorLine', () => {
  it('names a mockup by its option', () => {
    expect(line(snap([{ tag: 'button', text: 'Submit round' }]), { option: 'B' })).toBe('mockup B → button "Submit round"');
  });

  it('calls vega-lite a chart and falls back to the id without a title', () => {
    expect(line(snap([{ tag: 'path', attrs: { 'aria-label': 'runtime: Bun; ms: 60' } }]), { illustration: { id: 'cold', kind: 'vega-lite' } })).toBe(
      'chart "cold" → path "runtime: Bun; ms: 60"',
    );
  });

  it('adds the crop to a weak match', () => {
    const anchor = resolveAnchor(snap([], { click: { x: 0, y: 0 } }), HTML);
    expect(anchorLine(anchor, '/tmp/crops/r1-q1-c1.png')).toBe(
      'html "Error banner" → empty area  [at 0% across, 0% down; crop /tmp/crops/r1-q1-c1.png]',
    );
  });
});
