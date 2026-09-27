// Registers every block the page draws. A new block: export its BlockRenderer
// from blocks/<kind>.ts and register it here.

import { registerBlock } from './registry.ts';
import { tableBlock } from './table.ts';

registerBlock('table', tableBlock);

export { blockFor, registerBlock, type BlockContext, type BlockRenderer } from './registry.ts';
