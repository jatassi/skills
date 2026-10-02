// The agents `present --agent` recognises, and how a name an agent gives for
// itself is matched to one. Each id has exactly one logo at
// src/agents/logos/<id>.svg (the build copies them to page/agents/); a unit
// test holds the two lists equal.
//
// Matching is generous: case, punctuation, camelCase, version numbers and
// extra words are ignored, so "Claude Code", "claude-code", "ClaudeCode v2.1
// (Opus)" and "Anthropic's Claude Code CLI" all name claude-code. A name that
// matches nothing is shown as given, with the generic `other` logo.

export interface AgentInfo {
  name: string;
  /** Other names an agent may give itself. The id and name always match too. */
  aliases?: string[];
}

export const AGENTS = {
  'claude-code': { name: 'Claude Code', aliases: ['claude code cli', 'anthropic claude code', 'claude agent sdk'] },
  claude: { name: 'Claude', aliases: ['claude ai', 'claude desktop', 'claude app', 'anthropic claude', 'anthropic'] },
  codex: { name: 'Codex', aliases: ['openai codex', 'codex cli', 'chatgpt codex'] },
  chatgpt: { name: 'ChatGPT', aliases: ['openai', 'chat gpt', 'chatgpt work', 'gpt'] },
  'gemini-cli': { name: 'Gemini CLI', aliases: ['gemini', 'google gemini', 'gemini code assist', 'jules', 'google jules'] },
  antigravity: { name: 'Google Antigravity', aliases: ['antigravity ide'] },
  'github-copilot': {
    name: 'GitHub Copilot',
    aliases: ['copilot', 'copilot cli', 'copilot chat', 'copilot agent', 'copilot coding agent', 'gh copilot'],
  },
  vscode: { name: 'VS Code', aliases: ['visual studio code', 'vs code agent', 'code oss'] },
  cursor: { name: 'Cursor', aliases: ['cursor agent', 'cursor cli', 'cursor ide'] },
  windsurf: { name: 'Windsurf', aliases: ['cascade', 'windsurf cascade', 'codeium', 'devin windsurf'] },
  amp: { name: 'Amp', aliases: ['ampcode', 'sourcegraph amp'] },
  opencode: { name: 'OpenCode', aliases: ['sst opencode', 'open code'] },
  openhands: { name: 'OpenHands', aliases: ['open hands', 'all hands', 'openhands cli', 'opendevin'] },
  goose: { name: 'Goose', aliases: ['block goose', 'codename goose'] },
  junie: { name: 'Junie', aliases: ['jetbrains junie', 'jetbrains', 'intellij', 'jetbrains ai'] },
  kiro: { name: 'Kiro', aliases: ['amazon kiro', 'aws kiro', 'kiro cli', 'amazon q', 'amazon q developer'] },
  cline: { name: 'Cline', aliases: ['claude dev'] },
  'roo-code': { name: 'Roo Code', aliases: ['roo', 'roocode', 'roo cline'] },
  'kilo-code': { name: 'Kilo Code', aliases: ['kilo', 'kilocode'] },
  trae: { name: 'TRAE', aliases: ['trae ide', 'trae agent', 'bytedance trae'] },
  'qwen-code': { name: 'Qwen Code', aliases: ['qwen', 'qwen cli', 'alibaba qwen'] },
  'kimi-cli': { name: 'Kimi CLI', aliases: ['kimi', 'kimi code', 'moonshot kimi', 'moonshot'] },
  qoder: { name: 'Qoder', aliases: ['qoder cli'] },
  codebuddy: { name: 'CodeBuddy', aliases: ['code buddy', 'tencent codebuddy'] },
  devin: { name: 'Devin', aliases: ['cognition devin', 'cognition'] },
  replit: { name: 'Replit Agent', aliases: ['replit', 'replit ai'] },
  'command-code': { name: 'Command Code', aliases: ['commandcode'] },
  'hermes-agent': { name: 'Hermes Agent', aliases: ['hermes', 'nous hermes', 'nous research'] },
  openclaw: { name: 'OpenClaw', aliases: ['open claw', 'clawdbot', 'moltbot'] },
  'snowflake-cortex-code': { name: 'Snowflake Cortex Code', aliases: ['cortex code', 'snowflake cortex', 'snowflake'] },
  zed: { name: 'Zed', aliases: ['zed agent', 'zed editor', 'zed industries'] },
  warp: { name: 'Warp', aliases: ['warp terminal', 'warp agent'] },
  qodo: { name: 'Qodo', aliases: ['qodo gen', 'qodo command', 'codium ai', 'codiumai'] },
  'databricks-genie-code': { name: 'Databricks Genie Code', aliases: ['genie code', 'databricks', 'databricks assistant'] },
  'spring-ai': { name: 'Spring AI', aliases: ['spring'] },
  letta: { name: 'Letta', aliases: ['letta code', 'memgpt'] },
  piebald: { name: 'Piebald' },
  tabnine: { name: 'Tabnine', aliases: ['tab nine', 'tabnine cli'] },
  'laravel-boost': { name: 'Laravel Boost', aliases: ['laravel', 'boost'] },
  agentman: { name: 'Agentman' },
  emdash: { name: 'Emdash' },
  autohand: { name: 'Autohand Code', aliases: ['autohand', 'autohand code cli'] },
  'mistral-vibe': { name: 'Mistral Vibe', aliases: ['vibe', 'mistral', 'mistral ai vibe', 'mistral code'] },
  pi: { name: 'pi', aliases: ['pi coding agent', 'pi mono'] },
  bub: { name: 'Bub' },
  'deep-code': { name: 'Deep Code', aliases: ['deepcode', 'deepseek', 'deepseek code'] },
  'pulumi-neo': { name: 'Pulumi Neo', aliases: ['pulumi', 'neo'] },
  'google-ai-edge-gallery': { name: 'Google AI Edge Gallery', aliases: ['ai edge gallery', 'edge gallery'] },
  factory: { name: 'Factory Droid', aliases: ['factory', 'droid', 'factory ai', 'droids'] },
  firebender: { name: 'Firebender' },
  ona: { name: 'Ona', aliases: ['gitpod', 'ona agent'] },
  workshop: { name: 'Workshop', aliases: ['workshop ai'] },
  'fast-agent': { name: 'fast-agent', aliases: ['fastagent'] },
  vita: { name: 'Vita', aliases: ['vita ai'] },
  superconductor: { name: 'Superconductor' },
  'vt-code': { name: 'VT Code', aliases: ['vtcode'] },
  mux: { name: 'Mux', aliases: ['coder mux'] },
  nanobot: { name: 'nanobot', aliases: ['nano bot'] },
  zeroclaw: { name: 'ZeroClaw', aliases: ['zero claw'] },
  /** Any agent not listed above. Never matched by name; the fallback. */
  other: { name: 'Agent' },
} as const satisfies Record<string, AgentInfo>;

