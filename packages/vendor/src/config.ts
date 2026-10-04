// Reads and validates the four data files in vendor/ that drive vendoring:
//
//   upstream.json       each upstream repo, its pinned commit, the paths it
//                       ships (local path -> upstream path) and the upstream
//                       skill folders it watches for new skills
//   substitutions.json  the mechanical rewrites applied to every upstream file
//   forks.json          every vendored path allowed to differ from its derived
//                       upstream form, each with a kind and a reason
//   checks.json         what check mode rejects in the vendored tree
//
// See docs/adr/0004-vendoring-pinned-upstreams-with-declared-forks.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';

export const VENDOR_DIR = 'vendor';

export class ConfigError extends Error {}

/** One shipped path: a file or a folder, local path <- upstream path. */
export interface Include {
  local: string;
  upstream: string;
  /** Copied byte for byte: no substitutions, no checks (licences, scripts). */
  verbatim: boolean;
}

export interface Upstream {
  name: string;
  repo: string;
  commit: string;
  /** Upstream folders whose child folders are skills; a new one is reported for triage. */
  watch: string[];
  includes: Include[];
  /** Upstream paths deliberately not shipped, each with its reason. */
  exclude: Map<string, string>;
}

export interface Rule {
  match: string | RegExp;
  /** Only in local paths this matches. */
  files: RegExp | null;
  replacement: string;
}

export const FORK_KINDS = ['policy', 'port-feature'] as const;
export interface Fork {
  kind: (typeof FORK_KINDS)[number];
  why: string;
}

export interface DenyRule {
  rule: string;
  label: string;
  test: (line: string) => boolean;
  hint: string;
}

export interface Checks {
  denylist: DenyRule[];
  /** Agent types every Claude Code session has; every other one must be namespaced. */
  builtinAgentTypes: Set<string>;
  namespace: string;
  /** Local paths that are playbooks, whose skill references must resolve. */
  playbooks: RegExp;
  /** Each captures a skill name in group 1. */
  skillReferences: RegExp[];
}

export interface Config {
  root: string;
  upstreams: Upstream[];
  substitutions: Rule[];
  forks: Map<string, Fork>;
  checks: Checks;
}

type Json = Record<string, unknown>;

function readJson(root: string, file: string): Json {
  const path = join(root, VENDOR_DIR, file);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new ConfigError(`${VENDOR_DIR}/${file} is missing`);
  }
  try {
    const value: unknown = JSON.parse(text);
    if (!isObject(value)) throw new Error('not an object');
    return value;
  } catch (error) {
    throw new ConfigError(`${VENDOR_DIR}/${file}: ${(error as Error).message}`);
  }
}

const isObject = (value: unknown): value is Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function onlyFields(where: string, value: Json, allowed: string[]) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new ConfigError(`${where}: unknown field ${unknown.map((f) => `"${f}"`).join(', ')}`);
}

/** A clean relative POSIX path: no leading slash, no `.` or `..` parts, no trailing slash. */
function cleanPath(where: string, path: unknown): string {
  if (!isString(path) || path.startsWith('/') || path.endsWith('/') || path.includes('\\')) {
    throw new ConfigError(`${where}: "${String(path)}" is not a relative path without a trailing slash`);
  }
  if (path.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new ConfigError(`${where}: "${path}" must not contain empty, . or .. parts`);
  }
  return posix.normalize(path);
}

/** Whether `path` is `base` or inside it. */
export const within = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

