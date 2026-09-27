// Hunk headers as written by hand. An agent writing a diff gets the start
// lines right (they come from the file) but often miscounts the lines in a
// hunk, and editors strip the space from blank context lines. Both would make
// a strict unified-diff parser reject the diff, so the counts are recounted
// from the hunk's own lines before parsing.

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

/**
 * The diff with every hunk header's counts recounted from its lines, and each
 * empty line inside a hunk read as a blank context line. A hunk runs until
 * the next hunk, the next file's header, or a line that isn't a diff line.
 */
export function recountHunks(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const header = HUNK.exec(lines[i]!);
    if (!header) {
      out.push(lines[i++]!);
      continue;
    }
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j]!;
      if (line.startsWith('@@') || line.startsWith('diff --git ')) break;
      if (fileHeader(lines, j)) break;
      if (line === '') {
        // A blank context line, unless nothing of the hunk follows it.
        if (!hunkContinues(lines, j + 1)) break;
        body.push(' ');
        continue;
      }
      if (!/^[ +\-\\]/.test(line)) break;
      body.push(line);
    }
    const old = body.filter((line) => line[0] === ' ' || line[0] === '-').length;
    const added = body.filter((line) => line[0] === ' ' || line[0] === '+').length;
    out.push(`@@ -${header[1]},${old} +${header[2]},${added} @@${header[3]}`, ...body);
    i = j;
  }
  return out.join('\n');
}

/** Whether a hunk line follows, past any further blank lines. */
function hunkContinues(lines: string[], from: number): boolean {
  for (let k = from; k < lines.length; k++) {
    const line = lines[k]!;
    if (line === '') continue;
    return /^[ +\-\\]/.test(line) && !fileHeader(lines, k);
  }
  return false;
}

/** `--- old` straight followed by `+++ new` starts the next file. */
function fileHeader(lines: string[], at: number): boolean {
  return lines[at]!.startsWith('--- ') && Boolean(lines[at + 1]?.startsWith('+++ '));
}