export type AgentId = keyof typeof AGENTS;

export const AGENT_IDS = Object.keys(AGENTS) as AgentId[];

/** The agent a session's page shows: who it matched, and the name to show. */
export interface AgentIdentity {
  id: AgentId;
  /** The catalogue name, or for `other` the name the agent gave (trimmed). */
  name: string;
}

const MAX_NAME = 40;

// Words that say nothing about which agent it is.
const NOISE = new Set(['the', 'a', 'an', 'by', 'of', 'from', 'for', 'on', 'in', 'via', 'using', 'with', 'and', 's']);

/** "ClaudeCode v2.1 (Opus)" → ["claude", "code", "v2", "1", "opus"]. */
function words(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '' && !NOISE.has(word));
}

interface Key {
  id: AgentId;
  words: string[];
  joined: string;
}

const KEYS: Key[] = AGENT_IDS.filter((id) => id !== 'other').flatMap((id) => {
  const info: AgentInfo = AGENTS[id];
  return [id, info.name, ...(info.aliases ?? [])].map((alias) => {
    const aliasWords = words(alias);
    return { id, words: aliasWords, joined: aliasWords.join('') };
  });
});

const BY_LENGTH = [...KEYS].sort((a, b) => b.joined.length - a.joined.length || b.words.length - a.words.length);

/** Where `needle` occurs as consecutive words of `haystack`, or -1. */
function wordsAt(haystack: string[], needle: string[]): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/**
 * The agent a self-given name names. Tried in order, the first that finds one wins:
 *  1. the whole name, ignoring case, spacing and punctuation ("claude-code", "Claude Code");
 *  2. the longest alias found in it, either as whole words ("Claude Code CLI v2") or, at
 *     4+ letters, glued inside one word ("anthropic-claudecode-cli").
 * Anything else is `other`, shown under the name it gave.
 */
export function identifyAgent(given: string): AgentIdentity {
  const text = given.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
  const found = matchAgent(text);
  return found ? { id: found, name: AGENTS[found].name } : { id: 'other', name: text || AGENTS.other.name };
}

function matchAgent(text: string): AgentId | undefined {
  const given = words(text);
  if (given.length === 0) return undefined;
  const joined = given.join('');

  const exact = KEYS.find((key) => key.joined === joined);
  if (exact) return exact.id;

  // Longest alias first, so "claude code" beats "claude" and "copilot" beats "pi".
  return BY_LENGTH.find(
    (key) =>
      wordsAt(given, key.words) !== -1 || (key.joined.length >= 4 && given.some((word) => word.includes(key.joined))),
  )?.id;
}
