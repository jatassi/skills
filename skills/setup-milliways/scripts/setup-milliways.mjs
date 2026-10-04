#!/usr/bin/env node
// setup-milliways: the deterministic half of the setup-milliways skill.
//
//   detect  print what the repo and this machine already have, as JSON
//   write   write whatever of the kitchen is missing; never overwrite a file
//   labels  create the kitchen's GitHub labels that don't exist yet
//
// Every command takes --repo <dir> (default: the current directory). Plain
// Node, no dependencies: it runs from the installed plugin as is.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, renameSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { delimiter, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');

const ROOT_LINE =
  'Start every non-trivial task with the `make-it-so` skill. Kitchen config: `docs/agents/AGENTS.md`.';

// The docs/agents contract: topic key = file name without .md, in index order.
const DOCS = [
  ['issue-tracker', 'Issue tracker', 'GitHub Issues through `gh`, including wayfinder operations and the kitchen labels'],
  ['triage-labels', 'Triage labels', 'The label string for each of the five triage roles'],
  ['domain', 'Domain', 'Where `GLOSSARY.md` and ADRs live, and how to use them'],
  ['models', 'Models', 'Role → model tier and effort, detected families, and the fallback rule'],
  ['verification', 'Verification', 'Which verify skill proves changes, and the live lane as the floor of every verdict'],
  ['autonomy', 'Autonomy', 'Areas as path globs, the rung of each, clean-merge and promotion rules, and the one-way doors'],
  ['garden', 'Garden', 'Banned patterns, the reflect / sweep / cluster cadences, and how `correct` fixes them'],
];

const HARNESSES = [
  { name: 'claude-code', family: 'anthropic', env: ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_REMOTE'] },
  { name: 'codex', family: 'openai', env: ['CODEX_SANDBOX', 'CODEX_SANDBOX_NETWORK_DISABLED', 'CODEX_THREAD_ID'] },
  { name: 'gemini-cli', family: 'google', env: ['GEMINI_CLI'] },
  { name: 'cursor', family: null, env: ['CURSOR_AGENT', 'CURSOR_TRACE_ID'] },
];

// Family → the CLI that reaches it, and the tier a second-family seat runs at.
const FAMILIES = [
  { family: 'anthropic', cli: 'claude' },
  { family: 'openai', cli: 'codex', seat: 'codex:sol' },
  { family: 'google', cli: 'gemini', seat: 'gemini:pro' },
];

const TRIAGE = [
  ['needs-triage', 'Maintainer needs to evaluate this issue'],
  ['needs-info', 'Waiting on reporter for more information'],
  ['ready-for-agent', 'Fully specified, ready for an AFK agent'],
  ['ready-for-human', 'Requires human implementation'],
  ['wontfix', 'Will not be actioned'],
];

const KITCHEN_LABELS = [
  ['wayfinder:map', '1d76db', 'A wayfinder map: the decisions a large effort works through'],
  ['wayfinder:research', 'c5def5', 'Wayfinder ticket: research'],
  ['wayfinder:prototype', 'c5def5', 'Wayfinder ticket: prototype'],
  ['wayfinder:grilling', 'c5def5', 'Wayfinder ticket: grilling'],
  ['wayfinder:task', 'c5def5', 'Wayfinder ticket: task'],
  ['garden', '0e8a16', 'A workaround, banned pattern or repeated mistake to correct'],
  ['door:one-way', 'b60205', 'Irreversible change: always waits for the chef'],
  ['prototype', 'fbca04', 'Throwaway prototype pull request, closed unmerged after the pick'],
];

const SKIP_DIRS = new Set(['.git', 'node_modules']);

// ---------------------------------------------------------------- detection

function detectHarness(env) {
  if (env.AI_AGENT?.startsWith('claude-code')) return harnessOf('claude-code', env);
  for (const h of HARNESSES) if (h.env.some((k) => env[k])) return harnessOf(h.name, env);
  return { name: 'unknown', family: null, cloud: false };
}

function harnessOf(name, env) {
  const h = HARNESSES.find((x) => x.name === name);
  return { name, family: h.family, cloud: name === 'claude-code' && env.CLAUDE_CODE_REMOTE === 'true' };
}

function onPath(cmd, env) {
  const exts = process.platform === 'win32' ? (env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (env.PATH || '').split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, cmd + ext);
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {}
    }
  }
  return null;
}

