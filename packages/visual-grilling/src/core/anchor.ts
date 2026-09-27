// Anchoring: turns a click inside an illustration into the words the agent
// reads, in the illustration's own terms (`cell row "MCP server", column
// "Install"`).
//
// Pure. It works on a DOM snapshot (see src/page/anchor-snapshot.ts), so it
// runs the same in the page, inside sandboxed frames, on the server and in
// unit tests. A block's adapter gets the first say; the generic fallback
// names anything else.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One element of the clicked element's ancestor chain. */
export interface SnapshotElement {
  tag: string;
  /** id, role, class, name, type, placeholder, alt, href, value, and every data-* and aria-* attribute. */
  attrs: Record<string, string>;
  /** Visible text (style, script and title left out), at most 140 characters. */
  text: string;
  /** Text of a `<title>` child, SVG's accessible name. */
  title: string | null;
  /** Where the element sits among the root's elements of its tag and first class. */
  nth: { cls: string; i: number; of: number } | null;
  /** Relative to the snapshot root. */
  box: Box;
}

/** An element a block adapter asked for by selector, wherever it sits. */
export interface SnapshotPeer {
  tag: string;
  attrs: Record<string, string>;
  text: string;
}

/** A short visible text leaf, for "near …" descriptions of unlabeled spots. */
export interface SnapshotText {
  text: string;
  box: Box;
  /** Index of the SVG the text sits in, -1 outside any SVG. */
  svg: number;
}

export interface Snapshot {
  /** The clicked element first, then its ancestors up to and including the root. */
  chain: SnapshotElement[];
  root: { w: number; h: number };
  /** Relative to the root. */
  click: { x: number; y: number };
  /** A CSS selector for the clicked element, relative to the root. */
  selector: string;
  peers: SnapshotPeer[];
  texts: SnapshotText[];
  /** Index of the SVG the click landed in, -1 outside any SVG. */
  clickSvg: number;
}

/** What an adapter (or the generic fallback) found: `chainIndex` is the chain element it names, -1 for none. */
export interface AdapterMatch {
  kind: string;
  ref: string | null;
  label: string | null;
  via: string;
  chainIndex: number;
}

/**
 * A block's own reading of a click, tried before the generic fallback. The
 * page builds one from the block's `anchor` (blocks/registry.ts), which also
 * sees the illustration.
 */
export type AnchorAdapter = (snapshot: Snapshot) => AdapterMatch | null;

export interface AnchorTarget {
  kind: string;
  ref: string | null;
  label: string | null;
  /** What named it: the adapter's term, or data-anchor, id, aria-label, title, form control, text, position only. */
  via: string;
  /** Named by position or by text above the clicked element: the agent gets extra detail. */
  weak: boolean;
}

/** Where a comment sits: an illustration of the question, or an option's mockup. */
export interface AnchorSubject {
  illustration?: { id: string; kind: string; title?: string };
  /** The option letter, for a comment on that option's mockup. */
  option?: string;
}

export interface Anchor extends AnchorSubject {
  target: AnchorTarget;
  clicked: { tag: string; role: string | null; text: string };
  /** The nearest named container above the target (data-anchor or aria-label). */
  within: string | null;
  /** The nearest visible texts, for weak matches only. */
  near: string[];
  /** The click, as a percentage of the illustration's width and height. */
  position: { x: number; y: number };
  selector: string;
  /** The target's box, relative to the illustration. */
  box: Box | null;
}

export function resolveAnchor(snapshot: Snapshot, subject: AnchorSubject, adapter?: AnchorAdapter): Anchor {
  const match = adapter?.(snapshot) ?? genericMatch(snapshot);
  const weak = match.via === POSITION_ONLY || (match.via === 'text' && match.chainIndex > 0);
  const clicked = snapshot.chain[0]!;
  const pointed = match.chainIndex >= 0 ? snapshot.chain[match.chainIndex] : undefined;
  return {
    ...subject,
    target: { kind: match.kind, ref: match.ref, label: match.label, via: match.via, weak },
    clicked: { tag: clicked.tag, role: clicked.attrs.role ?? null, text: short(clicked.text, 80) },
    within: withinOf(snapshot, match.chainIndex),
    near: weak ? nearestTexts(snapshot, 2, match.label) : [],
    position: {
      x: percent(snapshot.click.x, snapshot.root.w),
      y: percent(snapshot.click.y, snapshot.root.h),
    },
    selector: snapshot.selector,
    box: pointed ? pointed.box : null,
  };
}

/** Display nouns for block kinds, where the fence name isn't what a person calls it. */
const KIND_NOUN: Record<string, string> = { 'vega-lite': 'chart' };

/**
 * How the anchor reads to the agent: `table "Compare" → cell row "MCP server",
 * column "Install"`. A weak match adds, in brackets, the element clicked, the
 * nearest text, the position and the crop, if any. The named container and
 * the selector stay in the record only.
 */
export function anchorLine(anchor: Anchor, crop?: string): string {
  const where = anchor.option
    ? `mockup ${anchor.option}`
    : anchor.illustration
      ? `${KIND_NOUN[anchor.illustration.kind] ?? anchor.illustration.kind} "${anchor.illustration.title ?? anchor.illustration.id}"`
      : 'illustration';
  return `${where} → ${targetText(anchor.target)}${weakDetail(anchor, crop)}`;
}

/** The target alone, as the page shows it on a pinned comment. */
export function targetText(target: AnchorTarget): string {
  if (target.kind === AREA) return 'empty area';
  return `${target.kind}${target.ref ? ` ${target.ref}` : ''}${target.label ? ` ${quote(short(target.label, 70))}` : ''}`;
}

