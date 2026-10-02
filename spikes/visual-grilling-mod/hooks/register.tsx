import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Answer, Illustration, Question, Round, Verdict } from '../types'

// The repo's own round-file parser (packages/visual-grilling/src/core/round.ts),
// bundled by esbuild: the same strict checks `present` runs today.
import { formatRoundError, parseRound } from './round-parser.mjs'

type Parsed = ReturnType<typeof parseRound>
type ParsedRound = Extract<Parsed, { ok: true }>['round']
type TreeNode = NonNullable<ParsedRound['designTree']>[number]

function treeMarkdown(nodes: readonly TreeNode[], depth = 0): string {
  return nodes
    .map(n => {
      const qs = n.questions.map(q => ` Q${q}`).join('')
      const line = `${'  '.repeat(depth)}- [${n.settled ? 'x' : ' '}] ${n.label}${n.gist ? `: ${n.gist}` : ''}${qs}`
      return [line, treeMarkdown(n.children, depth + 1)].filter(Boolean).join('\n')
    })
    .join('\n')
}

/** The parsed round in the pane's shape. Diagrams go to the Node helper for SVG; until then, their source. */
function fromParsed(r: ParsedRound): Round {
  return {
    title: r.title,
    designTree: r.designTree ? treeMarkdown(r.designTree) : undefined,
    questions: r.questions.map(q => ({
      number: q.number,
      title: q.title,
      prose: q.prose,
      illustrations: q.illustrations.map((ill): Illustration => {
        if (ill.kind === 'table') return { kind: 'markdown', id: ill.id, title: ill.title, source: ill.source }
        const lang = ill.kind === 'code' ? ill.code?.lang : ill.kind
        return { kind: 'code', id: ill.id, title: ill.title, lang, source: ill.source }
      }),
      options: q.options.map(o => ({ letter: o.letter, label: o.label })),
      recommendation: q.recommendation.source,
      recommendedOption: q.recommendation.option,
    })),
  }
}

const PANE = 'grilling-round'
const TOOL = 'present_round'
const HOLD_LIMIT_MS = 10 * 60 * 1000

const round = atom({ plugin: 'visual-grilling-mod', key: 'round' } as const, null)
const answers = atom({ plugin: 'visual-grilling-mod', key: 'answers' } as const, {})
const submitted = atom({ plugin: 'visual-grilling-mod', key: 'submitted' } as const, false)

/** The summary block `await` prints today, rebuilt from the pane's answers. */
export function summaryOf(r: Round, all: Record<string, Answer>): string {
  const lines = r.questions.map(q => {
    const a = all[String(q.number)] ?? { comments: [] }
    const verdict = a.verdict === undefined ? 'unanswered' : verdictText(q, a.verdict)
    const comments = a.comments.map(c => `\n  - comment: ${c}`).join('')
    return `Q${q.number} ${q.title}: ${verdict}${comments}`
  })
  return ['submitted', 'summary:', ...lines].join('\n')
}

function verdictText(q: Question, v: Verdict): string {
  switch (v.kind) {
    case 'accepted':
      return `accepted the recommendation (${q.recommendedOption ?? q.recommendation})`
    case 'option':
      return `picked ${v.letter} - ${q.options.find(o => o.letter === v.letter)?.label ?? '?'}`
    case 'text':
      return `answered: ${v.text}`
    case 'unsure':
      return 'unsure'
  }
}

