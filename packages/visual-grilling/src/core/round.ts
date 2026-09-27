// The round file: the Markdown an agent writes and hands to `present`.
//
// Layout: an optional `# Round title`, an optional `design-tree` fence, then
// questions in grilling's form. Each question's parts come in a fixed order:
// prose → illustrations (fences) → options (the list right before ➡️, with
// html mockups indented under them) → the ➡️ recommendation.
//
// The parser is strict about structure and tolerant of small punctuation
// differences. It collects every error rather than stopping at the first, so
// the agent can fix a round in one pass.

import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { toString } from 'mdast-util-to-string';
import { gfm } from 'micromark-extension-gfm';
import { codeLanguage } from './code-languages.ts';
import { parseTable, type TableData } from './table.ts';
import type { Code, List, ListItem, Nodes, Paragraph, RootContent } from 'mdast';

// ------------------------------------------------------------------- model

export interface Mockup {
  /** The mockup's HTML, dedented out of its option. */
  source: string;
  /** False when the fence says `tailwind=false`. */
  tailwind: boolean;
  line: number;
}

export interface Option {
  letter: string;
  /** The option's label as written (Markdown source), for the page. */
  label: string;
  /** The same label as plain text, for what the agent reads back. */
  text: string;
  mockup?: Mockup;
}

export interface Recommendation {
  /** The recommendation's Markdown source, without the ➡️ marker. */
  source: string;
  /** The same text as plain text, for one-line summaries. */
  text: string;
  /** The option the recommendation opens with (`**B** …`), if any. */
  option?: string;
}

export type IllustrationKind = 'mermaid' | 'dot' | 'vega-lite' | 'table' | 'diff' | 'html' | 'code';

export interface CodeSettings {
  /** The language to highlight: the fence's language, or `lang=` on a `code` fence. */
  lang: string;
  file?: string;
  startLine?: number;
  /** Inclusive line ranges, in the file's own numbers when `startLine` is set. */
  highlight?: [number, number][];
}

export interface Illustration {
  id: string;
  kind: IllustrationKind;
  /** The fence's language as written. */
  fence: string;
  title?: string;
  source: string;
  /** 1-based line of the opening fence. */
  line: number;
  /** For `html`: false when the fence says `tailwind=false`. */
  tailwind?: boolean;
  /** For code fences. */
  code?: CodeSettings;
  /** For `table`: its one table, as cells. */
  table?: TableData;
}

export interface Question {
  number: number;
  /** Plain text. */
  title: string;
  /** Markdown source of the prose (header remainder plus following blocks). */
  prose: string;
  illustrations: Illustration[];
  options: Option[];
  recommendation: Recommendation;
  /** 1-based line of the question header in the round file. */
  line: number;
}

export interface DesignTreeNode {
  /** The branch as written, without the checkbox or the gist (plain text). */
  label: string;
  settled: boolean;
  /** For a settled branch, the text after `: `. */
  gist?: string;
  /** Questions the branch names with a bare `Q<n>`: of this round or an earlier one of the session. */
  questions: number[];
  children: DesignTreeNode[];
}

export interface Round {
  title?: string;
  designTree?: DesignTreeNode[];
  questions: Question[];
}

export interface RoundError {
  line: number;
  question?: number;
  /** The illustration (or an option's mockup) the error is about. */
  illustration?: { id?: string; fence: string; option?: string };
  message: string;
}

/**
 * Something `present` tells the agent without rejecting the round, in the same
 * shape and place as an error (an unknown code language, say).
 */
export type RoundNote = RoundError;

export type ParseResult = { ok: true; round: Round; notes: RoundNote[] } | { ok: false; errors: RoundError[] };

// ----------------------------------------------------------------- grammar

