export type Illustration =
  | { kind: 'svg'; id: string; title?: string; svg: string; alt: string }
  | { kind: 'code'; id: string; title?: string; lang?: string; source: string }
  | { kind: 'markdown'; id: string; title?: string; source: string }

export type Option = { letter: string; label: string }

export type Question = {
  number: number
  title: string
  prose: string
  illustrations: Illustration[]
  options: Option[]
  recommendation: string
  recommendedOption?: string
}

export type Round = { title?: string; designTree?: string; questions: Question[] }

export type Verdict =
  | { kind: 'accepted' }
  | { kind: 'option'; letter: string }
  | { kind: 'text'; text: string }
  | { kind: 'unsure' }

export type Answer = { verdict?: Verdict; comments: string[] }

declare module 'claude-code' {
  interface PluginState {
    'visual-grilling-mod': {
      round: Round | null
      answers: Record<string, Answer>
      submitted: boolean
    }
  }
}
