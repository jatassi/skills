import { describe, expect, it } from 'vitest';
import { formatRoundError, parseRound, type Round } from '../../src/core/round.ts';

/** Parses a round that must be accepted. */
function accept(source: string): Round {
  const result = parseRound(source);
  if (!result.ok) throw new Error(`expected the round to parse:\n${lines(source).join('\n')}`);
  return result.round;
}

/** The exact stderr lines `present` prints for a rejected round. */
function lines(source: string): string[] {
  const result = parseRound(source);
  return result.ok ? [] : result.errors.map((error) => formatRoundError('round.md', error));
}

const Q = (n: number, body = '') => `❓ **Q${n}** - **Title ${n}**: Body ${n}.\n\n${body}➡️ Yes.\n`;
const fence = (info: string, content: string, ticks = '```') => `${ticks}${info}\n${content}\n${ticks}\n\n`;

describe('round title', () => {
  it('is optional', () => {
    expect(accept(Q(1)).title).toBeUndefined();
  });

  it('is the first non-blank line', () => {
    expect(accept(`\n\n# Storage choices\n\n${Q(1)}`).title).toBe('Storage choices');
  });

  it('is at most 60 characters', () => {
    expect(accept(`# ${'x'.repeat(60)}\n\n${Q(1)}`).title).toHaveLength(60);
    expect(lines(`# ${'x'.repeat(61)}\n\n${Q(1)}`)).toEqual([
      'round.md:1: the round title is 61 characters; keep it to 60',
    ]);
  });

  it('must come first', () => {
    expect(lines(`${fence('design-tree', '- [ ] Q1')}# Late title\n\n${Q(1)}`)).toEqual([
      'round.md:5: the # round title must be the first line of the round file',
    ]);
  });
});

describe('before Q1', () => {
  it('rejects anything but a title and a design-tree fence', () => {
    expect(lines(`# T\n\nSome intro.\n\n## Sub\n\n${Q(1)}`)).toEqual([
      'round.md:3: nothing but a # title and a design-tree fence may come before Q1',
      'round.md:5: nothing but a # title and a design-tree fence may come before Q1',
    ]);
  });

  it('rejects a round with no question', () => {
    expect(lines('')).toEqual(['round.md:1: no question found; start one with ❓ **Q1** - **title**: body']);
  });
});

describe('question headers', () => {
  it.each([
    ['❓ with U+FE0F', '❓️ **Q1** - **Where?**: Body.'],
    ['an en dash', '❓ **Q1** – **Where?**: Body.'],
    ['an em dash', '❓ **Q1** — **Where?**: Body.'],
    ['a missing colon', '❓ **Q1** - **Where?** Body.'],
    ['the colon inside the bold', '❓ **Q1** - **Where?:** Body.'],
  ])('tolerates %s', (_name, header) => {
    const [question] = accept(`${header}\n\n➡️ Yes.\n`).questions;
    expect(question).toMatchObject({ number: 1, title: 'Where?', prose: 'Body.' });
  });

  it('tolerates ➡️ without U+FE0F', () => {
    expect(accept('❓ **Q1** - **T**: B.\n\n➡ Yes.\n').questions[0]!.recommendation.text).toBe('Yes.');
  });

  it('reads the title as plain text', () => {
    expect(accept('❓ **Q1** - **Use `pnpm`?**: B.\n\n➡️ Yes.\n').questions[0]!.title).toBe('Use pnpm?');
  });

  it('ignores --- separators', () => {
    expect(accept(`${Q(1)}\n---\n\n${Q(2)}\n---\n`).questions.map((q) => q.prose)).toEqual(['Body 1.', 'Body 2.']);
  });

  it('numbers may start anywhere', () => {
    expect(accept(`${Q(7)}\n${Q(9)}`).questions.map((q) => q.number)).toEqual([7, 9]);
  });

  it('rejects a duplicate number', () => {
    expect(lines(`${Q(1)}\n${Q(1)}`)).toEqual(['round.md:5 · Q1: duplicate Q1; the first is at line 1']);
  });

  it('rejects a number that does not increase', () => {
    expect(lines(`${Q(2)}\n${Q(1)}`)).toEqual(['round.md:5 · Q1: question numbers must increase; Q1 follows Q2']);
  });

  it('rejects a malformed header', () => {
    expect(lines(`${Q(1)}\n❓ Q2 - Missing bold: body\n\n➡️ Yes.\n`)).toEqual([
      'round.md:5 · Q1: malformed question header; write ❓ **Q1** - **title**: body',
      'round.md:7 · Q1: a question takes one ➡️ recommendation',
    ]);
    expect(lines(`**Q1** - **No marker**: body\n\n➡️ Yes.\n\n${Q(2)}`)).toEqual([
      'round.md:1: malformed question header; write ❓ **Q1** - **title**: body',
    ]);
  });

  it('does not mistake prose that opens with a bold question number for a header', () => {
    expect(accept(Q(1, '**Q2** depends on this.\n\n')).questions[0]!.prose).toBe('Body 1.\n\n**Q2** depends on this.');
  });
});

