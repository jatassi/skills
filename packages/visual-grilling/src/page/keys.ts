// The round page's keys, as commands. The page decides what each one does in
// its current state (a read-only round ignores the answering ones).
//
//   Enter      accept the recommendation      J / K   next / previous step
//   A, B, …    pick that option               W       write my own answer
//   U          mark unsure                    M       comment mode on / off
//   ⌘↵ / Ctrl+↵   submit
//   Escape     drop an unsaved comment, leave comment mode, close a drawer or
//              menu, or leave the answer box
//
// Letters the page uses for commands never pick an option, so an option
// lettered J, K, M, U or W is picked by click only.

export type KeyCommand =
  | { kind: 'accept' }
  | { kind: 'pick'; letter: string }
  | { kind: 'write' }
  | { kind: 'unsure' }
  | { kind: 'next' }
  | { kind: 'previous' }
  | { kind: 'comment' }
  | { kind: 'submit' }
  | { kind: 'escape' };

const COMMAND_LETTERS = new Set(['j', 'k', 'm', 'u', 'w']);

export function keyCommand(event: KeyboardEvent): KeyCommand | undefined {
  if (event.isComposing) return undefined;
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) return { kind: 'submit' };
  if (event.key === 'Escape') return { kind: 'escape' };
  if (event.metaKey || event.ctrlKey || event.altKey) return undefined;

  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, select, [contenteditable]')) return undefined;

  if (event.key === 'Enter') {
    // A focused control answers Enter itself.
    if (target?.closest('button, a, summary, [role^="menuitem"], [tabindex]:not([tabindex="-1"])')) return undefined;
    return { kind: 'accept' };
  }

  if (!/^[a-z]$/i.test(event.key)) return undefined;
  const key = event.key.toLowerCase();
  switch (key) {
    case 'j':
      return { kind: 'next' };
    case 'k':
      return { kind: 'previous' };
    case 'w':
      return { kind: 'write' };
    case 'u':
      return { kind: 'unsure' };
    case 'm':
      return { kind: 'comment' };
  }
  if (COMMAND_LETTERS.has(key)) return undefined;
  return { kind: 'pick', letter: key.toUpperCase() };
}
