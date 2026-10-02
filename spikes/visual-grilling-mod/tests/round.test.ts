import { describe, expect, test } from 'claude-code/testing'

const ROUND = {
  title: 'Storage choices',
  designTree: '- [x] Channel: pane\n- [ ] Storage\n  - [ ] Location Q1',
  questions: [
    {
      number: 1,
      title: 'Where are rounds saved?',
      prose: 'Rounds need a home for the session.',
      illustrations: [
        {
          kind: 'svg',
          id: 'save-flow',
          alt: 'agent to present to session folder',
          svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><rect width="60" height="30" fill="#4a8"/><text x="70" y="20">present</text></svg>',
        },
      ],
      options: [
        { letter: 'A', label: 'Session folder in $TMPDIR' },
        { letter: 'B', label: 'The repository' },
      ],
      recommendation: '**A** because it is deleted with the session.',
      recommendedOption: 'A',
    },
    {
      number: 2,
      title: 'Which runtime?',
      prose: 'Cold start matters.',
      illustrations: [{ kind: 'code', id: 'snippet', lang: 'ts', source: 'const x = 1' }],
      options: [],
      recommendation: 'Node, since it ships everywhere.',
    },
  ],
}

const PANE = { component: 'Pane', requestId: 'grilling-round' } as const

describe('a round in a pane', () => {
  for (const surface of ['desktop', 'terminal'] as const) {
    test(`on ${surface}: present, answer, submit, and the summary starts the next turn`, async ($, on) => {
      // Beneath the plugin, these stand for the engine.
      on('ui.open', () => ({ value: { isPlaced: true } }) as never)
      on('ui.status', () => ({ value: undefined }) as never)
      const prompts: string[] = []
      on('prompt.submit', ($, e) => {
        prompts.push(e.text)
        return { text: e.text }
      })
      const presented = await $.tool.call({ tool: 'mcp__visual-grilling-mod__present_round', round: ROUND } as never)

      expect(String((presented as { result?: unknown }).result)).toContain('presented')
      const ui = await $.ui.mount({ plugin: 'visual-grilling-mod', surface, ...PANE, props: { title: 'x', isFocused: true, bodyColumns: 100 } as never })
      expect(await ui.find({ key: 'submit' })).toBeDefined()

      await ui.press({ key: 'q1-opt-B' })
      await ui.input({ key: 'q1-comment', text: 'what about Windows temp paths?' })
      await ui.input({ key: 'q2-text', text: 'Bun, actually' })
      expect(String((await ui.find({ key: 'q1-opt-B' }))?.props.label)).toContain('●')
      if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
      await ui.press({ key: 'submit' })
      await ui.unmount()

      expect(prompts).toHaveLength(1)
      const out = prompts[0]!
      expect(out).toContain('submitted')
      expect(out).toContain('Q1 Where are rounds saved?: picked B - The repository')
      expect(out).toContain('comment: what about Windows temp paths?')
      expect(out).toContain('Q2 Which runtime?: answered: Bun, actually')
    })
  }

  test('a round file goes through the real parser, and a bad one is rejected line by line', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }) as never)
    on('ui.status', () => ({ value: undefined }) as never)
    const TOOL = 'mcp__visual-grilling-mod__present_round'

    const bad = await $.tool.call({ tool: TOOL, markdown: '❓ **Q1** - **No recommendation**: body' } as never)
    expect(String((bad as { result?: unknown }).result)).toMatch(/^rejected\nround\.md:1 · Q1/)

    const md = [
      '# Storage choices',
      '',
      '```design-tree',
      '- [x] Channel: pane',
      '- [ ] Location Q1',
      '```',
      '',
      '❓ **Q1** - **Where are rounds saved?**: Rounds need a home.',
      '',
      '```mermaid id=save-flow title="Where a round goes"',
      'flowchart LR',
      '  agent[Agent] --> folder[(Session folder)]',
      '```',
      '',
      '- **A** - Session folder in `$TMPDIR`',
      '- **B** - The repository',
      '',
      '➡️ **A** because it is deleted with the session.',
    ].join('\n')
    const ok = await $.tool.call({ tool: TOOL, markdown: md } as never)
    expect(String((ok as { result?: unknown }).result)).toContain('presented')

    const ui = await $.ui.mount({ plugin: 'visual-grilling-mod', surface: 'desktop', ...PANE, props: { title: 'x', isFocused: true, bodyColumns: 100 } as never })
    expect(await ui.find({ key: 'q1-opt-B' }), 'option B').toBeDefined()
    expect((await ui.find({ key: 'q1-opt-A' }))?.props.variant).toBe('primary')
    expect(await ui.find({ type: 'Code' }), 'code').toBeDefined()
    expect(String((await ui.find({ type: 'Code' }))?.props.source)).toContain('flowchart LR')
    await ui.unmount()
  })
})