describe('question parts', () => {
  it('reads prose, illustrations, options and the recommendation in order', () => {
    const round = accept(`❓ **Q1** - **Runtime**: Cold start matters.

More prose, with a list:

- one
- two

${fence('mermaid id=flow title="Request flow"', 'flowchart LR\n  a --> b')}- **A** - Node
- **B** - \`Bun\`

➡️ **B** because it starts fastest.

It also ships a bundler.
`);
    const [question] = round.questions;
    expect(question).toMatchObject({
      prose: 'Cold start matters.\n\nMore prose, with a list:\n\n- one\n- two',
      illustrations: [
        { id: 'flow', kind: 'mermaid', fence: 'mermaid', title: 'Request flow', source: 'flowchart LR\n  a --> b', line: 8 },
      ],
      options: [
        { letter: 'A', label: 'Node', text: 'Node' },
        { letter: 'B', label: '`Bun`', text: 'Bun' },
      ],
      recommendation: {
        option: 'B',
        source: '**B** because it starts fastest.\n\nIt also ships a bundler.',
        text: 'B because it starts fastest. It also ships a bundler.',
      },
    });
  });

  it('requires only the recommendation', () => {
    expect(accept('❓ **Q1** - **T**\n\n➡️ Yes.\n').questions[0]).toMatchObject({
      prose: '',
      illustrations: [],
      options: [],
    });
  });

  it('rejects a missing recommendation', () => {
    expect(lines(`❓ **Q1** - **T**: B.\n\n${Q(2)}`)).toEqual(['round.md:1 · Q1: missing ➡️ recommendation']);
  });

  it('rejects an empty recommendation', () => {
    expect(lines('❓ **Q1** - **T**: B.\n\n➡️\n')).toEqual(['round.md:3 · Q1: the ➡️ recommendation is empty']);
  });

  it('rejects prose after an illustration', () => {
    expect(lines(Q(1, `${fence('mermaid id=a', 'graph LR')}Late prose.\n\n`))).toEqual([
      'round.md:7 · Q1: prose after an illustration; the order is prose → illustrations → options → ➡️',
    ]);
  });

  it('rejects an illustration after the options', () => {
    expect(lines(Q(1, `- **A** - One\n- **B** - Two\n\n${fence('mermaid id=a', 'graph LR')}`))).toEqual([
      'round.md:6 · Q1: an illustration after the options; the order is prose → illustrations → options → ➡️',
    ]);
  });

  it('rejects an illustration or options after the recommendation', () => {
    expect(lines(`❓ **Q1** - **T**: B.\n\n➡️ Yes.\n\n${fence('mermaid id=a', 'graph LR')}- **A** - One\n`)).toEqual([
      'round.md:5 · Q1: an illustration after the ➡️ recommendation; the order is prose → illustrations → options → ➡️',
      'round.md:9 · Q1: the options after the ➡️ recommendation; the order is prose → illustrations → options → ➡️',
    ]);
  });

  it('rejects a second recommendation', () => {
    expect(lines('❓ **Q1** - **T**: B.\n\n➡️ Yes.\n\n➡️ No.\n')).toEqual([
      'round.md:5 · Q1: a question takes one ➡️ recommendation',
    ]);
  });

  it('rejects headings in a question', () => {
    expect(lines(`❓ **Q1** - **T**: B.\n\n## Detail\n\nText\n===\n\n➡️ Yes.\n\n### After\n`)).toEqual([
      "round.md:3 · Q1: headings aren't allowed in a question; use **bold** text",
      "round.md:5 · Q1: headings aren't allowed in a question; use **bold** text",
      "round.md:10 · Q1: headings aren't allowed in a question; use **bold** text",
    ]);
  });

  it('rejects headings, fences and headers hidden in a list or quote', () => {
    expect(lines(Q(1, '> ## Quoted\n\n- note\n\n  ```ts\n  a\n  ```\n\n'))).toEqual([
      "round.md:3 · Q1: headings aren't allowed in a question; use **bold** text",
      'round.md:7 · Q1: a fence inside a list or quote; put illustrations at the top level of the question',
    ]);
    expect(lines('❓ **Q1** - **T**: B.\n\n➡️ Yes.\n\n- ❓ **Q2** - **T**: B.\n')).toEqual([
      'round.md:5 · Q1: a question header must be its own paragraph, outside any list or quote',
    ]);
  });

  it('points at a ➡️ folded into the paragraph above', () => {
    expect(lines('❓ **Q1** - **T**: B.\n\n- **A** - One\n- **B** - Two\n➡️ **B**\n')).toEqual([
      'round.md:5 · Q1: put a blank line before the ➡️ recommendation so it starts its own paragraph',
    ]);
  });

  it('keeps an indented code block as prose', () => {
    expect(accept(Q(1, '    not a fence\n\n')).questions[0]!.illustrations).toEqual([]);
  });
});

