// The code library chunk: Shiki 4 for code fences and @pierre/diffs for
// unified diffs. The build emits it as its own ESM file (page/code.js); the
// round page imports it lazily, and the server's draw check imports the same
// file. Both render to HTML strings with no DOM.
//
// Colours are CSS variables, never literal values (Shiki's
// createCssVariablesTheme), so the page's theme tokens colour the output and a
// theme flip recolours it without highlighting again.

import { getFiletypeFromFileName, parsePatchFiles, registerCustomCSSVariableTheme, type FileDiffMetadata } from '@pierre/diffs';
import { preloadFileDiff } from '@pierre/diffs/ssr';
import type { HighlighterCore, ThemedToken } from 'shiki/core';
import { codeLanguage } from '../core/code-languages.ts';
import { recountHunks } from '../core/unified-diff.ts';
import { createCssVariablesTheme, createHighlighter, createJavaScriptRegexEngine, GRAMMARS } from './shiki.ts';

const THEME = 'vg-tokens';

// ------------------------------------------------------------------- code

let highlighter: Promise<HighlighterCore> | undefined;

function loadHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighter({
    themes: [createCssVariablesTheme({ name: THEME, variablePrefix: '--shiki-', fontStyle: true })],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

export interface HighlightedCode {
  /** The grammar used: a Shiki name, or `text` for a language outside the set. */
  lang: string;
  /** One HTML string of coloured spans per source line. */
  lines: string[];
}

/** Highlights code in `lang` (any name or alias; unknown ones show as plain text). */
export async function highlightCode(source: string, lang: string): Promise<HighlightedCode> {
  const grammar = codeLanguage(lang) ?? 'text';
  const shiki = await loadHighlighter();
  if (grammar !== 'text' && !shiki.getLoadedLanguages().includes(grammar)) await shiki.loadLanguage(...GRAMMARS[grammar]);
  const text = source.replace(/\n$/, '');
  const { tokens } = shiki.codeToTokens(text, { lang: grammar, theme: THEME });
  return { lang: grammar, lines: tokens.map((line) => line.map(tokenHtml).join('')) };
}

function tokenHtml(token: ThemedToken): string {
  const style: string[] = [];
  if (token.color) style.push(`color:${token.color}`);
  // FontStyle bit flags: 1 italic, 2 bold, 4 underline.
  const font = token.fontStyle ?? 0;
  if (font & 1) style.push('font-style:italic');
  if (font & 2) style.push('font-weight:bold');
  if (font & 4) style.push('text-decoration:underline');
  const content = escapeHtml(token.content);
  return style.length > 0 ? `<span style="${style.join(';')}">${content}</span>` : content;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
}

// ------------------------------------------------------------------- diff

/** Thrown when a diff parses to no files. */
export class EmptyDiffError extends Error {
  override name = 'EmptyDiffError';
}

export interface DiffFile {
  /** The file's path after the change (before it, for a deletion). */
  name: string;
  /** The path before a rename. */
  prevName?: string;
  type: FileDiffMetadata['type'];
  /** The file's diff as @pierre/diffs draws it: meant for a shadow root, styles included. */
  html: string;
}

let themeRegistered = false;

/**
 * Draws a unified diff, one entry per file, in inline (unified) display.
 * Hunk counts are recounted first (see recountHunks); a diff that still
 * doesn't parse throws, and one with no files throws `EmptyDiffError`.
 */
export async function drawDiff(source: string): Promise<DiffFile[]> {
  if (!themeRegistered) {
    // Token colours come from --diffs-token-* variables the page sets.
    registerCustomCSSVariableTheme(THEME, {}, true);
    themeRegistered = true;
  }
  let files: FileDiffMetadata[];
  try {
    files = parsePatchFiles(recountHunks(source), undefined, true).flatMap((patch) => patch.files);
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).replace(/^\w+: /, '');
    throw new Error(`the diff doesn't parse as a unified diff: ${message}`);
  }
  if (files.length === 0) {
    throw new EmptyDiffError('the diff has no files; write it as a unified diff: --- a/path, +++ b/path, then @@ hunks');
  }
  return Promise.all(
    files.map(async (fileDiff) => {
      const name = stripPrefix(fileDiff.name, 'b/');
      const prevName = fileDiff.prevName === undefined ? undefined : stripPrefix(fileDiff.prevName, 'a/');
      const renamed = prevName !== undefined && prevName !== name;
      // Only the prefixes differed: not a rename after all.
      const type = !renamed && fileDiff.type.startsWith('rename') ? 'change' : fileDiff.type;
      const file: FileDiffMetadata = {
        ...fileDiff,
        name,
        type,
        ...(renamed ? { prevName } : { prevName: undefined }),
        lang: codeLanguage(getFiletypeFromFileName(name)) ?? 'text',
      };
      const { prerenderedHTML } = await preloadFileDiff({
        fileDiff: file,
        options: { theme: THEME, diffStyle: 'unified', overflow: 'scroll', hunkSeparators: 'line-info-basic', expandUnchanged: false },
      });
      return { name, ...(renamed ? { prevName } : {}), type, html: prerenderedHTML };
    }),
  );
}

/** `b/src/app.ts` → `src/app.ts`: a plain unified diff keeps git's side prefixes in its names. */
function stripPrefix(path: string, prefix: string): string {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
