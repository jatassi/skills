import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CHECKS, Fixture, type FixtureUpstream, SUBSTITUTIONS } from './fixture.ts';

const SKILL = `---
name: foo
---

# Foo

1. Read the brief.
2. Spawn a helper with the Task tool.
3. Report back.
`;

let fx: Fixture;
let up: FixtureUpstream;
let first: string;

/** A plugin vendoring skills/foo from one fixture upstream, pinned at `first`. */
function setup(extra: Record<string, unknown> = {}) {
  fx.write({
    'vendor/upstream.json': {
      upstreams: {
        acme: { repo: up.dir, commit: first, watch: ['skills'], include: { 'skills/foo': 'skills/foo' }, exclude: {}, ...extra },
      },
    },
    'vendor/substitutions.json': SUBSTITUTIONS,
    'vendor/forks.json': {},
    'vendor/checks.json': CHECKS,
  });
}

beforeEach(() => {
  fx = new Fixture();
  up = fx.upstream('acme');
  first = up.commit({ 'skills/foo/SKILL.md': SKILL, 'skills/bar/SKILL.md': '# Bar\n', 'README.md': '# acme\n' });
});

afterEach(() => fx.cleanup());

describe('a clean sync', () => {
  test('vendors an include with substitutions applied, and check passes', () => {
    setup();
    const result = fx.run('sync');
    expect(result.out).toContain('added: skills/foo/SKILL.md');
    expect(result.status).toBe(0);
    expect(fx.read('skills/foo/SKILL.md')).toBe(SKILL.replace('the Task tool', 'the Agent tool'));
    expect(fx.read('skills/bar/SKILL.md')).toBeUndefined();
    expect(fx.run('check')).toMatchObject({ status: 0 });
  });

  test('is idempotent', () => {
    setup();
    expect(fx.run('sync').status).toBe(0);
    const again = fx.run('sync');
    expect(again.status).toBe(0);
    expect(again.out).not.toMatch(/added|updated|deleted/);
  });
});

describe('sync to a new upstream commit', () => {
  beforeEach(() => {
    setup();
    expect(fx.run('sync').status).toBe(0);
  });

  test('updates, adds and deletes vendored files, and moves the pin', () => {
    up.commit({ 'skills/foo/SKILL.md': SKILL.replace('3. Report back.', '3. Report back briefly.'), 'skills/foo/ref.md': 'ref\n' });
    const head = up.commit({ 'skills/foo/ref.md': null, 'skills/foo/other.md': 'other\n' });
    const result = fx.run('sync', '--to', 'HEAD');
    expect(result.status).toBe(0);
    expect(result.out).toContain('updated: skills/foo/SKILL.md');
    expect(result.out).toContain('added: skills/foo/other.md');
    expect(fx.read('skills/foo/SKILL.md')).toContain('3. Report back briefly.');
    expect(fx.read('skills/foo/other.md')).toBe('other\n');
    expect(fx.json('vendor/upstream.json').upstreams.acme.commit).toBe(head);
    expect(fx.run('check').status).toBe(0);
  });

  test('a declared fork that upstream left alone is kept', () => {
    const forked = fx.read('skills/foo/SKILL.md')!.replace('1. Read the brief.', '1. Read the brief twice.');
    fx.write({
      'skills/foo/SKILL.md': forked,
      'vendor/forks.json': { 'skills/foo/SKILL.md': { kind: 'policy', why: 'Reads the brief twice.' } },
    });
    expect(fx.run('check').status).toBe(0);
    up.commit({ 'skills/foo/extra.md': 'extra\n' });
    const result = fx.run('sync', '--to', 'HEAD');
    expect(result.status).toBe(0);
    expect(result.out).toContain('fork kept: skills/foo/SKILL.md');
    expect(fx.read('skills/foo/SKILL.md')).toBe(forked);
  });
});