const TITLE_LIMIT = 60;
const HEADER = /^❓️?\s*\*\*Q(\d+)\*\*\s*[-–—]\s*\*\*(.+?)\*\*\s*:?\s*([\s\S]*)$/;
/** Something that was meant as a question header but doesn't parse as one. */
const HEADER_LIKE = /^(?:❓|\*\*Q\d+\*\*\s*[-–—])/;
const RECOMMENDATION = /^➡️?\s*/;
const OPTION = /^\*\*([A-Z])\*\*\s*[-–—]\s*([\s\S]*)$/;
const POINTER = /^\*\*([A-Z])\*\*/;
const FENCE_START = /^\s*(?:`{3,}|~{3,})/;
const ID = /^[a-z0-9][a-z0-9-]*$/;
const KEY = /^[a-z][a-zA-Z0-9]*$/;
const DESIGN_TREE = 'design-tree';
const ORDER = 'the order is prose → illustrations → options → ➡️';
const NO_HEADINGS = "headings aren't allowed in a question; use **bold** text";

const FENCE_KINDS: Record<string, IllustrationKind> = {
  mermaid: 'mermaid',
  dot: 'dot',
  'vega-lite': 'vega-lite',
  table: 'table',
  diff: 'diff',
  html: 'html',
  code: 'code',
};

const CODE_KEYS = ['id', 'title', 'file', 'startLine', 'highlight'];
const ALLOWED_KEYS: Record<IllustrationKind, string[]> = {
  mermaid: ['id', 'title'],
  dot: ['id', 'title'],
  'vega-lite': ['id', 'title'],
  table: ['id', 'title'],
  diff: ['id', 'title'],
  html: ['id', 'title', 'tailwind'],
  code: CODE_KEYS,
};

// ------------------------------------------------------------------ parser

/**
 * Parses one round file. `earlier` holds the question numbers of the grilling
 * session's earlier rounds, which the design tree may name too: numbers carry
 * on across rounds. Only the server knows them; the parse is otherwise pure.
 */
export function parseRound(source: string, earlier: ReadonlySet<number> = new Set()): ParseResult {
  return new RoundParser(source, earlier).parse();
}

type Part = 'prose' | 'illustration' | 'options';
const PART_RANK: Record<Part, number> = { prose: 0, illustration: 1, options: 2 };
const PART_NAME: Record<Part, string> = { prose: 'prose', illustration: 'an illustration', options: 'the options' };

class RoundParser {
  private readonly errors: RoundError[] = [];
  private readonly notes: RoundNote[] = [];
  /** Illustration id → the question it first appeared in. */
  private readonly ids = new Map<string, number>();

  constructor(
    private readonly source: string,
    private readonly earlier: ReadonlySet<number>,
  ) {}

  parse(): ParseResult {
    const tree = parseMarkdown(this.source);
    const round: Round = { questions: [] };

    // Split top-level nodes into a preamble and one group per question header.
    const preamble: RootContent[] = [];
    const groups: { header: Paragraph; match: RegExpExecArray; nodes: RootContent[] }[] = [];
    for (const node of tree.children) {
      const match = node.type === 'paragraph' ? HEADER.exec(this.slice(node)) : null;
      if (node.type === 'paragraph' && match) {
        groups.push({ header: node, match, nodes: [] });
      } else if (node.type === 'thematicBreak') {
        continue;
      } else if (groups.length > 0) {
        groups.at(-1)!.nodes.push(node);
      } else {
        preamble.push(node);
      }
    }

    let treeFence: Code | undefined;
    let strayQuestion = false;
    preamble.forEach((node, index) => {
      // After a header that failed to parse, the rest is that question's body.
      if (strayQuestion || this.malformedHeader(node)) {
        strayQuestion = true;
        return;
      }
      if (node.type === 'heading' && node.depth === 1 && index === 0) {
        round.title = this.roundTitle(node.position!.start.line, toString(node).trim());
      } else if (node.type === 'heading' && node.depth === 1) {
        this.error(node, 'the # round title must be the first line of the round file');
      } else if (this.isFence(node) && node.lang === DESIGN_TREE && !treeFence) {
        treeFence = node;
      } else {
        this.error(node, 'nothing but a # title and a design-tree fence may come before Q1');
      }
    });

    if (groups.length === 0 && this.errors.length === 0) {
      this.errors.push({ line: 1, message: 'no question found; start one with ❓ **Q1** - **title**: body' });
    }

    const seen = new Map<number, number>();
    let previous: number | undefined;
    for (const { header, match, nodes } of groups) {
      const number = Number(match[1]);
      const line = this.lineOf(header);
      const first = seen.get(number);
      if (first !== undefined) {
        this.errors.push({ line, question: number, message: `duplicate Q${number}; the first is at line ${first}` });
      } else if (previous !== undefined && number <= previous) {
        this.errors.push({
          line,
          question: number,
          message: `question numbers must increase; Q${number} follows Q${previous}`,
        });
      }
      if (first === undefined) seen.set(number, line);
      previous = number;

      const question = this.question(number, line, match, nodes);
      if (question) round.questions.push(question);
    }

    if (treeFence) {
      const known = new Set([...this.earlier, ...groups.map(({ match }) => Number(match[1]))]);
      const designTree = this.designTree(treeFence, known);
      if (designTree) round.designTree = designTree;
    }

    if (this.errors.length > 0) {
      const errors = this.errors.map((error, index) => ({ error, index }));
      errors.sort((a, b) => a.error.line - b.error.line || a.index - b.index);
      return { ok: false, errors: errors.map(({ error }) => error) };
    }
    return { ok: true, round, notes: this.notes };
  }

  // ------------------------------------------------------------- question

  private question(
    number: number,
    line: number,
    match: RegExpExecArray,
    nodes: RootContent[],
  ): Question | undefined {
    const errorCount = this.errors.length;
    const recIndex = nodes.findIndex(
      (node) => node.type === 'paragraph' && RECOMMENDATION.test(this.slice(node)),
    );
    const body = recIndex === -1 ? nodes : nodes.slice(0, recIndex);
    const recNodes = recIndex === -1 ? [] : nodes.slice(recIndex);

    // Classify the body. An html fence right after a list of options is a
    // mockup that lost its indent: report it once and read on as if it were
    // indented, so one mistake doesn't cascade.
    const parts: { node: RootContent; part: Part }[] = [];
    for (const node of body) {
      if (this.malformedHeader(node, number)) continue;
      if (node.type === 'heading') {
        this.error(node, NO_HEADINGS, number);
        continue;
      }
      if (this.isFence(node)) {
        const before = parts.at(-1);
        if (node.lang === 'html' && before?.part === 'options') {
          const letter = this.optionItems(before.node as List).at(-1)?.letter;
          this.error(
            node,
            `an html fence after an option is that option's mockup; indent it under option ${letter ?? 'its option'}`,
            number,
          );
          continue;
        }
        parts.push({ node, part: 'illustration' });
        continue;
      }
      if (node.type === 'list' && this.isOptionList(node)) {
        const before = parts.at(-1);
        if (before?.part === 'options') {
          // Two option lists split by an unindented mockup: one list.
          const merged: List = { ...(before.node as List), children: [...(before.node as List).children, ...node.children] };
          before.node = merged;
          continue;
        }
        parts.push({ node, part: 'options' });
        continue;
      }
      parts.push({ node, part: 'prose' });
    }

    // Only the list right before ➡️ counts as options. An earlier lettered
    // list is prose, unless an illustration follows it: then the agent put
    // the options too early.
    parts.forEach((entry, index) => {
      if (entry.part !== 'options' || index === parts.length - 1) return;
      entry.part = parts[index + 1]!.part === 'illustration' ? 'options' : 'prose';
    });
    for (const { node, part } of parts) {
      if (part === 'prose') this.nested(node, number);
    }
    const swallowed = this.swallowedRecommendation(
      parts.filter(({ part }) => part !== 'illustration').map(({ node }) => node),
      number,
    );

    let highest: Part = 'prose';
    for (const { node, part } of parts) {
      if (PART_RANK[part] < PART_RANK[highest]) {
        this.error(node, `${PART_NAME[part]} after ${PART_NAME[highest]}; ${ORDER}`, number);
      } else {
        highest = part;
      }
    }

    const illustrations: Illustration[] = [];
    for (const { node, part } of parts) {
      if (part !== 'illustration') continue;
      const illustration = this.illustration(node as Code, number);
      if (illustration) illustrations.push(illustration);
    }

    const optionEntry = parts.at(-1)?.part === 'options' ? parts.at(-1)! : undefined;
    const options = optionEntry ? this.options(optionEntry.node as List, number) : [];
    const prose = [
      match[3]!.trim(),
      ...parts.filter(({ part }) => part === 'prose').map(({ node }) => this.slice(node)),
    ]
      .filter(Boolean)
      .join('\n\n');

    if (recIndex === -1) {
      if (!swallowed) this.errors.push({ line, question: number, message: 'missing ➡️ recommendation' });
      return undefined;
    }
    const recommendation = this.recommendation(recNodes, options, number);

    if (this.errors.length > errorCount || !recommendation) return undefined;
    return {
      number,
      title: plainText(`**${match[2]!}**`).replace(/:$/, '').trim(),
      prose,
      illustrations,
      options,
      recommendation,
      line,
    };
  }

  private recommendation(nodes: RootContent[], options: Option[], number: number): Recommendation | undefined {
    const [first] = nodes;
    this.nested(first!, number);
    for (const node of nodes.slice(1)) {
      if (this.isFence(node)) {
        this.error(node, `an illustration after the ➡️ recommendation; ${ORDER}`, number);
      } else if (node.type === 'heading') {
        this.error(node, NO_HEADINGS, number);
      } else if (node.type === 'paragraph' && RECOMMENDATION.test(this.slice(node))) {
        this.error(node, 'a question takes one ➡️ recommendation', number);
      } else if (node.type === 'list' && this.isOptionList(node)) {
        this.error(node, `the options after the ➡️ recommendation; ${ORDER}`, number);
      } else if (!this.malformedHeader(node, number)) {
        this.nested(node, number);
      }
    }

    const source = this.source
      .slice(first!.position!.start.offset!, nodes.at(-1)!.position!.end.offset!)
      .replace(RECOMMENDATION, '')
      .trim();
    if (!source) {
      this.error(first!, 'the ➡️ recommendation is empty', number);
      return undefined;
    }
    const pointer = POINTER.exec(source)?.[1];
    if (pointer && !options.some((option) => option.letter === pointer)) {
      this.error(first!, `the recommendation points at option ${pointer}, which does not exist`, number);
    }
    return { source, text: plainText(source), ...(pointer ? { option: pointer } : {}) };
  }

  // -------------------------------------------------------------- options

  private isOptionList(list: List): boolean {
    const first = list.children[0]?.children[0];
    return first?.type === 'paragraph' && OPTION.test(this.slice(first));
  }

  private optionItems(list: List): { item: ListItem; letter: string | undefined; label: string }[] {
    return list.children.map((item) => {
      const first = item.children[0];
      const match = first?.type === 'paragraph' ? OPTION.exec(this.slice(first)) : null;
      return { item, letter: match?.[1], label: match?.[2]?.trim() ?? '' };
    });
  }

  private options(list: List, number: number): Option[] {
    const options: Option[] = [];
    let expected = 'A';
    for (const { item, letter, label } of this.optionItems(list)) {
      if (!letter) {
        this.error(item, 'every item of the options list must be written - **A** - label', number);
        continue;
      }
      if (letter !== expected) {
        this.error(item, `option letters run A, B, C… with no gaps; expected ${expected}, found ${letter}`, number);
      }
      expected = String.fromCharCode(letter.charCodeAt(0) + 1);

      const option: Option = { letter, label, text: plainText(label) };
      for (const child of item.children.slice(1)) {
        if (this.isFence(child) && child.lang === 'html' && !option.mockup) {
          const mockup = this.mockup(child, letter, number);
          if (mockup) option.mockup = mockup;
        } else if (this.isFence(child) && child.lang === 'html') {
          this.error(child, `option ${letter} already has a mockup; an option takes one`, number);
        } else if (this.isFence(child)) {
          this.error(child, `only an html mockup may be indented under an option (option ${letter})`, number);
        } else {
          this.error(child, `option ${letter} is one line; only an html mockup may be indented under it`, number);
        }
      }
      options.push(option);
    }
    return options;
  }

  private mockup(node: Code, letter: string, number: number): Mockup | undefined {
    const subject = { fence: 'html', option: letter };
    const report = (message: string) =>
      this.errors.push({ line: this.lineOf(node), question: number, illustration: subject, message });
    const { attributes, problems } = parseAttributes(this.info(node).meta);
    problems.forEach(report);
    let tailwind = true;
    for (const [key, value] of attributes) {
      if (key === 'id') report('a mockup takes no id; it belongs to its option');
      else if (key === 'tailwind') {
        if (value === 'false') tailwind = false;
        else report(`tailwind takes only false (got "${value}")`);
      } else report(`unknown key "${key}"; a mockup takes only tailwind`);
    }
    this.duplicateAnchors(node, number, subject);
    return { source: node.value, tailwind, line: this.lineOf(node) };
  }

  // -------------------------------------------------------- illustrations

  private illustration(node: Code, number: number): Illustration | undefined {
    const line = this.lineOf(node);
    const { fence, meta } = this.info(node);
    const errorCount = this.errors.length;
    const { attributes, problems } = parseAttributes(meta);
    const id = attributes.get('id');
    const shownFence = fence && !fence.includes('=') ? fence : 'no language';
    const subject = { ...(id !== undefined && ID.test(id) ? { id } : {}), fence: shownFence };
    const report = (message: string) =>
      this.errors.push({ line, question: number, illustration: subject, message });

    if (!fence) {
      report('a fence starts with its language, like ```mermaid id=flow');
      return undefined;
    }
    if (fence.includes('=')) {
      report(`a fence starts with its language, like \`\`\`mermaid ${fence}`);
      return undefined;
    }
    if (fence === DESIGN_TREE) {
      report('the design-tree fence goes before Q1');
      return undefined;
    }
    problems.forEach(report);

    const kind: IllustrationKind = FENCE_KINDS[fence] ?? 'code';
    const allowed = fence === 'code' ? [...CODE_KEYS, 'lang'] : ALLOWED_KEYS[kind];
    for (const key of attributes.keys()) {
      if (!allowed.includes(key)) report(`unknown key "${key}"; ${fence} takes ${allowed.join(', ')}`);
    }

    if (id === undefined) {
      report('missing id; add id=<name> after the language');
    } else if (!ID.test(id)) {
      report(`id "${id}" must match [a-z0-9][a-z0-9-]*`);
    } else if (this.ids.has(id)) {
      report(`id "${id}" is already used in Q${this.ids.get(id)}; ids are unique in a round`);
    } else {
      this.ids.set(id, number);
    }

    const title = attributes.get('title');
    if (title !== undefined && !title.trim()) report('title is empty');

    const illustration: Illustration = {
      id: id ?? '',
      kind,
      fence,
      ...(title ? { title } : {}),
      source: node.value,
      line,
    };

    if (kind === 'html') {
      const tailwind = attributes.get('tailwind');
      if (tailwind !== undefined && tailwind !== 'false') report(`tailwind takes only false (got "${tailwind}")`);
      illustration.tailwind = tailwind !== 'false';
      this.duplicateAnchors(node, number, subject);
    }

    if (kind === 'code') {
      illustration.code = this.codeSettings(node, fence, attributes, report);
      const { lang } = illustration.code;
      if (codeLanguage(lang) === undefined && this.errors.length === errorCount) {
        this.notes.push({ line, question: number, illustration: subject, message: `"${lang}" is not a highlighted language, so it shows as plain text` });
      }
    }

    if (kind === 'table') {
      const parsed = parseTable(node.value);
      if (parsed.ok) illustration.table = parsed.table;
      else {
        for (const problem of parsed.problems) {
          this.errors.push({ line: line + problem.line, question: number, illustration: subject, message: problem.message });
        }
      }
    }

    return this.errors.length > errorCount ? undefined : illustration;
  }

  private codeSettings(
    node: Code,
    fence: string,
    attributes: Map<string, string>,
    report: (message: string) => void,
  ): CodeSettings {
    let lang = fence;
    if (fence === 'code') {
      const given = attributes.get('lang');
      if (given === undefined) report('a code fence needs lang=<language>');
      else if (!/^[A-Za-z0-9][\w+#.-]*$/.test(given)) report(`lang "${given}" is not a language name`);
      lang = given ?? 'text';
    }
    const settings: CodeSettings = { lang };

    const file = attributes.get('file');
    if (file !== undefined) {
      if (file.trim()) settings.file = file;
      else report('file is empty');
    }

    const startLine = attributes.get('startLine');
    if (startLine !== undefined) {
      if (/^[1-9]\d*$/.test(startLine)) settings.startLine = Number(startLine);
      else report(`startLine takes a positive whole number (got "${startLine}")`);
    }

    const highlight = attributes.get('highlight');
    if (highlight !== undefined) {
      const ranges = parseHighlight(highlight);
      if (!ranges) {
        report(`highlight takes lines and ranges like 3,5-7 (got "${highlight}")`);
      } else {
        const first = settings.startLine ?? 1;
        const last = first + Math.max(1, node.value.split('\n').length) - 1;
        const outside = ranges.find(([from, to]) => from < first || to > last);
        if (outside) {
          const shown = outside[0] === outside[1] ? `line ${outside[0]}` : `lines ${outside[0]}-${outside[1]}`;
          report(`highlight ${shown} is outside the code, which runs from line ${first} to ${last}`);
        } else {
          settings.highlight = ranges;
        }
      }
    }
    return settings;
  }

  /**
   * Every `data-anchor` name must be unique within one html illustration or
   * mockup. Only attributes count: a name in a script, a style, a comment or
   * a selector (`[data-anchor="x"]`) is not an element.
   */
  private duplicateAnchors(node: Code, number: number, subject: RoundError['illustration']): void {
    const seen = new Set<string>();
    const contentLine = this.lineOf(node) + 1;
    // Blank out what isn't markup, keeping line breaks so lines still count.
    const markup = node.value.replace(
      /<!--[\s\S]*?(?:-->|$)|<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,
      (skipped) => skipped.replace(/[^\n]/g, ' '),
    );
    markup.split('\n').forEach((text, index) => {
      for (const match of text.matchAll(/(?<=\s)data-anchor\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
        const name = match[1] ?? match[2] ?? match[3] ?? '';
        if (seen.has(name)) {
          this.errors.push({
            line: contentLine + index,
            question: number,
            ...(subject ? { illustration: subject } : {}),
            message: `duplicate data-anchor "${name}"; each name must be unique in one illustration`,
          });
        }
        seen.add(name);
      }
    });
  }

  // ---------------------------------------------------------- design tree

  private designTree(node: Code, questions: Set<number>): DesignTreeNode[] | undefined {
    const inner = parseMarkdown(node.value);
    const offset = this.lineOf(node);
    const errorCount = this.errors.length;
    const report = (line: number, message: string) =>
      this.errors.push({ line: offset + line, message: `design tree: ${message}` });

    const [list, ...extra] = inner.children;
    if (!list || list.type !== 'list') {
      report(list ? list.position!.start.line : 1, 'the fence holds one task list, like - [x] Storage: session folder');
      return undefined;
    }
    for (const stray of extra) report(stray.position!.start.line, 'the fence holds one task list and nothing else');

    const items = (branches: List): DesignTreeNode[] =>
      branches.children.map((item) => {
        const line = item.position!.start.line;
        const [first, ...rest] = item.children;
        const text = first?.type === 'paragraph' ? toString(first).replace(/\s+/g, ' ').trim() : '';
        if (item.checked === null || item.checked === undefined) {
          report(line, `each branch starts with [ ] (open) or [x] (settled); found "${text}"`);
        }
        if (!text) report(line, 'a branch needs a name');
        const settled = item.checked === true;
        const split = settled ? /^(.*?):\s+(.*)$/.exec(text) : null;
        const label = split ? split[1]!.trim() : text;
        const gist = split?.[2]?.trim();

        const named: number[] = [];
        for (const match of text.matchAll(/\bQ(\d+)\b/g)) {
          const n = Number(match[1]);
          if (!questions.has(n)) report(line, `Q${n} is not in this round or an earlier one`);
          else if (!named.includes(n)) named.push(n);
        }

        const children: DesignTreeNode[] = [];
        for (const child of rest) {
          if (child.type === 'list') children.push(...items(child));
          else report(child.position!.start.line, 'a branch is one line; nest sub-branches as a list');
        }
        return { label, settled, ...(gist ? { gist } : {}), questions: named, children };
      });

    const tree = items(list);
    return this.errors.length > errorCount ? undefined : tree;
  }

  // ------------------------------------------------------------- helpers

  /** A title line: at most 60 characters. */
  private roundTitle(line: number, title: string): string | undefined {
    const length = [...title].length;
    if (!title) this.errors.push({ line, message: 'the # round title is empty' });
    else if (length > TITLE_LIMIT) {
      this.errors.push({ line, message: `the round title is ${length} characters; keep it to ${TITLE_LIMIT}` });
    }
    return title || undefined;
  }

  /** Reports a paragraph that looks like a question header but doesn't parse as one. */
  private malformedHeader(node: RootContent, question?: number): boolean {
    if (node.type !== 'paragraph' || !HEADER_LIKE.test(this.slice(node))) return false;
    this.error(node, 'malformed question header; write ❓ **Q1** - **title**: body', question);
    return true;
  }

  /**
   * A fence's language and attributes, read from the raw opening line:
   * mdast applies CommonMark backslash escapes to the info string, which
   * would eat the `\"` and `\\` escapes of quoted values.
   */
  private info(node: Code): { fence: string; meta: string } {
    const line = this.slice(node).split('\n', 1)[0]!.replace(FENCE_START, '').trim();
    const fence = /^\S*/.exec(line)![0];
    return { fence, meta: line.slice(fence.length).trim() };
  }

  /** A fenced code block (an indented code block is not a fence). */
  private isFence(node: Nodes): node is Code {
    return node.type === 'code' && FENCE_START.test(this.slice(node));
  }

  /**
   * Headings, fences and question headers may not hide inside prose: in a
   * list item or a quote they would slip past the question's grammar.
   */
  private nested(node: Nodes, question: number): void {
    if (!('children' in node)) return;
    for (const child of node.children) {
      if (child.type === 'heading') this.error(child, NO_HEADINGS, question);
      else if (this.isFence(child)) {
        this.error(child, 'a fence inside a list or quote; put illustrations at the top level of the question', question);
      } else if (child.type === 'paragraph' && HEADER.test(this.slice(child))) {
        this.error(child, 'a question header must be its own paragraph, outside any list or quote', question);
      } else this.nested(child, question);
    }
  }

  /** A ➡️ line with no blank line before it gets folded into the paragraph or option above. */
  private swallowedRecommendation(nodes: Nodes[], question: number): boolean {
    let found = false;
    for (const node of nodes) {
      this.slice(node)
        .split('\n')
        .forEach((text, index) => {
          if (index === 0 || !/^[\s>]*➡/.test(text)) return;
          found = true;
          this.errors.push({
            line: this.lineOf(node) + index,
            question,
            message: 'put a blank line before the ➡️ recommendation so it starts its own paragraph',
          });
        });
    }
    return found;
  }

  private error(node: Nodes, message: string, question?: number): void {
    this.errors.push({ line: this.lineOf(node), ...(question === undefined ? {} : { question }), message });
  }

  private slice(node: Nodes): string {
    return this.source.slice(node.position!.start.offset!, node.position!.end.offset!);
  }

  private lineOf(node: Nodes): number {
    return node.position!.start.line;
  }
}

// ------------------------------------------------------------- attributes

/**
 * Parses a fence's `key=value` attributes. A value is bare or double-quoted,
 * with `\"` and `\\` escapes inside quotes.
 */
function parseAttributes(meta: string): { attributes: Map<string, string>; problems: string[] } {
  const attributes = new Map<string, string>();
  const problems: string[] = [];
  let i = 0;
  while (i < meta.length) {
    if (/\s/.test(meta[i]!)) {
      i += 1;
      continue;
    }
    const keyMatch = /^[^\s=]*/.exec(meta.slice(i))![0];
    i += keyMatch.length;
    if (meta[i] !== '=') {
      const word = keyMatch + (/^\S*/.exec(meta.slice(i))?.[0] ?? '');
      i += word.length - keyMatch.length;
      problems.push(`expected key=value, found "${word}"`);
      continue;
    }
    i += 1;
    let value = '';
    if (meta[i] === '"') {
      i += 1;
      let closed = false;
      while (i < meta.length) {
        const char = meta[i]!;
        if (char === '\\' && (meta[i + 1] === '"' || meta[i + 1] === '\\')) {
          value += meta[i + 1];
          i += 2;
        } else if (char === '"') {
          closed = true;
          i += 1;
          break;
        } else {
          value += char;
          i += 1;
        }
      }
      if (!closed) {
        problems.push(`the value of ${keyMatch || 'an attribute'} has no closing quote`);
        continue;
      }
      if (i < meta.length && !/\s/.test(meta[i]!)) {
        problems.push(`put a space after the quoted value of ${keyMatch}`);
        i += /^\S*/.exec(meta.slice(i))![0].length;
      }
    } else {
      value = /^\S*/.exec(meta.slice(i))![0];
      i += value.length;
      if (value.includes('"')) {
        problems.push(`quote the whole value of ${keyMatch}, like ${keyMatch}="…"`);
        continue;
      }
    }

    if (!keyMatch) {
      problems.push(`expected key=value, found "=${value}"`);
    } else if (!KEY.test(keyMatch)) {
      problems.push(`key "${keyMatch}" must be lower camelCase, like startLine`);
    } else if (attributes.has(keyMatch)) {
      problems.push(`${keyMatch} is given twice`);
    } else {
      attributes.set(keyMatch, value);
    }
  }
  return { attributes, problems };
}

/** `3,5-7` → [[3,3],[5,7]]; undefined when malformed. */
function parseHighlight(value: string): [number, number][] | undefined {
  const ranges: [number, number][] = [];
  for (const part of value.split(',')) {
    const match = /^\s*([1-9]\d*)(?:\s*-\s*([1-9]\d*))?\s*$/.exec(part);
    if (!match) return undefined;
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    if (to < from) return undefined;
    ranges.push([from, to]);
  }
  return ranges;
}

// ----------------------------------------------------------------- shared

function parseMarkdown(source: string) {
  return fromMarkdown(source, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
}

function plainText(markdown: string): string {
  return parseMarkdown(markdown)
    .children
    .map((node) => toString(node))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A note in the same form, marked `note:`; `present` prints it to stderr and still shows the round. */
export function formatRoundNote(file: string, note: RoundNote): string {
  return formatRoundError(file, { ...note, message: `note: ${note.message}` });
}

/** `round.md:LINE · Qn · illustration "id" (lang): message`, the form `present` prints to stderr. */
export function formatRoundError(file: string, error: RoundError): string {
  const parts = [`${file}:${error.line}`];
  if (error.question !== undefined) parts.push(`Q${error.question}`);
  const subject = error.illustration;
  if (subject?.option) parts.push(`mockup ${subject.option} (${subject.fence})`);
  else if (subject) parts.push(`illustration ${subject.id ? `"${subject.id}" ` : ''}(${subject.fence})`);
  return `${parts.join(' · ')}: ${error.message}`;
}
