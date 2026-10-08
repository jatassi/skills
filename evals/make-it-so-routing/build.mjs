#!/usr/bin/env node
// Writes one case.yaml per routing case under cases/, from the list below.
// Rerun after editing the list: node evals/make-it-so-routing/build.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Bare names: a description here would do the routing for the router.
const ROUTES = [
  'wayfinder', 'prototype', 'grilling', 'grill-with-docs', 'spec-and-tickets', 'feature', 'bug-fix',
  'perf-issue', 'investigation', 'refactoring', 'babysit', 'shipping', 'authoring-a-skill',
];

// The repo's AGENTS.md line, plus a stop after routing so each run is one decision.
const SYSTEM = `Start every non-trivial task with the milliways:make-it-so skill.

In this session, route only. Load make-it-so, apply its rules to the user's request, and do none of the work: no questions, no file reads, no todo list. Reply with one sentence on why, then a last line of the form \`ROUTE: <id>\`, where <id> names the first skill or playbook make-it-so sends the request to: a skill by its name, a playbook by its file name without .md. One of: ${ROUTES.join(', ')}.`;

// [slug, split, route, prompt, ...extra tags]. A label is the route the owner
// intends (the routing rule, the Playbooks list, the large-work order, the
// reasons in vendor/forks.json), not what the current text happens to pick.
// Tune drives edits. Holdout only vetoes them.
const CASES = [
  ['session-store-ticket', 'tune', 'wayfinder', "Pick up #212, \"Session tokens: Redis or Postgres?\". It's labelled wayfinder:prototype and sits under the auth map, #200. Measure both under our load script and settle it."],
  ['billing-noun-ticket', 'tune', 'wayfinder', 'Work #318, "Which word do users see for what they pay for: plan, tier or subscription?" (label wayfinder:grilling).'],
  ['flag-scaffold-ticket', 'tune', 'wayfinder', '#455 is labelled wayfinder:task: "Add a feature-flag scaffold so later tickets can toggle the new parser." Go ahead.'],
  ['drop-v1-ticket', 'tune', 'wayfinder', 'Ticket #91 from the API migration map (wayfinder:grilling) asks whether we can drop the v1 REST endpoints that customers still call. Resolve it.'],
  ['indexer-research-ticket', 'holdout', 'wayfinder', 'Next up on the search-rewrite map: #77, wayfinder:research, "How does the current indexer batch its writes?"'],
  ['next-on-map-ticket', 'holdout', 'wayfinder', 'Take the next open ticket on the wayfinder map in #140 and resolve it.'],
  ['orm-swap', 'tune', 'wayfinder', "We want to replace our homegrown ORM with Drizzle across all 14 services and the shared libraries. It'll take weeks and a lot of decisions. Plan how we get there.", 'boundary'],
  ['offline-sync', 'holdout', 'wayfinder', "Rewrite the mobile app's offline sync from scratch. Nobody knows the conflict model yet, and it touches the server, both clients and the stored data format.", 'boundary'],
  ['settings-layout', 'tune', 'prototype', 'Not sure whether the settings page reads better as tabs or as one long scroll with anchors. Try both so we can pick.'],
  ['cli-progress', 'tune', 'prototype', "Should the CLI's progress output be a spinner or a percentage bar? Mock both up quickly."],
  ['fswatch-double-fire', 'holdout', 'prototype', 'Does fs.watch on macOS fire once or twice per save from VS Code? Our reload debounce depends on it, so which debounce approach should we use?'],
  ['grill-release-plan', 'tune', 'grilling', 'Grill me on my plan to move the team from weekly releases to continuous deploys.'],
  ['rename-out-flag', 'tune', 'grilling', "We're about to rename the public --out flag on our CLI to --output and drop the old one. Before you touch code, make sure this is really what I want."],
  ['tutorial-skip', 'holdout', 'grilling', "I'm thinking of skipping the onboarding tutorial for invited users. Stress-test that idea with me before anyone builds it."],
  ['free-tier-api', 'holdout', 'grilling', "Should the free tier include API access? It's a pricing call. Help me think it through."],
  ['workspace-terms', 'tune', 'grill-with-docs', "Interview me about how 'workspace', 'project' and 'org' relate in our domain, and capture what we decide in the glossary and an ADR."],
  ['account-senses', 'tune', 'grill-with-docs', "Our code says 'account' in three different senses. Question me until each has one meaning, written down in GLOSSARY.md."],
  ['failover-adrs', 'holdout', 'grill-with-docs', 'Sharpen my design for multi-region failover with me, and record each decision as an ADR as we go.'],
  ['oauth-switch', 'tune', 'spec-and-tickets', "We're switching auth from session cookies to OAuth against our own IdP. Before anything is built, pin down what I want, write it up as a spec and break it into tickets.", 'boundary'],
  ['team-billing', 'holdout', 'spec-and-tickets', "I have a rough idea for team billing: seats, invoices, proration. Maybe three or four PRs. Settle what I actually want, write the spec, and cut it into tickets.", 'boundary'],
  ['dark-mode', 'tune', 'feature', 'Add a dark-mode toggle to the settings page that persists to localStorage. The design is already in Figma.'],
  ['webhook-backoff', 'tune', 'feature', 'Add retry with exponential backoff to the webhook sender, at most 5 attempts.'],
  ['invoice-csv', 'holdout', 'feature', 'Add CSV export to the invoices table, same columns as on screen.'],
  ['emoji-draft', 'tune', 'bug-fix', 'Saving a draft with an emoji in the title throws UnicodeEncodeError in the API logs. Fix it.'],
  ['safari-date', 'tune', 'bug-fix', "Users on Safari say the date picker shows yesterday's date after midnight UTC. Please fix."],
  ['payments-timeout', 'holdout', 'bug-fix', 'The integration job started failing on main this morning with a timeout in the payments suite. Fix it.'],
  ['wayfinder-filter-bug', 'holdout', 'bug-fix', 'The "wayfinder" label filter on our issue dashboard shows closed issues too. Fix the filter.'],
  ['dashboard-load', 'tune', 'perf-issue', 'The dashboard takes 9 seconds to load for accounts with 10k projects. It used to be under 2. Bring it back down.', 'boundary'],
  ['build-time', 'holdout', 'perf-issue', 'npm run build went from 40 seconds to 3 minutes after last week\'s upgrade. Find out why and fix it.', 'boundary'],
  ['scheduler-walkthrough', 'tune', 'investigation', 'How does our job scheduler decide which worker gets a task? Walk me through it. No changes.'],
  ['zod-or-valibot', 'tune', 'investigation', 'Should we use Zod or Valibot for the new API layer? Compare them for our codebase and recommend one.'],
  ['wayfinder-frontier', 'tune', 'investigation', 'How does the wayfinder skill decide which ticket is on the frontier? Just explain it.'],
  ['kafka-history', 'holdout', 'investigation', 'Why did we pick Kafka over SQS for the events pipeline? Dig through the history.'],
  ['rename-userctx', 'tune', 'refactoring', 'Rename UserCtx to SessionContext everywhere. No behavior change.'],
  ['proration-dedupe', 'holdout', 'refactoring', 'billing/utils.ts has three near-identical proration helpers. Collapse them into one without changing behavior.'],
  ['check-on-pr', 'tune', 'babysit', 'Check on PR #482. Anything outstanding?'],
  ['get-pr-green', 'holdout', 'babysit', 'Get #510 green and address the review-bot comments.'],
  ['land-pr', 'tune', 'shipping', '#477 is green and approved. Land it.'],
  ['ship-two', 'holdout', 'shipping', "Ship #530 and #531. They're both green."],
  ['release-checklist-skill', 'tune', 'authoring-a-skill', 'Write a new skill that teaches agents our release checklist.'],
  ['tdd-one-at-a-time', 'holdout', 'authoring-a-skill', "The tdd skill's SKILL.md tells agents to write all the tests first. Change it to one test at a time."],
  // Boundary cases here and above: two lines of the routing rule pull them different ways.
  ['part-of-map-ticket', 'tune', 'wayfinder', 'Work on #233. #200 is our wayfinder map for the API overhaul, and #233 is a child of it asking: "Rate limits per user or per org? Try both against the replay log and pick."', 'boundary'],
  ['map-child-question', 'holdout', 'wayfinder', 'Answer the open question in #64. It is a child issue of the pricing map, #60: "Do annual plans get a discount?"', 'boundary'],
  ['search-p95', 'tune', 'perf-issue', "Search got slow after Tuesday's deploy. p95 went from 200ms to 1.4s. Fix it.", 'boundary'],
  ['slow-export', 'holdout', 'perf-issue', 'Exporting a 50k-row report now takes over a minute. Last release it took 8 seconds. Sort it out.', 'boundary'],
  ['drop-legacy-column', 'tune', 'grilling', 'Drop the unused legacy_notes column from the users table and write the migration. Quick one.', 'boundary'],
  ['require-limit-param', 'holdout', 'grilling', 'Make the limit param on GET /v2/items required instead of defaulting to 50. Small diff.', 'boundary'],
  ['parse-duration', 'tune', 'bug-fix', "parseDuration('1h30m') returns 90 instead of 5400. Write a failing test and fix it.", 'boundary'],
  ['ci-move', 'tune', 'investigation', 'Is it worth moving our CI from GitHub Actions to Buildkite? Look at what we run today and give me a recommendation.', 'boundary'],
  ['outstanding-before-merge', 'holdout', 'babysit', "Anything outstanding on #602 before I merge it myself?", 'boundary'],
];

