import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Sandbox } from '../support/harness.ts';

let sandbox: Sandbox;

afterEach(async () => {
  await sandbox?.dispose(['c1']);
});

const round = (body: string) => `# Code

❓ **Q1** - **Change**: Which change?

${body}
➡️ Yes.
`;

describe('code blocks at present', () => {
  it('notes an unknown language, shows it as plain text, and still shows the round', async () => {
    sandbox = new Sandbox('c1');
    const file = sandbox.writeRound(
      'round.md',
      round(
        [
          '```zig id=main title="Entry point"',
          'pub fn main() void {}',
          '```',
          '',
          '```code id=page lang=html file="index.html" startLine=3 highlight=4',
          '<main>',
          '  <h1>Hi</h1>',
          '</main>',
          '```',
          '',
        ].join('\n'),
      ),
    );
    const result = await sandbox.cli(['present', '--agent', 'Claude Code', file, '--no-open']);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\n$/);
    expect(result.stderr).toBe(`${file}:5 · Q1 · illustration "main" (zig): note: "zig" is not a highlighted language, so it shows as plain text\n`);
    expect(existsSync(join(sandbox.sessionDir('c1'), 'rounds', 'round-1.md'))).toBe(true);
  });

  it('rejects a diff that parses to no files, and one that is not a unified diff', async () => {
    sandbox = new Sandbox('c1');
    const file = sandbox.writeRound(
      'round.md',
      round(
        [
          '```diff id=nothing',
          'just some prose, not a diff',
          '```',
          '',
          '```diff id=good',
          '--- a/src/app.ts',
          '+++ b/src/app.ts',
          '@@ -1,1 +1,1 @@',
          '-let a = 1;',
          '+let a = 2;',
          '```',
          '',
        ].join('\n'),
      ),
    );
    const result = await sandbox.cli(['present', '--agent', 'Claude Code', file, '--no-open']);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      `${file}:5 · Q1 · illustration "nothing" (diff): the diff has no files; write it as a unified diff: --- a/path, +++ b/path, then @@ hunks\n`,
    );
    expect(existsSync(sandbox.sessionDir('c1'))).toBe(false);
  });

  it('shows diffs over several files, recounting hand-written hunk headers', async () => {
    sandbox = new Sandbox('c1');
    const file = sandbox.writeRound(
      'round.md',
      round(
        [
          '```diff id=change',
          'diff --git a/src/app.ts b/src/app.ts',
          '--- a/src/app.ts',
          '+++ b/src/app.ts',
          '@@ -10,2 +10,2 @@ export function start() {',
          '   const port = 0;',
          '-  listen(port);',
          '+  listen(port, "127.0.0.1");',
          '+  log(port);',
          '   return port;',
          'diff --git a/README.md b/README.md',
          '--- a/README.md',
          '+++ b/README.md',
          '@@ -1 +1 @@',
          '-# App',
          '+# The app',
          '```',
          '',
        ].join('\n'),
      ),
    );
    const result = await sandbox.cli(['present', '--agent', 'Claude Code', file, '--no-open']);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });
});
