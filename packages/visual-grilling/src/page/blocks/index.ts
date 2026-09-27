// Registers every block the page draws. A new block: export its BlockRenderer
// from blocks/<kind>.ts and register it here.

import { dotBlock } from './dot.ts';
import { mermaidBlock } from './mermaid.ts';
import { registerBlock } from './registry.ts';
import { tableBlock } from './table.ts';

registerBlock('dot', dotBlock);
registerBlock('mermaid', mermaidBlock);
registerBlock('table', tableBlock);

export { blockFor, registerBlock, type BlockContext, type BlockRenderer } from './registry.ts';
