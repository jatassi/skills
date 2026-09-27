// What every Mermaid diagram-type adapter works with: the click, read against
// the drawing's render-id prefix and the peers its type asked for, and the
// helpers for turning Mermaid's ids back into the agent's.
//
// Pure: it reads a Snapshot (src/core/anchor.ts), never the DOM.

import type { AdapterMatch, Box, Snapshot, SnapshotElement, SnapshotPeer } from '../../../core/anchor.ts';

/** A click on one Mermaid drawing, as a diagram-type adapter sees it. */
export interface DiagramClick {
  snapshot: Snapshot;
  /** The clicked element and its ancestors up to (not including) the drawing's <svg>. */
  chain: SnapshotElement[];
  /** Mermaid's name for the diagram type, from the <svg>'s aria-roledescription (`flowchart-v2`, `sequence`…). */
  type: string;
  /** The render-id prefix Mermaid puts on ids: the <svg> id and a "-". */
  prefix: string;
  /** The illustration's Mermaid source, as the agent wrote it. */
  source: string;
  /** The elements the type's `peers` selector matched in this drawing, in document order. */
  peers: SnapshotPeer[];
}

/**
 * One diagram type's reading of clicks (or several types sharing a renderer).
 * `peers` is a CSS selector for the elements `read` needs to see besides the
 * clicked chain; it is scoped to this type's drawings.
 */
export interface DiagramAdapter {
  peers?: string;
  read(click: DiagramClick): AdapterMatch | null;
}

/**
 * How a term was found, for the agent: straight from an id in the SVG; from
 * a fixed neighbouring element (text that has no id of its own); from the
 * element's place in the drawing, which follows the source's statements; or
 * from which shapes contain the click point.
 */
export const VIA_ID = 'mermaid id';
export const VIA_NEIGHBOUR = 'mermaid neighbour';
export const VIA_POSITION = 'mermaid position';
export const VIA_GEOMETRY = 'mermaid geometry';

export function match(kind: string, ref: string | null, label: string | null, chainIndex: number, via = VIA_ID): AdapterMatch {
  return { kind, ref, label: label || null, via, chainIndex };
}

export function classes(element: { attrs: Record<string, string> }): string[] {
  return (element.attrs.class ?? '').trim().split(/\s+/).filter(Boolean);
}

export function hasClass(element: { attrs: Record<string, string> }, name: string): boolean {
  return classes(element).includes(name);
}

/** The first chain element passing `test`, with its index in the snapshot's chain. */
export function find(
  click: DiagramClick,
  test: (element: SnapshotElement) => boolean,
): { element: SnapshotElement; index: number } | null {
  const index = click.chain.findIndex(test);
  return index < 0 ? null : { element: click.chain[index]!, index };
}

/** `id` without the render-id prefix, or null when it doesn't carry it. */
export function unprefixed(click: DiagramClick, id: string | undefined): string | null {
  return id?.startsWith(click.prefix) ? id.slice(click.prefix.length) : null;
}

/** The agent's id inside a Mermaid element id like `flowchart-api-3`: `pattern` captures it. */
export function idOf(click: DiagramClick, element: { attrs: Record<string, string> }, pattern: RegExp): string | null {
  const bare = unprefixed(click, element.attrs.id);
  return bare === null ? null : (pattern.exec(bare)?.[1] ?? null);
}

/** The set of agent ids found by reading every peer's id through `pattern`. */
export function knownIds(click: DiagramClick, pattern: RegExp, test: (peer: SnapshotPeer) => boolean = () => true): Set<string> {
  const ids = new Set<string>();
  for (const peer of click.peers) {
    if (!test(peer)) continue;
    const id = idOf(click, peer, pattern);
    if (id !== null) ids.add(id);
  }
  return ids;
}

/**
 * Splits `joined` (two ids with `separator` between them) where both halves
 * are known ids. Ids can contain the separator themselves, so a regex can't
 * tell `my_node_other` apart; the known ids can.
 */
export function splitPair(joined: string, separator: string, known: Set<string>): [string, string] | null {
  for (let at = joined.indexOf(separator); at > 0; at = joined.indexOf(separator, at + 1)) {
    const from = joined.slice(0, at);
    const to = joined.slice(at + separator.length);
    if (known.has(from) && known.has(to)) return [from, to];
  }
  return null;
}

