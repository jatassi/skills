// src/cli/main.ts
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync as readFileSync2, rmSync as rmSync2 } from "node:fs";
import { tmpdir as tmpdir2 } from "node:os";
import { dirname as dirname2, join as join3, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// src/core/code-languages.ts
var CODE_LANGUAGES = {
  typescript: ["ts", "cts", "mts"],
  tsx: [],
  javascript: ["js", "cjs", "mjs"],
  jsx: [],
  json: [],
  jsonc: [],
  yaml: ["yml"],
  toml: [],
  shellscript: ["bash", "sh", "shell", "zsh"],
  python: ["py"],
  go: ["golang"],
  rust: ["rs"],
  java: [],
  kotlin: ["kt", "kts"],
  swift: [],
  c: [],
  cpp: ["c++"],
  csharp: ["cs", "c#"],
  php: [],
  sql: [],
  html: [],
  css: [],
  markdown: ["md"],
  diff: ["patch"],
  docker: ["dockerfile"],
  xml: ["svg"],
  terraform: ["tf", "tfvars"],
  ini: ["properties"],
  lua: [],
  dart: [],
  elixir: ["ex", "exs"]
};
var BY_NAME = new Map(
  Object.entries(CODE_LANGUAGES).flatMap(
    ([id, aliases]) => [id, ...aliases].map((name) => [name, id])
  )
);

// src/core/round.ts
function formatRoundNote(file, note) {
  return formatRoundError(file, { ...note, message: `note: ${note.message}` });
}
function formatRoundError(file, error) {
  const parts = [`${file}:${error.line}`];
  if (error.question !== void 0) parts.push(`Q${error.question}`);
  const subject = error.illustration;
  if (subject?.option) parts.push(`mockup ${subject.option} (${subject.fence})`);
  else if (subject) parts.push(`illustration ${subject.id ? `"${subject.id}" ` : ""}(${subject.fence})`);
  return `${parts.join(" \xB7 ")}: ${error.message}`;
}

// src/core/session.ts
import { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
var DIR_MODE = 448;
var SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function isValidSessionId(id) {
  return SESSION_ID.test(id);
}
function sessionsRoot() {
  return join(tmpdir(), "visual-grilling");
}
function sessionPaths(dir) {
  return {
    dir,
    rounds: join(dir, "rounds"),
    submissions: join(dir, "submissions"),
    crops: join(dir, "crops"),
    serverJson: join(dir, "server.json"),
    round: (n) => join(dir, "rounds", `round-${n}.md`),
    submission: (n) => join(dir, "submissions", `round-${n}.json`),
    crop: (n, question, comment) => join(dir, "crops", `r${n}-q${question}-c${comment}.png`)
  };
}
function sessionDir(id) {
  return join(sessionsRoot(), id);
}
function preparePrivateSessionDir(paths) {
  for (const dir of [dirname(paths.dir), paths.dir]) {
    try {
      mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    } catch (error) {
      if (!["EEXIST", "ENOTDIR"].includes(error.code ?? "")) throw error;
    }
    if (process.platform !== "win32") checkPrivateDir(dir);
  }
}
function checkPrivateDir(dir) {
  const stat = lstatSync(dir);
  const refuse = (reason) => {
    throw new Error(`refusing to use ${dir}: ${reason}`);
  };
  if (stat.isSymbolicLink()) refuse("it is a symlink, not a real directory; remove it and present again");
  if (!stat.isDirectory()) refuse("it is not a directory; remove it and present again");
  const uid = process.getuid();
  if (stat.uid !== uid) refuse(`it is owned by uid ${stat.uid}, not the current user (uid ${uid})`);
  if ((stat.mode & 63) !== 0) {
    const mode = (stat.mode & 511).toString(8).padStart(4, "0");
    refuse(`its mode ${mode} allows group or other access; it must be 0700 (chmod 700 it, or remove it)`);
  }
}
function readServerInfo(paths) {
  try {
    const info = JSON.parse(readFileSync(paths.serverJson, "utf8"));
    return Number.isInteger(info.port) && Number.isInteger(info.pid) ? info : void 0;
  } catch {
    return void 0;
  }
}

// src/cli/servers.ts
import { lstatSync as lstatSync2, readdirSync, rmSync } from "node:fs";
import { request } from "node:http";
import { join as join2 } from "node:path";
var PING_TIMEOUT_MS = 3e3;
var STARTING_GRACE_MS = 6e4;
var TimeoutError = class extends Error {
};
function call(port, route, body, timeoutMs) {
  const payload = JSON.stringify(body);
  return new Promise((resolvePromise, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path: route,
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed = text;
          try {
            parsed = JSON.parse(text);
          } catch {
          }
          resolvePromise({ status: res.statusCode ?? 0, body: parsed });
        });
        res.on("error", reject);
      }
    );
    if (timeoutMs !== void 0) {
      req.setTimeout(timeoutMs, () => req.destroy(new TimeoutError(`no answer within ${timeoutMs} ms`)));
    }
    req.on("error", reject);
    req.end(payload);
  });
}
async function serverState(info) {
  if (!isAlive(info.pid)) return "dead";
  try {
    const response = await call(info.port, "/control/ping", {}, PING_TIMEOUT_MS);
    const identity = response.body;
    return response.status === 200 && identity.pid === info.pid && identity.startTime === info.startTime ? "running" : "dead";
  } catch (error) {
    return error instanceof TimeoutError ? "unresponsive" : "dead";
  }
}
async function sweepDeadSessions(ownId) {
  const root = sessionsRoot();
  let names;
  try {
    names = readdirSync(root);
  } catch {
    return;
  }
  await Promise.all(
    names.filter((name) => name !== ownId && isValidSessionId(name)).map(async (name) => {
      const dir = join2(root, name);
      try {
        const stat = lstatSync2(dir);
        if (!stat.isDirectory()) return;
        const info = readServerInfo(sessionPaths(dir));
        if (info ? await serverState(info) !== "dead" : Date.now() - stat.mtimeMs < STARTING_GRACE_MS) return;
        if (lstatSync2(dir).mtimeMs !== stat.mtimeMs) return;
        rmSync(dir, { recursive: true, force: true });
      } catch {
      }
    })
  );
}
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

