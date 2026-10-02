// The design tree beside the questions: settled and open branches, nested as
// the agent wrote them, with each bare `Q<n>` linking to that question, in
// this round or an earlier one.

import type { DesignTreeNode } from '../core/round.ts';
import { h, icon } from './dom.ts';

export interface TreeContext {
  /** The question on screen, whose rows are marked current. */
  current?: number;
  /** Opens a question: of the round the tree belongs to, or of an earlier one. */
  open: (question: number) => void;
  /** The earlier round a question is in, when it isn't in the tree's own round. */
  elsewhere: (question: number) => number | undefined;
  /** Tells this copy's links apart from another copy's (column and drawer) for focus keeping. */
  keyPrefix: string;
  /** The round was submitted and the agent hasn't sent the next round's tree yet. */
  stale?: boolean;
}

export function designTree(nodes: DesignTreeNode[], context: TreeContext): HTMLElement {
  return h(
    'div',
    { class: context.stale ? 'tree stale' : 'tree' },
    h('h2', { class: 'tree-h' }, 'Design tree'),
    context.stale &&
      h(
        'p',
        { class: 'tree-note' },
        h('span', { class: 'wait-dot', 'aria-hidden': 'true' }),
        'Out of date until the next round',
      ),
    h(
      'div',
      { class: 'legend', 'aria-hidden': 'true' },
      h('span', {}, icon('done'), 'Settled'),
      h('span', {}, icon('open'), 'Open'),
    ),
    branches(nodes, context),
  );
}

function branches(nodes: DesignTreeNode[], context: TreeContext): HTMLElement {
  return h(
    'ul',
    {},
    ...nodes.map((node) => {
      const current = context.current !== undefined && node.questions.includes(context.current);
      return h(
        'li',
        {},
        h(
          'div',
          { class: `tn${node.settled ? ' settled' : ''}${current ? ' cur' : ''}` },
          h('span', { class: `st${node.settled ? ' ok' : ''}`, title: node.settled ? 'Settled' : 'Open' }, icon(node.settled ? 'done' : 'open')),
          h(
            'span',
            { class: 'tn-l' },
            ...linked(node.label, node.questions, context),
            node.gist && h('span', { class: 'tn-sub' }, ...linked(node.gist, node.questions, context)),
          ),
        ),
        node.children.length > 0 && branches(node.children, context),
      );
    }),
  );
}

/** Text with each `Q<n>` the branch names turned into a link to that question. */
function linked(text: string, questions: number[], context: TreeContext): (Node | string)[] {
  const parts: (Node | string)[] = [];
  let last = 0;
  for (const match of text.matchAll(/\bQ(\d+)\b/g)) {
    const n = Number(match[1]);
    if (!questions.includes(n)) continue;
    const round = context.elsewhere(n);
    parts.push(text.slice(last, match.index));
    parts.push(
      h(
        'a',
        {
          class: 'qref',
          href: `#q${n}`,
          'data-key': `${context.keyPrefix}-q${n}`,
          title: round === undefined ? undefined : `Opens round ${round}`,
          onclick: (event) => {
            event.preventDefault();
            context.open(n);
          },
        },
        `Q${n}`,
      ),
    );
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return parts.filter((part) => part !== '');
}
