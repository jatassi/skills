// Whether the agent overrode a drawing's theme, where exact colours matter
// (to match a real product, say). The override merges over the page's
// settings, but its colours no longer follow the theme, so the block's
// readability on dark is checked (readability.ts, checkDrawing) and the frame
// can give it the light backdrop.
//
// Each block's own override syntax:
//   - Mermaid: a `%%{init: …}%%` (or `initialize`) directive, or `config:` in the frontmatter;
//   - Vega-Lite: the spec's top-level `config`;
//   - DOT: a colour attribute (`color`, `fillcolor`, `fontcolor`, `bgcolor`…),
//     including an HTML label's `<font color=…>`.

import type { IllustrationKind } from '../../core/round.ts';

const MERMAID_DIRECTIVE = /%%\{\s*(?:init|initialize)\s*:/;
const MERMAID_FRONTMATTER = /^\s*---[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*---/;
const DOT_COLOUR_NAMES = 'color|fillcolor|fontcolor|bgcolor|pencolor|labelfontcolor|colorscheme';
const DOT_COLOUR = new RegExp(`\\b(?:${DOT_COLOUR_NAMES})\\s*=`, 'i');
/** DOT allows an attribute name in quotes too: `"fillcolor"="red"`. */
const DOT_QUOTED_COLOUR = new RegExp(`"(?:${DOT_COLOUR_NAMES})"\\s*=`, 'i');

export function overridesTheme(kind: IllustrationKind, source: string): boolean {
  switch (kind) {
    case 'mermaid': {
      if (MERMAID_DIRECTIVE.test(source)) return true;
      const frontmatter = MERMAID_FRONTMATTER.exec(source)?.[1];
      return frontmatter !== undefined && /^config\s*:/m.test(frontmatter);
    }
    case 'vega-lite':
      try {
        const spec = JSON.parse(source) as unknown;
        return typeof spec === 'object' && spec !== null && 'config' in spec;
      } catch {
        return false;
      }
    case 'dot':
      // Past a quoted attribute name, a quoted string is a label or an id: it can't name a colour attribute.
      return DOT_QUOTED_COLOUR.test(source) || DOT_COLOUR.test(source.replace(/"(?:[^"\\]|\\.)*"/g, '""'));
    default:
      return false;
  }
}
