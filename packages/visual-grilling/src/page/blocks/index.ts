// Registers every block the page draws. A new block: export its BlockRenderer
// from blocks/<kind>.ts and register it here.

import { codeBlock } from './code.ts';
import { dotBlock } from './dot.ts';
import { htmlBlock } from './html.ts';
import { mermaidBlock } from './mermaid.ts';
import { registerBlock } from './registry.ts';
import { tableBlock } from './table.ts';
import { vegaLiteBlock } from './vega-lite.ts';

for (const kind of ['code', 'diff'] as const) registerBlock(kind, codeBlock);
registerBlock('dot', dotBlock);
registerBlock('mermaid', mermaidBlock);
registerBlock('table', tableBlock);
registerBlock('vega-lite', vegaLiteBlock);
registerBlock('html', htmlBlock);

export {
  blockFor,
  registerBlock,
  type BlockContext,
  type BlockRenderer,
  type BlockState,
  type BlockView,
} from './registry.ts';
