import { describe, expect, it } from 'vitest';
import { firstSentence, renderSubmission, type SubmissionRecord } from '../../src/core/submission.ts';

const RECORD_PATH = '/tmp/visual-grilling/a1b2/submissions/round-3.json';
const golden = (name: string) => `./golden/${name}.txt`;

describe('renderSubmission', () => {
  it('renders every answer mode, comments, warnings and the summary', async () => {
    const record: SubmissionRecord = {
      round: 3,
      title: 'Storage choices',
      submittedAt: '2026-09-27T10:00:00.000Z',
      questions: [
        {
          number: 1,
          title: 'Where are rounds saved?',
          verdict: {
            mode: 'accepted',
            option: 'A',
            label: 'Session folder in $TMPDIR',
            recommendation: 'A because it is cleaned up with the session.',
          },
          comments: [],
          warnings: [],
        },
        {
          number: 2,
          title: 'Which runtime?',
          verdict: { mode: 'picked', option: 'B', label: 'Bun' },
          comments: [{ anchor: 'chart "Cold start" → bar "runtime: Bun; ms: 60"', text: 'is this warm or cold?' }],
          warnings: [
            {
              kind: 'draw',
              illustration: { id: 'flow', lang: 'mermaid' },
              message: 'Parse error on line 2:\nExpecting NODE',
            },
          ],
        },
        {
          number: 3,
          title: 'Retention?',
          verdict: { mode: 'own', text: 'keep them until the "repo" is\ncleaned' },
          comments: [],
          warnings: [],
        },
        { number: 4, title: 'Submit control placement', verdict: { mode: 'unsure' }, comments: [], warnings: [] },
        { number: 5, title: 'Tree column', verdict: { mode: 'none' }, comments: [], warnings: [] },
        {
          number: 6,
          title: 'Error copy',
          verdict: { mode: 'none' },
          comments: [
            {
              anchor: 'html "Error banner" → unlabeled shape',
              text: 'too loud',
              weak: { near: 'Retry', across: 72, down: 40, crop: '/tmp/visual-grilling/a1b2/crops/r3-q6-c1.png' },
            },
            { anchor: 'html "Error banner" → button "Retry"', text: 'fine' },
          ],
          warnings: [{ kind: 'script', illustration: { id: 'banner', lang: 'html' }, message: 'x is not defined' }],
        },
        {
          number: 7,
          title: 'Retry policy',
          verdict: {
            mode: 'accepted',
            recommendation: 'Retry three times with backoff. Anything more hides real outages.',
          },
          comments: [],
          warnings: [],
        },
      ],
    };
    await expect(renderSubmission(record, RECORD_PATH)).toMatchFileSnapshot(golden('every-mode'));
  });

  it('leaves out the title and the warning count when there are none', async () => {
    const record: SubmissionRecord = {
      round: 1,
      submittedAt: '2026-09-27T10:00:00.000Z',
      questions: [
        {
          number: 2,
          title: 'Only question',
          verdict: { mode: 'unsure' },
          comments: [{ anchor: 'table "Costs" → cell row "MCP", column "Install"', text: 'one' }],
          warnings: [{ kind: 'draw', illustration: { id: 'costs', lang: 'table' }, message: 'boom' }],
        },
      ],
    };
    await expect(renderSubmission(record, RECORD_PATH)).toMatchFileSnapshot(golden('untitled'));
  });
});

describe('firstSentence', () => {
  it('keeps a short first sentence whole', () => {
    expect(firstSentence('Use the session folder. It is cleaned up.')).toBe('Use the session folder.');
  });

  it('keeps text with no sentence end', () => {
    expect(firstSentence('the session folder')).toBe('the session folder');
  });

  it('does not end a sentence inside a version or path', () => {
    expect(firstSentence('Pin Node 22.22.2 as the floor. Raise it later.')).toBe('Pin Node 22.22.2 as the floor.');
  });

  it('cuts a long sentence at a word boundary to about 80 characters', () => {
    const text =
      'Keep every round and submission in the session folder under the temp directory, so cleanup is a single delete, and nothing leaks.';
    const cut = firstSentence(text);
    expect(cut).toBe('Keep every round and submission in the session folder under the temp directory…');
    expect(cut.length).toBeLessThanOrEqual(80);
  });
});