function detectFamilies(env, harness) {
  const clis = {};
  const found = new Set();
  if (harness.family) found.add(harness.family);
  for (const f of FAMILIES) {
    const p = onPath(f.cli, env);
    if (p) {
      clis[f.cli] = p;
      found.add(f.family);
    }
  }
  return { families: FAMILIES.map((f) => f.family).filter((f) => found.has(f)), clis };
}

function githubRepo(repo) {
  const r = spawnSync('git', ['-C', repo, 'remote', 'get-url', 'origin'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const m = r.stdout.trim().match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

// Every file in the repo, repo-relative with forward slashes: through git when
// it's a git repo, so ignored paths (other worktrees, build output) stay out.
function repoFiles(repo) {
  const r = spawnSync('git', ['-C', repo, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status === 0) {
    const files = r.stdout.split('\0').filter(Boolean);
    // Claude Code reads this one even when it's gitignored.
    for (const local of ['.claude/CLAUDE.md'])
      if (existsSync(join(repo, local))) files.push(local);
    return [...new Set(files)].filter((f) => existsSync(join(repo, f)));
  }
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name));
      } else if (e.isFile()) files.push(relative(repo, join(dir, e.name)).split(sep).join('/'));
    }
  };
  walk(repo);
  return files;
}

function detect(repo, env = process.env) {
  const harness = detectHarness(env);
  const { families, clis } = detectFamilies(env, harness);

  const claudeMd = [];
  const context = [];
  for (const f of repoFiles(repo)) {
    const name = f.slice(f.lastIndexOf('/') + 1);
    const dir = f.slice(0, f.length - name.length);
    if (name === 'CLAUDE.md') claudeMd.push(f);
    if (name === 'CONTEXT.md' || name === 'CONTEXT-MAP.md') {
      const to = dir + (name === 'CONTEXT.md' ? 'GLOSSARY.md' : 'GLOSSARY-MAP.md');
      context.push({ from: f, to, conflict: existsSync(join(repo, to)) });
    }
  }
  claudeMd.sort();
  context.sort((a, b) => a.from.localeCompare(b.from));

  const agentsPath = join(repo, 'AGENTS.md');
  const agentsText = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : null;

  const docsDir = join(repo, 'docs', 'agents');
  const present = [];
  const missing = [];
  for (const [key] of DOCS) (existsSync(join(docsDir, `${key}.md`)) ? present : missing).push(`docs/agents/${key}.md`);

  const verifySkills = [];
  for (const base of ['.claude/skills', '.agents/skills']) {
    try {
      for (const e of readdirSync(join(repo, base), { withFileTypes: true }))
        if (e.isDirectory() && e.name.startsWith('verify')) verifySkills.push(e.name);
    } catch {}
  }

  return {
    repo: resolve(repo),
    github: githubRepo(repo),
    harness,
    families,
    clis,
    secondFamily: families.find((f) => f !== 'anthropic') ?? null,
    agentsMd: {
      exists: agentsText !== null,
      rootLine: agentsText !== null && hasRootLine(agentsText),
      agentSkillsBlock: agentsText !== null && /^## Agent skills\s*$/m.test(agentsText),
    },
    claudeMd,
    context,
    docsAgents: {
      index: existsSync(join(docsDir, 'AGENTS.md')),
      present,
      missing,
    },
    verifySkills: [...new Set(verifySkills)].sort(),
  };
}

// The directive line, or the chef's rewording of it: any one line that names
// both the router and the config index.
const hasRootLine = (text) =>
  text.split(/\r?\n/).some((l) => l.includes('make-it-so') && l.includes('docs/agents/AGENTS.md'));

// ---------------------------------------------------------------- rendering

function fill(template, values) {
  return readFileSync(join(TEMPLATES, template), 'utf8').replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in values)) throw new Error(`template ${template} needs {{${k}}}`);
    return values[k];
  });
}

const indexRow = ([key, topic, what]) => `| ${topic} | [${key}.md](${key}.md) | ${what} |`;

function roleRows(second) {
  const seat = second ? FAMILIES.find((f) => f.family === second).seat : null;
  const rows = [
    ['judgment', 'opus', 'high', 'Judgment, prose, plans and synthesis. pstack: judgment and prose; how explainer; why synthesizer; reflect judgment, divergent, synthesizer'],
    ['hardest-code', 'opus', 'high', 'Cross-cutting design, concurrency, subtle algorithms. pstack: hardest tasks'],
    ['code', 'sonnet', 'medium', 'Code delegates. pstack: feature, refactoring; bug-fix; perf-issue; hillclimb; swarm workers; reflect tooling'],
    ['explorer', 'sonnet', 'medium', 'Read-only search and investigation. pstack: how explorer; why investigators'],
    ['verifier', 'opus', 'high', 'A fresh verifier and its swarm lanes: gates, live lane, regression against trunk, diff audit'],
  ];
  if (seat) rows.push(['verifier-diff-audit', seat, 'high', 'One diff-audit lane in the verifier swarm, from a second family']);
  rows.push(['review-panel', 'opus, opus, opus', 'high', 'pstack: arena runners; arena cross-judge pool; architect runners']);
  rows.push(['interrogate', seat ? `opus, opus, ${seat}` : 'opus, opus, opus', 'high', 'Adversarial review of one-way doors. pstack: interrogate reviewers']);
  return rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
}

