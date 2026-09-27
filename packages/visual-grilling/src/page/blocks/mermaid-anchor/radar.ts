// Radar: axis k (its line and label, in drawing order) is the k-th axis the
// source declares, and `radarCurve-<k>` / `radarLegendBox-<k>` the k-th
// curve, so both are named by the source's own ids. The graticule circles
// are generated.

import { classes, find, hasClass, labelUnlessId, match, peerAt, sourceLines, VIA_POSITION, type DiagramAdapter } from './shared.ts';

export const radarAdapter: DiagramAdapter = {
  peers: 'line.radarAxisLine',
  read(click) {
    const { axes, curves } = declarations(click.source);
    const axisLine = find(click, (element) => element.tag === 'line' && hasClass(element, 'radarAxisLine'));
    if (axisLine) {
      const axis = axes[peerAt(click, axisLine.element, (peer) => hasClass(peer, 'radarAxisLine'))];
      return axis ? match('axis', axis.id, labelUnlessId(axis.label, axis.id), axisLine.index, VIA_POSITION) : null;
    }
    const axisLabel = find(click, (element) => hasClass(element, 'radarAxisLabel'));
    if (axisLabel?.element.nth) {
      const axis = axes[axisLabel.element.nth.i];
      return axis ? match('axis', axis.id, labelUnlessId(axis.label, axis.id), axisLabel.index, VIA_POSITION) : null;
    }
    for (const [index, element] of click.chain.entries()) {
      const numbered = classes(element).map((name) => /^radar(?:Curve|LegendBox)-(\d+)$/.exec(name)?.[1]).find(Boolean);
      const k = numbered ?? (hasClass(element, 'radarLegendText') ? element.nth?.i : undefined);
      const curve = k === undefined ? undefined : curves[Number(k)];
      if (curve) return match('curve', curve.id, labelUnlessId(curve.label, curve.id), index, VIA_POSITION);
    }
    return null;
  },
};

interface Declared {
  id: string;
  label: string | null;
}

/** The `axis` and `curve` declarations, in source order: `m["Math"]` → id m, label Math. */
function declarations(source: string): { axes: Declared[]; curves: Declared[] } {
  const axes: Declared[] = [];
  const curves: Declared[] = [];
  for (const { text } of sourceLines(source)) {
    const statement = /^(axis|curve)\s+(.*)$/.exec(text);
    if (!statement) continue;
    // A curve's values sit in braces; drop them so they don't read as ids.
    const body = statement[2]!.replace(/\{[^}]*\}/g, ' ');
    const found = [...body.matchAll(/([\w-]+)\s*(?:\[\s*"([^"]*)"\s*\])?/g)].map((part) => ({ id: part[1]!, label: part[2] ?? null }));
    (statement[1] === 'axis' ? axes : curves).push(...found);
  }
  return { axes, curves };
}