describe('an upstream change colliding with a declared fork', () => {
  beforeEach(() => {
    setup();
    expect(fx.run('sync').status).toBe(0);
    fx.write({
      'skills/foo/SKILL.md': fx.read('skills/foo/SKILL.md')!.replace('1. Read the brief.', '1. Read the brief twice.'),
      'vendor/forks.json': { 'skills/foo/SKILL.md': { kind: 'policy', why: 'Reads the brief twice.' } },
    });
  });

  test('a change elsewhere in the file merges into the fork', () => {
    up.commit({ 'skills/foo/SKILL.md': SKILL.replace('3. Report back.', '3. Report back briefly.') });
    const result = fx.run('sync', '--to', 'HEAD');
    expect(result.status).toBe(0);
    expect(result.out).toContain('merged into fork: skills/foo/SKILL.md');
    const merged = fx.read('skills/foo/SKILL.md')!;
    expect(merged).toContain('1. Read the brief twice.');
    expect(merged).toContain('3. Report back briefly.');
    expect(merged).toContain('the Agent tool');
  });

  test('a change to the forked lines is written as a conflict, and check fails until resolved', () => {
    const head = up.commit({ 'skills/foo/SKILL.md': SKILL.replace('1. Read the brief.', '1. Skim the brief.') });
    const result = fx.run('sync', '--to', 'HEAD');
    expect(result.status).toBe(1);
    expect(result.out).toContain('CONFLICT: skills/foo/SKILL.md');
    const text = fx.read('skills/foo/SKILL.md')!;
    expect(text).toContain('<<<<<<< local\n1. Read the brief twice.\n=======\n1. Skim the brief.\n>>>>>>> upstream');
    expect(fx.json('vendor/upstream.json').upstreams.acme.commit).toBe(head);
    const verdict = fx.run('check');
    expect(verdict.status).toBe(1);
    expect(verdict.out).toContain('[conflict-marker]');

    fx.write({ 'skills/foo/SKILL.md': text.replace(/<<<<<<< local\n(.*)\n=======\n.*\n>>>>>>> upstream\n/, '1. Skim the brief twice.\n') });
    expect(fx.run('check').status).toBe(0);
  });
});

describe('an undeclared divergence', () => {
  beforeEach(() => {
    setup();
    expect(fx.run('sync').status).toBe(0);
    fx.write({ 'skills/foo/SKILL.md': `${fx.read('skills/foo/SKILL.md')}4. Celebrate.\n`, 'skills/foo/mine.md': 'mine\n' });
  });

  test('fails check', () => {
    const result = fx.run('check');
    expect(result.status).toBe(1);
    expect(result.out).toContain('skills/foo/SKILL.md [undeclared-divergence]');
    expect(result.out).toContain('skills/foo/mine.md [undeclared-divergence]');
  });

  test('stops sync before it writes anything', () => {
    const pin = fx.read('vendor/upstream.json');
    up.commit({ 'skills/foo/SKILL.md': SKILL.replace('3. Report back.', '3. Report back briefly.') });
    const result = fx.run('sync', '--to', 'HEAD');
    expect(result.status).toBe(1);
    expect(result.out).toContain('sync stopped, nothing written');
    expect(result.out).toContain('skills/foo/SKILL.md (acme)');
    expect(fx.read('vendor/upstream.json')).toBe(pin);
    expect(fx.read('skills/foo/SKILL.md')).toContain('4. Celebrate.');
  });

  test('sync --overwrite restores the derived form', () => {
    const result = fx.run('sync', '--overwrite');
    expect(result.status).toBe(0);
    expect(result.out).toContain('deleted: skills/foo/mine.md');
    expect(fx.read('skills/foo/SKILL.md')).not.toContain('4. Celebrate.');
    expect(fx.read('skills/foo/mine.md')).toBeUndefined();
  });

  test('declaring it a fork satisfies check', () => {
    fx.write({
      'vendor/forks.json': {
        'skills/foo/SKILL.md': { kind: 'policy', why: 'Ends with a celebration.' },
        'skills/foo/mine.md': { kind: 'port-feature', why: 'Notes for this port.' },
      },
    });
    expect(fx.run('check').status).toBe(0);
  });
});

