#!/usr/bin/env node
// trust-ladder: score a kitchen's areas on the trust ladder.
//
//   score   read docs/agents/autonomy.md, fetch merged pull requests and what
//           links back to them through gh, and print, as JSON: per-area clean
//           streaks, unclean merges, promotions and demotions due, and a digest
//           of the latest merges ranked by risk.
//
// It only reads. Proposing promotions and applying demotions is the caller's
// job. Plain Node, no dependencies: it runs from the installed plugin as is.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const DAY = 86_400_000;
const RUNGS = ['chef', 'gated']; // lowest first
const DOOR_LABEL = 'door:one-way';
const GARDEN_LABEL = 'garden';

// Risk points per digest factor. Documented in SKILL.md; change both together.
const WEIGHTS = {
  door: 40,
  verifier: { 'verifier-failed': 30, 'verifier-blocked': 30, none: 20, 'type-check-only': 15, 'unit-test-verified': 5, 'live-ui-verified': 0 },
  blastRadius: { high: 20, medium: 10, low: 0 },
  extraArea: 5,
  size: [[10, 0], [100, 5], [500, 10], [1000, 15], [Infinity, 20]],
  newlyGated: 15,
  linked: 30,
};
const VERIFIER_TIERS = Object.keys(WEIGHTS.verifier).filter((t) => t !== 'none');

class UsageError extends Error {}

// ---------------------------------------------------------------- autonomy document

function section(text, heading, level) {
  const marks = '#'.repeat(level);
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `${marks} ${heading}`);
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && /^#{1,6} /.test(l) && l.match(/^#+/)[0].length <= level);
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

function tableRows(lines) {
  const rows = lines
    .filter((l) => l.trim().startsWith('|'))
    .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
  return rows.slice(1).filter((cells) => !cells.every((c) => /^:?-+:?$/.test(c)));
}

const backticked = (s) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