function familiesLine(d) {
  return d.families.length ? d.families.join(', ') : 'none';
}

function render(key, d, triage) {
  switch (key) {
    case 'index':
      return fill('index.md', { rows: DOCS.map(indexRow).join('\n') });
    case 'issue-tracker':
      return fill('issue-tracker.md', { repo: d.github ? `\`${d.github}\`` : 'this repo' });
    case 'models':
      return fill('models.md', {
        harness: d.harness.name + (d.harness.cloud ? ' (cloud)' : ''),
        families: familiesLine(d),
        roles: roleRows(d.secondFamily),
      });
    case 'verification':
      return fill('verification.md', { verifySkill: d.verifySkills.length ? d.verifySkills.map((s) => `\`${s}\``).join(', ') : '`none`' });
    default:
      return fill(`${key}.md`, {});
  }
}

// ---------------------------------------------------------------- write

function write(repo, d, { dryRun = false } = {}) {
  const out = [];
  const put = (path, text) => {
    if (dryRun) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  const WOULD = { created: 'would create', added: 'would add', renamed: 'would rename', indexed: 'would index', updated: 'would update' };
  const verb = (v) => (dryRun ? WOULD[v] : v);

  // Root AGENTS.md: exactly one directive line, added once.
  const agentsPath = join(repo, 'AGENTS.md');
  if (!existsSync(agentsPath)) {
    put(agentsPath, ROOT_LINE + '\n');
    out.push(`${verb('created')} AGENTS.md`);
  } else {
    const text = readFileSync(agentsPath, 'utf8');
    if (hasRootLine(text)) out.push('kept root line in AGENTS.md');
    else {
      put(agentsPath, ROOT_LINE + '\n' + (text.trim() ? '\n' + text : ''));
      out.push(`${verb('added')} root line to AGENTS.md`);
    }
  }

  // CONTEXT.md → GLOSSARY.md, CONTEXT-MAP.md → GLOSSARY-MAP.md.
  for (const c of d.context) {
    if (c.conflict) {
      out.push(`conflict ${c.from}: ${c.to} already exists`);
      continue;
    }
    if (!dryRun) renameSync(join(repo, c.from), join(repo, c.to));
    out.push(`${verb('renamed')} ${c.from} -> ${c.to}`);
    if (c.to.endsWith('GLOSSARY-MAP.md')) {
      const mapPath = join(repo, dryRun ? c.from : c.to);
      const text = readFileSync(mapPath, 'utf8');
      if (text.includes('CONTEXT.md')) {
        put(mapPath, text.replaceAll('CONTEXT.md', 'GLOSSARY.md'));
        out.push(`${verb('updated')} links in ${c.to}`);
      }
    }
  }

  // docs/agents documents: write each missing one; keep every existing one.
  const docsDir = join(repo, 'docs', 'agents');
  const created = [];
  for (const [key] of DOCS) {
    const path = join(docsDir, `${key}.md`);
    const name = `docs/agents/${key}.md`;
    if (existsSync(path)) {
      out.push(`kept ${name}`);
      if (key === 'models') {
        const recorded = readFileSync(path, 'utf8').match(/^Detected families: (.*)$/m)?.[1]?.trim();
        if (recorded !== undefined && recorded !== familiesLine(d))
          out.push(`stale ${name}: detected ${familiesLine(d)}; the document records ${recorded}`);
      }
      continue;
    }
    put(path, render(key, d));
    created.push(key);
    out.push(`${verb('created')} ${name}`);
  }

  // The index: written whole the first time; afterwards only rows for
  // documents created by this run are added, after the table's last row.
  const indexPath = join(docsDir, 'AGENTS.md');
  if (!existsSync(indexPath)) {
    put(indexPath, render('index', d));
    out.push(`${verb('created')} docs/agents/AGENTS.md`);
  } else {
    const lines = readFileSync(indexPath, 'utf8').split('\n');
    const add = DOCS.filter(([key]) => created.includes(key) && !lines.some((l) => l.includes(`${key}.md`)));
    if (add.length) {
      let at = lines.findLastIndex((l) => l.trimStart().startsWith('|'));
      if (at === -1) at = lines.length - 1;
      lines.splice(at + 1, 0, ...add.map(indexRow));
      put(indexPath, lines.join('\n'));
      for (const [key] of add) out.push(`${verb('indexed')} docs/agents/${key}.md`);
    } else out.push('kept docs/agents/AGENTS.md');
  }

  return out;
}

// ---------------------------------------------------------------- labels

function triageNames(repo) {
  const path = join(repo, 'docs', 'agents', 'triage-labels.md');
  const names = new Map(TRIAGE.map(([role]) => [role, role]));
  if (!existsSync(path)) return names;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const cells = line.split('|').map((c) => c.trim().replace(/^`|`$/g, ''));
    if (cells.length >= 4 && names.has(cells[1]) && cells[2]) names.set(cells[1], cells[2]);
  }
  return names;
}