describe('options', () => {
  it('counts only the list right before ➡️', () => {
    const [question] = accept(Q(1, '- **A** - Early lettered list\n\nThen prose.\n\n- **A** - Real\n- **B** - Options\n\n')).questions;
    expect(question!.options.map((o) => o.label)).toEqual(['Real', 'Options']);
    expect(question!.prose).toContain('- **A** - Early lettered list');
  });

  it('rejects gaps in the letters', () => {
    expect(lines(Q(1, '- **A** - One\n- **C** - Three\n\n'))).toEqual([
      'round.md:4 · Q1: option letters run A, B, C… with no gaps; expected B, found C',
    ]);
    expect(lines(Q(1, '- **B** - Two\n\n'))).toEqual([
      'round.md:3 · Q1: option letters run A, B, C… with no gaps; expected A, found B',
    ]);
  });

  it('rejects an item that is not an option', () => {
    expect(lines(Q(1, '- **A** - One\n- two\n\n'))).toEqual([
      'round.md:4 · Q1: every item of the options list must be written - **A** - label',
    ]);
  });

  it('rejects a recommendation that points at a missing option', () => {
    expect(lines('❓ **Q1** - **T**: B.\n\n- **A** - One\n\n➡️ **B** is best.\n')).toEqual([
      'round.md:5 · Q1: the recommendation points at option B, which does not exist',
    ]);
  });

  it('treats a recommendation that does not open with a letter as free text', () => {
    expect(accept(Q(1, '- **A** - One\n\n')).questions[0]!.recommendation.option).toBeUndefined();
  });

  it('rejects anything but a mockup under an option', () => {
    expect(lines(Q(1, '- **A** - One\n\n  More about one.\n\n- **B** - Two\n  ```ts id=x\n  a\n  ```\n\n'))).toEqual([
      'round.md:5 · Q1: option A is one line; only an html mockup may be indented under it',
      'round.md:8 · Q1: only an html mockup may be indented under an option (option B)',
    ]);
  });
});