/** `from → to` for two known ids joined by `separator`, or null when they don't split (see splitPair). */
export function ends(joined: string | undefined, separator: string, known: Set<string>): string | null {
  const pair = joined === undefined ? null : splitPair(joined, separator, known);
  return pair ? `${pair[0]} → ${pair[1]}` : null;
}

/**
 * `from → to`, with `#k` added when several connections join the same pair:
 * `pairs` lists every connection's pair in document order, and `index` is
 * this one's place in it.
 */
export function pairRef(pairs: (string | null)[], index: number): string | null {
  const pair = pairs[index];
  if (!pair) return null;
  const same = pairs.filter((other) => other === pair).length;
  if (same < 2) return pair;
  return `${pair} #${pairs.slice(0, index + 1).filter((other) => other === pair).length}`;
}

/**
 * Where a clicked chain element sits in the peers: its `nth` counts the
 * drawing's elements of its tag and first class, so the peers selector must
 * match all of those.
 */
export function peerIndex(click: DiagramClick, element: SnapshotElement): number {
  if (!element.nth) return -1;
  const { cls, i } = element.nth;
  let seen = -1;
  return click.peers.findIndex((peer) => peer.tag === element.tag && hasClass(peer, cls) && ++seen === i);
}

/** Visible text, or null when empty or the same as the id it would repeat. */
export function labelUnlessId(text: string | null | undefined, id: string | null): string | null {
  const trimmed = text?.trim() ?? '';
  return trimmed && trimmed !== id ? trimmed : null;
}

/**
 * `#k` when `names` holds `names[index]` more than once (k counts from 1 in
 * order), otherwise null: the ordinal that tells same-named elements apart.
 */
export function ordinal(names: readonly (string | null)[], index: number): string | null {
  const name = names[index];
  if (name === undefined || names.filter((other) => other === name).length < 2) return null;
  return `#${names.slice(0, index + 1).filter((other) => other === name).length}`;
}

/**
 * Where a chain element sits among the peers passing `test`, matched by tag
 * and box. It works for elements with no class to count by, and for a hit
 * area (hit.ts), which has its line's box. -1 when it isn't among them.
 */
export function peerAt(click: DiagramClick, element: SnapshotElement, test: (peer: SnapshotPeer) => boolean): number {
  return click.peers.filter(test).findIndex((peer) => peer.tag === element.tag && sameBox(peer.box, element.box));
}

/** The first chain element that is one of the peers passing `test`, with its index among them (`at`). */
export function findPeer(
  click: DiagramClick,
  test: (element: SnapshotPeer) => boolean,
): { element: SnapshotElement; index: number; at: number } | null {
  for (const [index, element] of click.chain.entries()) {
    if (!test(element)) continue;
    const at = peerAt(click, element, test);
    if (at >= 0) return { element, index, at };
  }
  return null;
}

export function sameBox(a: Box | undefined, b: Box): boolean {
  return a !== undefined && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function contains(box: Box | undefined, point: { x: number; y: number }): boolean {
  return box !== undefined && point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
}

/** One line of the source, trimmed, with its indent. */
export interface SourceLine {
  text: string;
  indent: number;
}

/**
 * The source's lines that say something: frontmatter, `%%` comments and
 * directives, and blank lines left out. The first is the diagram's header
 * (`xychart horizontal`, `pie title Sizes`).
 */
export function sourceLines(source: string): SourceLine[] {
  let lines = source.split(/\r?\n/);
  if (lines[0]?.trim() === '---') lines = lines.slice(lines.findIndex((line, i) => i > 0 && line.trim() === '---') + 1);
  return lines
    .filter((line) => line.trim() && !line.trim().startsWith('%%'))
    .map((line) => ({ text: line.trim(), indent: line.length - line.trimStart().length }));
}

/** The parts of a ref that are there, space-separated: `words('#2', 'in rule x')` → `#2 in rule x`. */
export function words(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** A name as the source writes it, quoted or bare: `"Big"` → `Big`. */
export function unquote(text: string): string {
  const trimmed = text.trim();
  return /^".*"$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
}
