// esbuild plugins that trim dead weight from the bundle. Each rewrite checks
// that the code it replaces is still there, and fails the build when a
// dependency upgrade moves it, rather than shipping an untrimmed or broken
// bundle.
//
// Run by build.mjs through Node's type stripping: erasable TypeScript only.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plugin } from 'esbuild';

/** Replaces `find` in `source`, failing when it is not there exactly once. */
function replaceOnce(source: string, find: string | RegExp, replacement: string, what: string): string {
  const matches = typeof find === 'string' ? source.split(find).length - 1 : (source.match(new RegExp(find, 'g')) ?? []).length;
  if (matches !== 1) throw new Error(`trim: ${what} found ${matches} times, expected once`);
  return source.replace(find, () => replacement);
}

const js = (contents: string) => ({ contents, loader: 'js' as const });

/**
 * jsdom, bundled into the server for the draw check:
 * - its default stylesheet, read from a file next to its sources at load
 *   time, is inlined;
 * - its sync-XHR worker is replaced by a stub that throws if it is ever used
 *   (drawing does no XHR);
 * - undici, which jsdom needs only to fetch resources and open WebSockets
 *   (drawing does neither), is replaced by a stub that throws if it is ever
 *   used;
 * - the generated CSSStyleProperties wrapper, which spells out a getter and
 *   a setter for each of ~800 CSS properties in each of its spellings, gets
 *   the same accessors defined by a loop instead.
 */
export const jsdomTrim: Plugin = {
  name: 'jsdom-trim',
  setup(build) {
    build.onLoad({ filter: /jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/]css[\\/]helpers[\\/]computed-style\.js$/ }, (args) => {
      const css = readFileSync(join(dirname(args.path), '../../../browser/default-stylesheet.css'), 'utf8');
      return js(
        replaceOnce(
          readFileSync(args.path, 'utf8'),
          /fs\.readFileSync\(\s*path\.resolve\(__dirname, "\.\.\/\.\.\/\.\.\/browser\/default-stylesheet\.css"\),\s*\{ encoding: "utf-8" \}\s*\)/,
          JSON.stringify(css),
          "jsdom's default stylesheet read",
        ),
      );
    });

    build.onLoad({ filter: /jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/]xhr[\\/]XMLHttpRequest-impl\.js$/ }, (args) => {
      let source = readFileSync(args.path, 'utf8');
      source = replaceOnce(source, 'require.resolve("./xhr-sync-worker.js")', 'null', "jsdom's sync-XHR worker path");
      source = replaceOnce(
        source,
        'syncWorker = new Worker(syncWorkerFile);',
        'throw new Error("synchronous XMLHttpRequest is not supported: the visual-grilling bundle leaves out jsdom\'s sync-XHR worker");',
        "jsdom's sync-XHR worker start",
      );
      return js(source);
    });

    build.onResolve({ filter: /^undici$/ }, (args) =>
      /[\\/]jsdom[\\/]/.test(args.importer) ? { path: 'undici', namespace: 'undici-stub' } : undefined,
    );
    build.onLoad({ filter: /.*/, namespace: 'undici-stub' }, () => js(UNDICI_STUB));

    build.onLoad({ filter: /jsdom[\\/]lib[\\/]generated[\\/]idl[\\/]CSSStyleProperties\.js$/ }, (args) =>
      js(compactStyleProperties(readFileSync(args.path, 'utf8'))),
    );
  },
};

const UNDICI_STUB = `
const { EventEmitter } = require("node:events");
const refusal = () => new Error("network access is not supported: the visual-grilling bundle leaves out undici");
function refuse() {
  throw refusal();
}
class Dispatcher extends EventEmitter {
  dispatch() { refuse(); }
  request() { return Promise.reject(refusal()); }
  close() { return Promise.resolve(); }
  destroy() { return Promise.resolve(); }
}
class DecoratorHandler {
  constructor(handler) { this.handler = handler; }
}
class WebSocket {
  constructor() { refuse(); }
}
const globalDispatcher = new Dispatcher();
module.exports = { Dispatcher, DecoratorHandler, WebSocket, getGlobalDispatcher: () => globalDispatcher };
`;

const PRE = 'ceReactionsPreSteps_jsdom_living_helpers_custom_elements';
const POST = 'ceReactionsPostSteps_jsdom_living_helpers_custom_elements';

/** One property's accessor pair exactly as jsdom's generator writes it. */
function accessorPair(key: string, name: string): string {
  return `

    get ${key}() {
      const $impl = utils.implForWrapperWithInterface(this ?? globalObject, $interfaceDescriptor);
      if ($impl === null) {
        throw new globalObject.TypeError(
          "'get ${name}' called on an object that is not a valid instance of CSSStyleProperties."
        );
      }

      ${PRE}(globalObject);
      try {
        return utils.tryWrapperForImpl($impl["${name}"]);
      } finally {
        ${POST}(globalObject);
      }
    }

    set ${key}(V) {
      const $impl = utils.implForWrapperWithInterface(this ?? globalObject, $interfaceDescriptor);
      if ($impl === null) {
        throw new globalObject.TypeError(
          "'set ${name}' called on an object that is not a valid instance of CSSStyleProperties."
        );
      }

      V = conversions["DOMString"](V, {
        context: "Failed to set the '${name}' property on 'CSSStyleProperties': The provided value",
        globals: globalObject,
        treatNullAsEmptyString: true
      });

      ${PRE}(globalObject);
      try {
        $impl["${name}"] = V;
      } finally {
        ${POST}(globalObject);
      }
    }`;
}

