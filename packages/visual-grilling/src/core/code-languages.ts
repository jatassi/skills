// The languages code blocks highlight: about 30, by Shiki's grammar name, and
// the names an agent may write for them. The parser uses this to note an
// unknown `lang`; the code chunk loads exactly these grammars. Anything else
// shows as plain text.

/** Shiki grammar name → the other names it goes by. */
export const CODE_LANGUAGES = {
  typescript: ['ts', 'cts', 'mts'],
  tsx: [],
  javascript: ['js', 'cjs', 'mjs'],
  jsx: [],
  json: [],
  jsonc: [],
  yaml: ['yml'],
  toml: [],
  shellscript: ['bash', 'sh', 'shell', 'zsh'],
  python: ['py'],
  go: ['golang'],
  rust: ['rs'],
  java: [],
  kotlin: ['kt', 'kts'],
  swift: [],
  c: [],
  cpp: ['c++'],
  csharp: ['cs', 'c#'],
  php: [],
  sql: [],
  html: [],
  css: [],
  markdown: ['md'],
  diff: ['patch'],
  docker: ['dockerfile'],
  xml: ['svg'],
  terraform: ['tf', 'tfvars'],
  ini: ['properties'],
  lua: [],
  dart: [],
  elixir: ['ex', 'exs'],
} as const satisfies Record<string, readonly string[]>;

export type CodeLanguage = keyof typeof CODE_LANGUAGES;

/** Names that mean "no highlighting" and need no note. */
const PLAIN = new Set(['text', 'txt', 'plain', 'plaintext']);

const BY_NAME = new Map<string, CodeLanguage>(
  Object.entries(CODE_LANGUAGES).flatMap(([id, aliases]) =>
    [id, ...aliases].map((name) => [name, id as CodeLanguage] as const),
  ),
);

/**
 * The grammar a language name highlights with: a grammar name, `text` for
 * plain text, or undefined for a language outside the set (which then shows
 * as plain text, with a note).
 */
export function codeLanguage(name: string): CodeLanguage | 'text' | undefined {
  const key = name.trim().toLowerCase();
  if (PLAIN.has(key)) return 'text';
  return BY_NAME.get(key);
}