function parseUpstreams(json: Json): Upstream[] {
  onlyFields('upstream.json', json, ['upstreams']);
  if (!isObject(json.upstreams)) throw new ConfigError('upstream.json: "upstreams" must be an object');
  const upstreams = Object.entries(json.upstreams).map(([name, raw]): Upstream => {
    const where = `upstream.json ${name}`;
    if (!/^[a-z0-9-]+$/.test(name)) throw new ConfigError(`${where}: name must be lowercase letters, digits and dashes`);
    if (!isObject(raw)) throw new ConfigError(`${where}: must be an object`);
    onlyFields(where, raw, ['repo', 'commit', 'watch', 'include', 'exclude']);
    if (!isString(raw.repo)) throw new ConfigError(`${where}: "repo" must be a git URL or path`);
    if (typeof raw.commit !== 'string' || !/^[0-9a-f]{40}$/.test(raw.commit)) {
      throw new ConfigError(`${where}: "commit" must be a full 40-character commit SHA`);
    }
    const watch = raw.watch ?? [];
    if (!Array.isArray(watch)) throw new ConfigError(`${where}: "watch" must be a list of upstream folders`);
    if (!isObject(raw.include)) throw new ConfigError(`${where}: "include" must map local paths to upstream paths`);
    const includes = Object.entries(raw.include).map(([local, value]): Include => {
      const at = `${where} include "${local}"`;
      if (typeof value === 'string') return { local: cleanPath(at, local), upstream: cleanPath(at, value), verbatim: false };
      if (!isObject(value)) throw new ConfigError(`${at}: must be an upstream path or { "path", "verbatim" }`);
      onlyFields(at, value, ['path', 'verbatim']);
      if (value.verbatim !== undefined && typeof value.verbatim !== 'boolean') {
        throw new ConfigError(`${at}: "verbatim" must be true or false`);
      }
      return { local: cleanPath(at, local), upstream: cleanPath(at, value.path), verbatim: value.verbatim === true };
    });
    const exclude = raw.exclude ?? {};
    if (!isObject(exclude)) throw new ConfigError(`${where}: "exclude" must map upstream paths to reasons`);
    for (const [path, why] of Object.entries(exclude)) {
      if (!isString(why)) throw new ConfigError(`${where} exclude "${path}": needs a reason`);
    }
    return {
      name,
      repo: raw.repo,
      commit: raw.commit,
      watch: watch.map((path) => cleanPath(`${where} watch`, path)),
      includes,
      exclude: new Map(Object.entries(exclude).map(([path, why]) => [cleanPath(`${where} exclude`, path), why as string])),
    };
  });
  const all = upstreams.flatMap((u) => u.includes.map((include) => ({ ...include, name: u.name })));
  for (const a of all) {
    for (const b of all) {
      if (a !== b && within(b.local, a.local)) {
        throw new ConfigError(`upstream.json: ${b.name} "${b.local}" overlaps ${a.name} "${a.local}"`);
      }
    }
  }
  return upstreams;
}

const RULE_FIELDS = ['pattern', 'regex', 'flags', 'files', 'replacement', 'why'];

function parseSubstitutions(json: Json): Rule[] {
  onlyFields('substitutions.json', json, ['substitutions']);
  if (!Array.isArray(json.substitutions)) throw new ConfigError('substitutions.json: "substitutions" must be a list');
  const raws = json.substitutions as unknown[];
  const rules = raws.map((raw, i): Rule => {
    const where = `substitutions.json [${i}]`;
    if (!isObject(raw)) throw new ConfigError(`${where}: must be an object`);
    onlyFields(where, raw, RULE_FIELDS);
    const { pattern, regex, flags, files, replacement, why } = raw;
    if ((pattern === undefined) === (regex === undefined)) throw new ConfigError(`${where}: needs exactly one of "pattern" or "regex"`);
    if (pattern !== undefined && !isString(pattern)) throw new ConfigError(`${where}: "pattern" must be a non-empty string`);
    if (regex !== undefined && !isString(regex)) throw new ConfigError(`${where}: "regex" must be a non-empty string`);
    if (typeof replacement !== 'string') throw new ConfigError(`${where}: needs a "replacement" string`);
    if (!isString(why)) throw new ConfigError(`${where}: needs a "why"`);
    if (files !== undefined && !isString(files)) throw new ConfigError(`${where}: "files" must be a regex over local paths`);
    checkFlags(where, flags);
    return {
      match: pattern !== undefined ? (pattern as string) : compile(where, regex as string, `g${flags ?? ''}`),
      files: files === undefined ? null : compile(where, files as string, ''),
      replacement,
    };
  });
  // Rules run in order, each on the output of those before it, so a literal
  // pattern that contains an earlier one could never match.
  raws.forEach((later, j) => {
    const laterPattern = (later as Json).pattern;
    if (typeof laterPattern !== 'string') return;
    const i = raws.slice(0, j).findIndex((r) => typeof (r as Json).pattern === 'string' && laterPattern.includes((r as Json).pattern as string));
    if (i !== -1) {
      throw new ConfigError(`substitutions.json [${j}] contains [${i}]'s pattern, which runs first and consumes it; move [${j}] above [${i}]`);
    }
  });
  return rules;
}

