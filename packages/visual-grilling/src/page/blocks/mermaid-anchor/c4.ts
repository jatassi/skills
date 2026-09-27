// C4: people, systems, containers and components are `g.c4-shape` with the
// agent's alias as id, and a class naming their kind (`c4-system_db`).
// Boundaries and relationships carry no identity; they are matched by
// position, elsewhere.

import { classes, find, hasClass, match, unprefixed, type DiagramAdapter } from './shared.ts';

export const c4Adapter: DiagramAdapter = {
  read(click) {
    const shape = find(click, (element) => element.tag === 'g' && hasClass(element, 'c4-shape') && unprefixed(click, element.attrs.id) !== null);
    if (!shape) return null;
    const alias = unprefixed(click, shape.element.attrs.id)!;
    const kind = classes(shape.element).find((name) => name.startsWith('c4-') && name !== 'c4-shape') ?? 'c4-element';
    // The shape's text starts with its name, then its "[Type]".
    const name = shape.element.text.split(' [')[0]!.trim();
    return match(kind.slice('c4-'.length).replace(/_/g, ' '), alias, name && name !== alias ? name : null, shape.index);
  },
};