describe('a new upstream skill to triage', () => {
  beforeEach(() => {
    setup();
    expect(fx.run('sync').status).toBe(0);
  });

  test('is reported by the sync that first sees it, and vendors nothing', () => {
    up.commit({ 'skills/baz/SKILL.md': '# Baz\n' });
    const result = fx.run('sync', '--to', 'HEAD');
    expect(result.status).toBe(0);
    expect(result.out).toMatch(/new upstream skill to triage.*: skills\/baz/);
    expect(result.out).not.toMatch(/triage.*skills\/bar/);
    expect(fx.read('skills/baz/SKILL.md')).toBeUndefined();
  });

  test('is not reported once excluded', () => {
    setup({ exclude: { 'skills/baz': 'Not for this kitchen.' } });
    up.commit({ 'skills/baz/SKILL.md': '# Baz\n' });
    const result = fx.run('sync', '--to', 'HEAD');
    expect(result.status).toBe(0);
    expect(result.out).not.toContain('skills/baz');
  });
});

describe('check', () => {
  test('rejects denylisted lines, un-namespaced agent types and playbooks naming missing skills', () => {
    first = up.commit({
      'skills/foo/SKILL.md': [
        'Ask with AskQuestion.',
        'Use claude-opus-4-7 for this.',
        'Read CLAUDE.md first.',
        'Spawn `subagent_type`: `general-purpose` or `subagent_type`: `milliways:helper`.',
        'Spawn subagent_type: "poteto-agent".',
        '',
      ].join('\n'),
      'skills/foo/playbooks/fix.md': '1. Run the **foo** skill.\n2. Run the **nope** skill.\n',
    });
    setup();
    fx.write({ 'agents/helper.md': '# helper\n' });
    expect(fx.run('sync').status).toBe(1);
    const result = fx.run('check');
    expect(result.status).toBe(1);
    expect(result.out).toContain('skills/foo/SKILL.md:1 [cursor-ism]');
    expect(result.out).toContain('skills/foo/SKILL.md:2 [model-version]');
    expect(result.out).toContain('skills/foo/SKILL.md:3 [claude-md]');
    expect(result.out).toContain('skills/foo/SKILL.md:5 [agent-namespace] agent type "poteto-agent"');
    expect(result.out).not.toContain('SKILL.md:4');
    expect(result.out).toContain('skills/foo/playbooks/fix.md:2 [missing-skill] playbook step names "nope"');
    expect(result.out).not.toContain('fix.md:1');
  });

  test('rejects a stale fork and a fork outside every include', () => {
    setup();
    expect(fx.run('sync').status).toBe(0);
    fx.write({
      'vendor/forks.json': {
        'skills/foo/SKILL.md': { kind: 'policy', why: 'Was forked once.' },
        'skills/elsewhere/SKILL.md': { kind: 'policy', why: 'Not vendored.' },
      },
    });
    const result = fx.run('check');
    expect(result.status).toBe(1);
    expect(result.out).toContain('skills/foo/SKILL.md [stale-fork]');
    expect(result.out).toContain('skills/elsewhere/SKILL.md [unknown-fork]');
  });

  test('copies verbatim includes byte for byte and does not lint them', () => {
    first = up.commit({ LICENSE: 'MIT. Use the Task tool. CLAUDE.md\n' });
    setup({ include: { 'skills/foo': 'skills/foo', 'LICENSES/acme.txt': { path: 'LICENSE', verbatim: true } } });
    expect(fx.run('sync').status).toBe(0);
    expect(fx.read('LICENSES/acme.txt')).toBe('MIT. Use the Task tool. CLAUDE.md\n');
  });

  test('a bad config is a usage error naming the file', () => {
    setup();
    fx.write({ 'vendor/forks.json': { 'skills/foo/SKILL.md': { kind: 'whim', why: 'x' } } });
    const result = fx.run('check');
    expect(result.status).toBe(2);
    expect(result.out).toContain('forks.json "skills/foo/SKILL.md": "kind" must be "policy" or "port-feature"');
  });
});