describe('mockups', () => {
  it('is an html fence indented under its option', () => {
    const [question] = accept(
      Q(1, '- **A** - Tabs\n\n  ```html\n  <nav>tabs</nav>\n  ```\n\n- **B** - Drawer\n  ```html tailwind=false\n  <aside>drawer</aside>\n  ```\n\n'),
    ).questions;
    expect(question!.options).toMatchObject([
      { letter: 'A', mockup: { source: '<nav>tabs</nav>', tailwind: true, line: 5 } },
      { letter: 'B', mockup: { source: '<aside>drawer</aside>', tailwind: false, line: 10 } },
    ]);
    expect(question!.illustrations).toEqual([]);
  });

  it('takes no id and only tailwind', () => {
    expect(lines(Q(1, '- **A** - Tabs\n\n  ```html id=tabs title=x tailwind=true\n  <nav></nav>\n  ```\n\n'))).toEqual([
      'round.md:5 · Q1 · mockup A (html): a mockup takes no id; it belongs to its option',
      'round.md:5 · Q1 · mockup A (html): unknown key "title"; a mockup takes only tailwind',
      'round.md:5 · Q1 · mockup A (html): tailwind takes only false (got "true")',
    ]);
  });

  it('takes one per option', () => {
    expect(lines(Q(1, '- **A** - Tabs\n\n  ```html\n  <a></a>\n  ```\n\n  ```html\n  <b></b>\n  ```\n\n'))).toEqual([
      'round.md:9 · Q1: option A already has a mockup; an option takes one',
    ]);
  });

  it('rejects an unindented mockup with a hint', () => {
    expect(lines(Q(1, '- **A** - Tabs\n- **B** - Drawer\n\n```html\n<aside></aside>\n```\n\n'))).toEqual([
      "round.md:6 · Q1: an html fence after an option is that option's mockup; indent it under option B",
    ]);
  });

  it('reports each unindented mockup once when they split the options', () => {
    expect(lines(Q(1, '- **A** - Tabs\n\n```html\n<nav></nav>\n```\n\n- **B** - Drawer\n\n```html\n<aside></aside>\n```\n\n'))).toEqual([
      "round.md:5 · Q1: an html fence after an option is that option's mockup; indent it under option A",
      "round.md:11 · Q1: an html fence after an option is that option's mockup; indent it under option B",
    ]);
  });

  it('rejects a duplicate data-anchor', () => {
    expect(lines(Q(1, '- **A** - Tabs\n\n  ```html\n  <a data-anchor="x"></a>\n  <b data-anchor=x></b>\n  ```\n\n'))).toEqual([
      'round.md:7 · Q1 · mockup A (html): duplicate data-anchor "x"; each name must be unique in one illustration',
    ]);
  });
});