const quote = (s) => `'${s.replaceAll("'", "''")}'`;
const indent = (s, n) => s.split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n');

const root = join(dirname(fileURLToPath(import.meta.url)), 'cases');
rmSync(root, { recursive: true, force: true });
for (const [slug, split, route, prompt, ...extra] of CASES) {
  if (!ROUTES.includes(route)) throw new Error(`${slug}: unknown route ${route}`);
  const pattern = `ROUTE:\\s*[*\`]*(?:milliways:)?${route}[*\`.]*\\s*$`;
  const yaml = `schema_version: '1.0'
name: ${slug}
tags: [${[split, route, ...extra].join(', ')}]
execution:
  prompt: ${quote(prompt)}
  max_turns: 4
  allowed_tools: [Skill]
  append_system_prompt: |
${indent(SYSTEM, 4)}
runs: 1
expected_outcome: ${route}
graders:
  - name: route
    type: regex
    target: last_message
    pattern: ${quote(pattern)}
`;
  mkdirSync(join(root, slug), { recursive: true });
  writeFileSync(join(root, slug, 'case.yaml'), yaml);
}
const count = (s) => CASES.filter((c) => c[1] === s).length;
console.log(`wrote ${CASES.length} cases (tune ${count('tune')}, holdout ${count('holdout')})`);
