import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_IDS, identifyAgent } from '../../src/core/agents.ts';

const LOGOS = resolve(import.meta.dirname, '../../src/agents/logos');

describe('agent logos', () => {
  it('has exactly one logo per agent id', () => {
    const logos = readdirSync(LOGOS)
      .filter((file) => file.endsWith('.svg'))
      .map((file) => file.slice(0, -'.svg'.length));
    expect(logos.sort()).toEqual([...AGENT_IDS].sort());
  });

  it.each(AGENT_IDS)('%s is a plain SVG with a viewBox and no script', (id) => {
    const svg = readFileSync(join(LOGOS, `${id}.svg`), 'utf8');
    expect(svg).toMatch(/^<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toMatch(/^<svg\b[^>]*\bviewBox="/);
    expect(svg).not.toMatch(/<script|<foreignObject|\son[a-z]+=|javascript:/i);
    // Only inline data: images, never a network fetch.
    expect(svg).not.toMatch(/href="(?!data:|#)/);
  });

  it('lists every logo in SOURCES.md', () => {
    const sources = readFileSync(join(LOGOS, 'SOURCES.md'), 'utf8');
    for (const id of AGENT_IDS) expect(sources).toContain(`| \`${id}\` |`);
  });
});

describe('identifyAgent', () => {
  it.each([
    // The id, the name, and any spelling of them.
    ['claude-code', 'claude-code'],
    ['Claude Code', 'claude-code'],
    ['CLAUDE_CODE', 'claude-code'],
    ['ClaudeCode', 'claude-code'],
    ['claudecode', 'claude-code'],
    // Extra words, versions and models around the name.
    ['Claude Code v2.1.4 (Opus 4.6)', 'claude-code'],
    ["Anthropic's Claude Code CLI", 'claude-code'],
    ['Claude Code by Anthropic', 'claude-code'],
    ['anthropic-claudecode-cli', 'claude-code'],
    ['Claude', 'claude'],
    ['claude.ai', 'claude'],
    // Aliases.
    ['OpenAI Codex', 'codex'],
    ['codex-cli 0.48', 'codex'],
    ['GPT-5 Codex', 'codex'],
    ['ChatGPT', 'chatgpt'],
    ['Gemini', 'gemini-cli'],
    ['gemini-cli', 'gemini-cli'],
    ['Copilot', 'github-copilot'],
    ['GitHub Copilot in VS Code', 'github-copilot'],
    ['Visual Studio Code', 'vscode'],
    ['Cursor Agent', 'cursor'],
    ['Cascade', 'windsurf'],
    ['Droid', 'factory'],
    ['Factory', 'factory'],
    ['Roo', 'roo-code'],
    ['RooCode', 'roo-code'],
    ['Kilo', 'kilo-code'],
    ['qwen', 'qwen-code'],
    ['Kimi Code', 'kimi-cli'],
    ['Cortex Code', 'snowflake-cortex-code'],
    ['Genie Code', 'databricks-genie-code'],
    ['amp', 'amp'],
    ['Amp', 'amp'],
    ['pi', 'pi'],
    ['Goose', 'goose'],
    ['opencode', 'opencode'],
    ['OpenHands', 'openhands'],
    ['Junie', 'junie'],
    ['Zed', 'zed'],
    ['VT Code', 'vt-code'],
    ['fast-agent', 'fast-agent'],
  ])('%s → %s', (given, id) => {
    expect(identifyAgent(given).id).toBe(id);
  });

  it('names a matched agent by its catalogue name', () => {
    expect(identifyAgent('claude_code')).toEqual({ id: 'claude-code', name: 'Claude Code' });
  });

  it("doesn't find a short name inside another word", () => {
    // "pi" in "copilot" or "spring", "amp" in "example".
    expect(identifyAgent('copilot').id).toBe('github-copilot');
    expect(identifyAgent('Spring AI').id).toBe('spring-ai');
    expect(identifyAgent('example agent').id).toBe('other');
  });

  it('shows an agent it does not know under the name it gave', () => {
    expect(identifyAgent('  Brand New   Agent ')).toEqual({ id: 'other', name: 'Brand New Agent' });
    expect(identifyAgent('x'.repeat(100)).name).toHaveLength(40);
  });

  it('never matches `other` by name', () => {
    expect(identifyAgent('other')).toEqual({ id: 'other', name: 'other' });
  });
});