describe('illustrations', () => {
  it('reads every fence language into its block kind', () => {
    const body = [
      fence('mermaid id=m', 'graph LR'),
      fence('dot id=d', 'digraph { a -> b }'),
      fence('vega-lite id=v', '{}'),
      fence('table id=t', '| a |\n|---|\n| 1 |'),
      fence('diff id=f', '--- a\n+++ b'),
      fence('html id=h', '<p>hi</p>'),
      fence('ts id=c', 'let a = 1;'),
      fence('code id=r lang=mermaid', 'graph LR'),
    ].join('');
    const [question] = accept(Q(1, body)).questions;
    expect(question!.illustrations.map(({ id, kind, fence: lang }) => [id, kind, lang])).toEqual([
      ['m', 'mermaid', 'mermaid'],
      ['d', 'dot', 'dot'],
      ['v', 'vega-lite', 'vega-lite'],
      ['t', 'table', 'table'],
      ['f', 'diff', 'diff'],
      ['h', 'html', 'html'],
      ['c', 'code', 'ts'],
      ['r', 'code', 'code'],
    ]);
    expect(question!.illustrations[5]).toMatchObject({ tailwind: true });
    expect(question!.illustrations[6]!.code).toEqual({ lang: 'ts' });
    expect(question!.illustrations[7]!.code).toEqual({ lang: 'mermaid' });
  });

  it('reads code settings', () => {
    const [question] = accept(Q(1, fence('py id=snippet file="src/app.py" startLine=10 highlight=10,12-13', 'a\nb\nc\nd'))).questions;
    expect(question!.illustrations[0]!.code).toEqual({
      lang: 'py',
      file: 'src/app.py',
      startLine: 10,
      highlight: [
        [10, 10],
        [12, 13],
      ],
    });
  });

  it('reads tailwind=false on html', () => {
    expect(accept(Q(1, fence('html id=h tailwind=false', '<p></p>'))).questions[0]!.illustrations[0]!.tailwind).toBe(false);
  });

  it('keeps a fence nested with a longer outer fence or tildes', () => {
    const source = '```ts\nlet a = 1;\n```';
    const [question] = accept(Q(1, fence('markdown id=a', source, '````') + fence('markdown id=b', source, '~~~'))).questions;
    expect(question!.illustrations.map((i) => i.source)).toEqual([source, source]);
  });

  it('unquotes quoted values with escapes', () => {
    const [question] = accept(Q(1, fence('mermaid id=a title="Say \\"hi\\" \\\\ bye"', 'graph LR'))).questions;
    expect(question!.illustrations[0]!.title).toBe('Say "hi" \\ bye');
  });

  describe('id', () => {
    it('is required', () => {
      expect(lines(Q(1, fence('mermaid title=Flow', 'graph LR')))).toEqual([
        'round.md:3 · Q1 · illustration (mermaid): missing id; add id=<name> after the language',
      ]);
    });

    it('must match [a-z0-9][a-z0-9-]*', () => {
      expect(lines(Q(1, fence('mermaid id=Flow', 'graph LR') + fence('dot id=-x', 'digraph {}')))).toEqual([
        'round.md:3 · Q1 · illustration (mermaid): id "Flow" must match [a-z0-9][a-z0-9-]*',
        'round.md:7 · Q1 · illustration (dot): id "-x" must match [a-z0-9][a-z0-9-]*',
      ]);
    });

    it('is unique in the round', () => {
      expect(lines(`${Q(1, fence('mermaid id=flow', 'graph LR'))}\n${Q(2, fence('dot id=flow', 'digraph {}'))}`)).toEqual([
        'round.md:11 · Q2 · illustration "flow" (dot): id "flow" is already used in Q1; ids are unique in a round',
      ]);
    });
  });

  it('rejects a fence with no language', () => {
    expect(lines(Q(1, fence('', 'plain') + fence('id=a', 'plain')))).toEqual([
      'round.md:3 · Q1 · illustration (no language): a fence starts with its language, like ```mermaid id=flow',
      'round.md:7 · Q1 · illustration (no language): a fence starts with its language, like ```mermaid id=a',
    ]);
  });

  it('rejects a design-tree fence inside a question', () => {
    expect(lines(Q(1, fence('design-tree', '- [ ] Q1')))).toEqual([
      'round.md:3 · Q1 · illustration (design-tree): the design-tree fence goes before Q1',
    ]);
  });

  describe('keys', () => {
    it.each([
      ['mermaid', 'id, title'],
      ['dot', 'id, title'],
      ['vega-lite', 'id, title'],
      ['table', 'id, title'],
      ['diff', 'id, title'],
      ['html', 'id, title, tailwind'],
      ['ts', 'id, title, file, startLine, highlight'],
      ['code', 'id, title, file, startLine, highlight, lang'],
    ])('%s takes %s', (lang, keys) => {
      const extra = lang === 'code' ? ' lang=ts' : '';
      expect(lines(Q(1, fence(`${lang} id=a${extra} height=3`, 'x')))).toEqual([
        `round.md:3 · Q1 · illustration "a" (${lang}): unknown key "height"; ${lang} takes ${keys}`,
      ]);
    });

    it('rejects code keys on a block', () => {
      expect(lines(Q(1, fence('mermaid id=a startLine=3', 'graph LR')))).toEqual([
        'round.md:3 · Q1 · illustration "a" (mermaid): unknown key "startLine"; mermaid takes id, title',
      ]);
    });

    it('must be lower camelCase key=value pairs, each given once', () => {
      expect(lines(Q(1, fence('ts id=a start-line=3 wide title=x title=y', 'x')))).toEqual([
        'round.md:3 · Q1 · illustration "a" (ts): key "start-line" must be lower camelCase, like startLine',
        'round.md:3 · Q1 · illustration "a" (ts): expected key=value, found "wide"',
        'round.md:3 · Q1 · illustration "a" (ts): title is given twice',
      ]);
    });

    it('rejects broken quoting', () => {
      expect(lines(Q(1, fence('ts id=a title=say"hi"', 'x') + fence('ts id=b title="open', 'x')))).toEqual([
        'round.md:3 · Q1 · illustration "a" (ts): quote the whole value of title, like title="…"',
        'round.md:7 · Q1 · illustration "b" (ts): the value of title has no closing quote',
      ]);
      expect(lines(Q(1, fence('ts id=a title="x"file=y', 'x')))).toEqual([
        'round.md:3 · Q1 · illustration "a" (ts): put a space after the quoted value of title',
      ]);
    });

    it('rejects an empty title or file', () => {
      expect(lines(Q(1, fence('ts id=a title="" file=""', 'x')))).toEqual([
        'round.md:3 · Q1 · illustration "a" (ts): title is empty',
        'round.md:3 · Q1 · illustration "a" (ts): file is empty',
      ]);
    });
  });

  describe('values', () => {
    it('tailwind takes only false', () => {
      expect(lines(Q(1, fence('html id=a tailwind=true', '<p></p>')))).toEqual([
        'round.md:3 · Q1 · illustration "a" (html): tailwind takes only false (got "true")',
      ]);
    });

    it.each(['0', '-2', '1.5', 'ten'])('startLine rejects %s', (value) => {
      expect(lines(Q(1, fence(`ts id=a startLine=${value}`, 'x')))).toEqual([
        `round.md:3 · Q1 · illustration "a" (ts): startLine takes a positive whole number (got "${value}")`,
      ]);
    });

    it.each(['0', '3-1', 'a', '1,,2', '2-'])('highlight rejects %s', (value) => {
      expect(lines(Q(1, fence(`ts id=a highlight=${value}`, 'x\ny\nz')))).toEqual([
        `round.md:3 · Q1 · illustration "a" (ts): highlight takes lines and ranges like 3,5-7 (got "${value}")`,
      ]);
    });

    it('highlight stays inside the code, in the file’s own line numbers', () => {
      expect(accept(Q(1, fence('ts id=a highlight="1, 2-3"', 'x\ny\nz'))).questions[0]!.illustrations[0]!.code!.highlight).toEqual([
        [1, 1],
        [2, 3],
      ]);
      expect(lines(Q(1, fence('ts id=a highlight=4', 'x\ny\nz') + fence('ts id=b startLine=20 highlight=3', 'x')))).toEqual([
        'round.md:3 · Q1 · illustration "a" (ts): highlight line 4 is outside the code, which runs from line 1 to 3',
        'round.md:9 · Q1 · illustration "b" (ts): highlight line 3 is outside the code, which runs from line 20 to 20',
      ]);
    });

    it('a code fence needs a language name', () => {
      expect(lines(Q(1, fence('code id=a', 'x') + fence('code id=b lang="c sharp"', 'x')))).toEqual([
        'round.md:3 · Q1 · illustration "a" (code): a code fence needs lang=<language>',
        'round.md:7 · Q1 · illustration "b" (code): lang "c sharp" is not a language name',
      ]);
    });
  });

  it('rejects a duplicate data-anchor in one html illustration only', () => {
    const html = '<div data-anchor="card">\n  <b data-anchor=\'title\'></b>\n  <i data-anchor="card"></i>\n</div>';
    expect(lines(Q(1, fence('html id=a', html)))).toEqual([
      'round.md:6 · Q1 · illustration "a" (html): duplicate data-anchor "card"; each name must be unique in one illustration',
    ]);
    // The same name in two illustrations is fine.
    accept(Q(1, fence('html id=a', '<p data-anchor="x"></p>') + fence('html id=b', '<p data-anchor="x"></p>')));
  });
});