async function answer($: EngineInterface, n: number, fn: (a: Answer) => Answer) {
  await update($, answers, all => ({ ...all, [String(n)]: fn(all[String(n)] ?? { comments: [] }) }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: TOOL,
      description:
        'Show one grilling round in a pane beside the transcript and wait for the user to submit it. ' +
        'Returns "submitted" and a summary block, or "pending" if nobody answered in 10 minutes (call again).',
      inputSchema: {
        type: 'object',
        required: ['markdown'],
        properties: {
          markdown: { type: 'string', description: 'The round file, exactly as round-file.md describes it' },
        },
      },
    })
    return next(e)
  })

  // `present` and `await` in one: the tool opens the pane and returns at once,
  // so the turn ends and the terminal stays a channel. Submit starts the next
  // turn with the summary, as a background `await` exiting does today.
  on('tool.call', { tool: 'mcp__visual-grilling-mod__present_round' }, async ($, e) => {
    const input = e as unknown as { markdown?: string; round?: Round }
    let given: Round
    if (typeof input.markdown === 'string') {
      const parsed = parseRound(input.markdown)
      if (!parsed.ok) {
        return { result: ['rejected', ...parsed.errors.map(err => formatRoundError('round.md', err))].join('\n') }
      }
      given = fromParsed(parsed.round)
    } else if (input.round !== undefined) {
      given = input.round
    } else {
      return { result: 'rejected\nround.md: pass the round file as markdown' }
    }
    await update($, round, () => given)
    await update($, answers, () => ({}))
    await update($, submitted, () => false)
    const opened = await $.ui.open({ id: PANE, title: given.title ?? 'Grilling round', focus: true })
    $.ui.status('grilling: round open')
    return {
      result:
        'presented' +
        (opened.isPlaced ? '' : ' (the pane is waiting for room; tell the user to run /grill-round)') +
        '\nEnd your turn. The submission arrives as the next message.',
    }
  })

  // A reply typed in the terminal while a round is open answers it there.
  on('prompt.submit', async ($, e, next) => {
    const isOurs = e.origin.kind === 'plugin' && e.origin.name === $.plugin.name
    if (!isOurs && (await read($, round)) !== null && !(await read($, submitted))) {
      await update($, submitted, () => true)
      $.ui.status(undefined)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown, Code, Input } = $.ui.resolve(e)
    const r = await read($, round)
    if (r === null) return <Text dimColor>No round open.</Text>
    const all = await read($, answers)
    const isDone = await read($, submitted)

    const illustration = (ill: Illustration) => {
      if (ill.kind === 'code') return <Code source={ill.source} language={ill.lang} />
      if (ill.kind === 'markdown') return <Markdown key={`ill-${ill.id}`} text={ill.source} />
      // Svg is desktop-only; the terminal gets the alt text.
      if (e.surface === 'desktop') {
        const { Svg } = $.ui.resolve(e)
        return <Svg source={ill.svg} alt={ill.alt} isInteractive />
      }
      return <Text dimColor>[diagram: {ill.alt}]</Text>
    }

    const card = (q: Question) => {
      const a = all[String(q.number)] ?? { comments: [] }
      const picked = a.verdict?.kind === 'option' ? a.verdict.letter : undefined
      return (
        <Box key={`q${q.number}`} flexDirection="column" borderStyle="round" paddingX={1} gap={1}>
          <Text bold>
            Q{q.number} · {q.title}
          </Text>
          <Markdown text={q.prose} />
          {q.illustrations.map(illustration)}
          {q.options.map(o => (
            <Button
              key={`q${q.number}-opt-${o.letter}`}
              label={`${picked === o.letter ? '● ' : ''}${o.letter} - ${o.label}${q.recommendedOption === o.letter ? '  (recommended)' : ''}`}
              variant={q.recommendedOption === o.letter ? 'primary' : 'secondary'}
              onPress={() => answer($, q.number, x => ({ ...x, verdict: { kind: 'option', letter: o.letter } }))}
            />
          ))}
          <Markdown text={`➡️ ${q.recommendation}`} />
          <Box flexDirection="row" gap={1}>
            <Button
              key={`q${q.number}-accept`}
              label={a.verdict?.kind === 'accepted' ? '● Accept' : 'Accept'}
              onPress={() => answer($, q.number, x => ({ ...x, verdict: { kind: 'accepted' } }))}
            />
            <Button
              key={`q${q.number}-unsure`}
              label={a.verdict?.kind === 'unsure' ? '● Unsure' : 'Unsure'}
              onPress={() => answer($, q.number, x => ({ ...x, verdict: { kind: 'unsure' } }))}
            />
          </Box>
          <Input
            key={`q${q.number}-text`}
            label="Your answer"
            placeholder="Free text instead of an option"
            value={a.verdict?.kind === 'text' ? a.verdict.text : ''}
            submitLabel="answer"
            onSubmit={text => answer($, q.number, x => ({ ...x, verdict: { kind: 'text', text } }))}
          />
          {a.comments.map((c, i) => (
            <Text key={`q${q.number}-c${i}`} dimColor>
              💬 {c}
            </Text>
          ))}
          <Input
            key={`q${q.number}-comment`}
            label="Comment"
            placeholder="Add a comment on this question"
            value=""
            submitLabel="add"
            onSubmit={text => answer($, q.number, x => ({ ...x, comments: [...x.comments, text] }))}
          />
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {r.designTree !== undefined && <Markdown text={r.designTree} />}
        {r.questions.map(card)}
        {isDone ? (
          <Text dimColor>Submitted.</Text>
        ) : (
          <Button
            key="submit"
            label="Submit round"
            variant="primary"
            onPress={async () => {
              await update($, submitted, () => true)
              $.ui.status(undefined)
              await $.prompt.submit({ text: summaryOf(r, await read($, answers)) })
            }}
          />
        )}
      </Box>
    )
  })
}