const squash = (text: string): string => text.replace(/\s+/g, '');

/** The same accessors, defined by a loop over the names after the class. */
function accessorLoop(names: string[]): string {
  return `
  for (const name of ${JSON.stringify(names)}) {
    Object.defineProperty(CSSStyleProperties.prototype, name, {
      configurable: true,
      enumerable: false,
      get() {
        const $impl = utils.implForWrapperWithInterface(this ?? globalObject, $interfaceDescriptor);
        if ($impl === null) {
          throw new globalObject.TypeError(
            "'get " + name + "' called on an object that is not a valid instance of CSSStyleProperties."
          );
        }
        ${PRE}(globalObject);
        try {
          return utils.tryWrapperForImpl($impl[name]);
        } finally {
          ${POST}(globalObject);
        }
      },
      set(V) {
        const $impl = utils.implForWrapperWithInterface(this ?? globalObject, $interfaceDescriptor);
        if ($impl === null) {
          throw new globalObject.TypeError(
            "'set " + name + "' called on an object that is not a valid instance of CSSStyleProperties."
          );
        }
        V = conversions["DOMString"](V, {
          context: "Failed to set the '" + name + "' property on 'CSSStyleProperties': The provided value",
          globals: globalObject,
          treatNullAsEmptyString: true
        });
        ${PRE}(globalObject);
        try {
          $impl[name] = V;
        } finally {
          ${POST}(globalObject);
        }
      }
    });
  }`;
}

/**
 * Rewrites jsdom's generated CSSStyleProperties.js so the class body keeps
 * only its constructor and the accessors come from `accessorLoop`. Every
 * accessor pair must match `accessorPair` up to whitespace (the generator's
 * formatter wraps long lines), so a generator change fails the build instead
 * of being dropped.
 */
export function compactStyleProperties(source: string): string {
  const start = '    constructor() {\n      throw new globalObject.TypeError("Illegal constructor");\n    }';
  const end = '\n  }\n  Object.defineProperties(CSSStyleProperties.prototype, {';
  const from = source.indexOf(start);
  const to = source.indexOf(end);
  if (from < 0 || to < 0 || source.indexOf(start, from + 1) >= 0 || source.indexOf(end, to + 1) >= 0) {
    throw new Error('trim: CSSStyleProperties class body not found');
  }
  const bodyStart = from + start.length;
  const names: string[] = [];
  const header = /\n\n    get ("[^"\n]+"|[A-Za-z_$][\w$]*)\(\) \{/y;
  let at = bodyStart;
  while (at < to) {
    header.lastIndex = at;
    const match = header.exec(source);
    if (!match) throw new Error(`trim: unexpected CSSStyleProperties member at offset ${at}`);
    const key = match[1]!;
    const name = key.startsWith('"') ? (JSON.parse(key) as string) : key;
    const next = source.indexOf('\n\n    get ', at + 1);
    const pairEnd = next < 0 || next > to ? to : next;
    if (squash(source.slice(at, pairEnd)) !== squash(accessorPair(key, name))) {
      throw new Error(`trim: CSSStyleProperties accessor "${name}" is not in the expected shape`);
    }
    names.push(name);
    at = pairEnd;
  }
  if (at !== to || names.length === 0) throw new Error('trim: CSSStyleProperties accessors did not end at the class end');
  return source.slice(0, bodyStart) + '\n  }' + accessorLoop(names) + source.slice(to + '\n  }'.length);
}

/**
 * Keeps the code chunk to Shiki's core. `shiki` (which @pierre/diffs imports)
 * becomes our cut-down stand-in (src/chunks/shiki.ts) with the JavaScript
 * regex engine and only the code-block grammars, so the oniguruma engine and
 * wasm are left out; and @pierre/theming's collection of every Shiki and
 * Pierre theme is stubbed, since the chunk draws with its own CSS-variables
 * theme.
 */
export function shikiCore(standIn: string): Plugin {
  return {
    name: 'shiki-core',
    setup(build) {
      build.onResolve({ filter: /^shiki(\/wasm|\/engine\/oniguruma)?$/ }, () => ({ path: standIn }));
      build.onLoad({ filter: /@pierre[\\/]theming[\\/]dist[\\/]themes\.js$/ }, () =>
        js(
          [
            'export { createTheme } from "./modules/createTheme.js";',
            'const none = { getThemes: () => [], getTheme: () => undefined };',
            'export const pierreThemes = none, shikiThemes = none, themes = none;',
          ].join('\n'),
        ),
      );
    },
  };
}
