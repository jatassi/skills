// Every file under a build output folder with its size, in path order. The
// build prints these, and the release workflow puts them in the release notes.

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface OutputSize {
  /** Relative to the output folder, with `/` separators on every platform. */
  path: string;
  bytes: number;
}

/** Folders of many small files, listed as one line each: `page/agents/ (61 files)`. */
const GROUPED = ['page/agents/'];

export function outputSizes(out: string): OutputSize[] {
  const sizes: OutputSize[] = [];
  const groups = new Map<string, { entry: OutputSize; files: number }>();
  for (const file of walk(out)) {
    const path = relative(out, file).split(sep).join('/');
    const bytes = statSync(file).size;
    const folder = GROUPED.find((prefix) => path.startsWith(prefix));
    if (!folder) {
      sizes.push({ path, bytes });
      continue;
    }
    const group = groups.get(folder);
    if (group) {
      group.files += 1;
      group.entry.bytes += bytes;
      group.entry.path = `${folder} (${group.files} files)`;
    } else {
      const entry = { path: `${folder} (1 files)`, bytes };
      groups.set(folder, { entry, files: 1 });
      sizes.push(entry);
    }
  }
  return sizes;
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
