// What `shiki` resolves to in the code chunk (the build aliases it): Shiki's
// core with the JavaScript regex engine and only the code-block languages, so
// neither the oniguruma wasm nor the other ~200 grammars are bundled.
// @pierre/diffs imports its highlighter from `shiki`; the code chunk imports
// from here directly, so both share one set of grammars.

import {
  createHighlighterCore,
  type HighlighterCore,
  type LanguageRegistration,
  type RegexEngine,
  type ThemeInput,
} from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import c from 'shiki/langs/c.mjs';
import cpp from 'shiki/langs/cpp.mjs';
import csharp from 'shiki/langs/csharp.mjs';
import css from 'shiki/langs/css.mjs';
import dart from 'shiki/langs/dart.mjs';
import diff from 'shiki/langs/diff.mjs';
import docker from 'shiki/langs/docker.mjs';
import elixir from 'shiki/langs/elixir.mjs';
import go from 'shiki/langs/go.mjs';
import html from 'shiki/langs/html.mjs';
import ini from 'shiki/langs/ini.mjs';
import java from 'shiki/langs/java.mjs';
import javascript from 'shiki/langs/javascript.mjs';
import json from 'shiki/langs/json.mjs';
import jsonc from 'shiki/langs/jsonc.mjs';
import jsx from 'shiki/langs/jsx.mjs';
import kotlin from 'shiki/langs/kotlin.mjs';
import lua from 'shiki/langs/lua.mjs';
import markdown from 'shiki/langs/markdown.mjs';
import php from 'shiki/langs/php.mjs';
import python from 'shiki/langs/python.mjs';
import rust from 'shiki/langs/rust.mjs';
import shellscript from 'shiki/langs/shellscript.mjs';
import sql from 'shiki/langs/sql.mjs';
import swift from 'shiki/langs/swift.mjs';
import terraform from 'shiki/langs/terraform.mjs';
import toml from 'shiki/langs/toml.mjs';
import tsx from 'shiki/langs/tsx.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import xml from 'shiki/langs/xml.mjs';
import yaml from 'shiki/langs/yaml.mjs';
import type { CodeLanguage } from '../core/code-languages.ts';

export {
  codeToHtml,
  createCssVariablesTheme,
  getTokenStyleObject,
  stringifyTokenStyle,
} from 'shiki/core';
export { createJavaScriptRegexEngine };

/** Every code-block grammar (with the grammars it embeds), by its Shiki name. */
export const GRAMMARS: Record<CodeLanguage, LanguageRegistration[]> = {
  typescript,
  tsx,
  javascript,
  jsx,
  json,
  jsonc,
  yaml,
  toml,
  shellscript,
  python,
  go,
  rust,
  java,
  kotlin,
  swift,
  c,
  cpp,
  csharp,
  php,
  sql,
  html,
  css,
  markdown,
  diff,
  docker,
  xml,
  terraform,
  ini,
  lua,
  dart,
  elixir,
};

/** Shiki's `bundledLanguages`, cut down to the code-block set. */
export const bundledLanguages = Object.fromEntries(
  Object.entries(GRAMMARS).map(([name, grammar]) => [name, () => Promise.resolve({ default: grammar })]),
) as Record<CodeLanguage, () => Promise<{ default: LanguageRegistration[] }>>;

/**
 * Shiki's `createHighlighter`, on the core: languages and themes given by
 * name load from the set above; anything else is left out (plain text).
 */
export function createHighlighter(options: {
  themes?: ThemeInput[];
  langs?: (string | LanguageRegistration[])[];
  engine?: RegexEngine | Promise<RegexEngine>;
}): Promise<HighlighterCore> {
  const langs = (options.langs ?? []).flatMap((lang) =>
    typeof lang === 'string' ? (GRAMMARS[lang as CodeLanguage] ?? []) : lang,
  );
  return createHighlighterCore({
    themes: (options.themes ?? []).filter((theme) => typeof theme !== 'string'),
    langs,
    engine: options.engine ?? createJavaScriptRegexEngine(),
  });
}

/** The oniguruma engine is not bundled; @pierre/diffs only asks for it when told to. */
export function createOnigurumaEngine(): never {
  throw new Error('the oniguruma engine is not bundled; use the JavaScript regex engine');
}
