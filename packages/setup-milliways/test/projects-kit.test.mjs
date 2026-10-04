// The Projects kit that setup-milliways points to: the coordinator brief the
// chef pastes into a Claude Project's instructions, and the routine prompts.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'skills', 'setup-milliways', 'projects');
const ROUTINES = ['risk-digest', 'garden-sweep', 'garden-cluster', 'upstream-sync'];

// Claude Projects caps project instructions at 16,000 characters.
const PROJECT_INSTRUCTIONS_LIMIT = 16_000;

describe('coordinator brief', () => {
  test("fits in a Claude Project's instructions", () => {
    const brief = readFileSync(join(KIT, 'coordinator-brief.md'), 'utf8');
    // UTF-16 length is never shorter than the character count, so it is the safe measure.
    assert.ok(brief.length < PROJECT_INSTRUCTIONS_LIMIT, `the brief is ${brief.length} characters; the limit is ${PROJECT_INSTRUCTIONS_LIMIT}`);
  });
});

describe('routine prompts', () => {
  for (const name of ROUTINES) {
    test(`${name} has settings and a prompt to paste`, () => {
      const file = join(KIT, 'routines', `${name}.md`);
      assert.ok(existsSync(file), `missing ${file}`);
      const text = readFileSync(file, 'utf8');
      const at = text.indexOf('\n## Prompt\n');
      assert.ok(at > 0, `${name}.md has no "## Prompt" section`);
      assert.ok(text.slice(at + '\n## Prompt\n'.length).trim().length > 0, `${name}.md has an empty prompt`);
    });
  }
});
