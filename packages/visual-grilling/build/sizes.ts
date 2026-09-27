// Every file under a build output folder with its size, in path order. The
// build prints these, and the release workflow puts them in the release notes.

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface OutputSize {
  /** Relative to the output folder, with `/` separators on every platform. */
  path: string;
  bytes: number;
}

export function outputSizes(out: string): OutputSize[] {
  return [...walk(out)].map((file) => ({ path: relative(out, file).split(sep).join('/'), bytes: statSync(file).size }));
}

export function kib(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}
