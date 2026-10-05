// The multi-phase-plan playbook tells a thread to copy its skeleton into a
// plan file and then run the vendored check-plan.mjs over it. A forked line
// in the skeleton that check-plan rejects would fail every plan built on it.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PLAYBOOK = join(ROOT, 'skills', 'make-it-so', 'playbooks', 'multi-phase-plan.md');
const CHECK_PLAN = join(ROOT, 'skills', 'make-it-so', 'scripts', 'check-plan.mjs');

function skeleton(): string {
  const text = readFileSync(PLAYBOOK, 'utf8');
  const match = text.match(/^````markdown\n([\s\S]*?)^````$/m);
  if (!match) throw new Error('multi-phase-plan.md has no ````markdown skeleton');
  return match[1]!;
}

test('the multi-phase-plan skeleton passes check-plan once its live-lane model is filled in', () => {
  // check-plan requires the live lanes' model to be filled in; every other placeholder may stay.
  const plan = skeleton().replace('Ten lanes on `<verifier model>`', 'Ten lanes on `opus`');
  const dir = mkdtempSync(join(tmpdir(), 'check-plan-'));
  try {
    const file = join(dir, 'plan.md');
    writeFileSync(file, plan);
    const run = spawnSync(process.execPath, [CHECK_PLAN, file], { encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.stdout).toContain('1 PR sections, 0 problems');
    expect(run.status).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
