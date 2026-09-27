// C4: people, systems, containers and components are `g.c4-shape` with the
// agent's alias as id, and a class naming their kind (`c4-system_db`).
//
// Boundaries and relationships carry no identity, so they are matched by
// position. Each boundary is a top-level group led by its dashed rect,
// drawn inner boundaries first (boundary k is the k-th in post-order of the
// source's nesting). Every relationship sits in one top-level group, as its
// line or path and then its label texts, in source order: line k is the
// k-th `Rel`, and a label belongs to the line drawn before it.

import type { AdapterMatch } from '../../../core/anchor.ts';
import {
  classes,
  find,
  hasClass,
  match,
  pairRef,
  peerAt,
  sourceLines,
  unprefixed,
  VIA_NEIGHBOUR,
  VIA_POSITION,
  type DiagramAdapter,
  type DiagramClick,
} from './shared.ts';

const isBoundary = (peer: { tag: string }) => peer.tag === 'rect';
const isLine = (peer: { tag: string }) => peer.tag === 'line' || peer.tag === 'path';
const isRelPart = (peer: { tag: string }) => isLine(peer) || peer.tag === 'text';

export const c4Adapter: DiagramAdapter = {
  // Children of the drawing's top-level groups: boundary rects, relationship lines and texts.
  peers: '> g > rect, > g > line, > g > path, > g > text',
  read(click) {
    const shape = find(click, (element) => element.tag === 'g' && hasClass(element, 'c4-shape') && unprefixed(click, element.attrs.id) !== null);
    if (shape) {
      const alias = unprefixed(click, shape.element.attrs.id)!;
      const kind = classes(shape.element).find((name) => name.startsWith('c4-') && name !== 'c4-shape') ?? 'c4-element';
      // The shape's text starts with its name, then its "[Type]".
      const name = shape.element.text.split(' [')[0]!.trim();
      return match(kind.slice('c4-'.length).replace(/_/g, ' '), alias, name && name !== alias ? name : null, shape.index);
    }
    const top = click.chain.length - 1;
    const group = click.chain[top];
    if (!group || group.tag !== 'g') return null;
    const boundaries = click.peers.filter(isBoundary);
    const k = boundaries.findIndex((rect) => rect.box && rect.box.x === group.box.x && rect.box.y === group.box.y && rect.box.w === group.box.w && rect.box.h === group.box.h);
    if (k >= 0) {
      const boundary = parse(click.source).boundaries[k];
      return boundary ? match('boundary', boundary.alias, boundary.label, top, VIA_POSITION) : null;
    }
    return relationship(click);
  },
};

function relationship(click: DiagramClick): AdapterMatch | null {
  const clicked = click.chain[0]!.tag === 'tspan' ? 1 : 0;
  const element = click.chain[clicked];
  if (!element || !isRelPart(element)) return null;
  const parts = click.peers.filter(isRelPart);
  const at = peerAt(click, element, isRelPart);
  const line = parts.slice(0, at + 1).findLastIndex(isLine);
  if (at < 0 || line < 0) return null;
  const k = parts.slice(0, line + 1).filter(isLine).length - 1;
  const rels = parse(click.source).relationships;
  const rel = rels[k];
  const ref = pairRef(
    rels.map((other) => other.ends),
    k,
  );
  if (!rel || !ref) return null;
  return match('relationship', ref, rel.label, clicked, isLine(element) ? VIA_POSITION : VIA_NEIGHBOUR);
}

interface Boundary {
  alias: string;
  label: string | null;
  children: Boundary[];
}

/** Relationships in source order, and boundaries in drawing order (inner ones first). */
function parse(source: string): { relationships: { ends: string; label: string | null }[]; boundaries: Boundary[] } {
  const relationships: { ends: string; label: string | null }[] = [];
  const root: Boundary = { alias: '', label: null, children: [] };
  const open = [root];
  for (const { text } of sourceLines(source)) {
    const rel = /^(Bi)?Rel(?:_\w+)?\s*\(\s*([^,\s)]+)\s*,\s*([^,\s)]+)\s*(?:,\s*"([^"]*)")?/.exec(text);
    if (rel) relationships.push({ ends: `${rel[2]} ${rel[1] ? '↔' : '→'} ${rel[3]}`, label: rel[4] ?? null });
    const boundary = /^(?:\w*Boundary|Deployment_Node|Node(?:_[LR])?)\s*\(\s*([^,\s)]+)\s*(?:,\s*"([^"]*)")?.*\{\s*$/.exec(text);
    if (boundary) {
      const entry = { alias: boundary[1]!, label: boundary[2] ?? null, children: [] };
      open.at(-1)!.children.push(entry);
      open.push(entry);
    } else if (text === '}' && open.length > 1) {
      open.pop();
    }
  }
  const postOrder = (boundaries: Boundary[]): Boundary[] => boundaries.flatMap((entry) => [...postOrder(entry.children), entry]);
  return { relationships, boundaries: postOrder(root.children) };
}
