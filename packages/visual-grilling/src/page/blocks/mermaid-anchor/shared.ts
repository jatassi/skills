// What every Mermaid diagram-type adapter works with: the click, read against
// the drawing's render-id prefix and the peers its type asked for, and the
// helpers for turning Mermaid's ids back into the agent's.
//
// Pure: it reads a Snapshot (src/core/anchor.ts), never the DOM.

import type { AdapterMatch, Snapshot, SnapshotElement, SnapshotPeer } from '../../../core/anchor.ts';

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
 * How a term was found, for the agent: straight from an id in the SVG, or
 * from a fixed neighbouring element (text that has no id of its own).
 * Later rules add `mermaid position` and `mermaid geometry`.
 */
export const VIA_ID = 'mermaid id';
export const VIA_NEIGHBOUR = 'mermaid neighbour';

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
