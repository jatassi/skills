// Anchoring for the `mermaid` block: one adapter per diagram type, keyed by
// Mermaid's name for the type (the drawing's aria-roledescription). A click
// the type's adapter can't name, or a type with no adapter, falls to the
// generic rules.
//
// Adding a type: write a DiagramAdapter in its own module (types drawn by
// one renderer, like the graph family, share a module) and list it in
// ADAPTERS with the type names it reads. Its `peers` selector joins the
// block's, scoped to drawings of those types.
//
// The rules come from the research on Mermaid 12's SVG output: docs/research/
// mermaid-anchor-terms.md on the research/mermaid-anchor-terms branch.

import type { AdapterMatch, Snapshot, SnapshotElement } from '../../../core/anchor.ts';
import type { PageIllustration } from '../../../core/protocol.ts';
import { architectureAdapter } from './architecture.ts';
import { c4Adapter } from './c4.ts';
import { ganttAdapter } from './gantt.ts';
import { gitGraphAdapter } from './gitgraph.ts';
import {
  blockAdapter,
  classAdapter,
  erAdapter,
  flowchartAdapter,
  kanbanAdapter,
  requirementAdapter,
  stateAdapter,
  useCaseAdapter,
} from './graph.ts';
import { sequenceAdapter } from './sequence.ts';
import { HIT_CLASS, HIT_ORIGINAL_CLASS, HIT_ORIGINAL_ID } from './hit.ts';
import { hasClass, type DiagramAdapter, type DiagramClick } from './shared.ts';
import { vennAdapter } from './venn.ts';

const ADAPTERS: [types: string[], adapter: DiagramAdapter][] = [
  [['flowchart-v2', 'flowchart', 'flowchart-elk', 'swimlane', 'agentflow'], flowchartAdapter],
  [['classDiagram'], classAdapter],
  [['stateDiagram'], stateAdapter],
  [['er'], erAdapter],
  [['requirement'], requirementAdapter],
  [['kanban'], kanbanAdapter],
  [['block'], blockAdapter],
  [['usecase'], useCaseAdapter],
  [['architecture'], architectureAdapter],
  [['c4'], c4Adapter],
  [['gantt'], ganttAdapter],
  [['venn'], vennAdapter],
  [['gitGraph'], gitGraphAdapter],
  [['sequence'], sequenceAdapter],
];

const BY_TYPE = new Map(ADAPTERS.flatMap(([types, adapter]) => types.map((type) => [type, adapter] as const)));

/** Every type's peers selector, each part scoped to that type's drawings. */
export const MERMAID_PEERS = ADAPTERS.flatMap(([types, adapter]) =>
  adapter.peers
    ? types.flatMap((type) =>
        adapter.peers!.split(',').map((part) => `svg[aria-roledescription="${type}"] ${part.trim()}`),
      )
    : [],
).join(', ');

/** The `mermaid` block's anchor adapter. */
export function mermaidAnchor(snapshot: Snapshot, illustration: PageIllustration): AdapterMatch | null {
  const svgIndex = snapshot.chain.findIndex((element) => element.tag === 'svg' && element.attrs['aria-roledescription']);
  if (svgIndex < 0) return null;
  const svg = snapshot.chain[svgIndex]!;
  const type = svg.attrs['aria-roledescription']!;
  const adapter = BY_TYPE.get(type);
  if (!adapter || !svg.attrs.id) return null;
  const click: DiagramClick = {
    snapshot,
    chain: snapshot.chain.slice(0, svgIndex).map(original),
    type,
    prefix: `${svg.attrs.id}-`,
    source: illustration.source,
    peers: snapshot.peers.filter((peer) => !hasClass(peer, HIT_CLASS)),
  };
  return adapter.read(click);
}

/** A hit area (see hit.ts) stands for the line it widens: read it with that line's id and class. */
function original(element: SnapshotElement): SnapshotElement {
  const id = element.attrs[HIT_ORIGINAL_ID];
  if (id === undefined) return element;
  const attrs: Record<string, string> = { ...element.attrs, class: element.attrs[HIT_ORIGINAL_CLASS] ?? '' };
  if (id) attrs.id = id;
  return { ...element, attrs, nth: null };
}