function weakDetail(anchor: Anchor, crop: string | undefined): string {
  if (!anchor.target.weak) return '';
  const { clicked } = anchor;
  const parts: string[] = [];
  if (anchor.target.kind !== AREA) {
    let element = `clicked <${clicked.tag}${clicked.role ? ` role=${clicked.role}` : ''}>`;
    if (clicked.text && clicked.text !== anchor.target.label) element += ` ${quote(short(clicked.text, 40))}`;
    parts.push(element);
  }
  if (anchor.near.length > 0) parts.push(`near ${anchor.near.map((text) => quote(short(text, 30))).join(', ')}`);
  parts.push(`at ${anchor.position.x}% across, ${anchor.position.y}% down`);
  if (crop) parts.push(`crop ${crop}`);
  return `  [${parts.join('; ')}]`;
}

// ------------------------------------------------------------ the fallback

const POSITION_ONLY = 'position only';
const AREA = 'area';

/** Ids a library or the page generated, which mean nothing to the agent. */
function generatedId(id: string): boolean {
  return /^(mermaid|view_|flowsvg|m\d+$|q\d|vg)/i.test(id) || /\d{3,}/.test(id);
}

/**
 * Names any HTML or SVG: an author-given name first (data-anchor, a
 * hand-written id, aria-label, <title>), then a form control's own
 * description, then short text on the clicked element or up to two levels
 * above, and otherwise an unlabeled shape or an empty area.
 */
export function genericMatch(snapshot: Snapshot): AdapterMatch {
  const { chain } = snapshot;
  const last = chain.length - 1;

  for (let i = 0; i < last; i++) {
    const element = chain[i]!;
    const { attrs } = element;
    if (attrs['data-anchor']) {
      return { kind: element.tag, ref: attrs['data-anchor'], label: short(element.text, 60) || null, via: 'data-anchor', chainIndex: i };
    }
    if (attrs.id && !generatedId(attrs.id)) {
      return { kind: element.tag, ref: attrs.id, label: short(element.text, 60) || null, via: 'id', chainIndex: i };
    }
    if (attrs['aria-label']) {
      return { kind: attrs.role ?? element.tag, ref: null, label: attrs['aria-label'], via: 'aria-label', chainIndex: i };
    }
    if (element.title) return { kind: element.tag, ref: null, label: element.title, via: 'title', chainIndex: i };
  }

  const first = chain[0]!;
  if (['input', 'textarea', 'select'].includes(first.tag)) {
    return {
      kind: first.tag === 'input' ? `${first.attrs.type ?? 'text'} input` : first.tag,
      ref: first.attrs.name ?? null,
      label: first.attrs.placeholder ?? first.attrs.value ?? null,
      via: 'form control',
      chainIndex: 0,
    };
  }

  // Only close to the click: a far ancestor's text describes a whole group, not the spot.
  for (let i = 0; i < Math.min(last, 3); i++) {
    const element = chain[i]!;
    if (element.text && element.text.length <= 60 && !/^(svg|body|html)$/.test(element.tag)) {
      return { kind: roleName(element), ref: null, label: element.text, via: 'text', chainIndex: i };
    }
  }

  if (last > 0 && !/^(svg|div|body|html|main|section)$/.test(first.tag)) {
    return { kind: `unlabeled ${roleName(first)}`, ref: null, label: null, via: POSITION_ONLY, chainIndex: 0 };
  }
  return { kind: AREA, ref: null, label: null, via: POSITION_ONLY, chainIndex: -1 };
}

const TAG_ROLES: Record<string, string> = {
  button: 'button',
  a: 'link',
  input: 'input',
  li: 'list item',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  td: 'cell',
  th: 'header',
  label: 'label',
  text: 'text',
  tspan: 'text',
  g: 'shape group',
  rect: 'shape',
  circle: 'shape',
  ellipse: 'shape',
  polygon: 'shape',
  path: 'shape',
  line: 'shape',
  img: 'image',
};

function roleName(element: SnapshotElement): string {
  return element.attrs.role ?? TAG_ROLES[element.tag] ?? element.tag;
}

function nearestTexts(snapshot: Snapshot, count: number, skip: string | null): string[] {
  const { click } = snapshot;
  const distance = (box: Box) =>
    Math.hypot(Math.max(box.x - click.x, 0, click.x - (box.x + box.w)), Math.max(box.y - click.y, 0, click.y - (box.y + box.h)));
  const seen = new Set<string>();
  return snapshot.texts
    .filter((text) => text.box.w > 0 && text.text !== skip && (snapshot.clickSvg < 0 || text.svg === snapshot.clickSvg))
    .map((text) => ({ text: text.text, distance: distance(text.box) }))
    .sort((a, b) => a.distance - b.distance)
    .filter(({ text }) => !seen.has(text) && Boolean(seen.add(text)))
    .slice(0, count)
    .map(({ text }) => text);
}

function withinOf(snapshot: Snapshot, from: number): string | null {
  const { chain } = snapshot;
  for (let i = Math.max(0, from) + 1; i < chain.length - 1; i++) {
    const name = chain[i]!.attrs['data-anchor'] ?? chain[i]!.attrs['aria-label'];
    if (name) return name;
  }
  return null;
}

function percent(value: number, whole: number): number {
  return Math.min(100, Math.max(0, Math.round((100 * value) / Math.max(1, whole))));
}

function short(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function quote(text: string): string {
  return JSON.stringify(text.replace(/\s+/g, ' ').trim());
}