function parseAutonomy(text) {
  const areasBody = section(text, 'Areas', 2);
  if (!areasBody) throw new Error('autonomy document has no "## Areas" section');
  const areas = tableRows(areasBody).map(([area, paths = '', rung = '']) => {
    const globs = backticked(paths);
    if (!area) throw new Error('an Areas row has no area name');
    if (!globs.length) throw new Error(`area ${area} has no path globs in backticks`);
    if (!RUNGS.includes(rung)) throw new Error(`area ${area} has rung "${rung}"; expected ${RUNGS.join(' or ')}`);
    return { area, globs, matchers: globs.map(globRegExp), rung };
  });
  if (!areas.length) throw new Error('autonomy document declares no areas');
  const dup = areas.find((a, i) => areas.findIndex((b) => b.area === a.area) !== i);
  if (dup) throw new Error(`area ${dup.area} is declared twice`);

  const rulesBody = section(text, 'Rules', 2);
  if (!rulesBody) throw new Error('autonomy document has no "## Rules" section');
  const rules = new Map(tableRows(rulesBody).map(([k, v]) => [k, v]));
  const positive = (key) => {
    const v = Number(rules.get(key));
    if (!Number.isInteger(v) || v < 1) throw new Error(`rule ${key} must be a positive whole number, got "${rules.get(key)}"`);
    return v;
  };

  const doorsBody = section(text, 'One-way doors', 2) ?? [];
  const doorPathsBody = section(doorsBody.join('\n'), 'Paths', 3) ?? [];
  const doorGlobs = doorPathsBody.filter((l) => /^\s*[-*] /.test(l)).flatMap(backticked);

  return {
    areas,
    cleanWindowDays: positive('clean-window-days'),
    promotionStreak: positive('promotion-streak'),
    doors: doorGlobs.map(globRegExp),
  };
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Globs match whole repo-relative paths: `**` spans directories (a leading
// `**/` also matches none), `*` and `?` stay within one path segment.
function globRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      const atSegmentStart = i === 0 || glob[i - 1] === '/';
      if (atSegmentStart && glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; }
      else if (atSegmentStart && i + 2 === glob.length) { re += '.*'; i += 1; }
      else { re += '[^/]*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += escape(c);
  }
  return new RegExp(`^${re}$`);
}

const areaOf = (areas, path) => areas.find((a) => a.matchers.some((m) => m.test(path)));

// When each currently gated area became gated: the commit date of the oldest
// commit in the unbroken run of first-parent commits, newest first, where the
// document gives the area rung `gated`. Uncommitted: `now`. Unknown (no git
// history, or a shallow clone whose history ends inside the run): null.
function gatedSince(repo, docPath, areas, now) {
  const out = new Map(areas.map((a) => [a.area, null]));
  const rel = relative(repo, docPath);
  if (rel.startsWith('..') || isAbsolute(rel)) return out;
  const spec = `./${rel.split(sep).join('/')}`;
  const log = spawnSync('git', ['-C', repo, 'log', '--first-parent', '--format=%H %cI', '--', spec], { encoding: 'utf8' });
  if (log.error || log.status !== 0) return out;
  const commits = log.stdout.split('\n').filter(Boolean).map((l) => {
    const [hash, date] = l.split(' ');
    const show = spawnSync('git', ['-C', repo, 'show', `${hash}:${spec}`], { encoding: 'utf8' });
    let rungs = new Map();
    try {
      if (show.status === 0) rungs = new Map(parseAutonomy(show.stdout).areas.map((a) => [a.area, a.rung]));
    } catch {}
    return { date: new Date(date).toISOString(), rungs };
  });
  if (!commits.length) return out;
  const shallow =
    spawnSync('git', ['-C', repo, 'rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).stdout?.trim() === 'true';
  for (const a of areas) {
    if (a.rung !== 'gated') continue;
    let since = now;
    let runEnded = false;
    for (const c of commits) {
      if (c.rungs.get(a.area) !== 'gated') {
        runEnded = true;
        break;
      }
      since = c.date;
    }
    out.set(a.area, runEnded || !shallow ? since : null);
  }
  return out;
}

// ---------------------------------------------------------------- GitHub

function gh(repo, args) {
  const r = spawnSync('gh', args, { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw new Error(`gh: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`gh ${args.join(' ')} failed: ${r.stderr.trim()}`);
  return JSON.parse(r.stdout);
}

function fetchHistory(repo, { base, from, limit }) {
  const info = gh(repo, ['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef']);
  const branch = base ?? info.defaultBranchRef?.name;
  if (!branch) throw new Error('could not tell the default branch; pass --base');
  const day = from.slice(0, 10);
  const merges = gh(repo, [
    'pr', 'list', '--state', 'merged', '--base', branch, '--search', `merged:>=${day}`, '--limit', String(limit),
    '--json', 'number,title,body,url,author,mergedAt,mergeCommit,labels,files,additions,deletions',
  ]);
  const prs = gh(repo, [
    'pr', 'list', '--state', 'all', '--search', `created:>=${day}`, '--limit', String(limit),
    '--json', 'number,title,body,url,state,createdAt',
  ]);
  const issues = gh(repo, [
    'issue', 'list', '--state', 'all', '--label', GARDEN_LABEL, '--search', `created:>=${day}`, '--limit', String(limit),
    '--json', 'number,title,body,url,createdAt',
  ]);
  return { repoName: info.nameWithOwner, branch, merges, prs, issues };
}

// ---------------------------------------------------------------- links

// Does `text` reference the merge: #N or owner/repo#N for this repo, its pull
// request URL, or a 7+ character prefix of its merge commit SHA?
function refersTo(text, merge, repoName) {
  if (!text) return false;
  const n = merge.number;
  for (const m of text.matchAll(new RegExp(`(?<![\\w./-])(?:([\\w.-]+/[\\w.-]+))?#${n}(?!\\d)`, 'g')))
    if (!m[1] || m[1].toLowerCase() === repoName.toLowerCase()) return true;
  if (new RegExp(`github\\.com/${escape(repoName)}/pull/${n}(?!\\d)`, 'i').test(text)) return true;
  const oid = merge.mergeCommit?.oid?.toLowerCase();
  if (oid) for (const [t] of text.matchAll(/\b[0-9a-f]{7,40}\b/gi)) if (oid.startsWith(t.toLowerCase())) return true;
  return false;
}

const FIX_FORWARD = /\bfix(?:es|ed)?[- ]?forward/i;

// A revert names what it reverts on a line that says so ("Reverts #N", "This
// reverts commit <sha>"), or in its title outside the quoted original title,
// so a reference the reverted PR's own title carried doesn't count.
function linkKind(pr, merge, repoName) {
  const title = pr.title ?? '';
  const body = (pr.body ?? '').split(/\r?\n/);
  const refers = (text) => refersTo(text, merge, repoName);
  if (/^\s*revert\b/i.test(title)) {
    const bare = title.replace(/"[^"]*"/g, '');
    if (refers(bare) || body.some((line) => /\breverts?\b/i.test(line) && refers(line))) return 'revert';
  }
  if ([title, ...body].some((line) => FIX_FORWARD.test(line) && refers(line))) return 'fix-forward';
  return null;
}

function linksTo(merge, history, windowMs) {
  const mergedAt = Date.parse(merge.mergedAt);
  const inWindow = (created) => {
    const d = Date.parse(created) - mergedAt;
    return d >= 0 && d <= windowMs;
  };
  const links = [];
  for (const pr of history.prs) {
    if (pr.number === merge.number || pr.state === 'CLOSED' || !inWindow(pr.createdAt)) continue;
    const kind = linkKind(pr, merge, history.repoName);
    if (kind) links.push({ kind, number: pr.number, url: pr.url, createdAt: iso(pr.createdAt) });
  }
  for (const issue of history.issues) {
    if (!inWindow(issue.createdAt)) continue;
    if (refersTo(`${issue.title ?? ''}\n${issue.body ?? ''}`, merge, history.repoName))
      links.push({ kind: 'garden', number: issue.number, url: issue.url, createdAt: iso(issue.createdAt) });
  }
  return links.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.number - b.number);
}

// ---------------------------------------------------------------- scoring

const iso = (d) => new Date(d).toISOString();
const byMerge = (a, b) => a.mergedAt.localeCompare(b.mergedAt) || a.number - b.number;

function score(doc, history, { now, since, from, gated }) {
  const windowMs = doc.cleanWindowDays * DAY;
  const nowMs = Date.parse(now);
  const merges = history.merges
    .filter((m) => m.mergedAt && Date.parse(m.mergedAt) >= Date.parse(from) && Date.parse(m.mergedAt) < nowMs)
    .map((m) => {
      const paths = (m.files ?? []).map((f) => f.path);
      const names = new Set();
      const unassigned = [];
      for (const p of paths) {
        const a = areaOf(doc.areas, p);
        if (a) names.add(a.area);
        else unassigned.push(p);
      }
      const merge = { ...m, mergedAt: iso(m.mergedAt), paths, unassigned };
      merge.areas = doc.areas.filter((a) => names.has(a.area)).map((a) => a.area);
      merge.links = linksTo(merge, history, windowMs);
      merge.status = merge.links.length ? 'unclean' : nowMs - Date.parse(merge.mergedAt) > windowMs ? 'clean' : 'pending';
      return merge;
    })
    .sort(byMerge);

  const ladder = doc.areas.map((a) => climb(a, merges, gated.get(a.area), doc.promotionStreak));

  const promotions = ladder
    .filter((a) => a.rung === 'chef' && a.streak.length >= doc.promotionStreak)
    .map((a) => ({ area: a.area, streak: a.streak.length, prs: a.streak.map((m) => m.number) }));
  const demotions = ladder
    .filter((a) => a.rung === 'gated' && a.demoting.length)
    .map((a) => ({ area: a.area, prs: a.demoting.map((m) => m.number) }));

  const unclean = merges
    .filter((m) => m.status === 'unclean')
    .map((m) => ({ pr: m.number, url: m.url, title: m.title, mergedAt: m.mergedAt, areas: m.areas, links: m.links }));
  const unassigned = merges.filter((m) => m.unassigned.length).map((m) => ({ pr: m.number, paths: m.unassigned }));

  const digest = merges
    .filter((m) => m.mergedAt >= since && Date.parse(m.mergedAt) < nowMs)
    .map((m) => risk(m, doc, ladder))
    .sort((a, b) => b.score - a.score || b.mergedAt.localeCompare(a.mergedAt) || a.pr - b.pr)
    .map((m, i) => ({ rank: i + 1, ...m }));

  return {
    areas: ladder.map((a) => ({
      area: a.area,
      rung: a.rung,
      gatedSince: a.gatedSince,
      merges: a.merges.length,
      streak: a.streak.length,
      pending: a.pending.length,
      unclean: a.merges.filter((m) => m.status === 'unclean').map((m) => m.number),
    })),
    unclean,
    promotions,
    demotions,
    unassigned,
    digest: { from: since, to: now, merges: digest },
  };
}

// One area's place on the ladder, from its merges in merge order.
//   streak    clean merges since the latest unclean one (pending ones skipped)
//   pending   merges since the latest unclean one whose window is still open
//   demoting  unclean merges merged since the area was gated; with gatedSince
//             unknown, those after the latest run of promotion-streak clean
//             merges (the run that could have earned the rung)
//   newly     the first promotion-streak merges since the area was gated
function climb(area, merges, gatedSince, promotionStreak) {
  const own = merges.filter((m) => m.areas.includes(area.area));
  const tail = own.slice(own.findLastIndex((m) => m.status === 'unclean') + 1);
  let demoting = [];
  let newly = [];
  if (area.rung === 'gated' && gatedSince !== null) {
    const sinceGated = own.filter((m) => m.mergedAt >= gatedSince);
    demoting = sinceGated.filter((m) => m.status === 'unclean');
    newly = sinceGated.slice(0, promotionStreak);
  } else if (area.rung === 'gated') {
    let run = 0;
    let earnedAt = -1;
    own.forEach((m, i) => {
      if (m.status === 'unclean') run = 0;
      else if (m.status === 'clean' && ++run >= promotionStreak) earnedAt = i;
    });
    demoting = own.slice(earnedAt + 1).filter((m) => m.status === 'unclean');
  }
  return {
    area: area.area,
    rung: area.rung,
    gatedSince,
    merges: own,
    streak: tail.filter((m) => m.status === 'clean'),
    pending: tail.filter((m) => m.status === 'pending'),
    demoting,
    newly,
  };
}

function risk(m, doc, ladder) {
  const labels = (m.labels ?? []).map((l) => l.name.toLowerCase());
  const doorPaths = m.paths.filter((p) => doc.doors.some((d) => d.test(p))).sort();
  const door = { oneWay: labels.includes(DOOR_LABEL) || doorPaths.length > 0, label: labels.includes(DOOR_LABEL), paths: doorPaths };
  const verifier = VERIFIER_TIERS.find((t) => labels.includes(t)) ?? null;
  const blastRadius = (m.body ?? '').match(/blast radius\W{0,5}\b(high|medium|low)\b/i)?.[1].toLowerCase() ?? null;
  const lines = (m.additions ?? 0) + (m.deletions ?? 0);
  const mine = ladder.filter((a) => m.areas.includes(a.area));
  const rung = mine.length ? RUNGS.find((r) => mine.some((a) => a.rung === r)) : null;
  const newlyGated = mine.some((a) => a.newly.includes(m));
  const factors = {
    door: door.oneWay ? WEIGHTS.door : 0,
    verifier: WEIGHTS.verifier[verifier ?? 'none'],
    blastRadius: (blastRadius ? WEIGHTS.blastRadius[blastRadius] : 0) + WEIGHTS.extraArea * Math.max(0, m.areas.length - 1),
    size: WEIGHTS.size.find(([max]) => lines <= max)[1],
    newlyGated: newlyGated ? WEIGHTS.newlyGated : 0,
    linked: m.links.length ? WEIGHTS.linked : 0,
  };
  return {
    pr: m.number,
    url: m.url,
    title: m.title,
    author: m.author?.login ?? null,
    mergedAt: m.mergedAt,
    score: Object.values(factors).reduce((a, b) => a + b, 0),
    factors,
    areas: m.areas,
    rung,
    door,
    verifier,
    blastRadius,
    newlyGated,
    size: { additions: m.additions ?? 0, deletions: m.deletions ?? 0, files: m.paths.length },
    status: m.status,
    links: m.links,
  };
}

// ---------------------------------------------------------------- CLI

const HELP = `Usage: trust-ladder score [options]

Reads the autonomy document, fetches merged pull requests and what links back
to them through gh, and prints the ladder and the risk digest as JSON on
stdout. Reads only: it never edits the document or opens anything.

Options:
  --repo <dir>           The repo root; gh runs here (default: current directory).
  --autonomy <file>      The autonomy document (default: <repo>/docs/agents/autonomy.md).
  --now <iso>            The time to score at (default: now).
  --since <iso>          Start of the digest window (default: 24 hours before --now).
  --lookback-days <n>    How far back to score merges (default: 90).
  --base <branch>        The branch merges land on (default: the repo's default branch).
  --limit <n>            Most pull requests and issues per gh query (default: 1000).

Exit status: 0 scored, 1 failed (message on stderr), 2 bad usage.
`;

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = { cmd, repo: process.cwd(), autonomy: null, now: null, since: null, lookbackDays: 90, base: null, limit: 1000 };
  const valued = { '--repo': 'repo', '--autonomy': 'autonomy', '--now': 'now', '--since': 'since', '--lookback-days': 'lookbackDays', '--base': 'base', '--limit': 'limit' };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--help' || a === '-h') return { ...opts, cmd: '--help' };
    if (!(a in valued)) throw new UsageError(`unknown option ${a}`);
    const value = rest[++i];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${a} needs a value`);
    opts[valued[a]] = value;
  }
  for (const k of ['now', 'since'])
    if (opts[k] !== null && Number.isNaN(Date.parse(opts[k]))) throw new UsageError(`--${k} is not a date: ${opts[k]}`);
  for (const k of ['lookbackDays', 'limit']) {
    const v = Number(opts[k]);
    if (!Number.isInteger(v) || v < 1) throw new UsageError(`--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} must be a positive whole number`);
    opts[k] = v;
  }
  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`trust-ladder: ${e.message}\n\n${HELP}`);
    return 2;
  }
  if (!opts.cmd || opts.cmd === '--help' || opts.cmd === '-h') {
    process.stdout.write(HELP);
    return 0;
  }
  if (opts.cmd !== 'score') {
    process.stderr.write(`trust-ladder: unknown command ${opts.cmd}\n\n${HELP}`);
    return 2;
  }
  try {
    const repo = resolve(opts.repo);
    if (!existsSync(repo)) throw new Error(`no such directory: ${repo}`);
    const docPath = resolve(repo, opts.autonomy ?? 'docs/agents/autonomy.md');
    if (!existsSync(docPath)) throw new Error(`no autonomy document at ${docPath}; run setup-milliways first`);
    const doc = parseAutonomy(readFileSync(docPath, 'utf8'));
    const now = iso(opts.now ?? Date.now());
    const since = iso(opts.since ?? Date.parse(now) - DAY);
    const from = iso(Math.min(Date.parse(now) - opts.lookbackDays * DAY, Date.parse(since)));
    const history = fetchHistory(repo, { base: opts.base, from, limit: opts.limit });
    const result = score(doc, history, { now, since, from, gated: gatedSince(repo, docPath, doc.areas, now) });
    const out = {
      schema: 1,
      repo: history.repoName,
      base: history.branch,
      now,
      rules: { cleanWindowDays: doc.cleanWindowDays, promotionStreak: doc.promotionStreak },
      lookback: { from, days: opts.lookbackDays },
      ...result,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return 0;
  } catch (e) {
    process.stderr.write(`trust-ladder: ${e.message}\n`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
