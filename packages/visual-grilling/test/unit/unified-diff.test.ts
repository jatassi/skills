import { describe, expect, it } from 'vitest';
import { recountHunks } from '../../src/core/unified-diff.ts';

describe('recounting hunks', () => {
  it('fixes miscounted hunk headers, keeping the start lines and the section text', () => {
    const diff = ['--- a/x.ts', '+++ b/x.ts', '@@ -10,9 +10,1 @@ function x() {', ' a', '-b', '+c', '+d', ' e'].join('\n');
    expect(recountHunks(diff).split('\n')[2]).toBe('@@ -10,3 +10,4 @@ function x() {');
  });

  it('reads an empty line inside a hunk as a blank context line, but not a trailing one', () => {
    const diff = ['--- a/x', '+++ b/x', '@@ -1 +1 @@', ' a', '', '-b', '+c', '', ''].join('\n');
    expect(recountHunks(diff).split('\n')).toEqual(['--- a/x', '+++ b/x', '@@ -1,3 +1,3 @@', ' a', ' ', '-b', '+c', '', '']);
  });

  it('ends a hunk at the next file, the next hunk, or a line that is not a diff line', () => {
    const diff = [
      'diff --git a/x b/x',
      '--- a/x',
      '+++ b/x',
      '@@ -1,1 +1,1 @@',
      '-a',
      '+b',
      '@@ -9,1 +9,1 @@',
      ' z',
      '--- a/y',
      '+++ b/y',
      '@@ -1,5 +1,5 @@',
      '--- deleted line that looks like a header',
      '+new',
      'trailing prose',
    ].join('\n');
    expect(recountHunks(diff).split('\n').filter((line) => line.startsWith('@@'))).toEqual([
      '@@ -1,1 +1,1 @@',
      '@@ -9,1 +9,1 @@',
      '@@ -1,1 +1,1 @@',
    ]);
  });

  it('leaves a new file’s empty old side at 0', () => {
    const diff = ['--- /dev/null', '+++ b/new.ts', '@@ -0,0 +1,5 @@', '+a', '+b'].join('\n');
    expect(recountHunks(diff).split('\n')[2]).toBe('@@ -0,0 +1,2 @@');
  });
});
