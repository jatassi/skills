// The design tree beside the questions: settled and open branches, nested as
// the agent wrote them, with each bare `Q<n>` linking to that question.

import type { DesignTreeNode } from '../core/round.ts';
import { h, icon } from './dom.ts';

export interface TreeContext {
  /** The question on screen, whose rows are marked current. */
  current?: number;
  /** Opens a question of the round the tree belongs to. */
  open: (question: number) => void;
  /** Tells this copy's links apart from another copy's (column and drawer) for focus keeping. */
  keyPrefix: string;
}

export function designTree(nodes: DesignTreeNode[], context: TreeContext): HTMLElement {
  return h(
    'div',
    { class: 'tree' },
    h('h2', { class: 'tree-h' }, 'Design tree'),
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

/** Text with each `Q<n>` of this round turned into a link to that question. */
function linked(text: string, questions: number[], context: TreeContext): (Node | string)[] {
  const parts: (Node | string)[] = [];
  let last = 0;
  for (const match of text.matchAll(/\bQ(\d+)\b/g)) {
    const n = Number(match[1]);
    if (!questions.includes(n)) continue;
    parts.push(text.slice(last, match.index));
    parts.push(
      h(
        'a',
        {
          class: 'qref',
          href: `#q${n}`,
          'data-key': `${context.keyPrefix}-q${n}`,
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
