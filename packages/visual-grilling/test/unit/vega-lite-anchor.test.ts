import { describe, expect, it } from 'vitest';
import { anchorLine, resolveAnchor, type AnchorSubject, type Snapshot, type SnapshotElement } from '../../src/core/anchor.ts';
import { vegaLiteAnchor } from '../../src/page/blocks/vega-lite.ts';

// Snapshots written by hand, in the shape Vega's SVG writer gives: the
// clicked element first, up to the frame's content box.

type Node = Partial<Omit<SnapshotElement, 'tag'>> & { tag: string };

function snap(nodes: Node[], rest: Partial<Snapshot> = {}): Snapshot {
  return {
    chain: [...nodes, { tag: 'div', attrs: { class: 'vega-lite-block' } }, { tag: 'div', attrs: { class: 'block-content' } }].map(
      (node) => ({ attrs: {}, text: '', title: null, nth: null, box: { x: 0, y: 0, w: 10, h: 10 }, ...node }),
    ),
    root: { w: 400, h: 200 },
    click: { x: 100, y: 50 },
    selector: 'x',
    peers: [],
    texts: [],
    clickSvg: 0,
    ...rest,
  };
}

const CHART: AnchorSubject = { illustration: { id: 'speed', kind: 'vega-lite', title: 'Cold start' } };
const line = (snapshot: Snapshot) => anchorLine(resolveAnchor(snapshot, CHART, vegaLiteAnchor));

const markGroup: Node = { tag: 'g', attrs: { class: 'mark-rect role-mark marks', role: 'graphics-object', 'aria-roledescription': 'rect mark container' } };
const svg: Node = { tag: 'svg', attrs: { class: 'marks' } };

describe('the vega-lite adapter', () => {
  it("names a mark by its role description and its datum's aria-label", () => {
    const bar: Node = {
      tag: 'path',
      attrs: { role: 'graphics-symbol', 'aria-roledescription': 'bar', 'aria-label': 'runtime: Bun; ms: 60' },
    };
    const anchor = resolveAnchor(snap([bar, markGroup, { tag: 'g' }, svg]), CHART, vegaLiteAnchor);
    expect(anchor.target).toEqual({ kind: 'bar', ref: null, label: 'runtime: Bun; ms: 60', via: 'datum', weak: false });
    expect(anchorLine(anchor)).toBe('chart "Cold start" → bar "runtime: Bun; ms: 60"');
  });

  it('names a point, an arc or any other mark the same way', () => {
    const point: Node = {
      tag: 'path',
      attrs: { role: 'graphics-symbol', 'aria-roledescription': 'point', 'aria-label': 'x: 3; y: 9' },
    };
    expect(line(snap([point, markGroup, svg]))).toBe('chart "Cold start" → point "x: 3; y: 9"');
  });

  it('drops the " mark" Vega adds to some role descriptions', () => {
    const arc: Node = {
      tag: 'path',
      attrs: { role: 'graphics-symbol', 'aria-roledescription': 'arc mark', 'aria-label': 'ms: 120; runtime: Node' },
    };
    expect(line(snap([arc, markGroup, svg]))).toBe('chart "Cold start" → arc "ms: 120; runtime: Node"');
  });

  it('names a titled element that is not a mark by its own aria-label', () => {
    const title: Node = {
      tag: 'g',
      attrs: { role: 'graphics-symbol', 'aria-roledescription': 'title', 'aria-label': "Title text 'Cold start'" },
    };
    expect(line(snap([{ tag: 'text', text: 'Cold start' }, title, svg]))).toBe(`chart "Cold start" → title "Title text 'Cold start'"`);
  });

  it("doesn't take a mark container's own description", () => {
    expect(vegaLiteAnchor(snap([markGroup, svg]))).toBeNull();
  });

  it('leaves a click between marks to the generic fallback, near the closest text', () => {
    const snapshot = snap([svg], { texts: [{ text: 'Bun', box: { x: 95, y: 60, w: 12, h: 8 }, svg: 0 }] });
    expect(line(snapshot)).toBe('chart "Cold start" → empty area  [near "Bun"; at 25% across, 25% down]');
  });
});