// src/cli/main.ts
var DEFAULT_AWAIT_SECONDS = 90;
var SERVER_START_MS = 1e4;
var STOP_MS = 5e3;
var EXIT_OK = 0;
var EXIT_FAILURE = 1;
var EXIT_USAGE = 2;
var UsageError = class extends Error {
};
var io = {
  out: (text) => process.stdout.write(text.endsWith("\n") ? text : `${text}
`),
  err: (text) => process.stderr.write(text.endsWith("\n") ? text : `${text}
`)
};
async function run(argv, entryUrl) {
  const distDir = dirname2(fileURLToPath(entryUrl));
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        session: { type: "string" },
        agent: { type: "string" },
        "no-open": { type: "boolean" },
        timeout: { type: "string" },
        help: { type: "boolean", short: "h" }
      }
    });
    const [command, ...rest] = positionals;
    if (values.help || command === void 0 || command === "help") {
      io.out(usage(distDir));
      return values.help || command === "help" ? EXIT_OK : EXIT_USAGE;
    }
    switch (command) {
      case "present": {
        if (rest.length !== 1) throw new UsageError("present takes exactly one round file");
        if (!values.agent?.trim()) {
          throw new UsageError('present needs --agent <name>: the agent you are, e.g. --agent "Claude Code"');
        }
        return await present(rest[0], {
          session: values.session,
          agent: values.agent,
          open: !values["no-open"],
          distDir
        });
      }
      case "await":
        return await awaitSubmission({ session: values.session, timeout: values.timeout });
      case "end":
        return await end({ session: values.session });
      default:
        throw new UsageError(`unknown command "${command}"`);
    }
  } catch (error) {
    if (error instanceof UsageError || error.code?.startsWith("ERR_PARSE_ARGS")) {
      io.err(`visual-grilling: ${error.message}
Run with --help for usage.`);
      return EXIT_USAGE;
    }
    io.err(`visual-grilling: ${error.message}`);
    return EXIT_FAILURE;
  }
}
function usage(distDir) {
  return `Usage: node cli.mjs <command> [flags]

Commands:
  present --agent <name> <round.md>
                       Check and show a round; prints the round page's link.
  await                Wait for the round submission; prints it for the agent.
  end                  Stop the server and delete the grilling session's files.
                       Does nothing when the session has no folder.

Flags:
  --agent <name>       present (required): the agent you are, as you'd name yourself
                       ("Claude Code", "Codex", "Gemini CLI", "Cursor"\u2026). The round page
                       shows it with its logo; a name it doesn't know gets a generic one.
  --session <id>       The grilling session. Defaults to $CLAUDE_CODE_SESSION_ID, then
                       $CODEX_SESSION_ID; without either, the first present prints
                       "session: <id>" to pass here.
  --no-open            present: don't open the default browser (open the link yourself,
                       e.g. in the Claude Code desktop Browser pane).
  --timeout <seconds>  await: how long to wait (default ${DEFAULT_AWAIT_SECONDS}; "5m" and "30s" work too).

await's first line names the outcome:
  submitted \xB7 round N \xB7 <title>   the submission follows          exit 0
  pending \xB7 round N \xB7 re-run await  the timeout ran out            exit 0
  superseded \xB7 round N answered in the terminal                  exit 0
  ended \xB7 <reason>                the server is gone              exit 1

present prints rejections to stderr and exits 1. It prints notes (an unknown code
language, shown as plain text) to stderr as "\u2026: note: \u2026" and still shows the round.

Exit codes: 0 ok, 1 rejected round or failure, 2 usage error.

Round-file guide: ${resolve(distDir, "..", "round-file.md")}
`;
}
function resolveSession(flag, allowGenerate) {
  const id = flag ?? (process.env.CLAUDE_CODE_SESSION_ID || process.env.CODEX_SESSION_ID);
  if (id !== void 0 && id !== "") {
    if (!isValidSessionId(id)) throw new UsageError(`"${id}" is not a usable session id`);
    return { id, generated: false };
  }
  if (!allowGenerate) {
    throw new UsageError("no grilling session: pass --session <id> (the id the first present printed)");
  }
  return { id: randomBytes(6).toString("hex"), generated: true };
}
async function present(file, options) {
  let source;
  try {
    source = readFileSync2(file, "utf8");
  } catch {
    throw new UsageError(`can't read round file ${file}`);
  }
  const session = resolveSession(options.session, true);
  const swept = sweepDeadSessions(session.id);
  try {
    const paths = sessionPaths(sessionDir(session.id));
    const newSession = !existsSync(paths.dir);
    preparePrivateSessionDir(paths);
    let { info: server, started } = await ensureServer(paths, options.distDir);
    let response;
    try {
      response = await call(server.port, "/control/present", { source, agent: options.agent });
    } catch {
      preparePrivateSessionDir(paths);
      ({ info: server, started } = await ensureServer(paths, options.distDir));
      response = await call(server.port, "/control/present", { source, agent: options.agent });
    }
    if (response.status === 422) {
      const { errors } = response.body;
      for (const error of errors) io.err(formatRoundError(file, error));
      if (newSession) await stopServer(server, paths);
      return EXIT_FAILURE;
    }
    if (response.status !== 200) throw serverError(response);
    const { url, notes } = response.body;
    for (const note of notes) io.err(formatRoundNote(file, note));
    if (session.generated) io.out(`session: ${session.id}`);
    io.out(url);
    if (started && options.open) openBrowser(url);
    return EXIT_OK;
  } finally {
    await swept;
  }
}
async function ensureServer(paths, distDir) {
  const existing = readServerInfo(paths);
  if (existing) {
    const state = await serverState(existing);
    if (state === "running") return { info: existing, started: false };
    if (state === "unresponsive") {
      throw new Error(`the grilling server (pid ${existing.pid}) is not responding; try again in a moment`);
    }
  }
  rmSync2(paths.serverJson, { force: true });
  const child = spawn(process.execPath, [join3(distDir, "server.mjs"), paths.dir], {
    cwd: tmpdir2(),
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  const deadline = Date.now() + SERVER_START_MS;
  while (Date.now() < deadline) {
    const info = readServerInfo(paths);
    if (info && info.pid === child.pid && await serverState(info) === "running") return { info, started: true };
    await sleep(50);
  }
  throw new Error(`the server did not start within ${SERVER_START_MS / 1e3} s`);
}
function openBrowser(url) {
  const [command, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", '""', url]] : ["xdg-open", [url]];
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: process.platform === "win32"
    });
    child.on("error", () => {
    });
    child.unref();
  } catch {
  }
}
async function awaitSubmission(options) {
  const timeoutMs = parseTimeout(options.timeout);
  const session = resolveSession(options.session, false);
  const paths = sessionPaths(sessionDir(session.id));
  if (!existsSync(paths.dir)) {
    io.out(`ended \xB7 grilling session ${session.id} is over (ended, idle, or never presented)`);
    return EXIT_FAILURE;
  }
  const server = readServerInfo(paths);
  const state = server ? await serverState(server) : "dead";
  if (!server || state === "dead") {
    io.out("ended \xB7 the server stopped unexpectedly (the next present restarts it)");
    return EXIT_FAILURE;
  }
  if (state === "unresponsive") throw new Error(`the grilling server (pid ${server.pid}) is not responding`);
  let response;
  try {
    response = await call(server.port, "/control/await", { timeoutMs });
  } catch {
    io.out("ended \xB7 the server stopped while waiting (the next present restarts it)");
    return EXIT_FAILURE;
  }
  if (response.status !== 200) throw serverError(response);
  io.out(response.body.text);
  return EXIT_OK;
}
function parseTimeout(value) {
  if (value === void 0) return DEFAULT_AWAIT_SECONDS * 1e3;
  const match = /^(\d+(?:\.\d+)?)(s|m)?$/.exec(value.trim());
  if (!match) throw new UsageError(`--timeout takes seconds, like 90, 30s or 5m (got "${value}")`);
  const seconds = Number(match[1]) * (match[2] === "m" ? 60 : 1);
  return Math.round(seconds * 1e3);
}
async function end(options) {
  const { id } = resolveSession(options.session, false);
  const paths = sessionPaths(sessionDir(id));
  if (!existsSync(paths.dir)) return EXIT_OK;
  const server = readServerInfo(paths);
  if (server && await serverState(server) !== "dead") await stopServer(server, paths);
  rmSync2(paths.dir, { recursive: true, force: true });
  io.out(`session ${id} ended`);
  return EXIT_OK;
}
async function stopServer(server, paths) {
  const answered = await call(server.port, "/control/end", {}, STOP_MS).then(
    () => true,
    () => false
  );
  const deadline = Date.now() + (answered ? STOP_MS : 0);
  while (Date.now() < deadline && isAlive(server.pid)) await sleep(50);
  if (isAlive(server.pid)) {
    try {
      process.kill(server.pid, "SIGKILL");
    } catch {
    }
  }
  rmSync2(paths.dir, { recursive: true, force: true });
}
function serverError(response) {
  const detail = typeof response.body === "object" && response.body && "error" in response.body ? String(response.body.error) : `HTTP ${response.status}`;
  return new Error(detail);
}
function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}
export {
  run
};
