# Code fences and `diff`

A code fence draws with Shiki: syntax colours, line numbers and highlighted lines. A `diff` fence draws a unified diff like a pull-request diff.

## Code fences

- When quoting a real file, set `file` to its repo-relative path and `startLine` to the first quoted line, so the gutter and every comment use the file's own line numbers.
- Use `highlight` for the lines the question is about (`highlight=14-16`, in the file's numbers when `startLine` is set).
- Quote only the lines the question needs, about 30 at most. Cut the rest and say so in prose.
- For a change to existing code, use `diff` rather than two code fences.

````
```ts id=retry file=src/client.ts startLine=40 highlight=44-46
…
```
````

### Languages

Write `lang` as the fence language, or as `lang=` on a `code` fence for a name the round file reserves (`html`, `diff`). Each grammar is listed with the other names it goes by:

| grammar | also |
|---|---|
| `typescript` | `ts`, `cts`, `mts` |
| `tsx` | |
| `javascript` | `js`, `cjs`, `mjs` |
| `jsx` | |
| `json` | |
| `jsonc` | |
| `yaml` | `yml` |
| `toml` | |
| `shellscript` | `bash`, `sh`, `shell`, `zsh` |
| `python` | `py` |
| `go` | `golang` |
| `rust` | `rs` |
| `java` | |
| `kotlin` | `kt`, `kts` |
| `swift` | |
| `c` | |
| `cpp` | `c++` |
| `csharp` | `cs`, `c#` |
| `php` | |
| `sql` | |
| `html` | |
| `css` | |
| `markdown` | `md` |
| `diff` | `patch` |
| `docker` | `dockerfile` |
| `xml` | `svg` |
| `terraform` | `tf`, `tfvars` |
| `ini` | `properties` |
| `lua` | |
| `dart` | |
| `elixir` | `ex`, `exs` |

`text`, `txt`, `plain` and `plaintext` mean no highlighting. Any other language also shows as plain text, and `present` prints a `note:` for it without rejecting the round.

## `diff`

- Write a unified diff with `---`/`+++` file headers and `@@` hunks, as `git diff` prints it. Several files in one diff are fine.
- Make each hunk's start lines the file's real ones, because comments name those lines. The line counts in `@@` are recounted, so they needn't be exact.
- Keep only the hunks the question is about, with a few lines of context.

## Anchors

A comment on a code line names the line and file, such as `line 44 of src/client.ts`. On a diff line it also names the side, such as `new line 12 of src/app.ts`, `old line 11 of src/app.ts` or `context line 13 of src/app.ts (old 12)`. Without `file`, a code line is named by its number alone.

## Marks and theme

`highlight` is code's only mark, standing in for `recommended`. Code and diffs always follow the theme and take no override.