describe('design tree', () => {
  const TREE = `- [x] Storage: session folder in $TMPDIR
  - [ ] Retention Q2
- [ ] Runtime: Q1 or later
  - [x] Language
`;

  it('is a nested task list read before Q1', () => {
    const round = accept(`# T\n\n${fence('design-tree', TREE.trimEnd())}${Q(1)}\n${Q(2)}`);
    expect(round.designTree).toEqual([
      {
        label: 'Storage',
        settled: true,
        gist: 'session folder in $TMPDIR',
        questions: [],
        children: [{ label: 'Retention Q2', settled: false, questions: [2], children: [] }],
      },
      {
        label: 'Runtime: Q1 or later',
        settled: false,
        questions: [1],
        children: [{ label: 'Language', settled: true, questions: [], children: [] }],
      },
    ]);
  });

  it('is optional', () => {
    expect(accept(Q(1)).designTree).toBeUndefined();
  });

  it('rejects a Q<n> that is not in the round', () => {
    expect(lines(`${fence('design-tree', '- [ ] Runtime\n  - [ ] Q4')}${Q(1)}`)).toEqual([
      'round.md:3: design tree: Q4 is not in this round',
    ]);
  });

  it('rejects anything but one task list', () => {
    expect(lines(`${fence('design-tree', 'Intro\n\n- [ ] a')}${Q(1)}`)).toEqual([
      'round.md:2: design tree: the fence holds one task list, like - [x] Storage: session folder',
    ]);
    expect(lines(`${fence('design-tree', '- [ ] a\n- plain\n\nafter')}${Q(1)}`)).toEqual([
      'round.md:3: design tree: each branch starts with [ ] (open) or [x] (settled); found "plain"',
      'round.md:5: design tree: the fence holds one task list and nothing else',
    ]);
  });

  it('rejects a second design-tree fence', () => {
    expect(lines(`${fence('design-tree', '- [ ] a')}${fence('design-tree', '- [ ] b')}${Q(1)}`)).toEqual([
      'round.md:5: nothing but a # title and a design-tree fence may come before Q1',
    ]);
  });
});

describe('every error at once', () => {
  it('collects all the errors of a round, in line order', () => {
    const source = `# ${'Long '.repeat(13)}

${fence('design-tree', '- [ ] Q9')}❓ **Q2** - **First**: Body.

${fence('mermaid', 'graph LR')}- **A** - One
- **C** - Three

➡️ **D**

❓ **Q1** - **Second**: Body.

## Heading
`;
    expect(lines(source)).toEqual([
      'round.md:1: the round title is 64 characters; keep it to 60',
      'round.md:4: design tree: Q9 is not in this round',
      'round.md:9 · Q2 · illustration (mermaid): missing id; add id=<name> after the language',
      'round.md:14 · Q2: option letters run A, B, C… with no gaps; expected B, found C',
      'round.md:16 · Q2: the recommendation points at option D, which does not exist',
      'round.md:18 · Q1: question numbers must increase; Q1 follows Q2',
      'round.md:18 · Q1: missing ➡️ recommendation',
      "round.md:20 · Q1: headings aren't allowed in a question; use **bold** text",
    ]);
  });
});
