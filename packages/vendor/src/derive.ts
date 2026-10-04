// An upstream commit's derived form: what the vendored tree would hold with
// no forks. Each included path is mapped to its local path, and every text
// file that isn't verbatim goes through the substitution table.

import type { Include, Rule, Upstream } from './config.ts';
import type { Blob, Tree } from './git.ts';

/** Local path -> derived file. */
export type Derived = Map<string, Blob>;

export class DeriveError extends Error {}

export function applySubstitutions(text: string, rules: Rule[], localPath: string): string {
  let out = text;
  for (const rule of rules) {
    if (rule.files && !rule.files.test(localPath)) continue;
    out = typeof rule.match === 'string'
      ? out.replaceAll(rule.match, () => rule.replacement)
      : out.replace(rule.match, rule.replacement);
  }
  return out;
}

/** Binary by a NUL byte, as git decides, or by bytes that aren't UTF-8. */
export function isBinary(bytes: Buffer): boolean {
  return bytes.includes(0) || !Buffer.from(bytes.toString('utf8')).equals(bytes);
}

/** The files an include covers in a tree: upstream path -> local path. */
export function includedPaths(include: Include, tree: Tree): Map<string, string> {
  if (tree.has(include.upstream)) return new Map([[include.upstream, include.local]]);
  const prefix = `${include.upstream}/`;
  return new Map(
    [...tree.keys()].filter((path) => path.startsWith(prefix)).map((path) => [path, `${include.local}/${path.slice(prefix.length)}`]),
  );
}

export function derive(upstream: Upstream, tree: Tree, rules: Rule[]): Derived {
  const derived: Derived = new Map();
  for (const include of upstream.includes) {
    const paths = includedPaths(include, tree);
    if (paths.size === 0) {
      throw new DeriveError(`${upstream.name}: "${include.upstream}" (for ${include.local}) is not in ${upstream.repo} at ${upstream.commit.slice(0, 12)}`);
    }
    for (const [from, to] of paths) {
      const blob = tree.get(from)!;
      const bytes = include.verbatim || isBinary(blob.bytes)
        ? blob.bytes
        : Buffer.from(applySubstitutions(blob.bytes.toString('utf8'), rules, to));
      derived.set(to, { bytes, executable: blob.executable });
    }
  }
  return derived;
}

/** Upstream skill folders under the watched folders, as upstream paths. */
export function watchedSkills(upstream: Upstream, tree: Tree): Set<string> {
  const skills = new Set<string>();
  for (const dir of upstream.watch) {
    for (const path of tree.keys()) {
      if (!path.startsWith(`${dir}/`)) continue;
      const child = path.slice(dir.length + 1).split('/');
      if (child.length > 1) skills.add(`${dir}/${child[0]}`);
    }
  }
  return skills;
}

/** Whether an upstream path is shipped by an include or declared excluded. */
export function isTriaged(upstream: Upstream, path: string): boolean {
  const covers = (base: string) => path === base || path.startsWith(`${base}/`) || base.startsWith(`${path}/`);
  return upstream.includes.some((include) => covers(include.upstream)) || [...upstream.exclude.keys()].some(covers);
}