function checkFlags(where: string, flags: unknown) {
  if (flags !== undefined && (typeof flags !== 'string' || /[^imsu]/.test(flags))) {
    throw new ConfigError(`${where}: "flags" may only use i, m, s and u`);
  }
}

function compile(where: string, source: string, flags: string): RegExp {
  try {
    return new RegExp(source, flags);
  } catch (error) {
    throw new ConfigError(`${where}: ${(error as Error).message}`);
  }
}

function parseForks(json: Json): Map<string, Fork> {
  const forks = new Map<string, Fork>();
  for (const [path, raw] of Object.entries(json)) {
    const where = `forks.json "${path}"`;
    cleanPath(where, path);
    if (!isObject(raw)) throw new ConfigError(`${where}: must be an object`);
    onlyFields(where, raw, ['kind', 'why']);
    if (!FORK_KINDS.includes(raw.kind as Fork['kind'])) {
      throw new ConfigError(`${where}: "kind" must be ${FORK_KINDS.map((k) => `"${k}"`).join(' or ')}`);
    }
    if (!isString(raw.why)) throw new ConfigError(`${where}: needs a "why"`);
    forks.set(path, { kind: raw.kind as Fork['kind'], why: raw.why });
  }
  return forks;
}

function parseChecks(json: Json): Checks {
  onlyFields('checks.json', json, ['denylist', 'builtinAgentTypes', 'namespace', 'playbooks', 'skillReferences']);
  const { denylist, builtinAgentTypes, namespace, playbooks, skillReferences } = json;
  if (!Array.isArray(denylist)) throw new ConfigError('checks.json: "denylist" must be a list');
  if (!Array.isArray(builtinAgentTypes) || !builtinAgentTypes.every(isString)) {
    throw new ConfigError('checks.json: "builtinAgentTypes" must be a list of names');
  }
  if (!isString(namespace)) throw new ConfigError('checks.json: "namespace" must be the plugin name');
  if (!isString(playbooks)) throw new ConfigError('checks.json: "playbooks" must be a regex over local paths');
  if (!Array.isArray(skillReferences) || !skillReferences.every(isString)) {
    throw new ConfigError('checks.json: "skillReferences" must be a list of regexes');
  }
  return {
    denylist: denylist.map((raw, i): DenyRule => {
      const where = `checks.json denylist [${i}]`;
      if (!isObject(raw)) throw new ConfigError(`${where}: must be an object`);
      onlyFields(where, raw, ['rule', 'token', 'regex', 'flags', 'hint']);
      const { rule, token, regex, flags, hint } = raw;
      if (!isString(rule) || !isString(hint)) throw new ConfigError(`${where}: needs a "rule" and a "hint"`);
      if ((token === undefined) === (regex === undefined)) throw new ConfigError(`${where}: needs exactly one of "token" or "regex"`);
      if (isString(token)) return { rule, label: token, test: (line) => line.includes(token), hint };
      if (!isString(regex)) throw new ConfigError(`${where}: "token" or "regex" must be a non-empty string`);
      checkFlags(where, flags);
      const re = compile(where, regex, (flags as string | undefined) ?? '');
      return { rule, label: `/${regex}/${(flags as string | undefined) ?? ''}`, test: (line) => re.test(line), hint };
    }),
    builtinAgentTypes: new Set(builtinAgentTypes),
    namespace,
    playbooks: compile('checks.json playbooks', playbooks, ''),
    skillReferences: skillReferences.map((source, i) => compile(`checks.json skillReferences [${i}]`, source, 'g')),
  };
}

export function loadConfig(root: string): Config {
  return {
    root,
    upstreams: parseUpstreams(readJson(root, 'upstream.json')),
    substitutions: parseSubstitutions(readJson(root, 'substitutions.json')),
    forks: parseForks(readJson(root, 'forks.json')),
    checks: parseChecks(readJson(root, 'checks.json')),
  };
}

/** Moves one upstream's pin in vendor/upstream.json, keeping everything else. */
export function writePin(root: string, name: string, commit: string) {
  const json = readJson(root, 'upstream.json') as { upstreams: Record<string, Json> };
  const upstream = json.upstreams[name];
  if (!upstream) throw new ConfigError(`upstream.json: no upstream "${name}"`);
  upstream.commit = commit;
  writeFileSync(join(root, VENDOR_DIR, 'upstream.json'), `${JSON.stringify(json, null, 2)}\n`);
}
