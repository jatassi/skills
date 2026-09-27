// Explainers for Mermaid draw failures. They run only after a real failure,
// so they can never reject a round that draws, and each turns one known class
// of library error into a fix the agent can make. The first one that
// recognises the failure wins; an unrecognised failure keeps Mermaid's message.

export interface Explanation {
  message: string;
  /** 1-based line within the diagram source, when the fix is on one line. */
  sourceLine?: number;
}

/** What the draw check knows about the failed diagram. */
export interface FailedDiagram {
  source: string;
  /** The parsed diagram, when the source parses at all. */
  diagram?: { type: string; db: unknown };
}

type Explainer = (failed: FailedDiagram) => Explanation | undefined;

const EXPLAINERS: Explainer[] = [nodeNamedLikeEdge, edgeIdCollision, ganttTaskMetadata];

export function explainMermaidFailure(failed: FailedDiagram): Explanation | undefined {
  for (const explain of EXPLAINERS) {
    const explanation = explain(failed);
    if (explanation) return explanation;
  }
  return undefined;
}

// ------------------------------------------------------------- flowcharts

interface FlowEdge {
  id: string;
  start: string;
  end: string;
  isUserDefinedId?: boolean;
}

function flowEdges(failed: FailedDiagram): { edges: FlowEdge[]; nodes: Set<string> } | undefined {
  const { diagram } = failed;
  if (!diagram || !diagram.type.startsWith('flowchart')) return undefined;
  const db = diagram.db as { getEdges?: () => FlowEdge[]; getVertices?: () => Map<string, unknown> };
  if (typeof db.getEdges !== 'function' || typeof db.getVertices !== 'function') return undefined;
  return { edges: db.getEdges(), nodes: new Set(db.getVertices().keys()) };
}

const arrow = (edge: FlowEdge) => `${edge.start} --> ${edge.end}`;

/**
 * A node named after an edge id (`a e1@--> b` then `e1 --> c`): Mermaid reads
 * `e1` as the edge, not a node, and the layout finds no shape for it
 * (mermaid#7033).
 */
function nodeNamedLikeEdge(failed: FailedDiagram): Explanation | undefined {
  const flow = flowEdges(failed);
  if (!flow) return undefined;
  const named = new Map(flow.edges.filter((edge) => edge.isUserDefinedId).map((edge) => [edge.id, edge]));
  for (const edge of flow.edges) {
    for (const end of [edge.start, edge.end]) {
      const owner = named.get(end);
      if (!owner || flow.nodes.has(end)) continue;
      return {
        message: `"${end}" is used as a node in "${arrow(edge)}" but is already the id of the edge "${arrow(owner)}" (${end}@); Mermaid can't draw a node and an edge with one id, so rename the node or the edge id`,
        sourceLine: lineMatching(failed.source, new RegExp(`(^|[^\\w-])${escape(end)}@`)),
      };
    }
  }
  return undefined;
}

/**
 * Two edges with one id. Mermaid names edges `L_<start>_<end>_<n>`, so node
 * ids containing `_` can collide (`a_b --> c` and `a --> b_c` both give
 * `L_a_b_c_0`), and an edge id the agent chose can match a generated one.
 */
function edgeIdCollision(failed: FailedDiagram): Explanation | undefined {
  const flow = flowEdges(failed);
  if (!flow) return undefined;
  const byId = new Map<string, FlowEdge>();
  for (const edge of flow.edges) {
    const first = byId.get(edge.id);
    if (!first) {
      byId.set(edge.id, edge);
      continue;
    }
    const chosen = [first, edge].find((candidate) => candidate.isUserDefinedId);
    if (chosen) {
      const generated = chosen === first ? edge : first;
      return {
        message: `the edge id "${chosen.id}" given to "${arrow(chosen)}" is the id Mermaid generates for "${arrow(generated)}"; choose an edge id that doesn't start with "L_"`,
        sourceLine: lineMatching(failed.source, new RegExp(`${escape(chosen.id)}@`)),
      };
    }
    return {
      message: `the edges "${arrow(first)}" and "${arrow(edge)}" both get the id "${edge.id}" because node ids contain "_"; rename those nodes without "_" (e.g. use "-" or camelCase)`,
    };
  }
  return undefined;
}

// ------------------------------------------------------------------ gantt

const GANTT_TAGS = new Set(['active', 'done', 'crit', 'milestone', 'vert']);
const GANTT_KEYWORDS =
  /^(gantt|title|dateFormat|axisFormat|tickInterval|excludes|includes|todayMarker|weekday|weekend|section|accTitle|accDescr|inclusiveEndDates|topAxis|displayMode|click|%%)\b/;

/**
 * A task's metadata after the `:` is up to three comma-separated items after
 * its tags (id, start, end or duration). An empty item (a trailing or doubled
 * comma) or a fourth item leaves the task with no start, and the draw throws
 * (mermaid#8123, mermaid#8188).
 */
function ganttTaskMetadata(failed: FailedDiagram): Explanation | undefined {
  if (failed.diagram && failed.diagram.type !== 'gantt') return undefined;
  const lines = failed.source.split('\n');
  if (!lines.some((line) => /^\s*gantt\b/.test(line))) return undefined;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed || GANTT_KEYWORDS.test(trimmed)) continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const task = trimmed.slice(0, colon).trim();
    const items = trimmed.slice(colon + 1).split(',').map((item) => item.trim());
    const firstItem = items.findIndex((item) => !GANTT_TAGS.has(item));
    const rest = firstItem === -1 ? [] : items.slice(firstItem);
    const where = `task "${task}"`;
    if (rest.some((item) => item === '')) {
      return {
        message: `${where} has an empty metadata item (a trailing or doubled comma); remove the extra comma`,
        sourceLine: index + 1,
      };
    }
    if (rest.length > 3) {
      return {
        message: `${where} has ${rest.length} metadata items after its tags; a task takes at most three (id, start, end or duration), with tags (${[...GANTT_TAGS].join(', ')}) first`,
        sourceLine: index + 1,
      };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------- helpers

function lineMatching(source: string, pattern: RegExp): number | undefined {
  const index = source.split('\n').findIndex((line) => pattern.test(line));
  return index === -1 ? undefined : index + 1;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