function kitchenLabels(repo) {
  const names = triageNames(repo);
  return [
    ...TRIAGE.map(([role, description]) => [names.get(role), 'd4c5f9', description]),
    ...KITCHEN_LABELS,
  ];
}

function gh(repo, args) {
  const r = spawnSync('gh', args, { cwd: repo, encoding: 'utf8' });
  if (r.error) throw new Error(`gh: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`gh ${args.join(' ')} failed: ${r.stderr.trim()}`);
  return r.stdout;
}

function labels(repo, { dryRun = false } = {}) {
  const existing = new Set(JSON.parse(gh(repo, ['label', 'list', '--limit', '1000', '--json', 'name'])).map((l) => l.name));
  const out = [];
  for (const [name, color, description] of kitchenLabels(repo)) {
    if (existing.has(name)) out.push(`kept label ${name}`);
    else {
      if (!dryRun) gh(repo, ['label', 'create', name, '--color', color, '--description', description]);
      out.push(`${dryRun ? 'would create' : 'created'} label ${name}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- CLI

const HELP = `Usage: setup-milliways <command> [--repo <dir>] [options]

Commands:
  detect                 Print what the repo and this machine have, as JSON.
  write                  Write whatever of the kitchen is missing. Never
                         overwrites a file. Prints one line per path:
                           created|kept|added|renamed|indexed|updated <path>
                           conflict <path>: <reason>
                           stale <path>: <reason>
  labels                 Create the kitchen's GitHub labels that don't exist
                         yet, through gh. Prints: created|kept label <name>

Options:
  --repo <dir>           The repo root (default: the current directory).
  --families <a,b>       write: use these model families instead of detecting
                         them (anthropic, openai, google).
  --dry-run              write, labels: print what would change; change nothing.
`;

function main(argv) {
  const [cmd, ...rest] = argv;
  const opts = { repo: process.cwd(), dryRun: false, families: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--repo') opts.repo = rest[++i];
    else if (a === '--families') opts.families = rest[++i];
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--help' || a === '-h') return void process.stdout.write(HELP);
    else return fail(`unknown option ${a}`);
  }
  if (!cmd || cmd === '--help' || cmd === '-h') return void process.stdout.write(HELP);
  const repo = resolve(opts.repo ?? '');
  if (!existsSync(repo)) return fail(`no such directory: ${repo}`);

  try {
    if (cmd === 'detect') return void process.stdout.write(JSON.stringify(detect(repo), null, 2) + '\n');
    if (cmd === 'write') {
      const d = detect(repo);
      if (opts.families !== null) {
        const known = FAMILIES.map((f) => f.family);
        const wanted = opts.families.split(',').map((s) => s.trim()).filter(Boolean);
        const bad = wanted.filter((f) => !known.includes(f));
        if (bad.length) return fail(`unknown family: ${bad.join(', ')} (known: ${known.join(', ')})`);
        d.families = known.filter((f) => wanted.includes(f));
        d.secondFamily = d.families.find((f) => f !== 'anthropic') ?? null;
      }
      return void process.stdout.write(write(repo, d, opts).join('\n') + '\n');
    }
    if (cmd === 'labels') return void process.stdout.write(labels(repo, opts).join('\n') + '\n');
  } catch (e) {
    return fail(e.message);
  }
  return fail(`unknown command ${cmd}`);
}

function fail(message) {
  process.stderr.write(`setup-milliways: ${message}\n`);
  process.exitCode = 1;
}

main(process.argv.slice(2));
